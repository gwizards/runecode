/**
 * Analytics bounded context — Aggregates, Value Objects, and snapshot types.
 *
 * DDD rules enforced here:
 *   - Private constructors; callers use static factory methods.
 *   - Aggregates record domain events internally; never dispatch to the bus directly.
 *   - No browser APIs, localStorage, or Tauri imports.
 */

import type { DomainEvent } from '../shared/event-bus';
import { ProjectId } from '../shared/project-id';
import { UserId } from '../shared/user-id';
import { Result, Ok, Err } from '../shared/result';
import {
  makeConsentGranted,
  makeConsentRevoked,
} from './events';

// ─── Re-exports from shared kernel ────────────────────────────────────────────

export { ProjectId } from '../shared/project-id';
export { UserId } from '../shared/user-id';

// ─── SessionId (aliased from session context) ─────────────────────────────────

/**
 * AnalyticsSessionId is structurally compatible with the session context's
 * SessionId. It is kept separate here to honour bounded-context isolation;
 * no import from the session context is required in the analytics domain.
 */
export class AnalyticsSessionId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<AnalyticsSessionId> {
    if (!raw || !raw.trim()) return Err('AnalyticsSessionId cannot be empty');
    return Ok(new AnalyticsSessionId(raw.trim()));
  }

  static generate(): AnalyticsSessionId {
    return new AnalyticsSessionId(crypto.randomUUID());
  }

  equals(other: AnalyticsSessionId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ─── ConsentId ────────────────────────────────────────────────────────────────

export class ConsentId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ConsentId> {
    if (!raw || !raw.trim()) return Err('ConsentId cannot be empty');
    return Ok(new ConsentId(raw.trim()));
  }

  static generate(): ConsentId {
    return new ConsentId(crypto.randomUUID());
  }

  equals(other: ConsentId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}

// ─── ConsentStatus ────────────────────────────────────────────────────────────

export type ConsentStatus = 'granted' | 'revoked' | 'pending';

// ─── RawConsent snapshot ──────────────────────────────────────────────────────

/**
 * Serialization-friendly snapshot. Used by the repository layer.
 * All fields are primitives or plain objects — no branded types.
 */
export interface RawConsent {
  readonly id: string;
  readonly userId: string;
  readonly sessionId: string;
  readonly projectId: string;
  readonly status: ConsentStatus;
  readonly grantedAt: number | undefined; // Unix ms
  readonly revokedAt: number | undefined; // Unix ms
}

// ─── CapturedEvent value object ───────────────────────────────────────────────

export interface CapturedEvent {
  readonly sessionId: string;
  readonly eventType: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly capturedAt: number; // Unix ms
}

// ─── ConsentAggregate ─────────────────────────────────────────────────────────

/**
 * Aggregate root for user analytics consent.
 *
 * Invariants:
 *   - A consent record must have a non-empty sessionId and projectId.
 *   - Once granted, grantedAt is immutable.
 *   - Revoking before granting is a no-op (status remains 'pending').
 */
export class ConsentAggregate {
  private _consentGranted: boolean;
  private _grantedAt: number | undefined;
  private _revokedAt: number | undefined;
  private readonly _domainEvents: DomainEvent[] = [];

  private constructor(
    readonly id: ConsentId,
    private readonly _userId: UserId,
    readonly sessionId: AnalyticsSessionId,
    readonly projectId: ProjectId,
    initialStatus: ConsentStatus,
    grantedAt?: number,
    revokedAt?: number,
  ) {
    this._consentGranted = initialStatus === 'granted';
    this._grantedAt = grantedAt;
    this._revokedAt = revokedAt;
  }

  // ── Factory ──

  static create(
    userId: UserId,
    sessionId: AnalyticsSessionId,
    projectId: ProjectId,
  ): Result<ConsentAggregate> {
    const id = ConsentId.generate();
    return Ok(new ConsentAggregate(id, userId, sessionId, projectId, 'pending'));
  }

  /**
   * Reconstitute from a raw snapshot (used by the repository after loading).
   */
  static fromSnapshot(raw: RawConsent): ConsentAggregate {
    const userIdResult = UserId.create(raw.userId);
    // Snapshots come from trusted storage; a missing userId falls back to a
    // sentinel rather than crashing the repository.
    const userId = userIdResult.ok ? userIdResult.value : UserId.generate();

    const idResult = ConsentId.create(raw.id);
    const id = idResult.ok ? idResult.value : ConsentId.generate();

    const sessionIdResult = AnalyticsSessionId.create(raw.sessionId);
    const sessionId = sessionIdResult.ok
      ? sessionIdResult.value
      : AnalyticsSessionId.generate();

    // Snapshots come from trusted storage; a missing/empty projectId is a data
    // error — fall back to the sentinel 'unknown' rather than crashing the repo.
    const projectIdResult = ProjectId.create(raw.projectId);
    const projectId = projectIdResult.ok
      ? projectIdResult.value
      : (ProjectId.create('unknown') as { ok: true; value: ProjectId }).value;

    return new ConsentAggregate(
      id,
      userId,
      sessionId,
      projectId,
      raw.status,
      raw.grantedAt,
      raw.revokedAt,
    );
  }

  // ── Queries ──

  get userId(): UserId {
    return this._userId;
  }

  get status(): ConsentStatus {
    if (this._revokedAt !== undefined) return 'revoked';
    if (this._consentGranted) return 'granted';
    return 'pending';
  }

  get grantedAt(): number | undefined {
    return this._grantedAt;
  }

  get revokedAt(): number | undefined {
    return this._revokedAt;
  }

  isGranted(): boolean {
    return this._consentGranted && this._revokedAt === undefined;
  }

  // ── Commands ──

  grant(): void {
    if (this._consentGranted) return; // idempotent
    this._consentGranted = true;
    this._grantedAt = Date.now();
    this._revokedAt = undefined;
    this._domainEvents.push(
      makeConsentGranted(this.id.toString(), this.sessionId.toString(), this.projectId.toString(), this._grantedAt),
    );
  }

  revoke(): void {
    if (!this._consentGranted) return; // idempotent if already revoked or pending
    this._revokedAt = Date.now();
    this._domainEvents.push(
      makeConsentRevoked(this.id.toString(), this.sessionId.toString(), this._revokedAt),
    );
  }

  // ── Event sourcing ──

  /** Drain and return all uncommitted domain events. */
  drainEvents(): DomainEvent[] {
    return this._domainEvents.splice(0);
  }

  // ── Snapshot ──

  toSnapshot(): RawConsent {
    return {
      id: this.id.toString(),
      userId: this._userId.toString(),
      sessionId: this.sessionId.toString(),
      projectId: this.projectId.toString(),
      status: this.status,
      grantedAt: this._grantedAt,
      revokedAt: this._revokedAt,
    };
  }
}
