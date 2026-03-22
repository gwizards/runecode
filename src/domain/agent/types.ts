/**
 * Agent bounded context — Core types and LiveAgentAggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factory,
 * domain methods that raise DomainEvents, snapshot for persistence.
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeAgentStarted,
  makeAgentThinking,
  makeAgentCompleted,
  makeAgentFailed,
} from './events';

// ─── Branded ID ────────────────────────────────────────────────────────────

export type AgentId = string & { readonly _brand: 'AgentId' };

export function toAgentId(id: string): AgentId {
  return id as AgentId;
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

  static create(raw: string): AgentName {
    const v = raw.trim();
    if (!v || v.length > 200) {
      throw new Error('Agent name must be 1-200 characters');
    }
    return new AgentName(v);
  }
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
   */
  static start(id: string, name: string): LiveAgentAggregate {
    const agentId = toAgentId(id);
    const agentName = AgentName.create(name);
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
    return aggregate;
  }

  /**
   * Reconstitute an aggregate from a persisted snapshot.
   * Does not raise any events.
   */
  static fromSnapshot(raw: RawLiveAgent): LiveAgentAggregate {
    return new LiveAgentAggregate(
      toAgentId(raw.id),
      AgentName.create(raw.name),
      raw.status ?? 'idle',
      raw.tokenCount ?? 0,
      raw.startedAt ?? Date.now(),
      raw.elapsedMs ?? 0,
      [],
    );
  }

  // ── Domain commands ───────────────────────────────────────────────────────

  /**
   * Transition running → thinking and raise AgentThinkingEvent.
   * Throws if the agent is in a terminal state.
   */
  think(): void {
    if (this.isTerminal) {
      throw new Error(
        `Cannot transition agent ${this.id} to 'thinking': already in terminal status '${this._status}'`,
      );
    }
    this._status = 'thinking';
    this._events.push(makeAgentThinking(this.id));
  }

  /**
   * Transition thinking → running.
   * No event is raised (internal scheduling detail).
   */
  resume(): void {
    if (this.isTerminal) {
      throw new Error(
        `Cannot resume agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'running';
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
   * Throws if already in a terminal state.
   */
  complete(): void {
    if (this.isTerminal) {
      throw new Error(
        `Cannot complete agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'completed';
    this._events.push(makeAgentCompleted(this.id, this._tokenCount, this._elapsedMs));
  }

  /**
   * Mark the agent as failed and raise AgentFailedEvent.
   * Throws if already in a terminal state.
   */
  fail(reason: string): void {
    if (this.isTerminal) {
      throw new Error(
        `Cannot fail agent ${this.id}: already in terminal status '${this._status}'`,
      );
    }
    this._status = 'failed';
    this._events.push(makeAgentFailed(this.id, reason));
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
      id: this.id,
      name: this._name.value,
      status: this._status,
      tokenCount: this._tokenCount,
      startedAt: this.startedAt,
      elapsedMs: this._elapsedMs,
    };
  }
}
