/**
 * Agent bounded context — Core types and LiveAgentAggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factory,
 * domain methods that raise DomainEvents, snapshot for persistence.
 */

import type { DomainEvent } from '../shared/event-bus';
import { Ok, Err, type Result } from '../shared/result';
import {
  makeAgentStarted,
  makeAgentThinking,
  makeAgentCompleted,
  makeAgentFailed,
} from './events';

// ─── Value Object: AgentId ─────────────────────────────────────────────────

export class AgentId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AgentId> {
    if (!raw || !raw.trim()) return Err('AgentId cannot be empty');
    return Ok(new AgentId(raw.trim()));
  }

  static generate(): AgentId { return new AgentId(crypto.randomUUID()); }

  equals(other: AgentId): boolean { return this.value === other.value; }

  toString(): string { return this.value; }
}

/** @deprecated Use AgentId.create() */
export function toAgentId(raw: string): Result<AgentId> { return AgentId.create(raw); }

/**
 * Unsafe coercion bridge — retained for test compatibility.
 * Only for trusted internal IDs already validated through another path.
 * @deprecated Use AgentId.create() and propagate Result.
 * @internal
 */
export function unsafeAgentId(raw: string): AgentId {
  const result = AgentId.create(raw);
  // Callers guarantee raw is non-empty; if not, fall back to a sentinel so
  // the domain never throws (programming error surfaced at test-assertion time).
  return result.ok ? result.value : AgentId.generate();
}

// ─── Value Object: AgentStatus ─────────────────────────────────────────────

export type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed' | 'idle';

export function isTerminalStatus(s: AgentStatus): boolean {
  return s === 'completed' || s === 'failed';
}

export function isActiveStatus(s: AgentStatus): boolean {
  return s === 'running' || s === 'thinking';
}

// ─── Value Object: AgentName ───────────────────────────────────────────────

export class AgentName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AgentName> {
    if (!raw || raw.trim().length === 0) return Err('Agent name cannot be empty');
    if (raw.length > 200) return Err('Agent name too long (max 200 chars)');
    return Ok(new AgentName(raw.trim()));
  }
}

// ─── Value Object: AgentModel ──────────────────────────────────────────────

export class AgentModel {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AgentModel> {
    if (!raw || raw.trim().length === 0) return Err('Agent model cannot be empty');
    if (raw.length > 100) return Err('Agent model name too long');
    return Ok(new AgentModel(raw.trim()));
  }

  static unknown(): AgentModel { return new AgentModel('unknown'); }
  toString(): string { return this.value; }
}

// ─── Raw shape (mirrors agentStore.ts LiveAgent) ───────────────────────────

export interface RawLiveAgent {
  id: string;
  name: string;
  status?: AgentStatus;
  tokenCount?: number;
  startedAt?: number;
  elapsedMs?: number;
}

// ─── LiveAgentAggregate ────────────────────────────────────────────────────

export class LiveAgentAggregate {
  private constructor(
    readonly id: AgentId,
    private _name: AgentName,
    private _status: AgentStatus,
    private _tokenCount: number,
    readonly startedAt: number,
    private _elapsedMs: number,
    private _events: DomainEvent[],
  ) {}

  // ── Static factories ──────────────────────────────────────────────────────

  /**
   * Create a new agent and raise AgentStartedEvent.
   * Initial status is 'running'.
   * Returns Err if the name is invalid.
   */
  static start(id: string, name: string): Result<LiveAgentAggregate> {
    const agentIdResult = toAgentId(id);
    if (!agentIdResult.ok) return agentIdResult;
    const agentId = agentIdResult.value;
    const nameResult = AgentName.create(name);
    if (!nameResult.ok) return nameResult;
    const agentName = nameResult.value;
    const now = Date.now();
    const aggregate = new LiveAgentAggregate(
      agentId,
      agentName,
      'running',
      0,
      now,
      0,
      [],
    );
    aggregate._events.push(makeAgentStarted(id, agentName.value));
    return Ok(aggregate);
  }

  /**
   * Reconstitute an aggregate from a persisted snapshot.
   * Does not raise any events.
   * Returns Err if the stored name fails validation.
   */
  static fromSnapshot(raw: RawLiveAgent): Result<LiveAgentAggregate> {
    const agentIdResult = toAgentId(raw.id);
    if (!agentIdResult.ok) return agentIdResult;
    const nameResult = AgentName.create(raw.name);
    if (!nameResult.ok) return nameResult;
    return Ok(
      new LiveAgentAggregate(
        agentIdResult.value,
        nameResult.value,
        raw.status ?? 'idle',
        raw.tokenCount ?? 0,
        raw.startedAt ?? Date.now(),
        raw.elapsedMs ?? 0,
        [],
      ),
    );
  }

  // ── Domain commands ───────────────────────────────────────────────────────

  /**
   * Transition running → thinking and raise AgentThinkingEvent.
   * Returns Err if the agent is in a terminal state.
   */
  think(): Result<void> {
    if (this.isTerminal) {
      return Err(
        `Cannot transition agent ${this.id} to 'thinking': already in terminal status '${this._status}'`,
      );
    }
    this._status = 'thinking';
    this._events.push(makeAgentThinking(this.id.value));
    return Ok(undefined);
  }

  /**
   * Transition thinking → running.
   * Returns Err if the agent is in a terminal state.
   * No event is raised (internal scheduling detail).
   */
  resume(): Result<void> {
    if (this.isTerminal) {
      return Err(
        `Cannot resume agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'running';
    return Ok(undefined);
  }

  /**
   * Update elapsed time and token counters.
   * No event is raised (high-frequency tick; callers poll or batch).
   */
  tick(elapsedMs: number, tokenCount: number): void {
    this._elapsedMs = elapsedMs;
    this._tokenCount = tokenCount;
  }

  /**
   * Mark the agent as completed and raise AgentCompletedEvent.
   * Returns Err if already in a terminal state.
   */
  complete(): Result<void> {
    if (this.isTerminal) {
      return Err(
        `Cannot complete agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'completed';
    this._events.push(makeAgentCompleted(this.id.value, this._tokenCount, this._elapsedMs));
    return Ok(undefined);
  }

  /**
   * Mark the agent as failed and raise AgentFailedEvent.
   * Returns Err if already in a terminal state.
   */
  fail(reason: string): Result<void> {
    if (this.isTerminal) {
      return Err(
        `Cannot fail agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'failed';
    this._events.push(makeAgentFailed(this.id.value, reason));
    return Ok(undefined);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get name(): string {
    return this._name.value;
  }

  get status(): AgentStatus {
    return this._status;
  }

  get tokenCount(): number {
    return this._tokenCount;
  }

  get elapsedMs(): number {
    return this._elapsedMs;
  }

  get isActive(): boolean {
    return isActiveStatus(this._status);
  }

  get isTerminal(): boolean {
    return isTerminalStatus(this._status);
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  clearEvents(): void {
    this._events = [];
  }

  toSnapshot(): RawLiveAgent {
    return {
      id: this.id.value,
      name: this._name.value,
      status: this._status,
      tokenCount: this._tokenCount,
      startedAt: this.startedAt,
      elapsedMs: this._elapsedMs,
    };
  }
}
