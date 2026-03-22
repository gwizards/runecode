/**
 * Session bounded context — Types and SessionAggregate.
 *
 * Branded IDs prevent accidental mixing of SessionId and ProjectId.
 * SessionAggregate uses a private constructor; callers must use
 * SessionAggregate.create() or SessionAggregate.unknown().
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeSessionCreated,
  makeOutputAppended,
  makeSessionCompleted,
  makeSessionFailed,
} from './events';

// ─── Branded IDs ──────────────────────────────────────────────────────────────

export type SessionId = string & { readonly _brand: 'SessionId' };
export type ProjectId = string & { readonly _brand: 'ProjectId' };

export function toSessionId(id: string): SessionId {
  if (!id || !id.trim()) throw new Error('SessionId cannot be empty');
  return id as SessionId;
}

export function toProjectId(id: string): ProjectId {
  if (!id || !id.trim()) throw new Error('ProjectId cannot be empty');
  return id as ProjectId;
}

// ─── Value Object: TokenUsage ─────────────────────────────────────────────────

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly cacheReadTokens: number;
  readonly cacheCreationTokens: number;
}

export function emptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
}

export function addTokenUsage(a: TokenUsage, b: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: a.inputTokens + (b.inputTokens ?? 0),
    outputTokens: a.outputTokens + (b.outputTokens ?? 0),
    costUsd: a.costUsd + (b.costUsd ?? 0),
    cacheReadTokens: a.cacheReadTokens + (b.cacheReadTokens ?? 0),
    cacheCreationTokens: a.cacheCreationTokens + (b.cacheCreationTokens ?? 0),
  };
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
  tokenUsage?: Partial<TokenUsage>;
}

// ─── Terminal statuses ────────────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(['completed', 'error']);

function isTerminal(status: string): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ─── SessionAggregate ─────────────────────────────────────────────────────────

export class SessionAggregate {
  private constructor(
    readonly id: SessionId,
    readonly projectId: ProjectId,
    private _title: string,
    private _status: string,
    private _tokenUsage: TokenUsage,
    private _output: string[],
    readonly createdAt: number,
    private _events: DomainEvent[],
  ) {}

  // ── Factory: create from raw data ──────────────────────────────────────────

  static create(raw: RawSession): SessionAggregate {
    const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : Date.now();
    const tokenUsage = raw.tokenUsage
      ? addTokenUsage(emptyTokenUsage(), raw.tokenUsage)
      : emptyTokenUsage();

    const aggregate = new SessionAggregate(
      toSessionId(raw.id),
      toProjectId(raw.projectId),
      raw.title ?? 'Untitled Session',
      raw.status ?? 'idle',
      tokenUsage,
      [],
      createdAt,
      [],
    );

    aggregate._events.push(
      makeSessionCreated(aggregate.id, aggregate.projectId, aggregate._title),
    );

    return aggregate;
  }

  // ── Factory: rehydrate from snapshot ──────────────────────────────────────

  /**
   * Reconstitutes an aggregate from a persisted snapshot. No events are raised.
   */
  static fromSnapshot(raw: RawSession): SessionAggregate {
    const createdAt = raw.createdAt ? Date.parse(raw.createdAt) : 0;
    const tokenUsage = raw.tokenUsage
      ? addTokenUsage(emptyTokenUsage(), raw.tokenUsage)
      : emptyTokenUsage();
    return new SessionAggregate(
      toSessionId(raw.id),
      toProjectId(raw.projectId),
      raw.title ?? 'Untitled Session',
      raw.status ?? 'idle',
      tokenUsage,
      [],
      createdAt,
      [],
    );
  }

  // ── Factory: null/empty session ────────────────────────────────────────────

  static unknown(): SessionAggregate {
    return new SessionAggregate(
      '' as SessionId,
      '' as ProjectId,
      '',
      'idle',
      emptyTokenUsage(),
      [],
      0,
      [],
    );
  }

  // ── Commands ───────────────────────────────────────────────────────────────

  appendOutput(chunk: string): void {
    this._output.push(chunk);
    this._events.push(makeOutputAppended(this.id, chunk));
  }

  complete(): void {
    if (isTerminal(this._status)) {
      throw new Error(
        `Cannot complete session ${this.id}: already in terminal status "${this._status}"`,
      );
    }
    this._status = 'completed';
    this._events.push(makeSessionCompleted(this.id, this._tokenUsage));
  }

  fail(reason: string): void {
    if (isTerminal(this._status)) {
      throw new Error(
        `Cannot fail session ${this.id}: already in terminal status "${this._status}"`,
      );
    }
    this._status = 'error';
    this._events.push(makeSessionFailed(this.id, reason));
  }

  updateTokenUsage(usage: Partial<TokenUsage>): void {
    this._tokenUsage = addTokenUsage(this._tokenUsage, usage);
  }

  // ── Getters ────────────────────────────────────────────────────────────────

  get title(): string {
    return this._title;
  }

  get status(): string {
    return this._status;
  }

  get tokenUsage(): TokenUsage {
    return { ...this._tokenUsage };
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
      id: this.id,
      projectId: this.projectId,
      title: this._title,
      createdAt: new Date(this.createdAt).toISOString(),
      status: this._status,
      tokenUsage: { ...this._tokenUsage },
    };
  }
}
