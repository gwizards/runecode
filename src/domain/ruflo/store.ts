import { create } from 'zustand';
import { ruFloService } from './service';
import { dispatchRuFloEvent, RUFLO_EVENTS } from '../../infrastructure/ruflo/browser-events-bridge';
import type { RuFloInstallation, RuFloSwarm, RuFloProjectStatus } from './types';
import {
  QuantizedMemoryStore,
  createRuFloMemoryStore,
  type QuantizationMode,
  type SearchResult,
} from './memory-store';
import { recommendMode } from './quantization';
import type { IRuFloEventListener } from './ports/i-ruflo-event-listener';
// Persistence delegated to infrastructure layer — see src/infrastructure/
import {
  loadPersistedMode,
  savePersistedMode,
  saveCalibration,
  restoreCalibration,
  checkAndMarkBackendInitialized,
} from '../../infrastructure/persistence/ruflo-persistence';

// ── Event listener port ───────────────────────────────────────────────────────
// Injected by the infrastructure layer before the store is first used.
// Call setRuFloEventListener() from the app bootstrap (e.g. main.tsx or the
// Tauri adapter module) with a concrete IRuFloEventListener implementation.
// If no listener is injected the store simply skips Tauri event subscriptions
// (graceful degradation — useful in tests and web-only environments).

let _eventListener: IRuFloEventListener | null = null;

/** Register the concrete Tauri event listener adapter. */
export function setRuFloEventListener(listener: IRuFloEventListener): void {
  _eventListener = listener;
}

// Module-level array that holds the unlisten functions returned by listener.listen().
// Stored outside Zustand state because functions are not serializable.
// Call teardownRuFloListeners() to remove all subscriptions (useful in tests
// and when the store needs to be recreated without leaking Tauri event handles).
const _ruFloUnlistenFns: Array<() => void> = [];

/** Remove all active ruflo event subscriptions. Safe to call multiple times. */
export function teardownRuFloListeners(): void {
  let fn: (() => void) | undefined;
  while ((fn = _ruFloUnlistenFns.pop()) !== undefined) {
    fn();
  }
}

// ── Singleton quantized local memory cache ────────────────────────────────────
// Used to cache embedding-like data locally with scalar/product quantization.
// The active quantization mode is loaded/saved via the infrastructure persistence
// adapter. Full PQ codebook export is not available on QuantizedMemoryStore
// directly (entries are a cache, not source of truth).

/** Lazily initialized local memory store. Mode and calibration are loaded from localStorage on first access. */
let _localStore: QuantizedMemoryStore | null = null;

export function getLocalMemoryStore(): QuantizedMemoryStore {
  if (!_localStore) {
    const persistedMode = loadPersistedMode();
    _localStore = createRuFloMemoryStore(persistedMode);
    restoreCalibration(_localStore);
  }
  return _localStore;
}

/** Re-initialize store with the recommended mode based on current entry count. */
export function upgradeMemoryStoreMode(): QuantizationMode {
  const store = getLocalMemoryStore();
  const snapshot = store.export();
  const recommended = recommendMode(store.size);
  if (recommended !== snapshot.mode) {
    // Entries are caches, not source of truth — safe to recreate fresh
    _localStore = createRuFloMemoryStore(recommended);
    savePersistedMode(recommended);
  }
  return recommended;
}

interface RuFloState {
  // ── State ──────────────────────────────────────────────────────────────
  installation: RuFloInstallation | null;
  swarm: RuFloSwarm | null;
  projectStatus: RuFloProjectStatus | null;
  memoryStats: Record<string, unknown> | null;
  loading: boolean;
  actionInProgress: string | null; // which action is running (install/uninstall/mcp/etc)
  error: string | null;
  _listenersSetup: boolean;

  // ── Local cache state ──────────────────────────────────────────────────
  localMemoryMode: QuantizationMode;
  localCacheSize: number;

