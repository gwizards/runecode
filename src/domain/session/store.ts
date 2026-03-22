/**
 * Session bounded context — Zustand store.
 *
 * Thin delegation layer: all state mutations go through
 * SessionApplicationService. The store holds React-visible state and
 * exposes action methods that call the service and update local state.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import { SessionAggregate, toSessionId } from './types';
import type { SessionId } from './types';
import { InMemorySessionRepository } from './repository';
import { SessionApplicationService } from './service';

// ─── Service singleton for this store ────────────────────────────────────────

const _repo = new InMemorySessionRepository();
const _service = new SessionApplicationService(_repo, globalEventBus);

// ─── State shape ──────────────────────────────────────────────────────────────

export interface LiveUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface SessionStoreState {
  sessions: SessionAggregate[];
  currentSessionId: SessionId | null;
  loading: boolean;
  error: string | null;

  /** Maps sessionId → array of raw output chunks. */
  sessionOutputs: Record<string, string[]>;

  /** Currently active skill names (populated by StreamMessage as skills are invoked). */
  activeSkills: string[];

  /** Accumulates live token usage for the currently-open session. */
  liveUsage: LiveUsage;

  // Actions
  loadSessions(projectId: string): Promise<void>;
  selectSession(id: string): void;
  createSession(raw: {
    id: string;
    projectId: string;
    title?: string;
    status?: string;
  }): Promise<void>;
  appendOutput(id: string, chunk: string): Promise<void>;
  completeSession(id: string): Promise<void>;
  failSession(id: string, reason: string): Promise<void>;
  deleteSession(id: string): Promise<void>;
  clearError(): void;

  // Session output actions
  appendSessionOutput(sessionId: string, chunk: string): void;
  clearSessionOutputs(sessionId: string): void;

  // Active skill actions
  addActiveSkill(skill: string): void;
  removeActiveSkill(skill: string): void;
  clearActiveSkills(): void;

  // Live usage actions
  updateLiveUsage(delta: { inputTokens?: number; outputTokens?: number; costUsd?: number }): void;
  resetLiveUsage(): void;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionStoreState>((set, _get) => ({
  sessions: [],
  currentSessionId: null,
  loading: false,
  error: null,

  sessionOutputs: {},
  activeSkills: [],
  liveUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },

  // ── Load all sessions for a project ───────────────────────────────────────

  async loadSessions(projectId: string): Promise<void> {
    set({ loading: true, error: null });
    const result = await _service.listSessions(projectId);
    if (result.ok) {
      set({ sessions: result.value, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },

  // ── Select / focus a session ───────────────────────────────────────────────

  selectSession(id: string): void {
    set({ currentSessionId: toSessionId(id) });
  },

  // ── Create a new session ───────────────────────────────────────────────────

  async createSession(raw): Promise<void> {
    set({ loading: true, error: null });
    const result = await _service.createSession(raw);
    if (result.ok) {
      const session = result.value;
      set(state => ({
        sessions: [...state.sessions, session],
        currentSessionId: session.id,
        loading: false,
      }));
    } else {
      set({ error: result.error, loading: false });
    }
  },

  // ── Append output chunk ────────────────────────────────────────────────────

  async appendOutput(id: string, chunk: string): Promise<void> {
    const result = await _service.appendOutput(id, chunk);
    if (!result.ok) {
      set({ error: result.error });
      return;
    }
    // Re-fetch to reflect updated aggregate state
    const fetched = await _service.getSession(id);
    if (fetched.ok) {
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === id ? fetched.value : s,
        ),
      }));
    }
  },

  // ── Complete a session ─────────────────────────────────────────────────────

  async completeSession(id: string): Promise<void> {
    const result = await _service.completeSession(id);
    if (!result.ok) {
      set({ error: result.error });
      return;
    }
    const fetched = await _service.getSession(id);
    if (fetched.ok) {
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === id ? fetched.value : s,
        ),
      }));
    }
  },

  // ── Fail a session ─────────────────────────────────────────────────────────

  async failSession(id: string, reason: string): Promise<void> {
    const result = await _service.failSession(id, reason);
    if (!result.ok) {
      set({ error: result.error });
      return;
    }
    const fetched = await _service.getSession(id);
    if (fetched.ok) {
      set(state => ({
        sessions: state.sessions.map(s =>
          s.id === id ? fetched.value : s,
        ),
      }));
    }
  },

  // ── Delete a session ───────────────────────────────────────────────────────

  async deleteSession(id: string): Promise<void> {
    set({ loading: true, error: null });
    const result = await _service.deleteSession(id);
    if (result.ok) {
      set(state => ({
        sessions: state.sessions.filter(s => s.id !== id),
        currentSessionId:
          state.currentSessionId === id ? null : state.currentSessionId,
        loading: false,
      }));
    } else {
      set({ error: result.error, loading: false });
    }
  },

  // ── Clear error ────────────────────────────────────────────────────────────

  clearError(): void {
    set({ error: null });
  },

  // ── Session output tracking ────────────────────────────────────────────────

  appendSessionOutput(sessionId: string, chunk: string): void {
    set(state => ({
      sessionOutputs: {
        ...state.sessionOutputs,
        [sessionId]: [...(state.sessionOutputs[sessionId] ?? []), chunk],
      },
    }));
  },

  clearSessionOutputs(sessionId: string): void {
    set(state => {
      const next = { ...state.sessionOutputs };
      delete next[sessionId];
      return { sessionOutputs: next };
    });
  },

  // ── Active skill tracking ──────────────────────────────────────────────────

  addActiveSkill(skill: string): void {
    set(state => ({
      activeSkills: state.activeSkills.includes(skill)
        ? state.activeSkills
        : [...state.activeSkills, skill],
    }));
  },

  removeActiveSkill(skill: string): void {
    set(state => ({
      activeSkills: state.activeSkills.filter(s => s !== skill),
    }));
  },

  clearActiveSkills(): void {
    set({ activeSkills: [] });
  },

  // ── Live usage tracking ────────────────────────────────────────────────────

  updateLiveUsage(delta: { inputTokens?: number; outputTokens?: number; costUsd?: number }): void {
    set(state => ({
      liveUsage: {
        inputTokens: (delta.inputTokens ?? state.liveUsage.inputTokens),
        outputTokens: (delta.outputTokens ?? state.liveUsage.outputTokens),
        costUsd: (delta.costUsd ?? state.liveUsage.costUsd),
      },
    }));
  },

  resetLiveUsage(): void {
    set({ liveUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } });
  },
}));
