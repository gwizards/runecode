/**
 * Scalar and Product Quantization for HNSW embeddings.
 *
 * Scalar quantization (SQ):  float32 → uint8  — 4x memory reduction
 * Product quantization (PQ): float32 → codes  — 8–32x memory reduction
 *
 * Suitable for 384-dim normalized embeddings (e.g. all-MiniLM-L6-v2).
 */

// ─── Scalar Quantization ────────────────────────────────────────────────────

/** Quantize a single float32 embedding to uint8 (clamp to [-1, 1] → [0, 255]) */
export function quantizeEmbedding(floats: Float32Array | number[]): Uint8Array {
  const out = new Uint8Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    const clamped = Math.max(-1, Math.min(1, floats[i]));
    out[i] = Math.round((clamped + 1.0) * 127.5);
  }
  return out;
}

/** Dequantize uint8 back to float32 */
export function dequantizeEmbedding(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] / 127.5 - 1.0;
  }
  return out;
}

/** Batch quantize an array of float32 embeddings */
export function batchQuantize(embeddings: (Float32Array | number[])[]): Uint8Array[] {
  return embeddings.map(quantizeEmbedding);
}

/** Batch dequantize */
export function batchDequantize(quantized: Uint8Array[]): Float32Array[] {
  return quantized.map(dequantizeEmbedding);
}

// ─── Error Metrics ──────────────────────────────────────────────────────────

export interface QuantizationError {
  /** Maximum absolute error across all dimensions */
  maxError: number;
  /** Mean absolute error */
  meanError: number;
  /** Root mean squared error */
  rmse: number;
  /** Signal-to-noise ratio in dB (higher = better quality) */
  snrDb: number;
}

/** Measure quantization error between original and round-tripped embedding */
export function measureQuantizationError(original: Float32Array | number[]): QuantizationError {
  const quantized = quantizeEmbedding(original);
  const restored = dequantizeEmbedding(quantized);
  const n = original.length;

  let maxErr = 0;
  let sumErr = 0;
  let sumSqErr = 0;
  let signalPower = 0;

  for (let i = 0; i < n; i++) {
    const orig = typeof original[i] === 'number' ? original[i] as number : (original as Float32Array)[i];
    const err = Math.abs(orig - restored[i]);
    maxErr = Math.max(maxErr, err);
    sumErr += err;
    sumSqErr += err * err;
    signalPower += orig * orig;
  }

  const meanError = sumErr / n;
  const rmse = Math.sqrt(sumSqErr / n);
  const noisePower = sumSqErr / n;
  const snrDb = noisePower === 0 ? Infinity : 10 * Math.log10(signalPower / n / noisePower);

  return { maxError: maxErr, meanError, rmse, snrDb };
}

// ─── Cosine Similarity ───────────────────────────────────────────────────────

/** Cosine similarity between two quantized uint8 embeddings */
export function cosineSimilarityQuantized(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error('Embedding dimension mismatch');
  // Operate in uint8 space: shift to [-127.5, 127.5] to avoid dequantize alloc
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] - 127.5;
    const bi = b[i] - 127.5;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Product Quantization ───────────────────────────────────────────────────

export interface PQConfig {
  /** Number of subspaces (must divide dims evenly). Default: 8 */
  numSubspaces: number;
  /** Number of centroids per subspace (power of 2). Default: 256 (uint8 codes) */
  numCentroids: number;
  /** Embedding dimensionality. Default: 384 */
  dims: number;
}

export interface PQCodebook {
  config: PQConfig;
  /** Centroids: [numSubspaces][numCentroids][subDim] */
  centroids: Float32Array[][];
}

export type PQCode = Uint8Array; // length = numSubspaces

/**
 * Product Quantizer — 8–32x memory reduction vs float32.
 *
 * PQ splits the embedding into `numSubspaces` sub-vectors and quantizes each
 * independently using a learned codebook of `numCentroids` centroids.
 * With numSubspaces=8 and numCentroids=256 → 8 bytes per 384-dim vector (48x reduction).
 *
 * The codebook must be trained with representative embeddings before encoding.
 */
export class ProductQuantizer {
  private codebook: PQCodebook;

  constructor(config: Partial<PQConfig> = {}) {
    const cfg: PQConfig = {
      numSubspaces: config.numSubspaces ?? 8,
      numCentroids: config.numCentroids ?? 256,
      dims: config.dims ?? 384,
    };
    if (cfg.dims % cfg.numSubspaces !== 0) {
      throw new Error(`dims (${cfg.dims}) must be divisible by numSubspaces (${cfg.numSubspaces})`);
    }
    if (cfg.numCentroids > 256) {
      throw new Error('numCentroids must be ≤ 256 to fit in uint8 codes');
    }
    this.codebook = { config: cfg, centroids: [] };
  }

  get config(): PQConfig {
    return this.codebook.config;
  }

  get isTrained(): boolean {
    return this.codebook.centroids.length === this.codebook.config.numSubspaces;
  }

  /**
   * Train the codebook using k-means on the provided embeddings.
   * Requires at least `numCentroids` training vectors.
   */
  train(embeddings: (Float32Array | number[])[]): void {
    const { numSubspaces, numCentroids, dims } = this.codebook.config;
    const subDim = dims / numSubspaces;

    this.codebook.centroids = [];

    for (let s = 0; s < numSubspaces; s++) {
      const start = s * subDim;
      // Extract sub-vectors for this subspace
      const subVecs = embeddings.map((e) =>
        new Float32Array(Array.from({ length: subDim }, (_, i) => (e as number[])[start + i] ?? 0))
      );
      this.codebook.centroids.push(this._kMeans(subVecs, numCentroids));
    }
  }

