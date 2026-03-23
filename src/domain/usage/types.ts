/**
 * Usage bounded context — Core types and UsageLedger aggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factories,
 * domain methods that raise DomainEvents, snapshot for persistence.
 */

import type { DomainEvent } from '../shared/event-bus';
import { Ok, Err, type Result } from '../shared/result';
import {
  makeUsageLedgerOpened,
  makeUsageRecordAdded,
  makeUsageLedgerSealed,
} from './events';
import { UserId } from '../identity/types';
import { SessionId } from '../shared/session-id';
import { ProjectId } from '../shared/project-id';

export { UserId };
export { SessionId };
export { ProjectId };

// ─── Value Object: LedgerId ────────────────────────────────────────────────

export class LedgerId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<LedgerId> {
    if (!raw || !raw.trim()) return Err('LedgerId cannot be empty');
    return Ok(new LedgerId(raw.trim()));
  }

  /** Reconstruct from a trusted, already-validated source (e.g. persistence). */
  static fromTrusted(id: string): LedgerId { return new LedgerId(id); }

  static generate(): LedgerId { return new LedgerId(crypto.randomUUID()); }

  equals(other: LedgerId): boolean { return this.value === other.value; }

  toString(): string { return this.value; }
}

/**
 * Unsafe constructors — only for internal code where the id has already been
 * validated (e.g. reconstructing from a trusted persistence snapshot).
 * @internal
 */
export function unsafeLedgerId(id: string): LedgerId  { return LedgerId.fromTrusted(id);  }
export function unsafeSessionId(id: string): SessionId { return SessionId._unsafe(id); }
export function unsafeProjectId(id: string): ProjectId { return ProjectId._unsafe(id); }

// ─── Value Object: UsageRecord ─────────────────────────────────────────────

/**
 * Fully-validated, immutable record of a single API call's token usage.
 *
 * Cost is stored as integer micro-dollars (1 micro-dollar = 0.000001 USD)
 * to avoid IEEE-754 float accumulation drift.  The display-only `costUsd`
 * field is derived from `costMicroUsd` and must never be used for arithmetic.
 */
