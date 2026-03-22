/**
 * Usage bounded context — Core types and UsageLedger aggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factories,
 * domain methods that raise DomainEvents, snapshot for persistence.
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeUsageLedgerOpened,
  makeUsageRecordAdded,
  makeUsageLedgerSealed,
} from './events';
import { UserId } from '../identity/types';

export { UserId };

// ─── Branded ID types ──────────────────────────────────────────────────────

export type LedgerId  = string & { readonly _brand: 'LedgerId'  };
export type SessionId = string & { readonly _brand: 'SessionId' };
export type ProjectId = string & { readonly _brand: 'ProjectId' };

export function toLedgerId(id: string): LedgerId {
  if (!id || !id.trim()) throw new Error('LedgerId cannot be empty');
  return id as LedgerId;
}

export function toSessionId(id: string): SessionId {
  if (!id || !id.trim()) throw new Error('SessionId cannot be empty');
  return id as SessionId;
}

export function toProjectId(id: string): ProjectId {
  if (!id || !id.trim()) throw new Error('ProjectId cannot be empty');
  return id as ProjectId;
}

// ─── Value Object: UsageRecord ─────────────────────────────────────────────

/** Fully-validated, immutable record of a single API call's token usage. */
export interface UsageRecord {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly costUsd: number;
  readonly recordedAt: number;
}

/** Raw input shape — only model + core token fields are required. */
export interface RawUsageRecord {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
  readonly cacheCreationTokens?: number;
  readonly cacheReadTokens?: number;
  readonly recordedAt?: number;
}

/**
 * Validate and construct an immutable UsageRecord.
 * Throws a descriptive error if any numeric field is negative.
 */
export function makeUsageRecord(raw: RawUsageRecord): UsageRecord {
  if (!raw.model || !raw.model.trim()) {
    throw new Error('UsageRecord.model cannot be empty');
  }
  if (raw.inputTokens < 0) {
    throw new Error(`UsageRecord.inputTokens must be >= 0, got ${raw.inputTokens}`);
  }
  if (raw.outputTokens < 0) {
    throw new Error(`UsageRecord.outputTokens must be >= 0, got ${raw.outputTokens}`);
  }
  if (raw.costUsd < 0) {
    throw new Error(`UsageRecord.costUsd must be >= 0, got ${raw.costUsd}`);
  }

  const cacheCreationTokens = raw.cacheCreationTokens ?? 0;
  const cacheReadTokens     = raw.cacheReadTokens     ?? 0;

  if (cacheCreationTokens < 0) {
    throw new Error(`UsageRecord.cacheCreationTokens must be >= 0, got ${cacheCreationTokens}`);
  }
  if (cacheReadTokens < 0) {
    throw new Error(`UsageRecord.cacheReadTokens must be >= 0, got ${cacheReadTokens}`);
  }

  return {
    model: raw.model.trim(),
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costUsd: raw.costUsd,
    recordedAt: raw.recordedAt ?? Date.now(),
  };
}

// ─── UsageSummary ──────────────────────────────────────────────────────────

/** Read model produced by UsageLedger domain methods. */
export interface UsageSummary {
  readonly ledgerId: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly totalCacheCreationTokens: number;
  readonly totalCacheReadTokens: number;
  readonly totalCostUsd: number;
  readonly recordCount: number;
  readonly openedAt: number;
  readonly sealedAt: number | null;
}

// ─── Snapshot shape ────────────────────────────────────────────────────────

/** Persisted representation of a UsageLedger aggregate. */
export interface RawLedger {
  readonly id: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly records: ReadonlyArray<UsageRecord>;
  readonly sealed: boolean;
  readonly openedAt: number;
  readonly sealedAt: number | null;
}

// ─── UsageLedger aggregate ─────────────────────────────────────────────────

export class UsageLedger {
  private constructor(
    private readonly _id: LedgerId,
    private readonly _sessionId: SessionId,
    private readonly _projectId: ProjectId,
    private readonly _userId: UserId,
    private _records: UsageRecord[],
    private _sealed: boolean,
    private readonly _openedAt: number,
    private _sealedAt: number | null,
    private _events: DomainEvent[],
  ) {}

  // ── Static factories ───────────────────────────────────────────────────────

