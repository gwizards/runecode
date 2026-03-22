/**
 * Usage bounded context — Zustand UI store.
 *
 * Thin adapter: translates UI actions into UsageApplicationService calls
 * and keeps flat summary snapshots for rendering.
 *
 * Does NOT contain any business logic — all domain rules live in
 * UsageLedger and UsageApplicationService.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { UsageSummary, RawUsageRecord } from './types';
import { InMemoryUsageLedgerRepository } from './repository';
import { UsageApplicationService } from './service';

// ─── Service singleton ─────────────────────────────────────────────────────

const _repo    = new InMemoryUsageLedgerRepository();
const _service = new UsageApplicationService(_repo, globalEventBus);

// ─── Store shape ───────────────────────────────────────────────────────────

interface UsageDomainState {
  /** Summary for the active ledger (current session). */
  currentSummary: UsageSummary | null;
  /** All summaries returned by the most recent queryUsage call. */
  summaries: UsageSummary[];
  loading: boolean;
  error: string | null;

  openLedger(cmd: { id: string; sessionId: string; projectId: string; userId: string }): Promise<void>;
  recordUsage(cmd: { sessionId: string; record: RawUsageRecord }): Promise<void>;
  sealLedger(cmd: { sessionId: string }): Promise<void>;
  loadSummary(sessionId: string): Promise<void>;
  queryUsage(cmd: { projectId?: string; from?: number; to?: number }): Promise<void>;
  clearError(): void;
}

// ─── Store implementation ──────────────────────────────────────────────────

export const useUsageDomainStore = create<UsageDomainState>((set) => ({
  currentSummary: null,
  summaries:      [],
  loading:        false,
  error:          null,

  async openLedger(cmd) {
    set({ loading: true, error: null });
    const result = await _service.openLedger(cmd);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, currentSummary: result.value.summary() });
  },

  async recordUsage(cmd) {
    set({ loading: true, error: null });
    const result = await _service.recordUsage(cmd);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, currentSummary: result.value });
  },

  async sealLedger(cmd) {
    set({ loading: true, error: null });
    const result = await _service.sealLedger(cmd);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, currentSummary: result.value });
  },

  async loadSummary(sessionId) {
    set({ loading: true, error: null });
    const result = await _service.getLedgerSummary(sessionId);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, currentSummary: result.value });
  },

  async queryUsage(cmd) {
    set({ loading: true, error: null });
    const result = await _service.queryUsage(cmd);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, summaries: result.value });
  },

  clearError() {
    set({ error: null });
  },
}));
