/**
 * Backward-compat re-export barrel for scalar quantization.
 *
 * Do not add new exports here. Import directly from the focused modules:
 *   - Primitive math & base class: ./quantization-core
 *   - Store containers:            ./quantization-stores
 *   - Agent quantizer:             ../agent/quantization
 *   - MCP quantizer:               ../mcp/quantization
 *   - Project quantizer:           ../project/quantization
 *
 * Analytics, Workspace, Session, and Command quantizers remain here until
 * they are promoted to their own bounded-context files.
 */

// ─── Focused module re-exports ────────────────────────────────────────────────

export * from './quantization-core';
export * from './quantization-stores';
export { AgentSnapshotQuantizer } from '../agent/quantization';
export { MCPSnapshotQuantizer } from '../mcp/quantization';
export { ProjectSnapshotQuantizer } from '../project/quantization';

// ─── Inline quantizers (not yet promoted to their own context files) ───────────

import type { RawConsent, ConsentStatus } from '../analytics/types';
import type { RawCommandSnapshot, CommandScopeValue } from '../command/types';
import { ScalarQuantizer, type QuantizedBuffer } from './quantization-core';

// ─── AnalyticsSnapshotQuantizer ──────────────────────────────────────────────

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
        userId: snapshot.userId,
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
      userId: buf.strings['userId'] ?? '',
      sessionId: buf.strings['sessionId'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      status: decodeConsentStatus(statusCode),
      grantedAt: grantedAtSec !== 0 ? this.decodeTimestampMs(grantedAtSec) : undefined,
      revokedAt: revokedAtSec !== 0 ? this.decodeTimestampMs(revokedAtSec) : undefined,
    };
  }
}

// ─── WorkspaceSnapshotQuantizer ───────────────────────────────────────────────

// Quantization-specific workspace snapshot — intentionally different from
// ../workspace/types.RawWorkspace which includes full tab arrays.  This shape
// captures only the scalar fields that benefit from quantization (tabCount,
// activeTabIndex).  Kept inline to avoid coupling the shared quantization
// barrel to the workspace bounded context.
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

// ─── SessionSnapshotQuantizer ─────────────────────────────────────────────────

// Minimal snapshot interface — keeps the shared kernel independent of the
// session bounded context. Must stay structurally compatible with RawSession.
interface SessionSnapshot {
  id: string;
  projectId: string;
  status?: string;
  createdAt?: string;
  title?: string;
  updatedAt?: string;
  tokenUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  };
}

// SessionStatus codec (4 values fit in a uint8)
const SESSION_STATUS_ENCODE: Record<string, number> = {
  running: 0,
  completed: 1,
  error: 2,
  idle: 3,
};

const SESSION_STATUS_DECODE = ['running', 'completed', 'error', 'idle'] as const;

/**
 * Quantizes RawSession snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0]  — status code (0=running, 1=completed, 2=error, 3=idle)
 *   uint32[0] — createdAt            (seconds since epoch; 0 = not set)
 *   uint32[1] — inputTokens          (lossless: max ~4.29B)
 *   uint32[2] — outputTokens         (lossless: max ~4.29B)
 *   uint32[3] — cacheReadTokens      (lossless)
 *   uint32[4] — cacheCreationTokens  (lossless)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: status string ~9 + 2×ISO-8601~24 + 5×float64 = ~88 bytes
 *   After:  1×uint8 + 5×uint32 = 21 bytes
 *   Saving: ~76% on quantizable fields
 *
 * String fields (id, projectId, title) are preserved as-is.
 * updatedAt is preserved as an ISO string in the strings map.
 */
export class SessionSnapshotQuantizer extends ScalarQuantizer<SessionSnapshot> {
  readonly version = 1;

  encode(snapshot: SessionSnapshot): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      1,  // uint8:  [status]
      0,  // uint16: (none)
      5,  // uint32: [createdAt, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint8[0] = SESSION_STATUS_ENCODE[snapshot.status ?? 'idle'] ?? 3;
    fixed.uint32[0] = this.encodeIsoTimestamp(snapshot.createdAt);
    fixed.uint32[1] = Math.min(snapshot.tokenUsage?.inputTokens ?? 0, 0xFFFFFFFF) >>> 0;
    fixed.uint32[2] = Math.min(snapshot.tokenUsage?.outputTokens ?? 0, 0xFFFFFFFF) >>> 0;
    fixed.uint32[3] = Math.min(snapshot.tokenUsage?.cacheReadTokens ?? 0, 0xFFFFFFFF) >>> 0;
    fixed.uint32[4] = Math.min(snapshot.tokenUsage?.cacheCreationTokens ?? 0, 0xFFFFFFFF) >>> 0;

    const strings: Record<string, string> = {
      id: snapshot.id,
      projectId: snapshot.projectId,
    };
    if (snapshot.title !== undefined) strings['title'] = snapshot.title;
    if (snapshot.updatedAt !== undefined) strings['updatedAt'] = snapshot.updatedAt;
    if (snapshot.tokenUsage?.costUsd !== undefined) strings['costUsd'] = String(snapshot.tokenUsage.costUsd);

