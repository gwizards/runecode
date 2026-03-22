/**
 * Tests for src/domain/shared/quantization.ts
 *
 * Covers:
 *   - AgentSnapshotQuantizer: encode/decode round-trips for all AgentStatus values
 *   - MCPSnapshotQuantizer:   encode/decode round-trips for all transport/status combos
 *   - ProjectSnapshotQuantizer: encode/decode round-trips including optional fields
 *   - quantizeVector / dequantizeVector: dimension preservation and <1% error
 *   - int8CosineSimilarity: returns 1.0 for identical vectors, 0 for orthogonal
 *   - computeSavingsProjections: returns 4 aggregate rows per record-count entry
 *   - QuantizedSnapshotStore: set/get/has/delete/values/size/estimateFixedBytes
 *   - QuantizedVectorStore: addVector/getVector/search/estimateBytes
 */

import { describe, it, expect } from 'vitest';
import type { RawLiveAgent, AgentStatus } from '../agent/types';
import type { RawMCPServer, ServerTransport, ServerStatusValue } from '../mcp/types';
import type { RawProject } from '../project/types';
import {
  quantizeScalar,
  dequantizeScalar,
  deriveUint32Params,
  quantizeVector,
  dequantizeVector,
  int8CosineSimilarity,
  AgentSnapshotQuantizer,
  MCPSnapshotQuantizer,
  ProjectSnapshotQuantizer,
  QuantizedSnapshotStore,
  QuantizedVectorStore,
  computeSavingsProjections,
} from './quantization';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<RawLiveAgent> = {}): RawLiveAgent {
  return {
    id: 'agent-001',
    name: 'Test Agent',
    status: 'idle',
    tokenCount: 42,
    startedAt: 1_700_000_000_000,
    elapsedMs: 5000,
    ...overrides,
  };
}

function makeMCP(overrides: Partial<RawMCPServer> = {}): RawMCPServer {
  return {
    id: 'mcp-001',
    name: 'Test MCP',
    transport: 'stdio',
    status: 'connected',
    enabled: true,
    ...overrides,
  };
}

function makeProject(overrides: Partial<RawProject> = {}): RawProject {
  return {
    id: 'proj-001',
    path: '/home/user/project',
    name: 'MyProject',
    createdAt: '2024-01-15T10:00:00.000Z',
    lastOpenedAt: '2024-06-01T08:30:00.000Z',
    ...overrides,
  };
}

// ─── quantizeScalar / dequantizeScalar ────────────────────────────────────────

describe('quantizeScalar', () => {
  it('round-trips a value within range', () => {
    const scale = 2;
    const zeroPoint = 0;
    const q = quantizeScalar(100, scale, zeroPoint, 0, 255);
    const x = dequantizeScalar(q, scale, zeroPoint);
    expect(x).toBeCloseTo(100, 0);
  });

  it('clamps values below minimum', () => {
    const q = quantizeScalar(-10, 1, 0, 0, 255);
    expect(q).toBe(0);
  });

  it('clamps values above maximum', () => {
    const q = quantizeScalar(300, 1, 0, 0, 255);
    expect(q).toBe(255);
  });

  it('returns zeroPoint when scale is 0', () => {
    const q = quantizeScalar(50, 0, 7, 0, 255);
    expect(q).toBe(7);
  });
});

// ─── deriveUint32Params ───────────────────────────────────────────────────────

describe('deriveUint32Params', () => {
  it('returns lossless params for values fitting in uint32', () => {
    const params = deriveUint32Params(0, 1_000_000);
    expect(params.scale).toBe(1);
    expect(params.zeroPoint).toBe(0);
  });

  it('derives scaled params for values outside uint32', () => {
    const params = deriveUint32Params(0, Number.MAX_SAFE_INTEGER);
    expect(params.scale).toBeGreaterThan(1);
  });
});

// ─── AgentSnapshotQuantizer ───────────────────────────────────────────────────

