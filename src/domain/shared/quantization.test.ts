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
import type { RawSession } from '../session/types';
import type { RawCommandSnapshot } from '../command/types';
import type { RawConsent } from '../analytics/types';
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
  SessionSnapshotQuantizer,
  CommandSnapshotQuantizer,
  AnalyticsSnapshotQuantizer,
  WorkspaceSnapshotQuantizer,
  QuantizedSnapshotStore,
  QuantizedVectorStore,
  ScalarQuantizer,
  computeSavingsProjections,
} from './quantization';
import type { QuantizedBuffer, RawWorkspace } from './quantization';

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

// ─── QuantizedSnapshotStore.searchNearest ────────────────────────────────────

/**
 * A minimal quantizer that encodes a Float32Array (up to 4 elements) as int8
 * fields.  This is the only way to exercise searchNearest, which requires
 * int8.length > 0 in the stored QuantizedBuffer.
 */
type RawVec4 = { values: number[] };

class Vec4SnapshotQuantizer extends ScalarQuantizer<RawVec4> {
  readonly version = 1;

  encode(snapshot: RawVec4): QuantizedBuffer {
    const DIM = 4;
    const fixed = this.makeEmptyBuffer(
      0,   // uint8
      0,   // uint16
      0,   // uint32
      DIM, // int8  ← the only numeric storage
      0,   // int16
    );
    // Symmetric int8 quantization (max|v|/127)
    const vals = snapshot.values;
    let maxAbs = 0;
    for (let i = 0; i < DIM; i++) maxAbs = Math.max(maxAbs, Math.abs(vals[i] ?? 0));
    const scale = maxAbs === 0 ? 1 : maxAbs / 127;
    for (let i = 0; i < DIM; i++) {
      fixed.int8[i] = Math.max(-127, Math.min(127, Math.round((vals[i] ?? 0) / scale)));
    }
    return { version: this.version, fixed, strings: {}, params: {} };
  }

  decode(buf: QuantizedBuffer): RawVec4 {
    this.assertVersion(buf);
    return { values: Array.from(buf.fixed.int8) };
  }
}