    return {
      version: this.version,
      fixed,
      strings,
      params: {
        createdAt: { scale: 1000, zeroPoint: 0 },
        inputTokens: { scale: 1, zeroPoint: 0 },
        outputTokens: { scale: 1, zeroPoint: 0 },
        cacheReadTokens: { scale: 1, zeroPoint: 0 },
        cacheCreationTokens: { scale: 1, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): SessionSnapshot {
    this.assertVersion(buf);

    const statusCode = buf.fixed.uint8[0] ?? 3;
    const createdAtSec = buf.fixed.uint32[0] ?? 0;
    const inputTokens = buf.fixed.uint32[1] ?? 0;
    const outputTokens = buf.fixed.uint32[2] ?? 0;
    const cacheReadTokens = buf.fixed.uint32[3] ?? 0;
    const cacheCreationTokens = buf.fixed.uint32[4] ?? 0;

    const result: SessionSnapshot = {
      id: buf.strings['id'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      status: SESSION_STATUS_DECODE[statusCode] ?? 'idle',
      createdAt: this.decodeIsoTimestamp(createdAtSec),
      tokenUsage: {
        inputTokens: inputTokens >>> 0,
        outputTokens: outputTokens >>> 0,
        costUsd: parseFloat(buf.strings['costUsd'] ?? '0'),
        cacheReadTokens: cacheReadTokens >>> 0,
        cacheCreationTokens: cacheCreationTokens >>> 0,
      },
    };

    if (buf.strings['title'] !== undefined) result.title = buf.strings['title'];
    if (buf.strings['updatedAt'] !== undefined) result.updatedAt = buf.strings['updatedAt'];

    return result;
  }
}

// ─── CommandSnapshotQuantizer ─────────────────────────────────────────────────

// CommandScope codec (4 values fit in a uint8)
const COMMAND_SCOPE_ENCODE: Record<CommandScopeValue, number> = {
  builtin: 0,
  user: 1,
  project: 2,
  skill: 3,
};

const COMMAND_SCOPE_DECODE: CommandScopeValue[] = ['builtin', 'user', 'project', 'skill'];

/**
 * Quantizes RawCommandSnapshot snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint8[0]  — scope code (0=builtin, 1=user, 2=project, 3=skill)
 *   uint8[1]  — capabilities flags: bit0=hasBashCommands, bit1=hasFileReferences,
 *               bit2=acceptsArguments
 *   uint32[0] — registeredAt (seconds since epoch)
 *
 * Memory per record (quantized fixed fields only):
 *   Before: scope string ~7 + 3×boolean + 1×float64 = ~32 bytes
 *   After:  2×uint8 + 1×uint32 = 6 bytes
 *   Saving: ~81% on quantizable fields
 *
 * String fields (id, name, fullCommand, content) are preserved as-is.
 * Optional strings (namespace, filePath, description) are stored if present.
 * allowedTools array is serialized as a JSON string.
 */
export class CommandSnapshotQuantizer extends ScalarQuantizer<RawCommandSnapshot> {
  readonly version = 1;

  encode(snapshot: RawCommandSnapshot): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      2,  // uint8:  [scope, capabilitiesFlags]
      0,  // uint16: (none)
      1,  // uint32: [registeredAt]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint8[0] = COMMAND_SCOPE_ENCODE[snapshot.scope] ?? 0;

    let capFlags = 0;
    if (snapshot.capabilities.hasBashCommands)   capFlags |= 0b001;
    if (snapshot.capabilities.hasFileReferences) capFlags |= 0b010;
    if (snapshot.capabilities.acceptsArguments)  capFlags |= 0b100;
    fixed.uint8[1] = capFlags;

    fixed.uint32[0] = this.encodeTimestampMs(snapshot.registeredAt);

    const strings: Record<string, string> = {
      id: snapshot.id,
      name: snapshot.name,
      fullCommand: snapshot.fullCommand,
      content: snapshot.content,
      allowedTools: JSON.stringify(snapshot.capabilities.allowedTools),
    };
    if (snapshot.namespace !== undefined)   strings['namespace'] = snapshot.namespace;
    if (snapshot.filePath !== undefined)    strings['filePath'] = snapshot.filePath;
    if (snapshot.description !== undefined) strings['description'] = snapshot.description;

    return {
      version: this.version,
      fixed,
      strings,
      params: {
        registeredAt: { scale: 1000, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): RawCommandSnapshot {
    this.assertVersion(buf);

    const scopeCode = buf.fixed.uint8[0] ?? 0;
    const capFlags = buf.fixed.uint8[1] ?? 0;
    const registeredAtSec = buf.fixed.uint32[0] ?? 0;

    const scope: CommandScopeValue = COMMAND_SCOPE_DECODE[scopeCode] ?? 'user';

    const allowedToolsRaw = buf.strings['allowedTools'];
    const allowedTools: string[] = allowedToolsRaw !== undefined
      ? (JSON.parse(allowedToolsRaw) as string[])
      : [];

    return {
      id: buf.strings['id'] ?? '',
      name: buf.strings['name'] ?? '',
      fullCommand: buf.strings['fullCommand'] ?? '',
      scope,
      namespace: buf.strings['namespace'],
      filePath: buf.strings['filePath'],
      content: buf.strings['content'] ?? '',
      description: buf.strings['description'],
      capabilities: {
        hasBashCommands:   (capFlags & 0b001) !== 0,
        hasFileReferences: (capFlags & 0b010) !== 0,
        acceptsArguments:  (capFlags & 0b100) !== 0,
        allowedTools,
      },
      registeredAt: this.decodeTimestampMs(registeredAtSec),
    };
  }
}
