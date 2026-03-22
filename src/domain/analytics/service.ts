/**
 * Analytics bounded context — Application Service.
 *
 * Orchestrates use cases by coordinating aggregates, the repository, and the
 * event bus. Contains NO domain logic — all invariants live in ConsentAggregate.
 *
 * All public methods return Result<T> and NEVER throw.
 * No browser APIs, localStorage, or Tauri imports.
 */

import type { DomainEventBus } from '../shared/event-bus';
import { Ok, Err } from '../shared/result';
import type { Result } from '../shared/result';
import { toProjectId } from '../shared/project-id';
import type { IConsentRepository } from './repository';
import {
  ConsentAggregate,
  toConsentId,
  toAnalyticsSessionId,
  type ConsentId,
  type AnalyticsSessionId,
  type ConsentStatus,
  type CapturedEvent,
} from './types';
import { makeEventCaptured } from './events';

// ─── In-memory event log ──────────────────────────────────────────────────────

/** Captured telemetry events queued for external dispatch. */
const capturedEventLog = new Map<AnalyticsSessionId, CapturedEvent[]>();

// ─── Application Service ──────────────────────────────────────────────────────

export class AnalyticsApplicationService {
  constructor(
    private readonly repository: IConsentRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Grant consent ───────────────────────────────────────────────────────────

  grantConsent(
    rawSessionId: string,
    rawProjectId: string,
  ): Result<ConsentId> {
    try {
      const sessionId = toAnalyticsSessionId(rawSessionId);
      const projectId = toProjectId(rawProjectId);

      // Idempotency: re-use existing record if one exists for this session.
      let consent = this.repository.findBySession(sessionId);
      if (consent === undefined) {
        consent = ConsentAggregate.create(sessionId, projectId);
      }

      consent.grant();
      this.persist(consent);

      return Ok(consent.id);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Revoke consent ──────────────────────────────────────────────────────────

  revokeConsent(rawConsentId: string): Result<void> {
    try {
      const consentId = toConsentId(rawConsentId);
      const consent = this.repository.findById(consentId);
      if (consent === undefined) {
        return Err(`Consent record not found: ${rawConsentId}`);
      }

      consent.revoke();
      this.persist(consent);

      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Get consent status ──────────────────────────────────────────────────────

  getConsentStatus(rawConsentId: string): Result<ConsentStatus> {
    try {
      const consentId = toConsentId(rawConsentId);
      const consent = this.repository.findById(consentId);
      if (consent === undefined) {
        return Err(`Consent record not found: ${rawConsentId}`);
      }

      return Ok(consent.status);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Track session ───────────────────────────────────────────────────────────

  trackEvent(
    rawSessionId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Result<void> {
    try {
      const sessionId = toAnalyticsSessionId(rawSessionId);

      // Only capture if the session has granted consent.
      const consent = this.repository.findBySession(sessionId);
      if (consent === undefined || !consent.isGranted()) {
        // Silently drop — not an error.
        return Ok(undefined);
      }

      const capturedAt = Date.now();
      const entry: CapturedEvent = {
        sessionId: rawSessionId,
        eventType,
        payload: { ...payload },
        capturedAt,
      };

      const log = capturedEventLog.get(sessionId) ?? [];
      log.push(entry);
      capturedEventLog.set(sessionId, log);

      this.eventBus.dispatch([
        makeEventCaptured(consent.id, rawSessionId, eventType),
      ]);

      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Query events ────────────────────────────────────────────────────────────

  queryEvents(rawSessionId: string): Result<CapturedEvent[]> {
    try {
      const sessionId = toAnalyticsSessionId(rawSessionId);
      const log = capturedEventLog.get(sessionId) ?? [];
      // Return a copy so callers cannot mutate internal state.
      return Ok(log.map(e => ({ ...e, payload: { ...e.payload } })));
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private persist(consent: ConsentAggregate): void {
    this.repository.save(consent);
    const events = consent.drainEvents();
    if (events.length > 0) {
      this.eventBus.dispatch(events);
    }
  }
}