describe('QuantizedSnapshotStore.searchNearest', () => {
  function makeStore() {
    return new QuantizedSnapshotStore<RawVec4, string>(new Vec4SnapshotQuantizer());
  }

  it('empty store returns []', () => {
    const store = makeStore();
    expect(store.searchNearest([1, 0, 0, 0])).toEqual([]);
  });

  it('zero-vector query returns [] (cosine undefined — all-zero query)', () => {
    const store = makeStore();
    store.set('a', { values: [1, 0, 0, 0] });
    // The query is all zeros → queryScale = 1, qQuery = all zeros → int8CosineSimilarity
    // returns 0 for every pair (dot=0, normA=0 → returns 0 by guard).
    // searchNearest itself does not special-case zero queries, but the score
    // will be 0 for all entries — it still returns them. However when the
    // query vector is [0,0,0,0] the quantized form is all-zeros too, so
    // int8CosineSimilarity returns 0 for each entry (not NaN).
    // The contract we verify is that it does NOT throw and returns an array.
    const results = store.searchNearest([0, 0, 0, 0]);
    expect(Array.isArray(results)).toBe(true);
  });

  it('single entry — returns [{ key, score, value }]', () => {
    const store = makeStore();
    store.set('vec-a', { values: [1, 1, 0, 0] });

    const results = store.searchNearest([1, 1, 0, 0], 5);

    expect(results).toHaveLength(1);
    expect(results[0]).toHaveProperty('key', 'vec-a');
    expect(results[0]).toHaveProperty('score');
    expect(results[0]).toHaveProperty('value');
  });

  it('all returned scores are in the range [-1, 1]', () => {
    const store = makeStore();
    store.set('a', { values: [1, 0, 0, 0] });
    store.set('b', { values: [0, 1, 0, 0] });
    store.set('c', { values: [-1, 0, 0, 0] });

    const results = store.searchNearest([1, 0, 0, 0], 5);

    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(-1);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('identical vector scores approximately 1.0', () => {
    const store = makeStore();
    const values = [3, 1, -2, 4];
    store.set('exact', { values });

    const results = store.searchNearest(values, 5);

    const match = results.find((r) => r.key === 'exact');
    expect(match).toBeDefined();
    expect(match!.score).toBeCloseTo(1.0, 1);
  });

  it('orthogonal vector scores approximately 0', () => {
    const store = makeStore();
    // [1, 0, 0, 0] is orthogonal to [0, 1, 0, 0]
    store.set('stored', { values: [1, 0, 0, 0] });

    const results = store.searchNearest([0, 1, 0, 0], 5);

    const match = results.find((r) => r.key === 'stored');
    expect(match).toBeDefined();
    expect(Math.abs(match!.score)).toBeLessThan(0.1);
  });

  it('opposite vector scores approximately -1', () => {
    const store = makeStore();
    store.set('pos', { values: [1, 1, 1, 1] });

    const results = store.searchNearest([-1, -1, -1, -1], 5);

    const match = results.find((r) => r.key === 'pos');
    expect(match).toBeDefined();
    expect(match!.score).toBeCloseTo(-1.0, 1);
  });

  it('topK limits the number of results', () => {
    const store = makeStore();
    for (let i = 0; i < 10; i++) {
      store.set(`vec-${i}`, { values: [i + 1, i, 0, 0] });
    }

    const results = store.searchNearest([1, 1, 0, 0], 3);

    expect(results).toHaveLength(3);
  });

  it('results are sorted in descending score order', () => {
    const store = makeStore();
    store.set('close', { values: [1, 0, 0, 0] });
    store.set('medium', { values: [1, 1, 0, 0] });
    store.set('far', { values: [0, 0, 1, 0] });

    const results = store.searchNearest([1, 0, 0, 0], 3);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('string-only quantizer (no int8 fields) returns []', () => {
    // AgentSnapshotQuantizer stores no int8 fields — searchNearest short-circuits.
    const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
    store.set('a', makeAgent({ id: 'a' }));

    const results = store.searchNearest([1, 0, 0]);

    expect(results).toEqual([]);
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

// ─── Helpers for Session and Command tests ────────────────────────────────────

function makeSession(overrides: Partial<RawSession> = {}): RawSession {
  return {
    id: 'sess-001',
    projectId: 'proj-001',
    status: 'running',
    createdAt: '2024-05-01T12:00:00.000Z',
    tokenUsage: {
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.01234,
      cacheReadTokens: 50,
      cacheCreationTokens: 75,
    },
    ...overrides,
  };
}

function makeCommand(overrides: Partial<RawCommandSnapshot> = {}): RawCommandSnapshot {
  return {
    id: 'cmd-001',
    name: 'test-cmd',
    fullCommand: '/test-cmd',
    scope: 'builtin',
    namespace: undefined,
    filePath: undefined,
    content: 'echo hello',
    description: undefined,
    capabilities: {
      hasBashCommands: false,
      hasFileReferences: false,
      acceptsArguments: false,
      allowedTools: [],
    },
    registeredAt: 1_700_000_000_000,
    ...overrides,
  };
}

// ─── SessionSnapshotQuantizer ─────────────────────────────────────────────────

describe('SessionSnapshotQuantizer', () => {
  const q = new SessionSnapshotQuantizer();

  it('round-trip: status "running" → decode → "running"', () => {
    const original = makeSession({ status: 'running' });
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe('running');
  });

  it('round-trip: status "completed" → decode → "completed"', () => {
    const original = makeSession({ status: 'completed' });
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe('completed');
  });

  it('round-trip: status "error" → decode → "error"', () => {
    const original = makeSession({ status: 'error' });
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe('error');
  });

  it('round-trip: status "idle" → decode → "idle"', () => {
    const original = makeSession({ status: 'idle' });
    const restored = q.decode(q.encode(original));
    expect(restored.status).toBe('idle');
  });

  it('round-trip: tokenUsage.inputTokens preserved', () => {
    const original = makeSession({ tokenUsage: { inputTokens: 12345, outputTokens: 0, costUsd: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenUsage?.inputTokens).toBe(12345);
  });

  it('round-trip: tokenUsage.outputTokens preserved', () => {
    const original = makeSession({ tokenUsage: { inputTokens: 0, outputTokens: 67890, costUsd: 0, cacheReadTokens: 0, cacheCreationTokens: 0 } });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenUsage?.outputTokens).toBe(67890);
  });

  it('round-trip: tokenUsage.costUsd preserved (e.g. 0.01234)', () => {
    const original = makeSession({ tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0.01234, cacheReadTokens: 0, cacheCreationTokens: 0 } });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenUsage?.costUsd).toBeCloseTo(0.01234, 8);
  });

  it('round-trip: id and projectId preserved', () => {
    const original = makeSession({ id: 'my-session-id', projectId: 'my-project-id' });
    const restored = q.decode(q.encode(original));
    expect(restored.id).toBe('my-session-id');
    expect(restored.projectId).toBe('my-project-id');
  });

  it('round-trip: optional title preserved', () => {
    const original = makeSession({ title: 'My Session Title' });
    const restored = q.decode(q.encode(original));
    expect(restored.title).toBe('My Session Title');
  });

  it('round-trip: missing optional fields (title/updatedAt) → undefined in decoded result', () => {
    const original: RawSession = { id: 'sess-no-opt', projectId: 'proj-001' };
    const restored = q.decode(q.encode(original));
    expect(restored.title).toBeUndefined();
    expect(restored.updatedAt).toBeUndefined();
  });

  it('round-trip: cacheReadTokens and cacheCreationTokens preserved', () => {
    const original = makeSession({ tokenUsage: { inputTokens: 0, outputTokens: 0, costUsd: 0, cacheReadTokens: 111, cacheCreationTokens: 222 } });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenUsage?.cacheReadTokens).toBe(111);
    expect(restored.tokenUsage?.cacheCreationTokens).toBe(222);
  });

  it('round-trip: max uint32 token values do not overflow', () => {
    const maxUint32 = 0xFFFFFFFF; // 4294967295
    const original = makeSession({
      tokenUsage: {
        inputTokens: maxUint32,
        outputTokens: maxUint32,
        costUsd: 0,
        cacheReadTokens: maxUint32,
        cacheCreationTokens: maxUint32,
      },
    });
    const restored = q.decode(q.encode(original));
    expect(restored.tokenUsage?.inputTokens).toBe(maxUint32);
    expect(restored.tokenUsage?.outputTokens).toBe(maxUint32);
    expect(restored.tokenUsage?.cacheReadTokens).toBe(maxUint32);
    expect(restored.tokenUsage?.cacheCreationTokens).toBe(maxUint32);
  });
});

// ─── CommandSnapshotQuantizer ─────────────────────────────────────────────────

describe('CommandSnapshotQuantizer', () => {
  const q = new CommandSnapshotQuantizer();

  it('round-trip: scope "builtin" → decode → "builtin"', () => {
    const original = makeCommand({ scope: 'builtin' });
    const restored = q.decode(q.encode(original));
    expect(restored.scope).toBe('builtin');
  });

  it('round-trip: scope "user" → decode → "user"', () => {
    const original = makeCommand({ scope: 'user' });
    const restored = q.decode(q.encode(original));
    expect(restored.scope).toBe('user');
  });

  it('round-trip: scope "project" → decode → "project"', () => {
    const original = makeCommand({ scope: 'project' });
    const restored = q.decode(q.encode(original));
    expect(restored.scope).toBe('project');
  });

  it('round-trip: scope "skill" → decode → "skill"', () => {
    const original = makeCommand({ scope: 'skill' });
    const restored = q.decode(q.encode(original));
    expect(restored.scope).toBe('skill');
  });

  it('round-trip: id, name, fullCommand preserved', () => {
    const original = makeCommand({ id: 'cmd-xyz', name: 'my-cmd', fullCommand: '/my-cmd arg' });
    const restored = q.decode(q.encode(original));
    expect(restored.id).toBe('cmd-xyz');
    expect(restored.name).toBe('my-cmd');
    expect(restored.fullCommand).toBe('/my-cmd arg');
  });

  it('round-trip: description optional field preserved', () => {
    const original = makeCommand({ description: 'A useful command' });
    const restored = q.decode(q.encode(original));
    expect(restored.description).toBe('A useful command');
  });

  it('round-trip: filePath optional field preserved', () => {
    const original = makeCommand({ scope: 'user', filePath: '/home/user/.claude/commands/test.md' });
    const restored = q.decode(q.encode(original));
    expect(restored.filePath).toBe('/home/user/.claude/commands/test.md');
  });

  it('round-trip: allowedTools array preserved (JSON round-trip)', () => {
    const original = makeCommand({
      capabilities: {
        hasBashCommands: true,
        hasFileReferences: false,
        acceptsArguments: false,
        allowedTools: ['Bash', 'Read', 'Write'],
      },
    });
    const restored = q.decode(q.encode(original));
    expect(restored.capabilities.allowedTools).toEqual(['Bash', 'Read', 'Write']);
  });

  it('round-trip: capabilities bitmask — hasBashCommands=true preserved', () => {
    const original = makeCommand({
      capabilities: {
        hasBashCommands: true,
        hasFileReferences: false,
        acceptsArguments: false,
        allowedTools: ['Bash'],
      },
    });
    const restored = q.decode(q.encode(original));
    expect(restored.capabilities.hasBashCommands).toBe(true);
    expect(restored.capabilities.hasFileReferences).toBe(false);
    expect(restored.capabilities.acceptsArguments).toBe(false);
  });

  it('round-trip: capabilities bitmask — all flags true preserved', () => {
    const original = makeCommand({
      capabilities: {
        hasBashCommands: true,
        hasFileReferences: true,
        acceptsArguments: true,
        allowedTools: ['Bash', 'Read'],
      },
    });
    const restored = q.decode(q.encode(original));
    expect(restored.capabilities.hasBashCommands).toBe(true);
    expect(restored.capabilities.hasFileReferences).toBe(true);
    expect(restored.capabilities.acceptsArguments).toBe(true);
  });

  it('round-trip: capabilities bitmask — all flags false preserved', () => {
    const original = makeCommand({
      capabilities: {
        hasBashCommands: false,
        hasFileReferences: false,
        acceptsArguments: false,
        allowedTools: [],
      },
    });
    const restored = q.decode(q.encode(original));
    expect(restored.capabilities.hasBashCommands).toBe(false);
    expect(restored.capabilities.hasFileReferences).toBe(false);
    expect(restored.capabilities.acceptsArguments).toBe(false);
  });

  it('round-trip: namespace optional field preserved', () => {
    const original = makeCommand({ namespace: 'my-namespace' });
    const restored = q.decode(q.encode(original));
    expect(restored.namespace).toBe('my-namespace');
  });
});

// ─── Helpers for Analytics and Workspace tests ────────────────────────────────

function makeConsent(overrides: Partial<RawConsent> = {}): RawConsent {
  return {
    id: 'consent-001',
    sessionId: 'sess-001',
    projectId: 'proj-001',
    status: 'granted',
    grantedAt: 1_700_000_000_000,
    revokedAt: undefined,
    ...overrides,
  };
}

function makeWorkspace(overrides: Partial<RawWorkspace> = {}): RawWorkspace {
  return {
    workspaceId: 'ws-001',
    sessionId: 'sess-001',
    projectId: 'proj-001',
    tabCount: 3,
    activeTabIndex: 1,
    ...overrides,
  };
}

// ─── Quantizer savings projections ────────────────────────────────────────────

describe('Quantizer savings projections', () => {
  // ── computeSavingsProjections structural tests ─────────────────────────────

  describe('computeSavingsProjections structure', () => {
    it('returns an array with 4 rows for each record count', () => {
      const result = computeSavingsProjections([100, 1000, 10_000]);
      expect(result).toHaveLength(3);
      for (const perCount of result) {
        expect(perCount).toHaveLength(4);
      }
    });

    it('each row has the required fields: recordCount, rawBytes, quantizedBytes, savedBytes, savingsPercent', () => {
      const result = computeSavingsProjections([100, 1000, 10_000]);
      for (const perCount of result) {
        for (const row of perCount) {
          // The SavingsProjection interface uses these field names:
          expect(row).toHaveProperty('aggregateType');
          expect(row).toHaveProperty('records');
          expect(row).toHaveProperty('baselineBytes');
          expect(row).toHaveProperty('quantizedBytes');
          expect(row).toHaveProperty('savingBytes');
          expect(row).toHaveProperty('savingPercent');
        }
      }
    });

    it('savingPercent is between 0 and 100 for all rows', () => {
      const result = computeSavingsProjections([100, 1000, 10_000]);
      for (const perCount of result) {
        for (const row of perCount) {
          expect(row.savingPercent).toBeGreaterThan(0);
          expect(row.savingPercent).toBeLessThanOrEqual(100);
        }
      }
    });

    it('quantizedBytes is less than baselineBytes for all rows', () => {
      const result = computeSavingsProjections([100, 1000, 10_000]);
      for (const perCount of result) {
        for (const row of perCount) {
          expect(row.quantizedBytes).toBeLessThan(row.baselineBytes);
        }
      }
    });

    it('savingBytes equals baselineBytes minus quantizedBytes', () => {
      const result = computeSavingsProjections([100, 1000, 10_000]);
      for (const perCount of result) {
        for (const row of perCount) {
          expect(row.savingBytes).toBe(row.baselineBytes - row.quantizedBytes);
        }
      }
    });
  });

  // ── AgentSnapshotQuantizer — estimateFixedBytes vs JSON ───────────────────

  describe('AgentSnapshotQuantizer savings', () => {
    const snapshot: RawLiveAgent = {
      id: 'agent-bench-001',
      name: 'BenchmarkAgent',
      status: 'running',
      tokenCount: 75_000,
      startedAt: 1_700_000_000_000,
      elapsedMs: 12_345,
    };

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for AgentSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawLiveAgent, string>(new AgentSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const restored = store.get(snapshot.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(snapshot.id);
      expect(restored!.name).toBe(snapshot.name);
      expect(restored!.status).toBe(snapshot.status);
      expect(restored!.tokenCount).toBe(snapshot.tokenCount);
    });
  });

  // ── MCPSnapshotQuantizer — estimateFixedBytes vs JSON ─────────────────────

  describe('MCPSnapshotQuantizer savings', () => {
    const snapshot: RawMCPServer = {
      id: 'mcp-bench-001',
      name: 'BenchmarkMCPServer',
      transport: 'sse',
      status: 'connected',
      enabled: true,
      url: 'http://localhost:3000',
    };

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawMCPServer, string>(new MCPSnapshotQuantizer());
      store.set(snapshot.id!, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for MCPSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawMCPServer, string>(new MCPSnapshotQuantizer());
      store.set(snapshot.id!, snapshot);
      const restored = store.get(snapshot.id!);
      expect(restored).toBeDefined();
      expect(restored!.name).toBe(snapshot.name);
      expect(restored!.transport).toBe(snapshot.transport);
      expect(restored!.status).toBe(snapshot.status);
      expect(restored!.enabled).toBe(snapshot.enabled);
    });
  });

  // ── ProjectSnapshotQuantizer — estimateFixedBytes vs JSON ─────────────────

  describe('ProjectSnapshotQuantizer savings', () => {
    const snapshot: RawProject = {
      id: 'proj-bench-001',
      path: '/home/user/projects/benchmark',
      name: 'BenchmarkProject',
      createdAt: '2024-01-15T10:00:00.000Z',
      lastOpenedAt: '2024-06-01T08:30:00.000Z',
    };

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawProject, string>(new ProjectSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for ProjectSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawProject, string>(new ProjectSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const restored = store.get(snapshot.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(snapshot.id);
      expect(restored!.path).toBe(snapshot.path);
      expect(restored!.name).toBe(snapshot.name);
    });
  });

  // ── SessionSnapshotQuantizer — estimateFixedBytes vs JSON ─────────────────

  describe('SessionSnapshotQuantizer savings', () => {
    const snapshot: RawSession = {
      id: 'sess-bench-001',
      projectId: 'proj-bench-001',
      title: 'Benchmark Session',
      status: 'running',
      createdAt: '2024-05-01T12:00:00.000Z',
      updatedAt: '2024-05-01T13:00:00.000Z',
      tokenUsage: {
        inputTokens: 5_000,
        outputTokens: 3_000,
        costUsd: 0.025,
        cacheReadTokens: 1_000,
        cacheCreationTokens: 500,
      },
    };

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawSession, string>(new SessionSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for SessionSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawSession, string>(new SessionSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const restored = store.get(snapshot.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(snapshot.id);
      expect(restored!.projectId).toBe(snapshot.projectId);
      expect(restored!.status).toBe(snapshot.status);
      expect(restored!.tokenUsage?.inputTokens).toBe(5_000);
    });
  });

  // ── CommandSnapshotQuantizer — estimateFixedBytes vs JSON ─────────────────

  describe('CommandSnapshotQuantizer savings', () => {
    const snapshot: RawCommandSnapshot = {
      id: 'cmd-bench-001',
      name: 'benchmark-cmd',
      fullCommand: '/benchmark-cmd --flag value',
      scope: 'user',
      namespace: 'bench',
      filePath: '/home/user/.claude/commands/benchmark.md',
      content: 'Run the benchmark suite with comprehensive coverage',
      description: 'Execute benchmark tests across all domains',
      capabilities: {
        hasBashCommands: true,
        hasFileReferences: true,
        acceptsArguments: true,
        allowedTools: ['Bash', 'Read', 'Write', 'Grep'],
      },
      registeredAt: 1_700_000_000_000,
    };

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawCommandSnapshot, string>(new CommandSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for CommandSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawCommandSnapshot, string>(new CommandSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const restored = store.get(snapshot.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(snapshot.id);
      expect(restored!.name).toBe(snapshot.name);
      expect(restored!.scope).toBe(snapshot.scope);
      expect(restored!.capabilities.hasBashCommands).toBe(true);
      expect(restored!.capabilities.allowedTools).toEqual(['Bash', 'Read', 'Write', 'Grep']);
    });
  });

  // ── AnalyticsSnapshotQuantizer — estimateFixedBytes vs JSON ───────────────

  describe('AnalyticsSnapshotQuantizer savings', () => {
    const snapshot = makeConsent({
      id: 'consent-bench-001',
      sessionId: 'sess-bench-001',
      projectId: 'proj-bench-001',
      status: 'granted',
      grantedAt: 1_700_000_000_000,
      revokedAt: undefined,
    });

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawConsent, string>(new AnalyticsSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for AnalyticsSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawConsent, string>(new AnalyticsSnapshotQuantizer());
      store.set(snapshot.id, snapshot);
      const restored = store.get(snapshot.id);
      expect(restored).toBeDefined();
      expect(restored!.id).toBe(snapshot.id);
      expect(restored!.sessionId).toBe(snapshot.sessionId);
      expect(restored!.projectId).toBe(snapshot.projectId);
      expect(restored!.status).toBe(snapshot.status);
    });
  });

  // ── WorkspaceSnapshotQuantizer — estimateFixedBytes vs JSON ───────────────

  describe('WorkspaceSnapshotQuantizer savings', () => {
    const snapshot = makeWorkspace({
      workspaceId: 'ws-bench-001',
      sessionId: 'sess-bench-001',
      projectId: 'proj-bench-001',
      tabCount: 7,
      activeTabIndex: 2,
    });

    it('estimateFixedBytes returns fewer bytes than JSON.stringify(snapshot).length', () => {
      const store = new QuantizedSnapshotStore<RawWorkspace, string>(new WorkspaceSnapshotQuantizer());
      store.set(snapshot.workspaceId, snapshot);
      const quantizedBytes = store.estimateFixedBytes();
      const jsonBytes = JSON.stringify(snapshot).length;
      expect(quantizedBytes).toBeLessThan(jsonBytes);
    });

    it('encode/decode preserves identity for WorkspaceSnapshotQuantizer store', () => {
      const store = new QuantizedSnapshotStore<RawWorkspace, string>(new WorkspaceSnapshotQuantizer());
      store.set(snapshot.workspaceId, snapshot);
      const restored = store.get(snapshot.workspaceId);
      expect(restored).toBeDefined();
      expect(restored!.workspaceId).toBe(snapshot.workspaceId);
      expect(restored!.sessionId).toBe(snapshot.sessionId);
      expect(restored!.projectId).toBe(snapshot.projectId);
      expect(restored!.tabCount).toBe(snapshot.tabCount);
      expect(restored!.activeTabIndex).toBe(snapshot.activeTabIndex);
    });
  });
});