  /**
   * Open a new ledger and raise UsageLedgerOpenedEvent.
   * @param raw.userId - A pre-validated UserId value object from the Identity context.
   */
  static open(raw: { id: string; sessionId: string; projectId: string; userId: UserId }): UsageLedger {
    const ledgerId   = toLedgerId(raw.id);
    const sessionId  = toSessionId(raw.sessionId);
    const projectId  = toProjectId(raw.projectId);
    const now        = Date.now();
    const aggregate  = new UsageLedger(ledgerId, sessionId, projectId, raw.userId, [], false, now, null, []);
    aggregate._events.push(makeUsageLedgerOpened(ledgerId, sessionId, projectId, raw.userId.value));
    return aggregate;
  }

  /**
   * Reconstitute a ledger from a persisted snapshot.
   * Does not raise any events.
   */
  static fromSnapshot(raw: RawLedger): UsageLedger {
    const userIdResult = UserId.create(raw.userId);
    if (!userIdResult.ok) {
      throw new Error(`Invalid userId in snapshot: ${userIdResult.error}`);
    }
    return new UsageLedger(
      toLedgerId(raw.id),
      toSessionId(raw.sessionId),
      toProjectId(raw.projectId),
      userIdResult.value,
      [...raw.records],
      raw.sealed,
      raw.openedAt,
      raw.sealedAt,
      [],
    );
  }

  // ── Domain commands ────────────────────────────────────────────────────────

  /**
   * Validate and append a usage record, raising UsageRecordAddedEvent.
   * Throws if the ledger is already sealed.
   */
  addRecord(raw: RawUsageRecord): UsageSummary {
    if (this._sealed) {
      throw new Error(`UsageLedger '${this._id}' is sealed — cannot add records`);
    }
    const record = makeUsageRecord(raw);
    this._records.push(record);
    this._events.push(
      makeUsageRecordAdded(
        this._id,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.costUsd,
      ),
    );
    return this.summary();
  }

  /**
   * Seal the ledger, preventing further records, and raise UsageLedgerSealedEvent.
   * Throws if the ledger is already sealed.
   */
  seal(): UsageSummary {
    if (this._sealed) {
      throw new Error(`UsageLedger '${this._id}' is already sealed`);
    }
    this._sealed   = true;
    this._sealedAt = Date.now();
    const s        = this.summary();
    this._events.push(
      makeUsageLedgerSealed(this._id, s.totalCostUsd, s.totalInputTokens + s.totalOutputTokens),
    );
    return s;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Compute a UsageSummary from the current state of the ledger. */
  summary(): UsageSummary {
    let totalInputTokens          = 0;
    let totalOutputTokens         = 0;
    let totalCacheCreationTokens  = 0;
    let totalCacheReadTokens      = 0;
    let totalCostUsd              = 0;

    for (const r of this._records) {
      totalInputTokens         += r.inputTokens;
      totalOutputTokens        += r.outputTokens;
      totalCacheCreationTokens += r.cacheCreationTokens;
      totalCacheReadTokens     += r.cacheReadTokens;
      totalCostUsd             += r.costUsd;
    }

    return {
      ledgerId:                  this._id,
      sessionId:                 this._sessionId,
      projectId:                 this._projectId,
      userId:                    this._userId.value,
      totalInputTokens,
      totalOutputTokens,
      totalCacheCreationTokens,
      totalCacheReadTokens,
      totalCostUsd,
      recordCount:               this._records.length,
      openedAt:                  this._openedAt,
      sealedAt:                  this._sealedAt,
    };
  }

  // ── Accessors ──────────────────────────────────────────────────────────────

  get id(): LedgerId {
    return this._id;
  }

  get sessionId(): SessionId {
    return this._sessionId;
  }

  get projectId(): ProjectId {
    return this._projectId;
  }

  get userId(): UserId {
    return this._userId;
  }

  get sealed(): boolean {
    return this._sealed;
  }

  get openedAt(): number {
    return this._openedAt;
  }

  /** Returns a defensive copy so callers cannot mutate internal state. */
  get records(): ReadonlyArray<UsageRecord> {
    return [...this._records];
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  clearEvents(): void {
    this._events = [];
  }

  toSnapshot(): RawLedger {
    return {
      id:        this._id,
      sessionId: this._sessionId,
      projectId: this._projectId,
      userId:    this._userId.value,
      records:   [...this._records],
      sealed:    this._sealed,
      openedAt:  this._openedAt,
      sealedAt:  this._sealedAt,
    };
  }
}