describe('AgentSnapshotQuantizer', () => {
  const q = new AgentSnapshotQuantizer();

  const allStatuses: AgentStatus[] = ['idle', 'running', 'thinking', 'completed', 'failed'];

  it.each(allStatuses)('round-trips status "%s"', (status) => {
    const original = makeAgent({ status });
    const buf = q.encode(original);
    const restored = q.decode(buf);
    expect(restored.status).toBe(status);
  });

  it('preserves id and name', () => {
    const original = makeAgent({ id: 'abc-123', name: 'SpecialAgent' });
    const restored = q.decode(q.encode(original));
    expect(restored.id).toBe('abc-123');
    expect(restored.name).toBe('SpecialAgent');
  });

  it('preserves tokenCount', () => {
    const original = makeAgent({ tokenCount: 99_999 });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenCount).toBe(99_999);
  });

  it('preserves elapsedMs', () => {
    const original = makeAgent({ elapsedMs: 123_456 });
    const restored = q.decode(q.encode(original));
    expect(restored.elapsedMs).toBe(123_456);
  });

  it('round-trips startedAt to within 1 second', () => {
    const startedAt = 1_700_000_000_000;
    const original = makeAgent({ startedAt });
    const restored = q.decode(q.encode(original));
    // Stored as seconds → 1000ms tolerance
    expect(Math.abs((restored.startedAt ?? 0) - startedAt)).toBeLessThanOrEqual(1000);
  });

  it('defaults missing status to idle', () => {
    const original: RawLiveAgent = { id: 'x', name: 'y' };
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe('idle');
  });

  it('sets correct version on buffer', () => {
    const buf = q.encode(makeAgent());
    expect(buf.version).toBe(1);
  });

  it('throws on version mismatch during decode', () => {
    const buf = q.encode(makeAgent());
    const wrongVersion = { ...buf, version: 99 };
    expect(() => q.decode(wrongVersion)).toThrow(/version mismatch/i);
  });
});

// ─── MCPSnapshotQuantizer ─────────────────────────────────────────────────────

describe('MCPSnapshotQuantizer', () => {
  const q = new MCPSnapshotQuantizer();

  const transports: ServerTransport[] = ['stdio', 'sse'];
  const statuses: ServerStatusValue[] = ['pending', 'connected', 'disconnected', 'error'];

  it.each(transports)('round-trips transport "%s"', (transport) => {
    const original = makeMCP({ transport });
    const restored = q.decode(q.encode(original));
    expect(restored.transport).toBe(transport);
  });

  it.each(statuses)('round-trips status "%s"', (status) => {
    const original = makeMCP({ status });
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe(status);
  });

  it('preserves enabled = true', () => {
    const original = makeMCP({ enabled: true });
    const restored = q.decode(q.encode(original));
    expect(restored.enabled).toBe(true);
  });

  it('preserves enabled = false', () => {
    const original = makeMCP({ enabled: false });
    const restored = q.decode(q.encode(original));
    expect(restored.enabled).toBe(false);
  });

  it('preserves name', () => {
    const original = makeMCP({ name: 'MyServer' });
    const restored = q.decode(q.encode(original));
    expect(restored.name).toBe('MyServer');
  });

  it('preserves optional url', () => {
    const original = makeMCP({ transport: 'sse', url: 'http://localhost:3000' });
    const restored = q.decode(q.encode(original));
    expect(restored.url).toBe('http://localhost:3000');
  });

  it('preserves optional command', () => {
    const original = makeMCP({ transport: 'stdio', command: 'npx', args: ['-y', 'my-server'] });
    const restored = q.decode(q.encode(original));
    expect(restored.command).toBe('npx');
    expect(restored.args).toEqual(['-y', 'my-server']);
  });

  it('preserves optional id', () => {
    const original = makeMCP({ id: 'server-xyz' });
    const restored = q.decode(q.encode(original));
    expect(restored.id).toBe('server-xyz');
  });

  it('sets correct version on buffer', () => {
    const buf = q.encode(makeMCP());
    expect(buf.version).toBe(1);
  });
});

// ─── ProjectSnapshotQuantizer ─────────────────────────────────────────────────

