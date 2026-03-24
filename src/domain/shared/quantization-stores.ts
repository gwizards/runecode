/**
 * Higher-level quantized storage containers.
 *
 * QuantizedSnapshotStore — in-memory key/value store holding QuantizedBuffers.
 * QuantizedVectorStore   — flat int8 vector store for HNSW embeddings.
 * computeSavingsProjections — memory savings estimates across aggregate types.
 *
 * These classes depend on the primitive math in quantization-core but have no
 * knowledge of individual bounded contexts or snapshot shapes.
 */

import {
  type QuantizedBuffer,
  type QuantizedEntry,
  type SavingsProjection,
  ScalarQuantizer,
  quantizeVector,
  dequantizeVector,
  int8CosineSimilarity,
} from './quantization-core';

// ─── QuantizedSnapshotStore<T> ────────────────────────────────────────────────

/**
 * An in-memory snapshot store that keeps all records in quantized form.
 *
 * Records are decoded on retrieval (on-the-fly, not cached) so the in-flight
 * domain objects always see full-fidelity data. The store itself holds only
 * QuantizedBuffers, achieving the stated memory targets.
 *
 * Generic parameters:
 *   T — the raw snapshot type (e.g. RawLiveAgent)
 *   K — the key type (typically a branded string ID)
 */
export class QuantizedSnapshotStore<T, K extends string> {
  private readonly store = new Map<K, QuantizedBuffer>();
  private readonly quantizer: ScalarQuantizer<T>;

  constructor(quantizer: ScalarQuantizer<T>) {
    this.quantizer = quantizer;
  }

  set(key: K, snapshot: T): void {
    this.store.set(key, this.quantizer.encode(snapshot));
  }

  get(key: K): T | undefined {
    const buf = this.store.get(key);
    return buf !== undefined ? this.quantizer.decode(buf) : undefined;
  }

