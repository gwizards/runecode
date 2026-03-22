/**
 * Analytics bounded context — IConsentRepository port.
 *
 * Defines the storage contract the domain requires for ConsentAggregate.
 * Adapters live in src/infrastructure/; in-memory adapters live in
 * src/domain/analytics/repository.ts.
 *
 * No browser APIs, localStorage, or Tauri imports.
 */

import type { ConsentId, AnalyticsSessionId } from '../types';
import type { ConsentAggregate } from '../types';

export interface IConsentRepository {
  findById(id: ConsentId): ConsentAggregate | undefined;
  findBySession(sessionId: AnalyticsSessionId): ConsentAggregate | undefined;
  save(consent: ConsentAggregate): void;
  /**
   * Semantic nearest-neighbour search over quantized numeric fields of stored
   * consent snapshots. Returns up to `topK` matches sorted by descending cosine
   * similarity. Returns [] when no int8-quantized dimensions are present.
   */
  searchByEmbedding(
    queryVector: number[],
    topK?: number,
  ): Array<{ consentId: ConsentId; score: number }>;
}
