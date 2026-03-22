/**
 * Session bounded context — Repository interface and in-memory implementation.
 *
 * ISessionRepository is the domain-facing port (defined in ./ports/ISessionRepository).
 * InMemorySessionRepository is suitable for tests and local dev.
 *
 * Storage uses QuantizedSnapshotStore<RawSession, SessionId> for ~76% memory
 * reduction on quantizable numeric and enum fields.
 */

import { SessionAggregate } from './types';
import type { SessionId, ProjectId, RawSession } from './types';
import {
  SessionSnapshotQuantizer,
  QuantizedSnapshotStore,
} from '../shared/quantization';
import type { ISessionRepository } from './ports/ISessionRepository';

export type { ISessionRepository };

// ─── In-memory implementation ─────────────────────────────────────────────────

export class InMemorySessionRepository implements ISessionRepository {
  private readonly sessions = new QuantizedSnapshotStore<RawSession, SessionId>(
    new SessionSnapshotQuantizer(),
  );

  async getSession(id: SessionId): Promise<SessionAggregate | null> {
    const snapshot = this.sessions.get(id);
    if (!snapshot) return null;
    const result = SessionAggregate.fromSnapshot(snapshot);
    if (!result.ok) {
      console.warn(`[SessionRepository] Skipping corrupted snapshot for id="${id}": ${result.error}`);
      return null;
    }
    return result.value;
  }

  async saveSession(session: SessionAggregate): Promise<void> {
    this.sessions.set(session.id, session.toSnapshot());
  }

  async deleteSession(id: SessionId): Promise<void> {
    this.sessions.delete(id);
  }

  async listSessionsByProject(projectId: ProjectId): Promise<SessionAggregate[]> {
    const result: SessionAggregate[] = [];
    for (const snapshot of this.sessions.values()) {
      if (snapshot.projectId === projectId) {
        const aggregateResult = SessionAggregate.fromSnapshot(snapshot);
        if (!aggregateResult.ok) {
          console.warn(`[SessionRepository] Skipping corrupted snapshot for projectId="${projectId}": ${aggregateResult.error}`);
          continue;
        }
        result.push(aggregateResult.value);
      }
    }
    return result;
  }

  /**
   * Test helper — seed a session directly without raising events.
   * Useful for setting up pre-conditions in unit tests.
   */
  seed(session: SessionAggregate): void {
    this.sessions.set(session.id, session.toSnapshot());
  }
}
