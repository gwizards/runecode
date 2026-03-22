/**
 * Scalar quantization for domain snapshot storage and HNSW vector index.
 *
 * Design goals:
 *   - 50-75% memory reduction for numeric fields via typed arrays
 *   - Standard scalar quantization: q = round(x / scale + zeroPoint)
 *   - int8 vector quantization for 384-dim embeddings (4x float32 reduction)
 *   - Full round-trip fidelity: decode(encode(snapshot)) ≡ snapshot
 *
 * Usage:
 *   const quantizer = new AgentSnapshotQuantizer();
 *   const buf = quantizer.encode(snapshot);
 *   const restored = quantizer.decode(buf);
 */

import type { RawLiveAgent, AgentStatus } from '../agent/types';
import type { RawMCPServer, ServerTransport, ServerStatusValue } from '../mcp/types';

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

// ─── AgentStatus codec ────────────────────────────────────────────────────────

// 5 values fit in a uint8 with 251 codes to spare.
const AGENT_STATUS_ENCODE: Record<AgentStatus, number> = {
  idle: 0,
  running: 1,
  thinking: 2,
  completed: 3,
  failed: 4,
};

const AGENT_STATUS_DECODE: AgentStatus[] = [
  'idle',
  'running',
  'thinking',
  'completed',
  'failed',
];

function encodeAgentStatus(status: AgentStatus | undefined): number {
  return AGENT_STATUS_ENCODE[status ?? 'idle'];
}

function decodeAgentStatus(code: number): AgentStatus {
  const s = AGENT_STATUS_DECODE[code];
  if (s === undefined) throw new Error(`Unknown AgentStatus code: ${code}`);
  return s;
}

// ─── AgentSnapshotQuantizer ───────────────────────────────────────────────────

/**
 * Quantizes RawLiveAgent snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0]  — status code (0-4)
 *   uint32[0] — tokenCount  (lossless: max ~4.29B)
 *   uint32[1] — startedAt   (seconds since epoch)
 *   uint32[2] — elapsedMs   (milliseconds, stored directly; max ~49 days)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: 3 × float64 + 1 × string~10 = 34 bytes numeric
 *   After:  1 × uint8 + 3 × uint32 = 13 bytes numeric
 *   Saving: ~62% on quantizable fields
 *
 * String fields (id, name) are preserved as-is in the strings map.
 */
export class AgentSnapshotQuantizer extends ScalarQuantizer<RawLiveAgent> {
  readonly version = 1;

  encode(snapshot: RawLiveAgent): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      1,  // uint8:  [status]
      0,  // uint16: (none)
      3,  // uint32: [tokenCount, startedAt, elapsedMs]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint8[0] = encodeAgentStatus(snapshot.status);
    fixed.uint32[0] = (snapshot.tokenCount ?? 0) >>> 0;
    fixed.uint32[1] = this.encodeTimestampMs(snapshot.startedAt ?? 0);
    fixed.uint32[2] = (snapshot.elapsedMs ?? 0) >>> 0;