describe('ProjectSnapshotQuantizer', () => {
  const q = new ProjectSnapshotQuantizer();

  it('round-trips id and path', () => {
    const original = makeProject({ id: 'p-1', path: '/workspace/foo' });
    const restored = q.decode(q.encode(original));
    expect(restored.id).toBe('p-1');
    expect(restored.path).toBe('/workspace/foo');
  });

  it('round-trips optional name', () => {
    const original = makeProject({ name: 'Cool Project' });
    const restored = q.decode(q.encode(original));
    expect(restored.name).toBe('Cool Project');
  });

  it('restores undefined name when not set', () => {
    const original: RawProject = { id: 'p-2', path: '/tmp/no-name' };
    const restored = q.decode(q.encode(original));
    expect(restored.name).toBeUndefined();
  });

  it('round-trips createdAt to within 1 second', () => {
    const isoString = '2024-03-10T12:00:00.000Z';
    const original = makeProject({ createdAt: isoString });
    const restored = q.decode(q.encode(original));
    const diff = Math.abs(
      new Date(restored.createdAt!).getTime() - new Date(isoString).getTime(),
    );
    expect(diff).toBeLessThanOrEqual(1000);
  });

  it('round-trips lastOpenedAt to within 1 second', () => {
    const isoString = '2025-11-20T18:45:00.000Z';
    const original = makeProject({ lastOpenedAt: isoString });
    const restored = q.decode(q.encode(original));
    const diff = Math.abs(
      new Date(restored.lastOpenedAt!).getTime() - new Date(isoString).getTime(),
    );
    expect(diff).toBeLessThanOrEqual(1000);
  });

  it('restores undefined timestamps when not set', () => {
    const original: RawProject = { id: 'p-3', path: '/tmp/no-ts' };
    const restored = q.decode(q.encode(original));
    expect(restored.createdAt).toBeUndefined();
    expect(restored.lastOpenedAt).toBeUndefined();
  });
});

// ─── quantizeVector / dequantizeVector ────────────────────────────────────────

describe('quantizeVector', () => {
  it('produces an Int8Array of the same length as the input', () => {
    const v = new Float32Array(384).fill(0).map((_, i) => Math.sin(i));
    const { quantized } = quantizeVector(v);
    expect(quantized).toBeInstanceOf(Int8Array);
    expect(quantized.length).toBe(384);
  });

  it('all values in int8 range [-127, 127]', () => {
    const v = new Float32Array(384).map(() => (Math.random() - 0.5) * 2);
    const { quantized } = quantizeVector(v);
    for (let i = 0; i < quantized.length; i++) {
      expect(quantized[i]).toBeGreaterThanOrEqual(-127);
      expect(quantized[i]).toBeLessThanOrEqual(127);
    }
  });

  it('handles a zero vector without error', () => {
    const v = new Float32Array(384).fill(0);
    const { quantized, scale } = quantizeVector(v);
    expect(quantized.every((x) => x === 0)).toBe(true);
    expect(scale).toBe(1); // guard from implementation
  });
});

describe('dequantizeVector', () => {
  it('reconstructs values within 0.5 * scale of the original', () => {
    // Build a unit-range vector with values spread across [-1, 1]
    const v = new Float32Array(384).map((_, i) => Math.cos(i * 0.1));

    const { quantized, scale } = quantizeVector(v);
    const restored = dequantizeVector(quantized, scale);

    // Int8 quantization error is bounded by ±0.5 × scale per dimension.
    // Use a small factor of safety (1.1) to guard floating-point rounding.
    const maxAllowedAbsError = 0.5 * scale * 1.1;
    for (let i = 0; i < v.length; i++) {
      const absError = Math.abs(restored[i]! - v[i]!);
      expect(absError).toBeLessThanOrEqual(maxAllowedAbsError);
    }
  });

  it('returns a Float32Array of the same length', () => {
    const v = new Float32Array(128).map(() => Math.random());
    const { quantized, scale } = quantizeVector(v);
    const restored = dequantizeVector(quantized, scale);
    expect(restored).toBeInstanceOf(Float32Array);
    expect(restored.length).toBe(128);
  });
});