  // ── Read actions ───────────────────────────────────────────────────────
  setupListeners: () => Promise<void>;
  fetchInstallation: () => Promise<void>;
  fetchSwarm: () => Promise<void>;
  fetchProjectStatus: (projectPath: string) => Promise<void>;
  /** QUERY — reads current memory stats and local cache state; no side effects. */
  fetchMemoryStats: () => Promise<void>;
  /** COMMAND — ensures backend is initialized on first launch, then refreshes stats. */
  refreshMemoryStats: () => Promise<void>;
  fetchAll: (projectPath?: string) => Promise<void>;

  // ── Write actions ──────────────────────────────────────────────────────
  install: () => Promise<string>;
  uninstall: () => Promise<string>;
  activateMcp: () => Promise<string>;
  deactivateMcp: () => Promise<string>;
  createSlashCommand: () => Promise<string>;
  initProject: (projectPath: string) => Promise<string>;

  // ── Memory actions ────────────────────────────────────────────────────
  syncMemoryLocal: (outputPath: string) => Promise<string>;
  consolidateMemory: () => Promise<string>;
  setMemoryBackend: (backend: 'agentdb' | 'hnsw' | 'hybrid') => Promise<string>;

  // ── Local cache actions ───────────────────────────────────────────────
  cacheEntry: (key: string, embedding: number[], metadata?: Record<string, unknown>) => void;
  searchCache: (query: number[], topK?: number) => SearchResult[];
  fitLocalQuantizer: (samples: Float32Array[]) => void;
}