  has(key: K): boolean {
    return this.store.has(key);
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  values(): T[] {
    return Array.from(this.store.values()).map((buf) => this.quantizer.decode(buf));
  }

  keys(): K[] {
    return Array.from(this.store.keys());
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Estimate total bytes consumed by the quantized fixed arrays.
   * Excludes string heap (which cannot be easily bounded without TextEncoder).
   */
  estimateFixedBytes(): number {
    let total = 0;
    for (const buf of this.store.values()) {
      total += buf.fixed.uint8.byteLength;
      total += buf.fixed.uint16.byteLength;
      total += buf.fixed.uint32.byteLength;
      total += buf.fixed.int8.byteLength;
      total += buf.fixed.int16.byteLength;
    }
    return total;
  }

  /**
   * Nearest-neighbour search over the int8-quantized numeric fields.
   * Returns up to `topK` keys sorted by cosine similarity (descending).
   *
   * The query vector is quantized to int8 using symmetric per-vector scaling
   * (max|v|/127) before comparison — the same scheme used during encoding.
   * Cosine similarity is computed directly in the int8 domain, which is
   * mathematically equivalent to float cosine when scales are close (and
   * sufficient for ranking purposes).
   *
   * Falls back gracefully: if the quantizer encodes no int8 numeric fields
   * (i.e. all stored buffers have int8.length === 0), returns [] immediately.
   */
  searchNearest(
    queryVector: number[],
    topK = 5,
  ): Array<{ key: K; score: number; value: T }> {
    // Determine the int8 vector length from the first stored entry.
    // If there are no entries, or int8 dimension is zero, nothing to search.
    const firstBuf = this.store.values().next().value as QuantizedBuffer | undefined;
    if (firstBuf === undefined || firstBuf.fixed.int8.length === 0) {
      return [];
    }
    const dim = firstBuf.fixed.int8.length;

    // Quantize query to int8 using symmetric scaling (max|v|/127).
    const qQuery = new Int8Array(dim);
    let maxAbs = 0;
    for (let i = 0; i < dim; i++) {
      const abs = Math.abs(queryVector[i] ?? 0);
      if (abs > maxAbs) maxAbs = abs;
    }
    const queryScale = maxAbs === 0 ? 1 : maxAbs / 127;
    for (let i = 0; i < dim; i++) {
      const v = queryVector[i] ?? 0;
      qQuery[i] = Math.max(-127, Math.min(127, Math.round(v / queryScale)));
    }

    // Score every stored entry and collect results.
    const results: Array<{ key: K; score: number; value: T }> = [];
    for (const [key, buf] of this.store.entries()) {
      const stored = buf.fixed.int8;
      // Skip entries whose int8 dimension doesn't match (schema mismatch guard).
      if (stored.length !== dim) continue;
      const score = int8CosineSimilarity(qQuery, stored);
      results.push({ key, score, value: this.quantizer.decode(buf) });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }
}

// ─── HNSW QuantizedVectorStore ────────────────────────────────────────────────

/**
 * A flat vector store that quantizes 384-dim float32 embeddings to int8
 * before storage, achieving 4x memory reduction.
 *
 * This is a flat index suitable for use as the backing store for an HNSW graph.
 * The HNSW graph structure itself (links, levels) is separate; this store only
 * handles the vector data layer.
 *
 * Approximate nearest-neighbour search should use int8CosineSimilarity for
 * candidate scoring to stay in the quantized domain.
 */
export class QuantizedVectorStore {
  private readonly entries = new Map<string, QuantizedEntry>();
  readonly dimensions: number;

  constructor(dimensions: number = 384) {
    this.dimensions = dimensions;
  }

  addVector(key: string, vector: Float32Array): void {
    if (vector.length !== this.dimensions) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`,
      );
    }
    const { quantized, scale } = quantizeVector(vector);
    this.entries.set(key, { key, quantized, scale });
  }

  getVector(key: string): Float32Array | undefined {
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    return dequantizeVector(entry.quantized, entry.scale);
  }

  getQuantized(key: string): QuantizedEntry | undefined {
    return this.entries.get(key);
  }

  deleteVector(key: string): void {
    this.entries.delete(key);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /**
   * Linear scan with int8 cosine similarity scoring.
   * For large collections replace with a proper HNSW graph traversal.
   *
   * Returns results sorted by descending similarity.
   */
  search(query: Float32Array, topK: number): Array<{ key: string; score: number }> {
    const { quantized: qQuery } = quantizeVector(query);

    const results: Array<{ key: string; score: number }> = [];
    for (const entry of this.entries.values()) {
      const score = int8CosineSimilarity(qQuery, entry.quantized);
      results.push({ key: entry.key, score });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Estimate total bytes consumed by the quantized int8 arrays.
   * Baseline float32 would be 4× this figure.
   */
  estimateBytes(): number {
    return this.entries.size * this.dimensions; // 1 byte per dimension (int8)
  }

  estimateBaselineFloat32Bytes(): number {
    return this.entries.size * this.dimensions * 4;
  }
}

// ─── Memory savings projections ───────────────────────────────────────────────

/**
 * Compute memory savings projections for a given record count.
 *
 * Baseline figures are derived from empirical field sizes in the snapshot types:
 *
 *   RawLiveAgent:
 *     Quantizable numeric fields: status(~10), tokenCount(8), startedAt(8), elapsedMs(8) = 34 bytes
 *     Quantized:                  status(1) + 3×uint32(12) = 13 bytes
 *
 *   RawMCPServer:
 *     Quantizable fields:         transport(~5), status(~12), enabled(~5) = 22 bytes
 *     Quantized:                  3×uint8 = 3 bytes
 *
 *   RawProject:
 *     Quantizable fields:         createdAt ISO(24), lastOpenedAt ISO(24) = 48 bytes
 *     Quantized:                  2×uint32 = 8 bytes
 *
 *   HNSW 384-dim embedding:
 *     Baseline float32:           384×4 = 1536 bytes
 *     Quantized int8:             384×1 = 384 bytes
 */
export function computeSavingsProjections(recordCounts: number[]): SavingsProjection[][] {
  const specs: Array<{
    type: string;
    baselinePerRecord: number;
    quantizedPerRecord: number;
  }> = [
    {
      type: 'RawLiveAgent',
      baselinePerRecord: 34,   // status string + 3×float64 numeric
      quantizedPerRecord: 13,  // 1×uint8 + 3×uint32
    },
    {
      type: 'RawMCPServer',
      baselinePerRecord: 22,   // transport + status strings + boolean
      quantizedPerRecord: 3,   // 3×uint8
    },
    {
      type: 'RawProject',
      baselinePerRecord: 48,   // 2×ISO-8601 strings
      quantizedPerRecord: 8,   // 2×uint32
    },
    {
      type: 'HNSW embedding (384-dim)',
      baselinePerRecord: 1536, // 384×float32
      quantizedPerRecord: 384, // 384×int8
    },
  ];

  return recordCounts.map((n) =>
    specs.map(({ type, baselinePerRecord, quantizedPerRecord }) => {
      const baselineBytes = n * baselinePerRecord;
      const quantizedBytes = n * quantizedPerRecord;
      const savingBytes = baselineBytes - quantizedBytes;
      const savingPercent = Math.round((savingBytes / baselineBytes) * 100);
      return {
        aggregateType: type,
        records: n,
        baselineBytes,
        quantizedBytes,
        savingBytes,
        savingPercent,
      };
    }),
  );
}
