// Zustand store for RuFlo global state
import { create } from 'zustand';
import { ruFloService } from './service';
import { dispatchRuFloEvent, RUFLO_EVENTS } from './events';
import type { RuFloInstallation, RuFloSwarm } from './types';

interface RuFloState {
  installation: RuFloInstallation | null;
  swarm: RuFloSwarm | null;
  loading: boolean;
  error: string | null;
  fetchInstallation: () => Promise<void>;
  fetchSwarm: () => Promise<void>;
}

export const useRuFloStore = create<RuFloState>((set) => ({
  installation: null,
  swarm: null,
  loading: false,
  error: null,

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
      // swarm status failure is non-critical
    }
  },
}));