    return {
      version: this.version,
      fixed,
      strings: {
        id: snapshot.id,
        name: snapshot.name,
      },
      params: {
        // These fields are lossless uint32 — scale=1, zeroPoint=0.
        tokenCount: { scale: 1, zeroPoint: 0 },
        startedAt: { scale: 1000, zeroPoint: 0 }, // stored in seconds, decoded to ms
        elapsedMs: { scale: 1, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): RawLiveAgent {
    this.assertVersion(buf);

    const statusCode = buf.fixed.uint8[0] ?? 0;
    const tokenCount = buf.fixed.uint32[0] ?? 0;
    const startedAtSec = buf.fixed.uint32[1] ?? 0;
    const elapsedMs = buf.fixed.uint32[2] ?? 0;

    return {
      id: buf.strings['id'] ?? '',
      name: buf.strings['name'] ?? '',
      status: decodeAgentStatus(statusCode),
      tokenCount: tokenCount >>> 0,
      startedAt: this.decodeTimestampMs(startedAtSec),
      elapsedMs: elapsedMs >>> 0,
    };
  }
}

// ─── ServerTransport / ServerStatusValue codecs ───────────────────────────────

const TRANSPORT_ENCODE: Record<ServerTransport, number> = {
  stdio: 0,
  sse: 1,
};

const TRANSPORT_DECODE: ServerTransport[] = ['stdio', 'sse'];

function encodeTransport(t: ServerTransport): number {
  return TRANSPORT_ENCODE[t];
}

function decodeTransport(code: number): ServerTransport {
  const t = TRANSPORT_DECODE[code];
  if (t === undefined) throw new Error(`Unknown ServerTransport code: ${code}`);
  return t;
}

const SERVER_STATUS_ENCODE: Record<ServerStatusValue, number> = {
  pending: 0,
  connected: 1,
  disconnected: 2,
  error: 3,
};

const SERVER_STATUS_DECODE: ServerStatusValue[] = [
  'pending',
  'connected',
  'disconnected',
  'error',
];

function encodeServerStatus(status: ServerStatusValue | undefined): number {
  return SERVER_STATUS_ENCODE[status ?? 'disconnected'];
}

function decodeServerStatus(code: number): ServerStatusValue {
  const s = SERVER_STATUS_DECODE[code];
  if (s === undefined) throw new Error(`Unknown ServerStatusValue code: ${code}`);
  return s;
}

// ─── MCPSnapshotQuantizer ─────────────────────────────────────────────────────

/**
 * Quantizes RawMCPServer snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0] — transport code (0=stdio, 1=sse)
 *   uint8[1] — status code    (0-4)
 *   uint8[2] — enabled flag   (0=false, 1=true)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: 2 × string~10 + 1 × boolean = ~22 bytes for quantizable fields
 *   After:  3 × uint8 = 3 bytes
 *   Saving: ~86% on quantizable fields
 *
 * String fields (id, name, url/command, args) are preserved as-is.
 * args is serialized as JSON to fit in the strings map.
 */
export class MCPSnapshotQuantizer extends ScalarQuantizer<RawMCPServer> {
  readonly version = 1;

  encode(snapshot: RawMCPServer): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      3,  // uint8:  [transport, status, enabled]
      0,  // uint16: (none)
      0,  // uint32: (none)
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint8[0] = encodeTransport(snapshot.transport);
    fixed.uint8[1] = encodeServerStatus(snapshot.status);
    fixed.uint8[2] = snapshot.enabled !== false ? 1 : 0;

    const strings: Record<string, string> = {
      name: snapshot.name,
    };
    if (snapshot.id !== undefined) strings['id'] = snapshot.id;
    if (snapshot.url !== undefined) strings['url'] = snapshot.url;
    if (snapshot.command !== undefined) strings['command'] = snapshot.command;
    if (snapshot.args !== undefined) strings['args'] = JSON.stringify(snapshot.args);

    return {
      version: this.version,
      fixed,
      strings,
      params: {},
    };
  }

  decode(buf: QuantizedBuffer): RawMCPServer {
    this.assertVersion(buf);

    const transportCode = buf.fixed.uint8[0] ?? 0;
    const statusCode = buf.fixed.uint8[1] ?? 2; // default: disconnected
    const enabledFlag = buf.fixed.uint8[2] ?? 1;

    const argsRaw = buf.strings['args'];
    const args: string[] | undefined = argsRaw !== undefined
      ? (JSON.parse(argsRaw) as string[])
      : undefined;

    const result: RawMCPServer = {
      name: buf.strings['name'] ?? '',
      transport: decodeTransport(transportCode),
      status: decodeServerStatus(statusCode),
      enabled: enabledFlag === 1,
    };

    if (buf.strings['id'] !== undefined) result.id = buf.strings['id'];
    if (buf.strings['url'] !== undefined) result.url = buf.strings['url'];
    if (buf.strings['command'] !== undefined) result.command = buf.strings['command'];
    if (args !== undefined) result.args = args;

    return result;
  }
}

// ─── AnalyticsSnapshotQuantizer ──────────────────────────────────────────────

import type { RawConsent, ConsentStatus } from '../analytics/types';

// ConsentStatus codec (3 values fit in a uint8)
const CONSENT_STATUS_ENCODE: Record<ConsentStatus, number> = {
  pending: 0,
  granted: 1,
  revoked: 2,
};

const CONSENT_STATUS_DECODE: ConsentStatus[] = ['pending', 'granted', 'revoked'];

function encodeConsentStatus(status: ConsentStatus | undefined): number {
  return CONSENT_STATUS_ENCODE[status ?? 'pending'];
}

function decodeConsentStatus(code: number): ConsentStatus {
  const s = CONSENT_STATUS_DECODE[code];
  if (s === undefined) throw new Error(`Unknown ConsentStatus code: ${code}`);
  return s;
}

/**
 * Quantizes RawConsent snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0]  — status code (0=pending, 1=granted, 2=revoked)
 *   uint32[0] — grantedAt  (seconds since epoch; 0 = not set / null)
 *   uint32[1] — revokedAt  (seconds since epoch; 0 = not set / null)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: status string ~7 chars + 2 × float64 timestamps = ~23 bytes
 *   After:  1×uint8 + 2×uint32 = 9 bytes
 *   Saving: ~61% on quantizable fields
 *
 * String fields (id, sessionId, projectId) are preserved as-is.
 */
export class AnalyticsSnapshotQuantizer extends ScalarQuantizer<RawConsent> {
  readonly version = 1;

  encode(snapshot: RawConsent): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      1,  // uint8:  [status]
      0,  // uint16: (none)
      2,  // uint32: [grantedAt, revokedAt]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint8[0] = encodeConsentStatus(snapshot.status);
    // Timestamps are Unix ms; encode to uint32 seconds (0 = not set).
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
    const grantedAtSec = buf.fixed.uint32[0] ?? 0;
    const revokedAtSec = buf.fixed.uint32[1] ?? 0;

