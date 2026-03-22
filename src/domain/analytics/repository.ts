/**
 * Analytics bounded context — Repository ports and in-memory adapters.
 *
 * Ports (interfaces) define what the domain needs.
 * Adapters (classes) fulfil those ports with concrete storage strategies.
 *
 * No browser APIs, localStorage, or Tauri imports here.
 */

import { ScalarQuantizer, QuantizedSnapshotStore, QuantizedBuffer } from '../shared/quantization';
import type { ConsentId, RawConsent, AnalyticsSessionId, ConsentStatus } from './types';
import { ConsentAggregate, toConsentId } from './types';

// ─── Port ─────────────────────────────────────────────────────────────────────

export interface IConsentRepository {
  findById(id: ConsentId): ConsentAggregate | undefined;
  findBySession(sessionId: AnalyticsSessionId): ConsentAggregate | undefined;
  save(consent: ConsentAggregate): void;
  /**
   * Semantic nearest-neighbour search over the int8-quantized numeric fields
   * of stored consent snapshots.  Returns up to `topK` matches sorted by
   * descending cosine similarity.  Returns [] when the backing store contains
   * no int8-quantized dimensions (i.e. all fields are strings/uint).
   */
  searchByEmbedding(queryVector: number[], topK?: number): Array<{ consentId: ConsentId; score: number }>;
}

// ─── ConsentSnapshotQuantizer ─────────────────────────────────────────────────

/**
 * Quantizes RawConsent snapshots for compact in-memory storage.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0]  — status code (0=pending, 1=granted, 2=revoked)
 *   uint32[0] — grantedAt  (seconds since epoch; 0 = not set)
 *   uint32[1] — revokedAt  (seconds since epoch; 0 = not set)
 *
 * String fields (id, sessionId, projectId) are preserved as-is.
 */
class ConsentSnapshotQuantizer extends ScalarQuantizer<RawConsent> {
  readonly version = 1;

  private static readonly STATUS_ENCODE: Record<ConsentStatus, number> = {
    pending: 0,
    granted: 1,
    revoked: 2,
  };

  private static readonly STATUS_DECODE: ConsentStatus[] = [
    'pending',
    'granted',
    'revoked',
  ];

  encode(snapshot: RawConsent): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      1, // uint8:  [status]
      0, // uint16: (none)
      2, // uint32: [grantedAt, revokedAt]
      0, // int8:   (none)
      0, // int16:  (none)
    );

    fixed.uint8[0] = ConsentSnapshotQuantizer.STATUS_ENCODE[snapshot.status];
    fixed.uint32[0] = snapshot.grantedAt !== undefined
      ? this.encodeTimestampMs(snapshot.grantedAt)
      : 0;
    fixed.uint32[1] = snapshot.revokedAt !== undefined
      ? this.encodeTimestampMs(snapshot.revokedAt)
      : 0;

    return {
      version: this.version,
      fixed,
      strings: {
        id: snapshot.id,
        sessionId: snapshot.sessionId,
        projectId: snapshot.projectId,
      },
      params: {
        grantedAt: { scale: 1000, zeroPoint: 0 },
        revokedAt: { scale: 1000, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): RawConsent {
    this.assertVersion(buf);

    const statusCode = buf.fixed.uint8[0] ?? 0;
    const status = ConsentSnapshotQuantizer.STATUS_DECODE[statusCode] ?? 'pending';

    const grantedAtSec = buf.fixed.uint32[0] ?? 0;
    const revokedAtSec = buf.fixed.uint32[1] ?? 0;

    return {
      id: buf.strings['id'] ?? '',
      sessionId: buf.strings['sessionId'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      status,
      grantedAt: grantedAtSec !== 0 ? this.decodeTimestampMs(grantedAtSec) : undefined,
      revokedAt: revokedAtSec !== 0 ? this.decodeTimestampMs(revokedAtSec) : undefined,
    };
  }
}

// ─── InMemoryConsentRepository ────────────────────────────────────────────────

/**
 * In-memory adapter backed by a QuantizedSnapshotStore.
 * Records are stored as QuantizedBuffers and decoded on retrieval.
 */
export class InMemoryConsentRepository implements IConsentRepository {
  private readonly store: QuantizedSnapshotStore<RawConsent, ConsentId>;
  /** Secondary index: sessionId → consentId for fast session lookups. */
  private readonly sessionIndex = new Map<AnalyticsSessionId, ConsentId>();

  constructor() {
    this.store = new QuantizedSnapshotStore<RawConsent, ConsentId>(
      new ConsentSnapshotQuantizer(),
    );
  }

  findById(id: ConsentId): ConsentAggregate | undefined {
    const raw = this.store.get(id);
    if (raw === undefined) return undefined;
    return ConsentAggregate.fromSnapshot(raw);
  }

  findBySession(sessionId: AnalyticsSessionId): ConsentAggregate | undefined {
    const id = this.sessionIndex.get(sessionId);
    if (id === undefined) return undefined;
    return this.findById(id);
  }

  save(consent: ConsentAggregate): void {
    const snapshot = consent.toSnapshot();
    this.store.set(toConsentId(snapshot.id), snapshot);
    this.sessionIndex.set(snapshot.sessionId as AnalyticsSessionId, toConsentId(snapshot.id));
  }

  searchByEmbedding(
    queryVector: number[],
    topK = 5,
  ): Array<{ consentId: ConsentId; score: number }> {
    return this.store
      .searchNearest(queryVector, topK)
      .map(({ key, score }) => ({ consentId: key, score }));
  }

  /**
   * Seed the repository with pre-existing raw snapshots.
   * Useful for testing or hydrating from a persistence layer.
   */
  seed(items: RawConsent[]): void {
    for (const raw of items) {
      const aggregate = ConsentAggregate.fromSnapshot(raw);
      this.save(aggregate);
    }
  }

  get size(): number {
    return this.store.size;
  }
}
