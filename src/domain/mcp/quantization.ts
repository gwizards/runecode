/**
 * MCPSnapshotQuantizer — quantizes RawMCPServer snapshots.
 *
 * Import from here directly instead of the shared barrel when you only need
 * the MCP quantizer. The shared barrel re-exports this for backward compat.
 */

import type { RawMCPServer, ServerTransport, ServerStatusValue } from './types';
import { ScalarQuantizer, type QuantizedBuffer } from '../shared/quantization-core';

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
