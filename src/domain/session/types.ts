/**
 * Session bounded context — Types and SessionAggregate.
 *
 * Branded IDs prevent accidental mixing of SessionId and ProjectId.
 * SessionAggregate uses a private constructor; callers must use
 * SessionAggregate.create() or SessionAggregate.unknown().
 */

import type { DomainEvent } from '../shared/event-bus';
import { Ok, Err, type Result } from '../shared/result';
import {
  makeSessionCreated,
  makeOutputAppended,
  makeSessionCompleted,
  makeSessionFailed,
  makeTokenUsageUpdated,
} from './events';

// ─── Session status ───────────────────────────────────────────────────────────

export type SessionStatus = 'running' | 'completed' | 'error' | 'idle';

const VALID_SESSION_STATUSES = new Set<SessionStatus>(['running', 'completed', 'error', 'idle']);

// ─── SessionId Value Object ───────────────────────────────────────────────────

export class SessionId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<SessionId> {
    if (!raw || !raw.trim()) return Err('SessionId cannot be empty');
    return Ok(new SessionId(raw.trim()));
  }

  /** Generate a new, unique SessionId backed by a random UUID. */
  static generate(): SessionId {
    return new SessionId(crypto.randomUUID());
  }

  /** Internal: construct without validation (e.g., for sentinels). */
  static _unsafe(raw: string): SessionId {
    return new SessionId(raw);
  }

  equals(other: SessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** @deprecated Use SessionId directly. */
export type SessionIdVO = SessionId;
/** @deprecated Use SessionId directly. */
export const SessionIdVO = SessionId;

/** @deprecated Use SessionId.create() instead. */
export function toSessionId(id: string): Result<SessionId> {
  if (id === '__unknown__') return Ok(SessionId._unsafe(id)); // sentinel allowed
  return SessionId.create(id);
}

// ─── ProjectId Value Object ───────────────────────────────────────────────────

export class ProjectId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ProjectId> {
    if (!raw || !raw.trim()) return Err('ProjectId cannot be empty');
    return Ok(new ProjectId(raw.trim()));
  }

  /** Generate a new, unique ProjectId backed by a random UUID. */
  static generate(): ProjectId {
    return new ProjectId(crypto.randomUUID());
  }

  /** Internal: construct without validation (e.g., for sentinels). */
  static _unsafe(raw: string): ProjectId {
    return new ProjectId(raw);
  }

  equals(other: ProjectId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

/** @deprecated Use ProjectId.create() instead. */
export function toProjectId(id: string): Result<ProjectId> {
  return ProjectId.create(id);
}

// ─── Value Object: TokenUsage ─────────────────────────────────────────────────

/** Plain data shape for partial token usage updates and persistence serialization. */
export type RawTokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
};

export class TokenUsage {
  private constructor(
    readonly inputTokens: number,
    readonly outputTokens: number,
    readonly costUsd: number,
    readonly cacheReadTokens: number,
    readonly cacheCreationTokens: number,
  ) {}

  static create(raw: {
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }): Result<TokenUsage> {
    const inputTokens = raw.inputTokens ?? 0;
    const outputTokens = raw.outputTokens ?? 0;
    const costUsd = raw.costUsd ?? 0;
    const cacheReadTokens = raw.cacheReadTokens ?? 0;
    const cacheCreationTokens = raw.cacheCreationTokens ?? 0;
    if (inputTokens < 0) return Err('inputTokens cannot be negative');
    if (outputTokens < 0) return Err('outputTokens cannot be negative');
    if (costUsd < 0) return Err('costUsd cannot be negative');
    return Ok(new TokenUsage(inputTokens, outputTokens, costUsd, cacheReadTokens, cacheCreationTokens));
  }

  static empty(): TokenUsage {
    return new TokenUsage(0, 0, 0, 0, 0);
  }

  add(other: TokenUsage): TokenUsage {
    return new TokenUsage(
      this.inputTokens + other.inputTokens,
      this.outputTokens + other.outputTokens,
      this.costUsd + other.costUsd,
      this.cacheReadTokens + other.cacheReadTokens,
      this.cacheCreationTokens + other.cacheCreationTokens,
    );
  }

  toPlain(): {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  } {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: this.costUsd,
      cacheReadTokens: this.cacheReadTokens,
      cacheCreationTokens: this.cacheCreationTokens,
    };
  }

  /**
   * Internal helper used by addTokenUsage(). Adds a partial raw update without
   * re-validating the base (which is already a valid VO).
   */
  static addPartial(
    base: TokenUsage,
    delta: RawTokenUsage,
  ): TokenUsage {
    return new TokenUsage(
      base.inputTokens + (delta.inputTokens ?? 0),
      base.outputTokens + (delta.outputTokens ?? 0),
      base.costUsd + (delta.costUsd ?? 0),
      base.cacheReadTokens + (delta.cacheReadTokens ?? 0),
      base.cacheCreationTokens + (delta.cacheCreationTokens ?? 0),
    );
  }
}

// ─── Value Object: SessionTitle ───────────────────────────────────────────────

export class SessionTitle {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<SessionTitle> {
    if (raw.length > 200) return Err('Session title too long (max 200 chars)');
    return Ok(new SessionTitle(raw));
  }

  static untitled(): SessionTitle { return new SessionTitle('Untitled Session'); }

  static fromPath(path: string): SessionTitle {
    const name = path.split('/').pop() ?? path;
    return new SessionTitle(name.replace(/\.md$/i, '') || 'Untitled Session');
  }

  isEmpty(): boolean { return this.value.trim().length === 0; }
  toString(): string { return this.value; }
}

