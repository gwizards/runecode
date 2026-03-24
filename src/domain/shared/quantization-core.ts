/**
 * Primitive scalar quantization math — no domain-specific snapshot types.
 *
 * Design goals:
 *   - 50-75% memory reduction for numeric fields via typed arrays
 *   - Standard scalar quantization: q = round(x / scale + zeroPoint)
 *   - int8 vector quantization for 384-dim embeddings (4x float32 reduction)
 *   - Full round-trip fidelity: decode(encode(snapshot)) ≡ snapshot
 *
 * This module is a pure math / infrastructure layer with no imports from
 * bounded contexts. All domain-specific quantizers import from here.
 */

// ─── QuantizedBuffer ──────────────────────────────────────────────────────────

/**
 * A self-describing binary envelope.
 *
 * `fixed` holds all quantized numeric scalars (typed array view over a shared
 * ArrayBuffer for zero-copy slice operations).
 * `strings` preserves fields that cannot be losslessly quantized.
 * `version` guards decode compatibility across schema changes.
 */
export interface QuantizedBuffer {
  readonly version: number;
  /** Quantized numeric/enum/boolean fields packed into typed arrays. */
  readonly fixed: {
    readonly uint8: Uint8Array;
    readonly uint16: Uint16Array;
    readonly uint32: Uint32Array;
    readonly int8: Int8Array;
    readonly int16: Int16Array;
  };
  /** Non-quantizable fields kept as UTF-8 strings. */
  readonly strings: Record<string, string>;
  /**
   * Per-field quantization parameters (scale and zeroPoint).
   * Only populated for fields that use ScalarQuantizer formula.
   */
  readonly params: Record<string, FieldQuantParams>;
}

// ─── Quantization parameters per field ────────────────────────────────────────

export interface FieldQuantParams {
  readonly scale: number;
  readonly zeroPoint: number;
}

// ─── Scalar quantization math ─────────────────────────────────────────────────

/**
 * Quantize a single float64 value to an integer.
 *
 * Formula: q = clamp(round(x / scale + zeroPoint), min, max)
 * This is the standard asymmetric scalar quantization formula.
 */
export function quantizeScalar(
  x: number,
  scale: number,
  zeroPoint: number,
  min: number,
  max: number,
): number {
  if (scale === 0) return zeroPoint;
  return Math.max(min, Math.min(max, Math.round(x / scale + zeroPoint)));
}

/**
 * Dequantize an integer back to a float64 approximation.
 *
 * Formula: x̂ = (q - zeroPoint) * scale
 */
export function dequantizeScalar(q: number, scale: number, zeroPoint: number): number {
  return (q - zeroPoint) * scale;
}

/**
 * Derive scale and zeroPoint for a uint32 field given the known value range.
 *
 * We use the full uint32 range [0, 4_294_967_295] so that for fields already
 * fitting in uint32 (e.g. seconds-since-epoch, token counts), scale = 1 and
 * zeroPoint = 0 — meaning the encode/decode is lossless.
 */
export function deriveUint32Params(minVal: number, maxVal: number): FieldQuantParams {
  if (maxVal <= 0xffffffff && minVal >= 0) {
    // Lossless path: value fits natively in uint32
    return { scale: 1, zeroPoint: 0 };
  }
  const range = maxVal - minVal;
  const scale = range / 0xffffffff;
  const zeroPoint = -Math.round(minVal / scale);
  return { scale, zeroPoint };
}

// ─── HNSW Vector Quantization ─────────────────────────────────────────────────

/**
 * Quantize a float32 embedding vector to int8.
 *
 * Storage reduction: 384 × 4 bytes → 384 × 1 byte = 4x.
 * The scale is derived per-vector from the maximum absolute component value,
 * which is the standard approach for symmetric int8 quantization.
 *
 * Scale formula: scale = max(|v_i|) / 127
 * Encode:        q_i = clamp(round(v_i / scale), -127, 127)
 * Decode:        v̂_i = q_i × scale
 *
 * Note: Int8Array range is [-128, 127]. We use [-127, 127] (symmetric) so
 * that -128 is reserved for future use (e.g. padding sentinel).
 */
