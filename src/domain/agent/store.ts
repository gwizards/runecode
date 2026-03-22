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

// ─── Live agent record shape (O(1) lookup by ID) ───────────────────────────

export interface LiveAgentRecord {
  id: string;
  name: string;
  status: string;
  model?: string;
  /** Tab ID this agent is displayed in (populated by callers). */
  tabId?: string;
  startedAt?: number;
  elapsedMs?: number;
  tokenCount?: number;
}

/** Derive a flat record map from the aggregate array. */
function toRecordMap(agents: LiveAgentAggregate[]): Record<string, LiveAgentRecord> {
  const map: Record<string, LiveAgentRecord> = {};
  for (const a of agents) {
    map[a.id.value] = {
      id: a.id.value,
      name: a.name,
      status: a.status,
      startedAt: a.startedAt,
      elapsedMs: a.elapsedMs,
      tokenCount: a.tokenCount,
    };
  }
  return map;
}

// ─── Store shape ───────────────────────────────────────────────────────────

interface AgentDomainState {
  agents: LiveAgentAggregate[];
  /** Record-keyed mirror of `agents` for O(1) lookup by agent ID. */
  liveAgents: Record<string, LiveAgentRecord>;
  loading: boolean;
  error: string | null;

  startAgent(id: string, name: string): Promise<void>;
  markThinking(id: string): Promise<void>;
  tickAgent(id: string, elapsedMs: number, tokenCount: number): Promise<void>;
  completeAgent(id: string): Promise<void>;
  failAgent(id: string, reason: string): Promise<void>;
  getActiveAgents(): Promise<LiveAgentAggregate[]>;

  /** Add or replace an agent in the liveAgents map (used by lifecycle hooks). */
  addLiveAgent(agent: LiveAgentRecord): void;
  /** Partially update a live agent record. */
  updateLiveAgent(id: string, patch: Partial<LiveAgentRecord>): void;
  /** Remove a live agent from the map (e.g. when a tab is force-closed). */
  removeLiveAgent(id: string): void;
}

// ─── Store implementation ──────────────────────────────────────────────────

export const useAgentDomainStore = create<AgentDomainState>((set, get) => ({
  agents: [],
  liveAgents: {},
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
    set({ loading: false, agents, liveAgents: toRecordMap(agents) });
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
    set({ loading: false, agents, liveAgents: toRecordMap(agents) });
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
      set({ agents: allResult.value, liveAgents: toRecordMap(allResult.value) });
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
    set({ loading: false, agents, liveAgents: toRecordMap(agents) });
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
    set({ loading: false, agents, liveAgents: toRecordMap(agents) });
  },

  async getActiveAgents() {
    const result = await _service.listActiveAgents();
    if (!result.ok) {
      set({ error: result.error });
      return [];
    }
    set({ agents: result.value, liveAgents: toRecordMap(result.value) });
    return result.value;
  },

  // ── Direct liveAgents map mutations ────────────────────────────────────────

  addLiveAgent(agent: LiveAgentRecord): void {
    set(state => ({
      liveAgents: { ...state.liveAgents, [agent.id]: agent },
    }));
  },

  updateLiveAgent(id: string, patch: Partial<LiveAgentRecord>): void {
    set(state => {
      const existing = state.liveAgents[id];
      if (!existing) return state;
      return {
        liveAgents: {
          ...state.liveAgents,
          [id]: { ...existing, ...patch },
        },
      };
    });
  },

  removeLiveAgent(id: string): void {
    set(state => {
      const next = { ...state.liveAgents };
      delete next[id];
      return { liveAgents: next };
    });
  },
}));
