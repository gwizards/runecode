/**
 * Workspace bounded context — Repository adapter and re-exports.
 *
 * IWorkspaceRepository is the hexagonal port defined in ports/workspace-repository.port.ts.
 * InMemoryWorkspaceRepository is the default in-process adapter.
 *
 * No imports from React, Tauri, window, or localStorage are permitted here.
 */

import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { QuantizedSnapshotStore, ScalarQuantizer } from '../shared/quantization';
import type { QuantizedBuffer } from '../shared/quantization';
import { WorkspaceAggregate } from './types';
import type { WorkspaceId, RawWorkspace, RawTab } from './types';
import type { SessionId } from '../session/types';
import type { IWorkspaceRepository } from './ports/workspace-repository.port';

// ─── IWorkspaceRepository (re-exported from ports/) ──────────────────────────

export type { IWorkspaceRepository } from './ports/workspace-repository.port';

// ─── WorkspaceSnapshotQuantizer ───────────────────────────────────────────────

/**
 * Quantizes RawWorkspace snapshots.
 *
 * Fixed buffer layout (version 1):
 *   uint32[0] — createdAt (seconds since epoch)
 *   uint8[0]  — tab count (capped at 255; workspace max is 20)
 *
 * Tab data is preserved in the strings map as JSON — tabs are small enough
 * that the savings from quantizing their contents would be marginal compared
 * to the complexity of a nested quantizer. The uint32 timestamp is the main
 * win.
 *
 * Memory per record:
 *   Before: 1 × ISO-8601 string ~24 chars = 24 bytes for createdAt
 *   After:  1 × uint32 = 4 bytes
 */
class WorkspaceSnapshotQuantizer extends ScalarQuantizer<RawWorkspace> {
  readonly version = 1;

  encode(snapshot: RawWorkspace): QuantizedBuffer {
    const fixed = this.makeEmptyBuffer(
      1,  // uint8:  [tabCount]
      0,  // uint16: (none)
      1,  // uint32: [createdAt]
      0,  // int8:   (none)
      0,  // int16:  (none)
    );

    fixed.uint32[0] = this.encodeTimestampMs(snapshot.createdAt);
    fixed.uint8[0] = Math.min(snapshot.tabs.length, 255);

    return {
      version: this.version,
      fixed,
      strings: {
        id: snapshot.id,
        sessionId: snapshot.sessionId,
        projectId: snapshot.projectId,
        tabs: JSON.stringify(snapshot.tabs),
      },
      params: {
        createdAt: { scale: 1000, zeroPoint: 0 },
      },
    };
  }

  decode(buf: QuantizedBuffer): RawWorkspace {
    this.assertVersion(buf);

    const createdAtSec = buf.fixed.uint32[0] ?? 0;
    const rawTabs = buf.strings['tabs'];
    const tabs: RawTab[] = rawTabs ? (JSON.parse(rawTabs) as RawTab[]) : [];

    return {
      id: buf.strings['id'] ?? '',
      sessionId: buf.strings['sessionId'] ?? '',
      projectId: buf.strings['projectId'] ?? '',
      tabs,
      createdAt: this.decodeTimestampMs(createdAtSec),
    };
  }
}

// ─── InMemoryWorkspaceRepository ─────────────────────────────────────────────

/**
 * Default in-process adapter for IWorkspaceRepository.
 *
 * Stores all workspace snapshots in a QuantizedSnapshotStore to reduce memory
 * footprint. Aggregates are rehydrated from the snapshot on each retrieval.
 *
 * A session→workspace index is maintained for findBySession() O(1) lookup.
 */
export class InMemoryWorkspaceRepository implements IWorkspaceRepository {
  private readonly store: QuantizedSnapshotStore<RawWorkspace, WorkspaceId>;
  private readonly sessionIndex = new Map<SessionId, WorkspaceId>();

  constructor() {
    this.store = new QuantizedSnapshotStore<RawWorkspace, WorkspaceId>(
      new WorkspaceSnapshotQuantizer(),
    );
  }

  findById(id: WorkspaceId): Result<WorkspaceAggregate> {
    const raw = this.store.get(id);
    if (!raw) return Err(`Workspace not found: ${id}`);
    return Ok(WorkspaceAggregate.fromSnapshot(raw));
  }

  findBySession(sessionId: SessionId): Result<WorkspaceAggregate> {
    const workspaceId = this.sessionIndex.get(sessionId);
    if (!workspaceId) return Err(`No workspace for session: ${sessionId}`);
    return this.findById(workspaceId);
  }

  save(workspace: WorkspaceAggregate): Result<void> {
    const snapshot = workspace.toSnapshot();
    this.store.set(workspace.id, snapshot);
    this.sessionIndex.set(workspace.sessionId, workspace.id);
    return Ok(undefined);
  }

  delete(id: WorkspaceId): Result<void> {
    const raw = this.store.get(id);
    if (raw) {
      this.sessionIndex.delete(raw.sessionId as SessionId);
    }
    this.store.delete(id);
    return Ok(undefined);
  }

  /** Returns the count of stored workspaces (useful in tests). */
  get size(): number {
    return this.store.size;
  }
}

// ─── seed() helper ────────────────────────────────────────────────────────────

/**
 * Seeds an InMemoryWorkspaceRepository with pre-built aggregate instances.
 * Useful for tests and Storybook fixtures.
 *
 * @example
 * const repo = new InMemoryWorkspaceRepository();
 * seed(repo, [workspace1, workspace2]);
 */
export function seed(
  repo: IWorkspaceRepository,
  workspaces: WorkspaceAggregate[],
): void {
  for (const ws of workspaces) {
    repo.save(ws);
  }
}