  /** Encode a single embedding to PQ codes */
  encode(embedding: Float32Array | number[]): PQCode {
    if (!this.isTrained) throw new Error('Codebook not trained — call train() first');
    const { numSubspaces, dims } = this.codebook.config;
    const subDim = dims / numSubspaces;
    const code = new Uint8Array(numSubspaces);

    for (let s = 0; s < numSubspaces; s++) {
      const start = s * subDim;
      const subVec = new Float32Array(subDim);
      for (let i = 0; i < subDim; i++) {
        subVec[i] = (embedding as number[])[start + i] ?? 0;
      }
      code[s] = this._nearestCentroid(subVec, this.codebook.centroids[s]);
    }
    return code;
  }

  /** Decode PQ codes back to approximate float32 embedding */
  decode(code: PQCode): Float32Array {
    if (!this.isTrained) throw new Error('Codebook not trained');
    const { numSubspaces, dims } = this.codebook.config;
    const subDim = dims / numSubspaces;
    const out = new Float32Array(dims);

    for (let s = 0; s < numSubspaces; s++) {
      const centroid = this.codebook.centroids[s][code[s]];
      for (let i = 0; i < subDim; i++) {
        out[s * subDim + i] = centroid[i];
      }
    }
    return out;
  }

  /** Approximate cosine similarity between two PQ codes (asymmetric distance) */
  similarity(codeA: PQCode, codeB: PQCode): number {
    const a = this.decode(codeA);
    const b = this.decode(codeB);
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }

  /** Export codebook for persistence */
  exportCodebook(): PQCodebook {
    return JSON.parse(JSON.stringify(this.codebook));
  }

  /** Import a previously saved codebook */
  importCodebook(book: PQCodebook): void {
    this.codebook = book;
    // Restore Float32Array instances from plain arrays after JSON round-trip
    this.codebook.centroids = book.centroids.map((sub) =>
      sub.map((c) => new Float32Array(c))
    );
  }

  // ── Private: k-means clustering ──────────────────────────────────────────

  private _kMeans(vectors: Float32Array[], k: number, maxIter = 25): Float32Array[] {
    const n = vectors.length;
    const dim = vectors[0].length;
    // Init centroids with k-means++ style (take first k unique vectors)
    const centroids = vectors.slice(0, Math.min(k, n)).map((v) => new Float32Array(v));
    // Pad if not enough vectors
    while (centroids.length < k) {
      centroids.push(new Float32Array(dim));
    }

    const assignments = new Int32Array(n);

    for (let iter = 0; iter < maxIter; iter++) {
      let changed = false;

      // Assignment step
      for (let i = 0; i < n; i++) {
        const nearest = this._nearestCentroid(vectors[i], centroids);
        if (nearest !== assignments[i]) {
          assignments[i] = nearest;
          changed = true;
        }
      }
      if (!changed) break;

      // Update step
      const counts = new Int32Array(k);
      const sums = Array.from({ length: k }, () => new Float32Array(dim));
      for (let i = 0; i < n; i++) {
        const c = assignments[i];
        counts[c]++;
        for (let d = 0; d < dim; d++) sums[c][d] += vectors[i][d];
      }
      for (let c = 0; c < k; c++) {
        if (counts[c] > 0) {
          for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
    return centroids;
  }

  private _nearestCentroid(vec: Float32Array, centroids: Float32Array[]): number {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      let dist = 0;
      for (let d = 0; d < vec.length; d++) {
        const diff = vec[d] - centroids[c][d];
        dist += diff * diff;
      }
      if (dist < bestDist) { bestDist = dist; best = c; }
    }
    return best;
  }
}

// ─── Memory Savings ─────────────────────────────────────────────────────────

export interface MemorySavingsReport {
  dims: number;
  float32Bytes: number;
  scalarUint8Bytes: number;
  scalarRatio: number;
  pqBytes: number;
  pqRatio: number;
  pqConfig: { subspaces: number; centroids: number; codebookBytes: number };
}

export function quantizationSavings(
  dims = 384,
  pqSubspaces = 8,
  pqCentroids = 256
): MemorySavingsReport {
  const float32Bytes = dims * 4;
  const scalarUint8Bytes = dims;
  const pqBytes = pqSubspaces; // one uint8 code per subspace
  const codebookBytes = pqSubspaces * pqCentroids * (dims / pqSubspaces) * 4; // float32 centroids

  return {
    dims,
    float32Bytes,
    scalarUint8Bytes,
    scalarRatio: float32Bytes / scalarUint8Bytes,
    pqBytes,
    pqRatio: float32Bytes / pqBytes,
    pqConfig: { subspaces: pqSubspaces, centroids: pqCentroids, codebookBytes },
  };
}

import type { QuantizationMode } from './memory-store';
export type { QuantizationMode } from './memory-store';

/**
 * Recommend a quantization mode based on corpus size and quality requirements.
 *
 * - < 100 entries: 'none' (overhead not worth it)
 * - 100–10,000 entries: 'scalar' (4x reduction, near-lossless)
 * - > 10,000 entries: 'product' (192x reduction, requires training)
 */
export function recommendMode(entryCount: number, requireHighAccuracy = false): QuantizationMode {
  if (requireHighAccuracy || entryCount < 100) return 'none';
  if (entryCount < 10_000) return 'scalar';
  return 'product';
}