export function quantizeVector(v: Float32Array): { quantized: Int8Array; scale: number } {
  let maxAbs = 0;
  for (let i = 0; i < v.length; i++) {
    const abs = Math.abs(v[i]!);
    if (abs > maxAbs) maxAbs = abs;
  }

  // Guard against zero-vectors (e.g. padding embeddings)
  const scale = maxAbs === 0 ? 1 : maxAbs / 127;

  const quantized = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) {
    quantized[i] = Math.max(-127, Math.min(127, Math.round(v[i]! / scale)));
  }

  return { quantized, scale };
}

/**
 * Reconstruct an approximate float32 vector from an int8-quantized vector.
 *
 * The scale must be the same value returned by quantizeVector for this vector.
 * Reconstruction error is bounded by ±0.5 × scale per dimension.
 */
export function dequantizeVector(quantized: Int8Array, scale: number): Float32Array {
  const v = new Float32Array(quantized.length);
  for (let i = 0; i < quantized.length; i++) {
    v[i] = (quantized[i]!) * scale;
  }
  return v;
}

/**
 * Compute the cosine similarity between two int8 vectors without dequantizing.
 *
 * Because scale is a common factor, it cancels in the cosine formula when both
 * vectors share the same scale. For cross-vector comparisons, operate in float32
 * after dequantizing, or normalize before quantizing.
 */
export function int8CosineSimilarity(a: Int8Array, b: Int8Array): number {
  if (a.length !== b.length) throw new Error('Vector dimension mismatch');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── HNSW QuantizedVectorStore supporting types ───────────────────────────────

/**
 * Metadata stored alongside each quantized embedding in the HNSW index.
 */
export interface QuantizedEntry {
  readonly key: string;
  readonly quantized: Int8Array;
  readonly scale: number;
}

// ─── Memory savings projection type ───────────────────────────────────────────

export interface SavingsProjection {
  readonly aggregateType: string;
  readonly records: number;
  readonly baselineBytes: number;
  readonly quantizedBytes: number;
  readonly savingBytes: number;
  readonly savingPercent: number;
}

// ─── ScalarQuantizer<T> base class ────────────────────────────────────────────

/**
 * Abstract base for aggregate-specific snapshot quantizers.
 *
 * Subclasses implement encode() and decode() for their concrete snapshot type.
 * The base class provides the typed-array allocation helpers and the
 * quantizeScalar / dequantizeScalar math so subclasses stay readable.
 */
export abstract class ScalarQuantizer<T> {
  abstract readonly version: number;

  abstract encode(snapshot: T): QuantizedBuffer;
  abstract decode(buf: QuantizedBuffer): T;

  protected assertVersion(buf: QuantizedBuffer): void {
    if (buf.version !== this.version) {
      throw new Error(
        `QuantizedBuffer version mismatch: expected ${this.version}, got ${buf.version}`,
      );
    }
  }

  /**
   * Encode a Unix millisecond timestamp to uint32 seconds.
   * Lossless for dates from 1970 to 2106. Sub-second precision is dropped;
   * this is acceptable for snapshot timestamps (not financial precision).
   */
  protected encodeTimestampMs(ms: number): number {
    return Math.round(ms / 1000) & 0xffffffff;
  }

  /**
   * Decode a uint32 seconds value back to a Unix millisecond timestamp.
   */
  protected decodeTimestampMs(seconds: number): number {
    return (seconds >>> 0) * 1000;
  }

  /**
   * Encode an ISO-8601 date string to uint32 seconds.
   * Returns 0 if the string is empty or unparseable.
   */
  protected encodeIsoTimestamp(iso: string | undefined): number {
    if (!iso) return 0;
    const ms = new Date(iso).getTime();
    return Number.isNaN(ms) ? 0 : this.encodeTimestampMs(ms);
  }

  /**
   * Decode a uint32 seconds value to an ISO-8601 string.
   * Returns undefined if seconds === 0 (sentinel for "not set").
   */
  protected decodeIsoTimestamp(seconds: number): string | undefined {
    if (seconds === 0) return undefined;
    return new Date(this.decodeTimestampMs(seconds)).toISOString();
  }

  protected makeEmptyBuffer(
    uint8Count: number,
    uint16Count: number,
    uint32Count: number,
    int8Count: number,
    int16Count: number,
  ): QuantizedBuffer['fixed'] {
    return {
      uint8: new Uint8Array(uint8Count),
      uint16: new Uint16Array(uint16Count),
      uint32: new Uint32Array(uint32Count),
      int8: new Int8Array(int8Count),
      int16: new Int16Array(int16Count),
    };
  }
}
