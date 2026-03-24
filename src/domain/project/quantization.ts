/**
 * ProjectSnapshotQuantizer — quantizes RawProject snapshots.
 *
 * Import from here directly instead of the shared barrel when you only need
 * the project quantizer. The shared barrel re-exports this for backward compat.
 */

import type { RawProject } from './types';
import { ScalarQuantizer, type QuantizedBuffer } from '../shared/quantization-core';

// ─── ProjectSnapshotQuantizer ─────────────────────────────────────────────────

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
