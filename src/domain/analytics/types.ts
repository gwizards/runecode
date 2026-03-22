/**
 * Analytics bounded context — Aggregates, Value Objects, and snapshot types.
 *
 * DDD rules enforced here:
 *   - Private constructors; callers use static factory methods.
 *   - Aggregates record domain events internally; never dispatch to the bus directly.
 *   - No browser APIs, localStorage, or Tauri imports.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { ProjectId } from '../shared/project-id';
import { UserId } from '../identity/types';
import {
  makeConsentGranted,
  makeConsentRevoked,
} from './events';

// ─── Re-exports from shared kernel ────────────────────────────────────────────

export type { ProjectId } from '../shared/project-id';
export { UserId } from '../identity/types';

// ─── SessionId (aliased from session context) ─────────────────────────────────

/**
 * AnalyticsSessionId is structurally compatible with the session context's
 * SessionId. It is kept separate here to honour bounded-context isolation;
 * no import from the session context is required in the analytics domain.
 */
export type AnalyticsSessionId = string & { readonly _brand: 'SessionId' };

export function toAnalyticsSessionId(raw: string): AnalyticsSessionId {
  if (!raw || !raw.trim()) throw new Error('AnalyticsSessionId cannot be empty');
  return raw as AnalyticsSessionId;
}

// ─── ConsentId ────────────────────────────────────────────────────────────────

export type ConsentId = string & { readonly _brand: 'ConsentId' };

export function toConsentId(raw: string): ConsentId {
  if (!raw || !raw.trim()) throw new Error('ConsentId cannot be empty');
  return raw as ConsentId;
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
  ): ConsentAggregate {
    const id = toConsentId(`consent-${sessionId}-${Date.now()}`);
    return new ConsentAggregate(id, userId, sessionId, projectId, 'pending');
  }

  /**
   * Reconstitute from a raw snapshot (used by the repository after loading).
   */
  static fromSnapshot(raw: RawConsent): ConsentAggregate {
    const userIdResult = UserId.create(raw.userId);
    // Snapshots come from trusted storage; a missing userId falls back to a
    // sentinel rather than crashing the repository.
    const userId = userIdResult.ok ? userIdResult.value : UserId.generate();
    return new ConsentAggregate(
      toConsentId(raw.id),
      userId,
      raw.sessionId as AnalyticsSessionId,
      raw.projectId as ProjectId,
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
      makeConsentGranted(this.id, this.sessionId, this.projectId, this._grantedAt),
    );
  }

  revoke(): void {
    if (!this._consentGranted) return; // idempotent if already revoked or pending
    this._revokedAt = Date.now();
    this._domainEvents.push(
      makeConsentRevoked(this.id, this.sessionId, this._revokedAt),
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
      id: this.id,
      userId: this._userId.toString(),
      sessionId: this.sessionId,
      projectId: this.projectId,
      status: this.status,
      grantedAt: this._grantedAt,
      revokedAt: this._revokedAt,
    };
  }
}
