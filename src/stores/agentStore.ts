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
  // Uses Record instead of Map for Zustand shallow equality compatibility
  liveAgents: Record<string, LiveAgent>;

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
    liveAgents: {},
    error: null,

    addLiveAgent: (agent: LiveAgent) => {
      set((state) => ({
        liveAgents: { ...state.liveAgents, [agent.id]: agent },
      }));
    },

    updateLiveAgent: (id: string, updates: Partial<LiveAgent>) => {
      set((state) => {
        const existing = state.liveAgents[id];
        if (!existing) return state;
        return {
          liveAgents: { ...state.liveAgents, [id]: { ...existing, ...updates } },
        };
      });
    },

    removeLiveAgent: (id: string) => {
      set((state) => {
        const { [id]: _, ...rest } = state.liveAgents;
        return { liveAgents: rest };
      });
    },

    clearError: () => set({ error: null }),
  });

export const useAgentStore = create<AgentState>()(
  subscribeWithSelector(agentStore)
);