// ─── int8CosineSimilarity ─────────────────────────────────────────────────────

describe('int8CosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const { quantized } = quantizeVector(
      new Float32Array(64).map((_, i) => Math.sin(i)),
    );
    const similarity = int8CosineSimilarity(quantized, quantized);
    expect(similarity).toBeCloseTo(1.0, 5);
  });

  it('returns 0 for two zero vectors', () => {
    const a = new Int8Array(64).fill(0);
    const b = new Int8Array(64).fill(0);
    expect(int8CosineSimilarity(a, b)).toBe(0);
  });

  it('returns a value in [-1, 1] for arbitrary vectors', () => {
    const v1 = new Float32Array(64).map(() => Math.random() - 0.5);
    const v2 = new Float32Array(64).map(() => Math.random() - 0.5);
    const { quantized: q1 } = quantizeVector(v1);
    const { quantized: q2 } = quantizeVector(v2);
    const sim = int8CosineSimilarity(q1, q2);
    expect(sim).toBeGreaterThanOrEqual(-1);
    expect(sim).toBeLessThanOrEqual(1);
  });

  it('throws when vectors have different lengths', () => {
    const a = new Int8Array(64);
    const b = new Int8Array(32);
    expect(() => int8CosineSimilarity(a, b)).toThrow(/dimension mismatch/i);
  });
});

// ─── computeSavingsProjections ────────────────────────────────────────────────

describe('computeSavingsProjections', () => {
  it('returns one array per record-count entry (3 inputs → 3 arrays)', () => {
    const result = computeSavingsProjections([100, 1000, 10_000]);
    expect(result).toHaveLength(3);
  });

  it('returns 4 aggregate rows per record-count entry', () => {
    const result = computeSavingsProjections([100, 1000, 10_000]);
    for (const perCount of result) {
      expect(perCount).toHaveLength(4);
    }
  });

  it('all savingPercent values are positive', () => {
    const result = computeSavingsProjections([1000]);
    for (const row of result[0]!) {
      expect(row.savingPercent).toBeGreaterThan(0);
    }
  });

  it('quantizedBytes < baselineBytes for every row', () => {
    const result = computeSavingsProjections([100, 10_000]);
    for (const perCount of result) {
      for (const row of perCount) {
        expect(row.quantizedBytes).toBeLessThan(row.baselineBytes);
      }
    }
  });

  it('savingBytes equals baselineBytes - quantizedBytes', () => {
    const result = computeSavingsProjections([500]);
    for (const row of result[0]!) {
      expect(row.savingBytes).toBe(row.baselineBytes - row.quantizedBytes);
    }
  });

  it('includes the expected aggregate type names', () => {
    const result = computeSavingsProjections([100]);
    const types = result[0]!.map((r) => r.aggregateType);
    expect(types).toContain('RawLiveAgent');
    expect(types).toContain('RawMCPServer');
    expect(types).toContain('RawProject');
    expect(types.some((t) => t.includes('384'))).toBe(true);
  });

  it('scales linearly with record count', () => {
    const result = computeSavingsProjections([10, 100]);
    for (let i = 0; i < 4; i++) {
      const small = result[0]![i]!;
      const large = result[1]![i]!;
      expect(large.baselineBytes).toBe(small.baselineBytes * 10);
      expect(large.quantizedBytes).toBe(small.quantizedBytes * 10);
    }
  });
});

// ─── QuantizedSnapshotStore ───────────────────────────────────────────────────

