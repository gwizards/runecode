/**
 * Analytics bounded context — Domain Events.
 *
 * Events are plain data objects — no browser APIs, no window.dispatchEvent.
 * The DomainEventBus from the shared kernel handles dispatch.
 *
 * Naming convention: past tense, UPPER_SNAKE_CASE keys in ANALYTICS_EVENT_TYPES.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event type discriminators ────────────────────────────────────────────────

export const ANALYTICS_EVENT_TYPES = {
  CONSENT_GRANTED: 'analytics/consent.granted',
  CONSENT_REVOKED: 'analytics/consent.revoked',
  SESSION_TRACKED: 'analytics/session.tracked',
  EVENT_CAPTURED: 'analytics/event.captured',
} as const;

export type AnalyticsEventType =
  (typeof ANALYTICS_EVENT_TYPES)[keyof typeof ANALYTICS_EVENT_TYPES];

// ─── Event interfaces ─────────────────────────────────────────────────────────

export interface ConsentGrantedEvent extends DomainEvent {
  readonly type: typeof ANALYTICS_EVENT_TYPES.CONSENT_GRANTED;
  readonly sessionId: string;
  readonly projectId: string;
  readonly grantedAt: number;
}

export interface ConsentRevokedEvent extends DomainEvent {
  readonly type: typeof ANALYTICS_EVENT_TYPES.CONSENT_REVOKED;
  readonly sessionId: string;
  readonly revokedAt: number;
}

export interface SessionTrackedEvent extends DomainEvent {
  readonly type: typeof ANALYTICS_EVENT_TYPES.SESSION_TRACKED;
  readonly sessionId: string;
  readonly projectId: string;
  readonly trackedAt: number;
}

export interface EventCapturedEvent extends DomainEvent {
  readonly type: typeof ANALYTICS_EVENT_TYPES.EVENT_CAPTURED;
  readonly sessionId: string;
  readonly eventType: string;
  readonly capturedAt: number;
}

// ─── Factory functions ────────────────────────────────────────────────────────

export function makeConsentGranted(
  aggregateId: string,
  sessionId: string,
  projectId: string,
  grantedAt: number,
): ConsentGrantedEvent {
  return {
    type: ANALYTICS_EVENT_TYPES.CONSENT_GRANTED,
    aggregateId,
    occurredAt: Date.now(),
    sessionId,
    projectId,
    grantedAt,
  };
}

export function makeConsentRevoked(
  aggregateId: string,
  sessionId: string,
  revokedAt: number,
): ConsentRevokedEvent {
  return {
    type: ANALYTICS_EVENT_TYPES.CONSENT_REVOKED,
    aggregateId,
    occurredAt: Date.now(),
    sessionId,
    revokedAt,
  };
}

export function makeSessionTracked(
  aggregateId: string,
  sessionId: string,
  projectId: string,
): SessionTrackedEvent {
  return {
    type: ANALYTICS_EVENT_TYPES.SESSION_TRACKED,
    aggregateId,
    occurredAt: Date.now(),
    sessionId,
    projectId,
    trackedAt: Date.now(),
  };
}

export function makeEventCaptured(
  aggregateId: string,
  sessionId: string,
  eventType: string,
): EventCapturedEvent {
  return {
    type: ANALYTICS_EVENT_TYPES.EVENT_CAPTURED,
    aggregateId,
    occurredAt: Date.now(),
    sessionId,
    eventType,
    capturedAt: Date.now(),
  };
}
