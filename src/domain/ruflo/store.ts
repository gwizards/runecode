import { create } from 'zustand';
import { ruFloService } from './service';
import { dispatchRuFloEvent, RUFLO_EVENTS } from './events';
import type { RuFloInstallation, RuFloSwarm, RuFloProjectStatus } from './types';

interface RuFloState {
  // ── State ──────────────────────────────────────────────────────────────
  installation: RuFloInstallation | null;
  swarm: RuFloSwarm | null;
  projectStatus: RuFloProjectStatus | null;
  memoryStats: Record<string, unknown> | null;
  loading: boolean;
  actionInProgress: string | null; // which action is running (install/uninstall/mcp/etc)
  error: string | null;

  // ── Read actions ───────────────────────────────────────────────────────
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
}

export const useRuFloStore = create<RuFloState>((set, get) => ({
  installation: null,
  swarm: null,
  projectStatus: null,
  memoryStats: null,
  loading: false,
  actionInProgress: null,
  error: null,

  // ── Read actions ─────────────────────────────────────────────────────────

  fetchInstallation: async () => {
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
    try {
      const memoryStats = await ruFloService.getMemoryStats();
      set({ memoryStats });
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
}));