export interface UsageRecord {
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  /** Integer micro-dollars.  1_000_000 micro-USD = 1 USD.  Use for all arithmetic. */
  readonly costMicroUsd: number;
  /** Display-only.  Equals costMicroUsd / 1_000_000.  Never accumulate this field. */
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
 * Converts the caller-supplied `costUsd` to integer micro-dollars at the
 * domain boundary so all internal arithmetic stays integer-clean.
 * Returns Err with a descriptive message if any field is invalid.
 */
export function makeUsageRecord(raw: RawUsageRecord): Result<UsageRecord> {
  if (!raw.model || !raw.model.trim()) {
    return Err('UsageRecord.model cannot be empty');
  }
  if (raw.inputTokens < 0) {
    return Err(`UsageRecord.inputTokens must be >= 0, got ${raw.inputTokens}`);
  }
  if (raw.outputTokens < 0) {
    return Err(`UsageRecord.outputTokens must be >= 0, got ${raw.outputTokens}`);
  }
  if (raw.costUsd < 0) {
    return Err(`UsageRecord.costUsd must be >= 0, got ${raw.costUsd}`);
  }

  const cacheCreationTokens = raw.cacheCreationTokens ?? 0;
  const cacheReadTokens     = raw.cacheReadTokens     ?? 0;

  if (cacheCreationTokens < 0) {
    return Err(`UsageRecord.cacheCreationTokens must be >= 0, got ${cacheCreationTokens}`);
  }
  if (cacheReadTokens < 0) {
    return Err(`UsageRecord.cacheReadTokens must be >= 0, got ${cacheReadTokens}`);
  }

  // Convert to integer micro-dollars at the domain boundary.
  const costMicroUsd = Math.round(raw.costUsd * 1_000_000);

  return Ok({
    model: raw.model.trim(),
    inputTokens: raw.inputTokens,
    outputTokens: raw.outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    costMicroUsd,
    costUsd: costMicroUsd / 1_000_000, // display-only, derived from integer
    recordedAt: raw.recordedAt ?? Date.now(),
  });
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
   * Returns Err if any of the id fields are empty.
   * @param raw.userId - A pre-validated UserId value object from the Identity context.
   */
  static open(raw: { id: string; sessionId: string; projectId: string; userId: UserId }): Result<UsageLedger> {
    const ledgerIdResult  = LedgerId.create(raw.id);
    if (!ledgerIdResult.ok)  return ledgerIdResult;
    const sessionIdResult = SessionId.create(raw.sessionId);
    if (!sessionIdResult.ok) return sessionIdResult;
    const projectIdResult = ProjectId.create(raw.projectId);
    if (!projectIdResult.ok) return projectIdResult;
    const ledgerId  = ledgerIdResult.value;
    const sessionId = sessionIdResult.value;
    const projectId = projectIdResult.value;
    const now       = Date.now();
    const aggregate = new UsageLedger(ledgerId, sessionId, projectId, raw.userId, [], false, now, null, []);
    aggregate._events.push(makeUsageLedgerOpened(ledgerId.value, sessionId.value, projectId.value, raw.userId.value));
    return Ok(aggregate);
  }

  /**
   * Reconstitute a ledger from a persisted snapshot.
   * Does not raise any events.
   * Returns Err if any stored field fails validation; falls back to a generated
   * UserId when the stored userId is missing (backward-compat with old snapshots).
   */
  static fromSnapshot(raw: RawLedger): Result<UsageLedger> {
    const userIdResult = UserId.create(raw.userId);
    const userId = userIdResult.ok ? userIdResult.value : UserId.generate();
    return Ok(
      new UsageLedger(
        unsafeLedgerId(raw.id),
        unsafeSessionId(raw.sessionId),
        unsafeProjectId(raw.projectId),
        userId,
        [...raw.records],
        raw.sealed,
        raw.openedAt,
        raw.sealedAt,
        [],
      ),
    );
  }

  // ── Domain commands ────────────────────────────────────────────────────────

  /**
   * Validate and append a usage record, raising UsageRecordAddedEvent.
   * Returns Err if the ledger is already sealed or the record is invalid.
   */
  addRecord(raw: RawUsageRecord): Result<UsageSummary> {
    if (this._sealed) {
      return Err(`UsageLedger '${this._id.value}' is sealed — cannot add records`);
    }
    const recordResult = makeUsageRecord(raw);
    if (!recordResult.ok) return recordResult;
    const record = recordResult.value;
    this._records.push(record);
    this._events.push(
      makeUsageRecordAdded(
        this._id.value,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.costUsd,
      ),
    );
    return Ok(this.summary());
  }

  /**
   * Seal the ledger, preventing further records, and raise UsageLedgerSealedEvent.
   * Returns Err if the ledger is already sealed.
   */
  seal(): Result<UsageSummary> {
    if (this._sealed) {
      return Err(`UsageLedger '${this._id.value}' is already sealed`);
    }
    this._sealed   = true;
    this._sealedAt = Date.now();
    const s        = this.summary();
    this._events.push(
      makeUsageLedgerSealed(this._id.value, s.totalCostUsd, s.totalInputTokens + s.totalOutputTokens),
    );
    return Ok(s);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Compute a UsageSummary from the current state of the ledger. */
  summary(): UsageSummary {
    let totalInputTokens          = 0;
    let totalOutputTokens         = 0;
    let totalCacheCreationTokens  = 0;
    let totalCacheReadTokens      = 0;
    // Accumulate as integer micro-dollars to avoid IEEE-754 drift.
    let totalCostMicroUsd         = 0;

    for (const r of this._records) {
      totalInputTokens         += r.inputTokens;
      totalOutputTokens        += r.outputTokens;
      totalCacheCreationTokens += r.cacheCreationTokens;
      totalCacheReadTokens     += r.cacheReadTokens;
      totalCostMicroUsd        += r.costMicroUsd;
    }

    // Convert to USD only at the display boundary.
    const totalCostUsd = totalCostMicroUsd / 1_000_000;

    return {
      ledgerId:                  this._id.value,
      sessionId:                 this._sessionId.value,
      projectId:                 this._projectId.value,
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
      id:        this._id.value,
      sessionId: this._sessionId.value,
      projectId: this._projectId.value,
      userId:    this._userId.value,
      records:   [...this._records],
      sealed:    this._sealed,
      openedAt:  this._openedAt,
      sealedAt:  this._sealedAt,
    };
  }
}
