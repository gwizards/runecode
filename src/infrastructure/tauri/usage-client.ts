// Infrastructure client — Tauri IPC adapter for usage ledger persistence.
//
// The TypeScript domain keeps an InMemoryUsageLedgerRepository as its fast
// in-memory cache.  This client provides write-through durability by calling
// Rust/SQLite Tauri commands after every mutation and rehydration on boot.

import { apiCall } from '@/lib/apiAdapter';
import type { RawLedger } from '@/domain/usage/types';

/** Shape of a row returned by the Rust `load_usage_ledgers` command. */
export interface PersistedLedgerRow {
  id: string;
  projectId: string;
  sessionId: string | null;
  /** JSON-serialised array of UsageRecord objects. */
  recordsJson: string;
  /** Integer micro-dollars (1_000_000 = $1.00). */
  totalCostMicroUsd: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Persist (upsert) a single UsageLedger snapshot to SQLite.
 *
 * Call this after every `repo.save(ledger)` so that the in-memory store
 * is always backed by durable storage.  Cost is passed as integer
 * micro-dollars to avoid any float precision loss at the persistence boundary.
 *
 * @param ledger     - The aggregate snapshot produced by `ledger.toSnapshot()`
 * @param totalCostMicroUsd - Sum of `record.costMicroUsd` across all records
 */
export async function persistUsageLedger(
  ledger: RawLedger,
  totalCostMicroUsd: number,
): Promise<void> {
  try {
    await apiCall<void>('persist_usage_ledger', {
      id: ledger.id,
      projectId: ledger.projectId,
      sessionId: ledger.sessionId ?? null,
      recordsJson: JSON.stringify(ledger.records),
      totalCostMicroUsd,
    });
  } catch (err) {
    // Log but never throw — persistence failure must not break the domain flow.
    console.error('[usage-client] persist_usage_ledger failed:', err);
  }
}

/**
 * Load all persisted UsageLedger rows from SQLite.
 *
 * Call once on app boot to rehydrate the InMemoryUsageLedgerRepository.
 * Returns an empty array if the table has no rows or the command fails.
 */
export async function loadUsageLedgers(): Promise<PersistedLedgerRow[]> {
  try {
    const rows = await apiCall<PersistedLedgerRow[]>('load_usage_ledgers');
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error('[usage-client] load_usage_ledgers failed:', err);
    return [];
  }
}
