/**
 * QuantizedMemoryStore — integrates ProductQuantizer with the RuFlo memory service.
 *
 * Provides a higher-level API for storing and searching embeddings with
 * automatic quantization. Reduces memory footprint by 4x (SQ) to 192x (PQ).
 *
 * Usage:
 *   const store = new QuantizedMemoryStore({ mode: 'scalar' });
 *   store.add('key1', embedding1);
 *   const nearest = store.search(queryEmbedding, 5);
 */

import {
  quantizeEmbedding,
  dequantizeEmbedding,
  cosineSimilarityQuantized,
  ProductQuantizer,
  quantizationSavings,
  CalibratedQuantizer,
  type PQConfig,
  type MemorySavingsReport,
} from './quantization';

export type QuantizationMode = 'none' | 'scalar' | 'product';

export interface QuantizedEntry {
  key: string;
  /** Scalar-quantized embedding (uint8) or PQ code */
  data: Uint8Array;
  metadata?: Record<string, unknown>;
  addedAt: number;
  ttlMs?: number;
}

export interface SearchResult {
  key: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface QuantizedMemoryStoreConfig {
  mode?: QuantizationMode;
  dims?: number;
  pq?: Partial<PQConfig>;
  /** Maximum entries before LRU eviction triggers. Default: unlimited. */
  maxEntries?: number;
  /** Default TTL in milliseconds for new entries. Default: no expiry. */
  defaultTtlMs?: number;
}

export class QuantizedMemoryStore {
  private mode: QuantizationMode;
  private dims: number;
  private entries: Map<string, QuantizedEntry> = new Map();
  private pq?: ProductQuantizer;
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number | undefined;
  private _quantizer: CalibratedQuantizer;

  constructor(config: QuantizedMemoryStoreConfig = {}) {
    this.mode = config.mode ?? 'scalar';
    this.dims = config.dims ?? 384;
    this.maxEntries = config.maxEntries ?? 0;
    this.defaultTtlMs = config.defaultTtlMs;
    this._quantizer = new CalibratedQuantizer(this.dims);

    if (this.mode === 'product') {
      this.pq = new ProductQuantizer({ dims: this.dims, ...config.pq });
    }
  }

  private isExpired(entry: QuantizedEntry): boolean {
    if (entry.ttlMs === undefined) return false;
    return Date.now() - entry.addedAt > entry.ttlMs;
  }

  get size(): number {
    for (const [key, entry] of this.entries) {
      if (this.isExpired(entry)) this.entries.delete(key);
    }
    return this.entries.size;
  }

  get isTrained(): boolean {
    if (this.mode === 'product') return this.pq?.isTrained ?? false;
    return true; // scalar/none modes don't need training
  }

  /**
   * Train the PQ codebook. Required before add() when mode='product'.
   * At least numCentroids (256) training vectors recommended.
   */
  train(embeddings: (Float32Array | number[])[]): void {
    if (this.mode !== 'product' || !this.pq) return;
    this.pq.train(embeddings);
  }

  /** Store an embedding with the given key */
  add(key: string, embedding: Float32Array | number[], metadata?: Record<string, unknown>, ttlMs?: number): void {
    let data: Uint8Array;

    if (this.mode === 'scalar') {
      // Use CalibratedQuantizer if fitted (better range mapping), else fall back to global scalar
      data = this._quantizer.isFitted
        ? this._quantizer.encode(embedding)
        : quantizeEmbedding(embedding);
    } else if (this.mode === 'product') {
      if (!this.pq?.isTrained) throw new Error('ProductQuantizer must be trained before add()');
      data = this.pq.encode(embedding);
    } else {
      // mode === 'none': store as uint8 via scalar for memory layout consistency
      data = this._quantizer.isFitted
        ? this._quantizer.encode(embedding)
        : quantizeEmbedding(embedding);
    }

    this.entries.set(key, { key, data, metadata, addedAt: Date.now(), ttlMs: ttlMs ?? this.defaultTtlMs });

    // TODO: use recommendMode(this.size) to upgrade quantization strategy
    if (this.maxEntries > 0 && this.entries.size > this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;
      for (const [k, e] of this.entries) {
        if (e.addedAt < oldestTime) { oldestTime = e.addedAt; oldestKey = k; }
      }
      if (oldestKey !== undefined) this.entries.delete(oldestKey);
    }
  }

