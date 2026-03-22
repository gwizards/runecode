/**
 * Usage bounded context — Repository in-memory implementation.
 *
 * IUsageLedgerRepository is the domain-facing port (defined in ports/IUsageLedgerRepository.ts).
 * InMemoryUsageLedgerRepository is the default adapter (suitable for tests and dev).
 */

import type { RawLedger } from './types';
import { LedgerId, SessionId, ProjectId, UsageLedger } from './types';
import { unwrap } from '../shared/result';
import { quantizeVector, int8CosineSimilarity } from '../shared/quantization';
import type { IUsageLedgerRepository } from './ports/IUsageLedgerRepository';

// Re-export the port so existing barrel imports from './repository' continue to work.
export type { IUsageLedgerRepository } from './ports/IUsageLedgerRepository';

// ─── Feature-vector extraction ─────────────────────────────────────────────

/**
 * Derive a 6-element float32 feature vector from a RawLedger snapshot.
 *
 * Dimensions:
 *   [0] openedAt              — Unix ms timestamp
 *   [1] sealedAt              — Unix ms timestamp (0 when unsealed)
 *   [2] total inputTokens     — sum across all usage records
 *   [3] total outputTokens    — sum across all usage records
 *   [4] total cacheCreationTokens
 *   [5] total cacheReadTokens
 *
 * These dimensions give a lightweight semantic fingerprint of a ledger's
 * temporal position and token consumption pattern.
 */
function ledgerFeatureVector(snapshot: RawLedger): Float32Array {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  for (const rec of snapshot.records) {
    inputTokens         += rec.inputTokens;
    outputTokens        += rec.outputTokens;
    cacheCreationTokens += rec.cacheCreationTokens;
    cacheReadTokens     += rec.cacheReadTokens;
  }
  return new Float32Array([
    snapshot.openedAt,
    snapshot.sealedAt ?? 0,
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
  ]);
}

// ─── In-memory implementation ──────────────────────────────────────────────

export class InMemoryUsageLedgerRepository implements IUsageLedgerRepository {
  /** Internal store keyed by ledgerId. */
  private readonly ledgers = new Map<string, RawLedger>();

  async getById(id: LedgerId): Promise<UsageLedger | null> {
    const snapshot = this.ledgers.get(id.value);
    if (!snapshot) return null;
    return unwrap(UsageLedger.fromSnapshot(snapshot));
  }

  async getBySession(sessionId: SessionId): Promise<UsageLedger | null> {
    for (const snapshot of this.ledgers.values()) {
      if (snapshot.sessionId === sessionId.value && !snapshot.sealed) {
        return unwrap(UsageLedger.fromSnapshot(snapshot));
      }
    }
    return null;
  }

  async save(ledger: UsageLedger): Promise<void> {
    this.ledgers.set(ledger.id.value, ledger.toSnapshot());
  }

  async delete(id: LedgerId): Promise<void> {
    this.ledgers.delete(id.value);
  }

  async listByProject(projectId: ProjectId): Promise<UsageLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((s) => s.projectId === projectId.value)
      .map((s) => unwrap(UsageLedger.fromSnapshot(s)));
  }

  async listByDateRange(from?: number, to?: number): Promise<UsageLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((s) => {
        if (from !== undefined && s.openedAt < from) return false;
        if (to   !== undefined && s.openedAt > to)   return false;
        return true;
      })
      .map((s) => unwrap(UsageLedger.fromSnapshot(s)));
  }

  searchByEmbedding(
    queryVector: number[],
    topK = 5,
  ): Array<{ ledgerId: string; score: number }> {
    // Quantize the query once and reuse across all entries.
    const queryFloat32 = new Float32Array(queryVector);
    const { quantized: qQuery } = quantizeVector(queryFloat32);

    const results: Array<{ ledgerId: string; score: number }> = [];
    for (const [id, snapshot] of this.ledgers.entries()) {
      const featureVec = ledgerFeatureVector(snapshot);
      const { quantized: qEntry } = quantizeVector(featureVec);
      // Pad or truncate to match query length so int8CosineSimilarity doesn't throw.
      const len = Math.min(qQuery.length, qEntry.length);
      const score = int8CosineSimilarity(qQuery.slice(0, len), qEntry.slice(0, len));
      results.push({ ledgerId: id, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Test helper — seed a ledger directly into the store without going
   * through save() so that tests can set up state without triggering
   * any service-layer side effects.
   */
  seed(ledger: UsageLedger): void {
    this.ledgers.set(ledger.id.value, ledger.toSnapshot());
  }
}
