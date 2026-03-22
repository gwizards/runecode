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
}

export class QuantizedMemoryStore {
  private mode: QuantizationMode;
  private dims: number;
  private entries: Map<string, QuantizedEntry> = new Map();
  private pq?: ProductQuantizer;

  constructor(config: QuantizedMemoryStoreConfig = {}) {
    this.mode = config.mode ?? 'scalar';
    this.dims = config.dims ?? 384;

    if (this.mode === 'product') {
      this.pq = new ProductQuantizer({ dims: this.dims, ...config.pq });
    }
  }

  get size(): number {
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
  add(key: string, embedding: Float32Array | number[], metadata?: Record<string, unknown>): void {
    let data: Uint8Array;

    if (this.mode === 'scalar') {
      data = quantizeEmbedding(embedding);
    } else if (this.mode === 'product') {
      if (!this.pq?.isTrained) throw new Error('ProductQuantizer must be trained before add()');
      data = this.pq.encode(embedding);
    } else {
      // mode === 'none': store as uint8 via scalar for memory layout consistency
      data = quantizeEmbedding(embedding);
    }

    this.entries.set(key, { key, data, metadata, addedAt: Date.now() });
  }

  /** Remove an entry */
  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  /** Check if a key exists */
  has(key: string): boolean {
    return this.entries.has(key);
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
      queryData = quantizeEmbedding(query);
    }

    const results: SearchResult[] = [];

    for (const entry of this.entries.values()) {
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

    if (this.mode === 'product') {
      return this.pq?.decode(entry.data) ?? null;
    }
    return dequantizeEmbedding(entry.data);
  }

  /** Export all entries for persistence */
  export(): { mode: QuantizationMode; dims: number; entries: [string, QuantizedEntry][] } {
    return {
      mode: this.mode,
      dims: this.dims,
      entries: Array.from(this.entries.entries()),
    };
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
