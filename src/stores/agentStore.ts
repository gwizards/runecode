import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { StateCreator } from 'zustand';

export interface LiveAgent {
  id: string;
  name: string;
  status: 'running' | 'thinking' | 'completed' | 'failed';
  startedAt: number;
  elapsedMs: number;
  tokenCount: number;
  tabId?: string;
  /** WebSocket connectionId for this agent session */
  connectionId?: string;
}

interface AgentState {
  // Live agent tracking (active WebSocket sessions)
  liveAgents: Map<string, LiveAgent>;

  // UI state
  error: string | null;

  // Live agent actions
  addLiveAgent: (agent: LiveAgent) => void;
  updateLiveAgent: (id: string, updates: Partial<LiveAgent>) => void;
  removeLiveAgent: (id: string) => void;
  clearError: () => void;
}

const agentStore: StateCreator<
  AgentState,
  [],
  [['zustand/subscribeWithSelector', never]],
  AgentState
> = (set) => ({
    liveAgents: new Map(),
    error: null,

    addLiveAgent: (agent: LiveAgent) => {
      set((state) => {
        const next = new Map(state.liveAgents);
        next.set(agent.id, agent);
        return { liveAgents: next };
      });
    },

    updateLiveAgent: (id: string, updates: Partial<LiveAgent>) => {
      set((state) => {
        const existing = state.liveAgents.get(id);
        if (!existing) return state;
        const next = new Map(state.liveAgents);
        next.set(id, { ...existing, ...updates });
        return { liveAgents: next };
      });
    },

    removeLiveAgent: (id: string) => {
      set((state) => {
        const next = new Map(state.liveAgents);
        next.delete(id);
        return { liveAgents: next };
      });
    },

    clearError: () => set({ error: null }),
  });

export const useAgentStore = create<AgentState>()(
  subscribeWithSelector(agentStore)
);