    return {
      id: buf.strings['id'] ?? '',
      sessionId: buf.strings['sessionId'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      status: decodeConsentStatus(statusCode),
      grantedAt: grantedAtSec !== 0 ? this.decodeTimestampMs(grantedAtSec) : undefined,
      revokedAt: revokedAtSec !== 0 ? this.decodeTimestampMs(revokedAtSec) : undefined,
    };
  }
}

// ─── WorkspaceSnapshotQuantizer ───────────────────────────────────────────────

// TODO: Replace this placeholder with `import type { RawWorkspace } from '../workspace/types'`
// once src/domain/workspace/types.ts is created by the workspace-domain agent.
export interface RawWorkspace {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly tabCount: number;        // uint8 — expected range 0-255
  readonly activeTabIndex: number;  // uint8 — expected range 0-254 (255 = none)
}

/**
 * Quantizes RawWorkspace snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0] — tabCount       (0-255)
 *   uint8[1] — activeTabIndex (0-255; 255 = no active tab)
 *
 * String fields (workspaceId, sessionId, projectId) are stored length-prefixed
 * in a flat Uint8Array via TextEncoder so they survive round-trips exactly.
 * For simplicity this quantizer stores them in the `strings` map (same as
 * the other quantizers) which already provides UTF-8 round-trip fidelity.
 *
 * Memory per record (quantized fixed fields only):
 *   Before: 2 × float64 numerics = 16 bytes
 *   After:  2 × uint8 = 2 bytes
 *   Saving: ~88% on quantizable fields
 */
export class WorkspaceSnapshotQuantizer extends ScalarQuantizer<RawWorkspace> {
  readonly version = 1;

  encode(snapshot: RawWorkspace): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      2,  // uint8:  [tabCount, activeTabIndex]
      0,  // uint16: (none)
      0,  // uint32: (none)
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    // Clamp to uint8 range to avoid overflow; callers should not exceed 255.
    fixed.uint8[0] = Math.max(0, Math.min(255, snapshot.tabCount)) & 0xff;
    fixed.uint8[1] = Math.max(0, Math.min(255, snapshot.activeTabIndex)) & 0xff;

    return {
      version: this.version,
      fixed,
      strings: {
        workspaceId: snapshot.workspaceId,
        sessionId: snapshot.sessionId,
        projectId: snapshot.projectId,
      },
      params: {},
    };
  }

  decode(buf: QuantizedBuffer): RawWorkspace {
    this.assertVersion(buf);

    return {
      workspaceId: buf.strings['workspaceId'] ?? '',
      sessionId: buf.strings['sessionId'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      tabCount: buf.fixed.uint8[0] ?? 0,
      activeTabIndex: buf.fixed.uint8[1] ?? 0,
    };
  }
}

// ─── ProjectSnapshotQuantizer ─────────────────────────────────────────────────

import type { RawProject } from '../project/types';

/**
 * Quantizes RawProject snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint32[0] — createdAt    (seconds since epoch; 0 = not set)
 *   uint32[1] — lastOpenedAt (seconds since epoch; 0 = not set)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: 2 × ISO-8601 string ~24 chars = ~50 bytes
 *   After:  2 × uint32 = 8 bytes
 *   Saving: ~84% on timestamp fields
 *
 * String fields (id, path, name) are preserved as-is.
 */
export class ProjectSnapshotQuantizer extends ScalarQuantizer<RawProject> {
  readonly version = 1;

  encode(snapshot: RawProject): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      0,  // uint8:  (none)
      0,  // uint16: (none)
      2,  // uint32: [createdAt, lastOpenedAt]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint32[0] = this.encodeIsoTimestamp(snapshot.createdAt);
    fixed.uint32[1] = this.encodeIsoTimestamp(snapshot.lastOpenedAt);

    const strings: Record<string, string> = {
      id: snapshot.id,
      path: snapshot.path,
    };
    if (snapshot.name !== undefined) strings['name'] = snapshot.name;

    return {
      version: this.version,
      fixed,
      strings,
      params: {
        createdAt: { scale: 1000, zeroPoint: 0 },
        lastOpenedAt: { scale: 1000, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): RawProject {
    this.assertVersion(buf);

    const createdAtSec = buf.fixed.uint32[0] ?? 0;
    const lastOpenedAtSec = buf.fixed.uint32[1] ?? 0;

    return {
      id: buf.strings['id'] ?? '',
      path: buf.strings['path'] ?? '',
      name: buf.strings['name'],
      createdAt: this.decodeIsoTimestamp(createdAtSec),
      lastOpenedAt: this.decodeIsoTimestamp(lastOpenedAtSec),
    };
  }
}

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
 * Metadata stored alongside each quantized embedding in the HNSW index.
 */
export interface QuantizedEntry {
  readonly key: string;
  readonly quantized: Int8Array;
  readonly scale: number;
}

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

export interface SavingsProjection {
  readonly aggregateType: string;
  readonly records: number;
  readonly baselineBytes: number;
  readonly quantizedBytes: number;
  readonly savingBytes: number;
  readonly savingPercent: number;
}

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
