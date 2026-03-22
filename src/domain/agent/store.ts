/**
 * Agent bounded context — Zustand UI store.
 *
 * Thin adapter: translates UI actions into AgentApplicationService calls
 * and keeps a flat snapshot list for rendering.
 *
 * Does NOT import from src/stores/agentStore.ts or src/lib/api.ts.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { LiveAgentAggregate } from './types';
import { InMemoryAgentRepository } from './repository';
import { AgentApplicationService } from './service';

// ─── Service singleton ─────────────────────────────────────────────────────

const _repo = new InMemoryAgentRepository();
const _service = new AgentApplicationService(_repo, globalEventBus);

// ─── Store shape ───────────────────────────────────────────────────────────

interface AgentDomainState {
  agents: LiveAgentAggregate[];
  loading: boolean;
  error: string | null;

  startAgent(id: string, name: string): Promise<void>;
  markThinking(id: string): Promise<void>;
  tickAgent(id: string, elapsedMs: number, tokenCount: number): Promise<void>;
  completeAgent(id: string): Promise<void>;
  failAgent(id: string, reason: string): Promise<void>;
  getActiveAgents(): Promise<LiveAgentAggregate[]>;
}

// ─── Store implementation ──────────────────────────────────────────────────

export const useAgentDomainStore = create<AgentDomainState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  async startAgent(id, name) {
    set({ loading: true, error: null });
    const result = await _service.startAgent(id, name);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listActiveAgents();
    const agents = allResult.ok ? allResult.value : get().agents;
    set({ loading: false, agents });
  },

  async markThinking(id) {
    set({ loading: true, error: null });
    const result = await _service.markThinking(id);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listActiveAgents();
    const agents = allResult.ok ? allResult.value : get().agents;
    set({ loading: false, agents });
  },

  async tickAgent(id, elapsedMs, tokenCount) {
    // Tick is high-frequency — skip loading flag to avoid excessive re-renders
    const result = await _service.tickAgent(id, elapsedMs, tokenCount);
    if (!result.ok) {
      set({ error: result.error });
      return;
    }
    const allResult = await _service.listActiveAgents();
    if (allResult.ok) {
      set({ agents: allResult.value });
    }
  },

  async completeAgent(id) {
    set({ loading: true, error: null });
    const result = await _service.completeAgent(id);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listActiveAgents();
    const agents = allResult.ok ? allResult.value : get().agents;
    set({ loading: false, agents });
  },

  async failAgent(id, reason) {
    set({ loading: true, error: null });
    const result = await _service.failAgent(id, reason);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listActiveAgents();
    const agents = allResult.ok ? allResult.value : get().agents;
    set({ loading: false, agents });
  },

  async getActiveAgents() {
    const result = await _service.listActiveAgents();
    if (!result.ok) {
      set({ error: result.error });
      return [];
    }
    set({ agents: result.value });
    return result.value;
  },
}));
