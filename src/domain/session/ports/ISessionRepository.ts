/**
 * Session bounded context — Repository port (domain-facing interface).
 *
 * Application services depend on this interface; concrete implementations
 * (InMemorySessionRepository, Tauri backend, etc.) are injected at runtime.
 */

import type { SessionId, ProjectId } from '../types';
import type { SessionAggregate } from '../types';

export interface ISessionRepository {
  getSession(id: SessionId): Promise<SessionAggregate | null>;
  saveSession(session: SessionAggregate): Promise<void>;
  deleteSession(id: SessionId): Promise<void>;
  listSessionsByProject(projectId: ProjectId): Promise<SessionAggregate[]>;
}
