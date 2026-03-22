/**
 * Analytics bounded context — Public API barrel.
 *
 * Import from this file in all application code.
 * Do not import directly from types.ts, events.ts, repository.ts,
 * service.ts, or store.ts to preserve encapsulation.
 */

// ─── Types / Aggregates / Value Objects ───────────────────────────────────────

export type {
  ConsentId,
  ConsentStatus,
  AnalyticsSessionId,
  RawConsent,
  CapturedEvent,
  ProjectId,
} from './types';

export {
  ConsentAggregate,
  toConsentId,
  toAnalyticsSessionId,
} from './types';

// ─── Domain Events ────────────────────────────────────────────────────────────

export { ANALYTICS_EVENT_TYPES } from './events';

export type {
  AnalyticsEventType,
  ConsentGrantedEvent,
  ConsentRevokedEvent,
  SessionTrackedEvent,
  EventCapturedEvent,
} from './events';

export {
  makeConsentGranted,
  makeConsentRevoked,
  makeSessionTracked,
  makeEventCaptured,
} from './events';

// ─── Repository ───────────────────────────────────────────────────────────────

export type { IConsentRepository } from './repository';
export { InMemoryConsentRepository } from './repository';

// ─── Application Service ──────────────────────────────────────────────────────

export { AnalyticsApplicationService } from './service';

// ─── Zustand Store (UI adapter) ───────────────────────────────────────────────

export { useAnalyticsStore, analyticsService, analyticsBus } from './store';
