/**
 * Usage bounded context — IUsageLedgerRepository port.
 *
 * This is the canonical domain-facing port definition.
 * Infrastructure adapters (InMemoryUsageLedgerRepository, SQL, etc.)
 * implement this interface; application services depend only on this port.
 */

import type { LedgerId, SessionId, ProjectId, UsageLedger } from '../types';

export interface IUsageLedgerRepository {
  /** Return the aggregate for the given id, or null if not found. */
  getById(id: LedgerId): Promise<UsageLedger | null>;

  /** Return the open (unsealed) ledger for a session, or null if none exists. */
  getBySession(sessionId: SessionId): Promise<UsageLedger | null>;

  /** Persist (upsert) a ledger aggregate by snapshot. */
  save(ledger: UsageLedger): Promise<void>;

  /** Remove a ledger by id. No-op if not found. */
  delete(id: LedgerId): Promise<void>;

  /** Return all ledgers belonging to a project. */
  listByProject(projectId: ProjectId): Promise<UsageLedger[]>;

  /**
   * Return all ledgers whose openedAt falls within [from, to] (inclusive, Unix ms).
   * Both bounds are optional; omitting one makes the range open-ended.
   */
  listByDateRange(from?: number, to?: number): Promise<UsageLedger[]>;

  /**
   * Semantic nearest-neighbour search using cosine similarity over a numeric
   * feature vector derived from each ledger's quantized snapshot fields.
   * Returns up to `topK` matches sorted by descending similarity score.
   *
   * Feature vector per ledger (6 dimensions):
   *   [0] openedAt (Unix ms)
   *   [1] sealedAt (Unix ms; 0 when unsealed)
   *   [2] total inputTokens across all records
   *   [3] total outputTokens across all records
   *   [4] total cacheCreationTokens across all records
   *   [5] total cacheReadTokens across all records
   */
  searchByEmbedding(queryVector: number[], topK?: number): Array<{ ledgerId: string; score: number }>;
}