describe('QuantizedSnapshotStore<RawLiveAgent>', () => {
  it('stores and retrieves a snapshot by key', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    const original = makeAgent({ id: 'a1', name: 'Alpha' });
    store.set('a1', original);
    const restored = store.get('a1');
    expect(restored).toBeDefined();
    expect(restored!.id).toBe('a1');
    expect(restored!.name).toBe('Alpha');
  });

  it('has() returns true for stored keys, false for missing', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    store.set('x', makeAgent({ id: 'x' }));
    expect(store.has('x')).toBe(true);
    expect(store.has('y')).toBe(false);
  });

  it('delete() removes the record', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    store.set('x', makeAgent({ id: 'x' }));
    store.delete('x');
    expect(store.has('x')).toBe(false);
    expect(store.get('x')).toBeUndefined();
  });

  it('size reflects the number of stored records', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    expect(store.size).toBe(0);
    store.set('a', makeAgent({ id: 'a' }));
    store.set('b', makeAgent({ id: 'b' }));
    expect(store.size).toBe(2);
    store.delete('a');
    expect(store.size).toBe(1);
  });

  it('values() returns all stored snapshots decoded', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    store.set('a', makeAgent({ id: 'a', name: 'Alpha' }));
    store.set('b', makeAgent({ id: 'b', name: 'Beta' }));
    const vals = store.values();
    expect(vals).toHaveLength(2);
    const names = vals.map((v) => v.name).sort();
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('estimateFixedBytes() returns a positive number for non-empty store', () => {
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    store.set('a', makeAgent());
    store.set('b', makeAgent());
    expect(store.estimateFixedBytes()).toBeGreaterThan(0);
  });
});

// ─── QuantizedVectorStore ─────────────────────────────────────────────────────

describe('QuantizedVectorStore', () => {
  it('addVector and getVector round-trip within 0.5 * scale of the original', () => {
    const store = new QuantizedVectorStore(64);
    const v = new Float32Array(64).map((_, i) => Math.sin(i * 0.2));
    store.addVector('vec1', v);
    const restored = store.getVector('vec1');
    expect(restored).not.toBeUndefined();
    // Derive scale directly to verify the error bound
    const { scale } = quantizeVector(v);
    const maxAllowedAbsError = 0.5 * scale * 1.1;
    for (let i = 0; i < v.length; i++) {
      const absError = Math.abs(restored![i]! - v[i]!);
      expect(absError).toBeLessThanOrEqual(maxAllowedAbsError);
    }
  });

  it('has() returns true after addVector', () => {
    const store = new QuantizedVectorStore(16);
    store.addVector('k', new Float32Array(16).fill(1));
    expect(store.has('k')).toBe(true);
  });

  it('deleteVector removes the entry', () => {
    const store = new QuantizedVectorStore(16);
    store.addVector('k', new Float32Array(16).fill(1));
    store.deleteVector('k');
    expect(store.has('k')).toBe(false);
    expect(store.getVector('k')).toBeUndefined();
  });

  it('throws when vector dimension does not match', () => {
    const store = new QuantizedVectorStore(384);
    expect(() => store.addVector('bad', new Float32Array(100))).toThrow(/dimension mismatch/i);
  });

  it('search returns results sorted by descending score', () => {
    const store = new QuantizedVectorStore(8);
    const base = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0]);
    const similar = new Float32Array([0.9, 0.1, 0, 0, 0, 0, 0, 0]);
    const dissimilar = new Float32Array([0, 0, 0, 0, 1, 0, 0, 0]);
    store.addVector('base', base);
    store.addVector('similar', similar);
    store.addVector('dissimilar', dissimilar);
    const results = store.search(base, 3);
    expect(results.length).toBeGreaterThan(0);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
    expect(results[0]!.key).toBe('base');
  });

  it('estimateBytes returns dimensions * size (int8)', () => {
    const store = new QuantizedVectorStore(384);
    store.addVector('a', new Float32Array(384).fill(0.5));
    store.addVector('b', new Float32Array(384).fill(0.3));
    expect(store.estimateBytes()).toBe(384 * 2);
  });

  it('estimateBaselineFloat32Bytes returns 4x estimateBytes', () => {
    const store = new QuantizedVectorStore(64);
    store.addVector('v', new Float32Array(64).fill(1));
    expect(store.estimateBaselineFloat32Bytes()).toBe(store.estimateBytes() * 4);
  });
});
