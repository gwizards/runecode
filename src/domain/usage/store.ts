/**
 * Usage bounded context — Zustand UI store.
 *
 * Thin adapter: translates UI actions into UsageApplicationService calls
 * and keeps flat summary snapshots for rendering.
 *
 * Does NOT contain any business logic — all domain rules live in
 * UsageLedger and UsageApplicationService.
 *
 * Persistence strategy:
 *   - InMemoryUsageLedgerRepository is the fast in-memory cache.
 *   - After every mutation (save), the Tauri SQLite commands are called
 *     as a write-through so data survives app restarts.
 *   - On first import the store triggers a one-time rehydration from SQLite.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { UsageSummary, RawUsageRecord } from './types';
import { LedgerId, UsageLedger } from './types';
import type { UsageLedger as UsageLedgerType } from './types';
import { InMemoryUsageLedgerRepository } from './repository';
import { UsageApplicationService } from './service';
import type { IUsagePersistencePort } from './ports/IUsagePersistencePort';

let _persistencePort: IUsagePersistencePort | null = null;

/**
 * Wire up the concrete persistence adapter at app bootstrap.
 * Must be called before any store mutation or rehydration.
 * (follows the same pattern as setRuFloEventListener in ruflo/store.ts)
 */
export function setUsagePersistencePort(port: IUsagePersistencePort): void {
  _persistencePort = port;
}

// ─── Service singleton ─────────────────────────────────────────────────────

const _repo    = new InMemoryUsageLedgerRepository();
const _service = new UsageApplicationService(_repo, globalEventBus);

// ─── Write-through helper ─────────────────────────────────────────────────

/**
 * Persist a ledger to SQLite after an in-memory save.
 * Computes the integer micro-dollar total from the aggregate's records
 * so the Rust layer never needs to parse costUsd floats.
 */
async function writeThrough(ledger: UsageLedgerType): Promise<void> {
  const snapshot = ledger.toSnapshot();
  const totalCostMicroUsd = ledger.records.reduce((sum, r) => sum + r.costMicroUsd, 0);
  if (_persistencePort) {
    await _persistencePort.persist(snapshot, totalCostMicroUsd);
  }
}

// ─── Boot-time rehydration ────────────────────────────────────────────────

/**
 * Load persisted ledgers from SQLite and seed the in-memory repository.
 * Runs once at module import time; errors are logged and swallowed so a
 * missing or empty database does not prevent the app from starting.
 */
async function rehydrateFromSqlite(): Promise<void> {
  try {
    if (!_persistencePort) return;
    const rows = await _persistencePort.loadAll();
    for (const row of rows) {
      let records: unknown[];
      try {
        records = JSON.parse(row.recordsJson);
      } catch {
        continue; // skip malformed rows
      }
      const snapshotResult = UsageLedger.fromSnapshot({
        id:        row.id,
        sessionId: row.sessionId ?? '',
        projectId: row.projectId,
        userId:    '', // userId not stored at row level; fromSnapshot falls back to generated UUID
        records:   records as never,
        sealed:    false,
        openedAt:  row.createdAt,
        sealedAt:  null,
      });
      if (snapshotResult.ok) {
        _repo.seed(snapshotResult.value);
      }
    }
  } catch (err) {
    console.error('[usage-store] rehydrateFromSqlite failed:', err);
  }
}

// Fire-and-forget on module load.  The store is usable immediately from
// the in-memory cache; rehydration backfills it asynchronously.
rehydrateFromSqlite();

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
    // Write-through: persist the new ledger to SQLite after in-memory save.
    await writeThrough(result.value);
    set({ loading: false, currentSummary: result.value.summary() });
  },

  async recordUsage(cmd) {
    set({ loading: true, error: null });
    const result = await _service.recordUsage(cmd);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    // Write-through: fetch the updated aggregate and persist it.
    const ledgerResult = await _service.getLedger(cmd.sessionId);
    if (ledgerResult.ok) {
      await writeThrough(ledgerResult.value);
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
    // Write-through: the sealed ledger is still in the repo by its id.
    // getBySession skips sealed ledgers, so fetch directly via LedgerId.
    const lidResult = LedgerId.create(result.value.ledgerId);
    if (lidResult.ok) {
      const sealedLedger = await _repo.getById(lidResult.value);
      if (sealedLedger) {
        await writeThrough(sealedLedger);
      }
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
