/**
 * Scalar quantization for HNSW embeddings.
 * Converts float32 [-1.0, 1.0] to uint8 [0, 255] — 4x memory reduction.
 * Suitable for 384-dim normalized text embeddings (e.g. all-MiniLM-L6-v2).
 */

/** Quantize a float32 embedding array to uint8 */
export function quantizeEmbedding(floats: Float32Array | number[]): Uint8Array {
  const out = new Uint8Array(floats.length);
  for (let i = 0; i < floats.length; i++) {
    // Clamp to [-1, 1] then map to [0, 255]
    const clamped = Math.max(-1, Math.min(1, floats[i]));
    out[i] = Math.round((clamped + 1.0) * 127.5);
  }
  return out;
}

/** Dequantize uint8 back to float32 */
export function dequantizeEmbedding(bytes: Uint8Array): Float32Array {
  const out = new Float32Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = (bytes[i] / 127.5) - 1.0;
  }
  return out;
}

/**
 * Cosine similarity on quantized uint8 embeddings.
 * Converts to float32 first for accuracy.
 */
export function cosineSimilarityQuantized(a: Uint8Array, b: Uint8Array): number {
  if (a.length !== b.length) throw new Error('Embedding dimension mismatch');
  const af = dequantizeEmbedding(a);
  const bf = dequantizeEmbedding(b);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < af.length; i++) {
    dot += af[i] * bf[i];
    normA += af[i] * af[i];
    normB += bf[i] * bf[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Memory savings report */
export function quantizationSavings(dims: number): { float32Bytes: number; uint8Bytes: number; ratio: number } {
  const float32Bytes = dims * 4;
  const uint8Bytes = dims * 1;
  return { float32Bytes, uint8Bytes, ratio: float32Bytes / uint8Bytes };
}