/** Backward-compatible helper — returns an empty TokenUsage VO instance. */
export function emptyTokenUsage(): TokenUsage {
  return TokenUsage.empty();
}

/** Backward-compatible helper — adds a partial raw update to an existing TokenUsage VO. */
export function addTokenUsage(a: TokenUsage, b: RawTokenUsage): TokenUsage {
  return TokenUsage.addPartial(a, b);
}

// ─── Raw shape (mirrors api.ts Session) ──────────────────────────────────────

export interface RawSession {
  id: string;
  projectId: string;
  title?: string;
  createdAt?: string;
  updatedAt?: string;
  /** 'running' | 'completed' | 'error' | 'idle' */
  status?: string;
  tokenUsage?: RawTokenUsage;
}

// ─── Terminal statuses ────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set<SessionStatus>(['completed', 'error']);

function isTerminal(status: SessionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ─── SessionAggregate ─────────────────────────────────────────────────────────

export class SessionAggregate {
  private constructor(
    readonly id: SessionId,
    readonly projectId: ProjectId,
    private _title: string,
    private _status: SessionStatus,
    private _tokenUsage: TokenUsage,
    private _output: string[],
    readonly createdAt: number,
    private _events: DomainEvent[],
  ) {}

  // ── Factory: create from raw data ──────────────────────────────────────────

  static create(raw: RawSession): Result<SessionAggregate> {
    const sidResult = toSessionId(raw.id);
    if (!sidResult.ok) return sidResult;
    const pidResult = toProjectId(raw.projectId);
    if (!pidResult.ok) return pidResult;

    const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : Date.now();
    const tokenUsage = raw.tokenUsage
      ? addTokenUsage(emptyTokenUsage(), raw.tokenUsage)
      : emptyTokenUsage();
    const status: SessionStatus = VALID_SESSION_STATUSES.has(raw.status as SessionStatus)
      ? (raw.status as SessionStatus)
      : 'idle';

    const aggregate = new SessionAggregate(
      sidResult.value,
      pidResult.value,
      raw.title ?? 'Untitled Session',
      status,
      tokenUsage,
      [],
      createdAt,
      [],
    );

    aggregate._events.push(
      makeSessionCreated(aggregate.id, aggregate.projectId, aggregate._title),
    );

    return Ok(aggregate);
  }

  // ── Factory: rehydrate from snapshot ──────────────────────────────────────

  /**
   * Reconstitutes an aggregate from a persisted snapshot. No events are raised.
   */
  static fromSnapshot(raw: RawSession): Result<SessionAggregate> {
    const sidResult = toSessionId(raw.id);
    if (!sidResult.ok) return sidResult;
    const pidResult = toProjectId(raw.projectId);
    if (!pidResult.ok) return pidResult;

    const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : 0;
    const tokenUsage = raw.tokenUsage
      ? addTokenUsage(emptyTokenUsage(), raw.tokenUsage)
      : emptyTokenUsage();
    const status: SessionStatus = VALID_SESSION_STATUSES.has(raw.status as SessionStatus)
      ? (raw.status as SessionStatus)
      : 'idle';
    return Ok(new SessionAggregate(
      sidResult.value,
      pidResult.value,
      raw.title ?? 'Untitled Session',
      status,
      tokenUsage,
      [],
      createdAt,
      [],
    ));
  }

  // ── Factory: null/empty session ────────────────────────────────────────────

  static unknown(): SessionAggregate {
    // Sentinel aggregate for "no active session" state.
    // Uses a reserved sentinel ID that is distinguishable from real IDs.
    return new SessionAggregate(
      SessionId._unsafe('__unknown__'),
      ProjectId._unsafe('__unknown__'),
      '',
      'idle',
      emptyTokenUsage(),
      [],
      0,
      [],
    );
  }

  get isUnknown(): boolean {
    return this.id.toString() === '__unknown__';
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  appendOutput(chunk: string): void {
    this._output.push(chunk);
    this._events.push(makeOutputAppended(this.id, chunk));
  }

  complete(): Result<void> {
    if (isTerminal(this._status)) {
      return Err(
        `Cannot complete session ${this.id}: already in terminal status "${this._status}"`,
      );
    }
    this._status = 'completed';
    this._events.push(makeSessionCompleted(this.id, this._tokenUsage));
    return Ok(undefined);
  }

  fail(reason: string): Result<void> {
    if (isTerminal(this._status)) {
      return Err(
        `Cannot fail session ${this.id}: already in terminal status "${this._status}"`,
      );
    }
    this._status = 'error';
    this._events.push(makeSessionFailed(this.id, reason));
    return Ok(undefined);
  }

  updateTokenUsage(usage: RawTokenUsage): void {
    this._tokenUsage = addTokenUsage(this._tokenUsage, usage);
    this._events.push(makeTokenUsageUpdated(this.id.toString(), this._tokenUsage));
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get title(): string {
    return this._title;
  }

  get status(): SessionStatus {
    return this._status;
  }

  get tokenUsage(): TokenUsage {
    return this._tokenUsage;
  }

  get output(): ReadonlyArray<string> {
    return this._output.slice();
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events.slice();
  }

  clearEvents(): void {
    this._events = [];
  }

  // ── Snapshot ───────────────────────────────────────────────────────────────

  toSnapshot(): RawSession {
    return {
      id: this.id.toString(),
      projectId: this.projectId.toString(),
      title: this._title,
      createdAt: new Date(this.createdAt).toISOString(),
      status: this._status,
      tokenUsage: this._tokenUsage.toPlain(),
    };
  }
}
