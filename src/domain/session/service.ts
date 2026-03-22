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
      const sessionResult = SessionAggregate.create(raw);
      if (!sessionResult.ok) return sessionResult;
      const session = sessionResult.value;
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
      const session = await this.repo.getSession(sidResult.value);
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
      const session = await this.repo.getSession(sidResult.value);
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      const completeResult = session.complete();
      if (!completeResult.ok) return completeResult;
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
      const session = await this.repo.getSession(sidResult.value);
      if (!session) {
        return Err(`Session not found: ${sessionId}`);
      }
      const failResult = session.fail(reason);
      if (!failResult.ok) return failResult;
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
      const session = await this.repo.getSession(sidResult.value);
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
      await this.repo.deleteSession(sidResult.value);
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
      const session = await this.repo.getSession(sidResult.value);
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
    const pidResult = toProjectId(projectId);
    if (!pidResult.ok) return pidResult;
    try {
      const sessions = await this.repo.listSessionsByProject(pidResult.value);
      return Ok(sessions);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