  /** Remove an entry */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Check if a key exists */
  has(key: string): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) { this.entries.delete(key); return false; }
    return true;
  }

  /**
   * Search for the top-k nearest entries by cosine similarity.
   * Returns results sorted by similarity (highest first).
   */
  search(query: Float32Array | number[], topK = 10): SearchResult[] {
    if (this.entries.size === 0) return [];

    let queryData: Uint8Array;
    if (this.mode === 'product') {
      if (!this.pq?.isTrained) throw new Error('ProductQuantizer must be trained before search()');
      queryData = this.pq.encode(query);
    } else {
      // Use CalibratedQuantizer if fitted so query and stored vectors use the same space
      queryData = this._quantizer.isFitted
        ? this._quantizer.encode(query)
        : quantizeEmbedding(query);
    }

    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
      if (this.isExpired(entry)) { this.entries.delete(entry.key); continue; }
      let similarity: number;
      if (this.mode === 'product') {
        similarity = this.pq!.similarity(queryData, entry.data);
      } else {
        similarity = cosineSimilarityQuantized(queryData, entry.data);
      }
      results.push({ key: entry.key, similarity, metadata: entry.metadata });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
  }

  /** Retrieve the approximate embedding for a key (dequantized) */
  get(key: string): Float32Array | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.isExpired(entry)) { this.entries.delete(key); return null; }

    if (this.mode === 'product') {
      return this.pq?.decode(entry.data) ?? null;
    }
    // Use CalibratedQuantizer if fitted for better fidelity
    return this._quantizer.isFitted
      ? this._quantizer.decode(entry.data)
      : dequantizeEmbedding(entry.data);
  }

  /** Export all entries for persistence */
  export(): { mode: QuantizationMode; dims: number; entries: [string, QuantizedEntry][] } {
    return {
      mode: this.mode,
      dims: this.dims,
      entries: Array.from(this.entries.entries()),
    };
  }

  /**
   * Import entries from a previous export() call.
   * Skips expired entries automatically.
   */
  importEntries(entries: [string, QuantizedEntry][]): void {
    for (const [key, entry] of entries) {
      if (!this.isExpired(entry)) {
        this.entries.set(key, entry);
      }
    }
  }

  /**
   * Warm up the store with calibration embeddings.
   * For 'product' mode: trains the PQ codebook if not already trained.
   * For 'scalar'/'none': no-op (accepted for API consistency).
   * Returns the active quantization mode.
   */
  warmUp(calibrationEmbeddings: (Float32Array | number[])[]): QuantizationMode {
    if (this.mode === 'product' && this.pq && !this.pq.isTrained) {
      this.pq.train(calibrationEmbeddings);
    }
    return this.mode;
  }

  /**
   * Fit the CalibratedQuantizer from representative sample embeddings.
   * After fitting, add() and get() use per-dimension calibrated quantization
   * instead of the global [-1, 1] clamping, improving fidelity for real data.
   * No-op if samples is empty.
   */
  fitQuantizer(samples: Float32Array[]): void {
    if (samples.length === 0) return;
    this._quantizer.fit(samples);
  }

  /**
   * Fit the CalibratedQuantizer then warm up the store with the same vectors.
   * Convenience method combining fitQuantizer() and warmUp() in one call.
   */
  warmUpQuantizer(entries: Float32Array[]): void {
    this.fitQuantizer(entries);
    this.warmUp(entries);
  }

  /** Memory usage report */
  memoryReport(): MemorySavingsReport & { currentBytes: number; entryCount: number } {
    const savings = quantizationSavings(this.dims);
    const bytesPerEntry = this.mode === 'product'
      ? (this.pq?.config.numSubspaces ?? 8)
      : savings.scalarUint8Bytes;
    const currentBytes = this.entries.size * bytesPerEntry;

    return { ...savings, currentBytes, entryCount: this.entries.size };
  }
}

/** Factory for creating a pre-configured store for the RuFlo memory namespace */
export function createRuFloMemoryStore(mode: QuantizationMode = 'scalar'): QuantizedMemoryStore {
  return new QuantizedMemoryStore({ mode, dims: 384 });
}
