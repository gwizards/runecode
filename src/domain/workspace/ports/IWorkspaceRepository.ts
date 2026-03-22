/**
 * Workspace bounded context — Repository port (interface).
 *
 * IWorkspaceRepository is the hexagonal-architecture port that decouples the
 * domain from any persistence technology. Adapters (InMemoryWorkspaceRepository,
 * TauriWorkspaceRepository, etc.) implement this interface.
 *
 * No imports from React, Tauri, window, or localStorage are permitted here.
 */

import type { Result } from '../../shared/result';
import type { WorkspaceAggregate, WorkspaceId } from '../types';
import type { SessionId } from '../../session/types';

export interface IWorkspaceRepository {
  /** Find a workspace by its ID. Returns Err if not found. */
  findById(id: WorkspaceId): Result<WorkspaceAggregate>;

  /** Find a workspace by the owning session. Returns Err if none exists. */
  findBySession(sessionId: SessionId): Result<WorkspaceAggregate>;

  /** Persist (insert or update) a workspace aggregate. */
  save(workspace: WorkspaceAggregate): Result<void>;

  /** Remove a workspace by ID. No-op if not found. */
  delete(id: WorkspaceId): Result<void>;
}
