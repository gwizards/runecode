/**
 * AgentSnapshotQuantizer — quantizes RawLiveAgent snapshots.
 *
 * Import from here directly instead of the shared barrel when you only need
 * the agent quantizer. The shared barrel re-exports this for backward compat.
 */

import type { RawLiveAgent, AgentStatus } from './types';
import { ScalarQuantizer, type QuantizedBuffer } from '../shared/quantization-core';

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
