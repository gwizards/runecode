/**
 * Session bounded context — Application Service.
 *
 * Orchestrates: load aggregate → call domain method → persist → dispatch events.
 * Never throws — all errors are wrapped in Err(string).
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { SessionAggregate, toProjectId, SessionIdVO } from './types';
import type { RawSession, RawTokenUsage } from './types';
import type { ISessionRepository } from './repository';

export class SessionApplicationService {
  constructor(
    private readonly repo: ISessionRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async createSession(raw: RawSession): Promise<Result<SessionAggregate>> {
    try {
      const session = SessionAggregate.create(raw);
      await this.repo.saveSession(session);
      this.eventBus.dispatch(session.events);
      session.clearEvents();
      return Ok(session);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Append output ──────────────────────────────────────────────────────────

  async appendOutput(sessionId: string, chunk: string): Promise<Result<void>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      const session = await this.repo.getSession(sidResult.value.toBranded());
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      session.appendOutput(chunk);
      await this.repo.saveSession(session);
      this.eventBus.dispatch(session.events);
      session.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Complete ───────────────────────────────────────────────────────────────

  async completeSession(sessionId: string): Promise<Result<void>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      const session = await this.repo.getSession(sidResult.value.toBranded());
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      session.complete();
      await this.repo.saveSession(session);
      this.eventBus.dispatch(session.events);
      session.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Fail ───────────────────────────────────────────────────────────────────

  async failSession(sessionId: string, reason: string): Promise<Result<void>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      const session = await this.repo.getSession(sidResult.value.toBranded());
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      session.fail(reason);
      await this.repo.saveSession(session);
      this.eventBus.dispatch(session.events);
      session.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Update token usage ─────────────────────────────────────────────────────

  async updateTokenUsage(
    sessionId: string,
    usage: RawTokenUsage,
  ): Promise<Result<void>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      const session = await this.repo.getSession(sidResult.value.toBranded());
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      session.updateTokenUsage(usage);
      await this.repo.saveSession(session);
      this.eventBus.dispatch(session.events);
      session.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  async deleteSession(sessionId: string): Promise<Result<void>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      await this.repo.deleteSession(sidResult.value.toBranded());
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Get ────────────────────────────────────────────────────────────────────

  async getSession(sessionId: string): Promise<Result<SessionAggregate>> {
    const sidResult = SessionIdVO.create(sessionId);
    if (!sidResult.ok) return sidResult;
    try {
      const session = await this.repo.getSession(sidResult.value.toBranded());
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      return Ok(session);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── List by project ────────────────────────────────────────────────────────

  async listSessions(projectId: string): Promise<Result<SessionAggregate[]>> {
    try {
      const sessions = await this.repo.listSessionsByProject(
        toProjectId(projectId),
      );
      return Ok(sessions);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
