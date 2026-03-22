import { describe, it, expect } from 'vitest';
import {
  quantizeEmbedding,
  dequantizeEmbedding,
  batchQuantize,
  batchDequantize,
  cosineSimilarityQuantized,
  measureQuantizationError,
  quantizationSavings,
  recommendMode,
  ProductQuantizer,
} from './quantization';

describe('quantizeEmbedding / dequantizeEmbedding', () => {
  it('maps 0.0 to 128 (midpoint)', () => {
    const q = quantizeEmbedding([0.0]);
    expect(q[0]).toBe(128);
  });

  it('maps 1.0 to 255', () => {
    const q = quantizeEmbedding([1.0]);
    expect(q[0]).toBe(255);
  });

  it('maps -1.0 to 0', () => {
    const q = quantizeEmbedding([-1.0]);
    expect(q[0]).toBe(0);
  });

  it('clamps values outside [-1, 1]', () => {
    const q = quantizeEmbedding([2.0, -2.0]);
    expect(q[0]).toBe(255);
    expect(q[1]).toBe(0);
  });

  it('round-trips with small error', () => {
    const orig = new Float32Array([0.1, -0.5, 0.9, 0.0, -0.3]);
    const q = quantizeEmbedding(orig);
    const restored = dequantizeEmbedding(q);
    for (let i = 0; i < orig.length; i++) {
      expect(Math.abs(orig[i] - restored[i])).toBeLessThan(0.01);
    }
  });
});

describe('batchQuantize / batchDequantize', () => {
  it('processes multiple embeddings', () => {
    const embs = [[0.1, 0.2], [-0.1, -0.2], [0.5, 0.5]];
    const quantized = batchQuantize(embs);
    expect(quantized).toHaveLength(3);
    const restored = batchDequantize(quantized);
    expect(restored).toHaveLength(3);
  });
});

describe('cosineSimilarityQuantized', () => {
  it('identical vectors have similarity 1', () => {
    const v = quantizeEmbedding([0.1, 0.5, -0.3, 0.7]);
    expect(cosineSimilarityQuantized(v, v)).toBeCloseTo(1.0, 3);
  });

  it('opposite vectors have similarity -1', () => {
    const a = quantizeEmbedding([1.0, 0.0]);
    const b = quantizeEmbedding([-1.0, 0.0]);
    expect(cosineSimilarityQuantized(a, b)).toBeCloseTo(-1.0, 1);
  });

  it('throws on dimension mismatch', () => {
    const a = quantizeEmbedding([1.0]);
    const b = quantizeEmbedding([1.0, 0.5]);
    expect(() => cosineSimilarityQuantized(a, b)).toThrow('dimension mismatch');
  });
});

describe('measureQuantizationError', () => {
  it('returns finite error metrics', () => {
    const orig = [0.1, -0.5, 0.9, 0.0, -0.3, 0.7, 0.2, -0.8];
    const err = measureQuantizationError(orig);
    expect(err.maxError).toBeGreaterThanOrEqual(0);
    expect(err.meanError).toBeGreaterThanOrEqual(0);
    expect(err.rmse).toBeGreaterThanOrEqual(0);
    expect(err.maxError).toBeLessThan(0.01); // scalar quant should be near-lossless
  });

  it('snrDb is positive for normalized embeddings', () => {
    const orig = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1) * 0.5);
    const err = measureQuantizationError(orig);
    expect(err.snrDb).toBeGreaterThan(30); // > 30dB is good quality
  });
});

describe('quantizationSavings', () => {
  it('returns 4x scalar ratio for 384 dims', () => {
    const s = quantizationSavings(384);
    expect(s.scalarRatio).toBe(4);
    expect(s.float32Bytes).toBe(1536);
    expect(s.scalarUint8Bytes).toBe(384);
  });

  it('returns 192x PQ ratio with 8 subspaces', () => {
    const s = quantizationSavings(384, 8, 256);
    expect(s.pqRatio).toBe(192); // 1536/8
    expect(s.pqBytes).toBe(8);
  });
});

describe('recommendMode', () => {
  it('recommends none for < 100 entries', () => {
    expect(recommendMode(50)).toBe('none');
    expect(recommendMode(0)).toBe('none');
  });

  it('recommends scalar for 100–9999 entries', () => {
    expect(recommendMode(100)).toBe('scalar');
    expect(recommendMode(5000)).toBe('scalar');
  });

  it('recommends product for >= 10000 entries', () => {
    expect(recommendMode(10000)).toBe('product');
    expect(recommendMode(100000)).toBe('product');
  });

  it('recommends none when requireHighAccuracy is true', () => {
    expect(recommendMode(50000, true)).toBe('none');
  });
});

describe('ProductQuantizer', () => {
  it('throws if dims not divisible by subspaces', () => {
    expect(() => new ProductQuantizer({ dims: 10, numSubspaces: 3 })).toThrow();
  });

  it('throws if numCentroids > 256', () => {
    expect(() => new ProductQuantizer({ numCentroids: 512 })).toThrow();
  });

  it('encodes and decodes with reasonable accuracy after training', () => {
    const pq = new ProductQuantizer({ dims: 8, numSubspaces: 2, numCentroids: 4 });
    const training = Array.from({ length: 20 }, () =>
      Array.from({ length: 8 }, () => Math.random() * 2 - 1)
    );
    pq.train(training);
    expect(pq.isTrained).toBe(true);

    const vec = training[0];
    const code = pq.encode(vec);
    expect(code).toHaveLength(2);
    const decoded = pq.decode(code);
    expect(decoded).toHaveLength(8);
  });

  it('throws on encode before training', () => {
    const pq = new ProductQuantizer({ dims: 8, numSubspaces: 2 });
    expect(() => pq.encode([1, 0, 0, 0, 0, 0, 0, 0])).toThrow('trained');
  });
});