export const useRuFloStore = create<RuFloState>((set, get) => ({
  installation: null,
  swarm: null,
  projectStatus: null,
  memoryStats: null,
  loading: false,
  actionInProgress: null,
  error: null,
  _listenersSetup: false,
  localMemoryMode: loadPersistedMode(),
  localCacheSize: 0,

  // ── Read actions ─────────────────────────────────────────────────────────

  setupListeners: async () => {
    if (get()._listenersSetup) return;
    set({ _listenersSetup: true });
    if (!_eventListener) return; // no adapter injected — skip (tests / web-only)
    try {
      const listener = _eventListener;
      // Store each unlisten function so teardownRuFloListeners() can remove them.
      // Without this the Tauri event handles leaked for the lifetime of the process.
      const unlistenMcp = await listener.listen('ruflo-mcp-changed', () => {
        get().fetchInstallation();
      });
      _ruFloUnlistenFns.push(unlistenMcp);

      const unlistenMemory = await listener.listen('ruflo-memory-changed', () => {
        get().fetchMemoryStats();
      });
      _ruFloUnlistenFns.push(unlistenMemory);

      const unlistenProject = await listener.listen('ruflo-project-changed', () => {
        // project status refresh handled per-component with path
      });
      _ruFloUnlistenFns.push(unlistenProject);
    } catch {
      // Listener unavailable at runtime — silently skip
    }
  },

  fetchInstallation: async () => {
    void get().setupListeners(); // non-blocking, idempotent
    set({ loading: true, error: null });
    const result = await ruFloService.getInstallation();
    if (!result.ok) {
      set({ error: result.error, loading: false });
      return;
    }
    set({ installation: result.value, loading: false });
    dispatchRuFloEvent(RUFLO_EVENTS.STATUS_CHANGED);
  },

  fetchSwarm: async () => {
    const result = await ruFloService.getSwarmStatus();
    if (result.ok) {
      set({ swarm: result.value });
    }
    // non-critical — ignore errors silently
  },

  fetchProjectStatus: async (projectPath: string) => {
    const result = await ruFloService.getProjectStatus(projectPath);
    if (result.ok) {
      set({ projectStatus: result.value });
    }
    // non-critical — ignore errors silently
  },

  fetchMemoryStats: async () => {
    // QUERY — reads current memory stats and local cache state; no side effects.
    const result = await ruFloService.getMemoryStats();
    if (!result.ok) return; // non-critical
    const memoryStats = result.value;
    const localStore = getLocalMemoryStore();
    const localSnapshot = localStore.export();
    set({
      memoryStats: {
        ...memoryStats,
        localCacheSize: localStore.size,
        localMode: localSnapshot.mode,
      },
      localMemoryMode: localSnapshot.mode as QuantizationMode,
      localCacheSize: localStore.size,
    });
  },

  refreshMemoryStats: async () => {
    // COMMAND — ensures agentdb backend is initialized on first launch (side
    // effect tracked by infrastructure layer), then delegates to the query.
    const alreadyInitialized = checkAndMarkBackendInitialized();
    if (!alreadyInitialized) {
      // non-critical — CLI may not be installed yet; ignore Err
      await ruFloService.setMemoryBackend('agentdb');
    }
    await get().fetchMemoryStats();
  },

  fetchAll: async (projectPath?: string) => {
    set({ loading: true });
    const tasks: Promise<void>[] = [
      get().fetchInstallation(),
      get().fetchSwarm(),
      get().refreshMemoryStats(), // COMMAND: handles first-launch backend init then reads stats
    ];
    if (projectPath) tasks.push(get().fetchProjectStatus(projectPath));
    await Promise.allSettled(tasks);
    set({ loading: false });
  },

  // ── Write actions ─────────────────────────────────────────────────────────

  install: async () => {
    set({ actionInProgress: 'install', error: null });
    const result = await ruFloService.install();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchInstallation();
    return result.value;
  },

  uninstall: async () => {
    set({ actionInProgress: 'uninstall', error: null });
    const result = await ruFloService.uninstall();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    set({ installation: null, swarm: null, memoryStats: null });
    dispatchRuFloEvent(RUFLO_EVENTS.STATUS_CHANGED);
    return result.value;
  },

  activateMcp: async () => {
    set({ actionInProgress: 'mcp', error: null });
    const result = await ruFloService.activateMcp();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchInstallation();
    return result.value;
  },

  deactivateMcp: async () => {
    set({ actionInProgress: 'mcp', error: null });
    const result = await ruFloService.deactivateMcp();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchInstallation();
    return result.value;
  },

  createSlashCommand: async () => {
    set({ actionInProgress: 'slash', error: null });
    const result = await ruFloService.createSlashCommand();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchInstallation();
    return result.value;
  },

  initProject: async (projectPath: string) => {
    set({ actionInProgress: 'init', error: null });
    const result = await ruFloService.initProject(projectPath);
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchProjectStatus(projectPath);
    return result.value;
  },

  // ── Memory actions ────────────────────────────────────────────────────────

  syncMemoryLocal: async (outputPath: string) => {
    set({ actionInProgress: 'mem-sync', error: null });
    const result = await ruFloService.syncMemoryLocal(outputPath);
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    return result.value;
  },

  consolidateMemory: async () => {
    set({ actionInProgress: 'mem-consolidate', error: null });
    const result = await ruFloService.consolidateMemory();
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchMemoryStats();
    return result.value;
  },

  setMemoryBackend: async (backend) => {
    set({ actionInProgress: 'mem-backend', error: null });
    const result = await ruFloService.setMemoryBackend(backend);
    set({ actionInProgress: null });
    if (!result.ok) {
      set({ error: result.error });
      throw new Error(result.error);
    }
    await get().fetchMemoryStats();
    return result.value;
  },

  // ── Local cache actions ───────────────────────────────────────────────────

  cacheEntry: (key, embedding, metadata) => {
    try {
      const store = getLocalMemoryStore();
      store.add(key, embedding, metadata);
      const newMode = upgradeMemoryStoreMode();
      savePersistedMode(newMode);
      set({ localCacheSize: getLocalMemoryStore().size, localMemoryMode: newMode });
    } catch { /* non-critical */ }
  },

  searchCache: (query, topK = 5) => {
    try {
      return getLocalMemoryStore().search(query, topK);
    } catch {
      return [];
    }
  },

  fitLocalQuantizer: (samples) => {
    try {
      const store = getLocalMemoryStore();
      store.fitQuantizer(samples);
      saveCalibration(store);
    } catch { /* non-critical */ }
  },
}));
