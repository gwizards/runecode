import { create } from 'zustand';
import { ruFloService } from './service';
import { dispatchRuFloEvent, RUFLO_EVENTS } from './events';
import type { RuFloInstallation, RuFloSwarm, RuFloProjectStatus } from './types';
import {
  QuantizedMemoryStore,
  createRuFloMemoryStore,
  type QuantizationMode,
  type SearchResult,
} from './memory-store';
import { recommendMode } from './quantization';

// ── Singleton quantized local memory cache ────────────────────────────────────
// Used to cache embedding-like data locally with scalar/product quantization.
// The active quantization mode is persisted to localStorage so recreating the
// store on reload uses the same mode. Full PQ codebook export is not available
// on QuantizedMemoryStore directly (entries are a cache, not source of truth).

const CODEBOOK_KEY = 'runecode-ruflo-pq-codebook';
/** localStorage key tracking whether we've applied the default agentdb backend */
const BACKEND_INIT_KEY = 'runecode-ruflo-backend-initialized';

function loadPersistedMode(): QuantizationMode {
  try {
    const raw = localStorage.getItem(CODEBOOK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: QuantizationMode };
      if (parsed.mode === 'scalar' || parsed.mode === 'product' || parsed.mode === 'none') {
        return parsed.mode;
      }
    }
  } catch { /* ignore */ }
  return 'scalar';
}

function savePersistedMode(mode: QuantizationMode): void {
  try {
    localStorage.setItem(CODEBOOK_KEY, JSON.stringify({ mode }));
  } catch { /* ignore */ }
}

/** Lazily initialized local memory store. Mode is loaded from localStorage on first access. */
let _localStore: QuantizedMemoryStore | null = null;

export function getLocalMemoryStore(): QuantizedMemoryStore {
  if (!_localStore) {
    const persistedMode = loadPersistedMode();
    _localStore = createRuFloMemoryStore(persistedMode);
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
  fetchMemoryStats: () => Promise<void>;
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
    try {
      const { listen } = await import('@tauri-apps/api/event');
      await listen('ruflo-mcp-changed', () => {
        get().fetchInstallation();
      });
      await listen('ruflo-memory-changed', () => {
        get().fetchMemoryStats();
      });
      await listen('ruflo-project-changed', () => {
        // project status refresh handled per-component with path
      });
    } catch {
      // Tauri events not available (e.g., in test env) — silently skip
    }
  },

  fetchInstallation: async () => {
    void get().setupListeners(); // non-blocking, idempotent
    set({ loading: true, error: null });
    try {
      const installation = await ruFloService.getInstallation();
      set({ installation, loading: false });
      dispatchRuFloEvent(RUFLO_EVENTS.STATUS_CHANGED);
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  fetchSwarm: async () => {
    try {
      const swarm = await ruFloService.getSwarmStatus();
      set({ swarm });
    } catch {
      // non-critical
    }
  },

  fetchProjectStatus: async (projectPath: string) => {
    try {
      const projectStatus = await ruFloService.getProjectStatus(projectPath);
      set({ projectStatus });
    } catch {
      // non-critical
    }
  },

  fetchMemoryStats: async () => {
    // On first launch, ensure agentdb is set as the active backend
    try {
      if (!localStorage.getItem(BACKEND_INIT_KEY)) {
        localStorage.setItem(BACKEND_INIT_KEY, '1');
        await ruFloService.setMemoryBackend('agentdb');
      }
    } catch { /* non-critical — CLI may not be installed yet */ }
    try {
      const memoryStats = await ruFloService.getMemoryStats();
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
    } catch {
      // non-critical
    }
  },

  fetchAll: async (projectPath?: string) => {
    set({ loading: true });
    const tasks: Promise<void>[] = [
      get().fetchInstallation(),
      get().fetchSwarm(),
      get().fetchMemoryStats(),
    ];
    if (projectPath) tasks.push(get().fetchProjectStatus(projectPath));
    await Promise.allSettled(tasks);
    set({ loading: false });
  },

  // ── Write actions ─────────────────────────────────────────────────────────

  install: async () => {
    set({ actionInProgress: 'install', error: null });
    try {
      const result = await ruFloService.install();
      await get().fetchInstallation();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  uninstall: async () => {
    set({ actionInProgress: 'uninstall', error: null });
    try {
      const result = await ruFloService.uninstall();
      set({ installation: null, swarm: null, memoryStats: null });
      dispatchRuFloEvent(RUFLO_EVENTS.STATUS_CHANGED);
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  activateMcp: async () => {
    set({ actionInProgress: 'mcp', error: null });
    try {
      const result = await ruFloService.activateMcp();
      await get().fetchInstallation();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  deactivateMcp: async () => {
    set({ actionInProgress: 'mcp', error: null });
    try {
      const result = await ruFloService.deactivateMcp();
      await get().fetchInstallation();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  createSlashCommand: async () => {
    set({ actionInProgress: 'slash', error: null });
    try {
      const result = await ruFloService.createSlashCommand();
      await get().fetchInstallation();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  initProject: async (projectPath: string) => {
    set({ actionInProgress: 'init', error: null });
    try {
      const result = await ruFloService.initProject(projectPath);
      await get().fetchProjectStatus(projectPath);
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  // ── Memory actions ────────────────────────────────────────────────────────

  syncMemoryLocal: async (outputPath: string) => {
    set({ actionInProgress: 'mem-sync', error: null });
    try {
      return await ruFloService.syncMemoryLocal(outputPath);
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  consolidateMemory: async () => {
    set({ actionInProgress: 'mem-consolidate', error: null });
    try {
      const result = await ruFloService.consolidateMemory();
      await get().fetchMemoryStats();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
  },

  setMemoryBackend: async (backend) => {
    set({ actionInProgress: 'mem-backend', error: null });
    try {
      const result = await ruFloService.setMemoryBackend(backend);
      await get().fetchMemoryStats();
      return result;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    } finally {
      set({ actionInProgress: null });
    }
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
}));
