/**
 * Session bounded context — Repository interface and in-memory implementation.
 *
 * ISessionRepository defines the persistence contract for the session context.
 * InMemorySessionRepository is suitable for tests and local dev.
 */

import type { SessionAggregate } from './types';
import type { SessionId, ProjectId } from './types';

// ─── Repository interface ─────────────────────────────────────────────────────

export interface ISessionRepository {
  getSession(id: SessionId): Promise<SessionAggregate | null>;
  saveSession(session: SessionAggregate): Promise<void>;
  deleteSession(id: SessionId): Promise<void>;
  listSessionsByProject(projectId: ProjectId): Promise<SessionAggregate[]>;
}

// ─── In-memory implementation ─────────────────────────────────────────────────

export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, SessionAggregate>();

  async getSession(id: SessionId): Promise<SessionAggregate | null> {
    return this.sessions.get(id) ?? null;
  }

  async saveSession(session: SessionAggregate): Promise<void> {
    this.sessions.set(session.id, session);
  }

  async deleteSession(id: SessionId): Promise<void> {
    this.sessions.delete(id);
  }

  async listSessionsByProject(projectId: ProjectId): Promise<SessionAggregate[]> {
    const result: SessionAggregate[] = [];
    for (const session of this.sessions.values()) {
      if (session.projectId === projectId) {
        result.push(session);
      }
    }
    return result;
  }

  /**
   * Test helper — seed a session directly without raising events.
   * Useful for setting up pre-conditions in unit tests.
   */
  seed(session: SessionAggregate): void {
    this.sessions.set(session.id, session);
  }
}
