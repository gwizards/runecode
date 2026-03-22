/**
 * Analytics bounded context — Application Service.
 *
 * Orchestrates use cases by coordinating aggregates, the repository, and the
 * event bus. Contains NO domain logic — all invariants live in ConsentAggregate.
 *
 * All public methods return Result<T> and NEVER throw.
 * No browser APIs, localStorage, or Tauri imports.
 * PostHog is abstracted behind IAnalyticsTracker — never imported directly here.
 */

import type { DomainEventBus } from '../shared/event-bus';
import { Ok, Err } from '../shared/result';
import type { Result } from '../shared/result';
import { toProjectId } from '../shared/project-id';
import type { IConsentRepository } from './ports/IConsentRepository';
import type { IAnalyticsTracker } from './ports/IAnalyticsTracker';
import {
  ConsentAggregate,
  toConsentId,
  toAnalyticsSessionId,
  type ConsentStatus,
  type CapturedEvent,
  UserId,
} from './types';
import {
  makeEventCaptured,
  makeSessionTracked,
} from './events';

// ─── In-memory event log ──────────────────────────────────────────────────────

/** Captured telemetry events queued for external dispatch. */
const capturedEventLog = new Map<string, CapturedEvent[]>();

// ─── Application Service ──────────────────────────────────────────────────────

export class AnalyticsApplicationService {
  constructor(
    private readonly repository: IConsentRepository,
    private readonly eventBus: DomainEventBus,
    /**
     * Optional analytics tracker port. When provided, session tracking and
     * event capture are forwarded to the external service (e.g. PostHog).
     * When absent the service operates in pure domain mode — events are
     * recorded in the in-memory log and dispatched on the event bus only.
     */
    private readonly tracker?: IAnalyticsTracker,
  ) {}

  // ── Grant consent ───────────────────────────────────────────────────────────

  /**
   * Grant analytics consent for a session.
   *
   * @param rawSessionId - Session identifier (non-empty string).
   * @param rawProjectId - Project identifier (non-empty string).
   * @param userId - Identity of the user granting consent.
   * @returns Ok(ConsentAggregate) on success; Err(message) on validation failure.
   */
  async grantConsent(
    rawSessionId: string,
    rawProjectId: string,
    userId: UserId,
  ): Promise<Result<ConsentAggregate>> {
    try {
      const sessionIdResult = toAnalyticsSessionId(rawSessionId);
      if (!sessionIdResult.ok) return Err(sessionIdResult.error);
      const sessionId = sessionIdResult.value;
      const projectIdResult = toProjectId(rawProjectId);
      if (!projectIdResult.ok) return Err(projectIdResult.error);
      const projectId = projectIdResult.value;

      // Idempotency: re-use existing record if one exists for this session.
      let consent = this.repository.findBySession(sessionId);
      if (consent === undefined) {
        consent = ConsentAggregate.create(userId, sessionId, projectId);
      }

      consent.grant();
      this.persist(consent);

      this.tracker?.optIn();

      return Ok(consent);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Revoke consent ──────────────────────────────────────────────────────────

  /**
   * Revoke analytics consent identified by its ConsentId.
   *
   * @param rawConsentId - Consent record identifier.
   * @returns Ok(void) on success; Err(message) if the record is not found.
   */
  async revokeConsent(rawConsentId: string): Promise<Result<void>> {
    try {
      const consentIdResult = toConsentId(rawConsentId);
      if (!consentIdResult.ok) return Err(consentIdResult.error);
      const consent = this.repository.findById(consentIdResult.value);
      if (consent === undefined) {
        return Err(`Consent record not found: ${rawConsentId}`);
      }

      consent.revoke();
      this.persist(consent);

      this.tracker?.optOut();

      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Get consent status ──────────────────────────────────────────────────────

  async getConsentStatus(rawConsentId: string): Promise<Result<ConsentStatus>> {
    try {
      const consentIdResult = toConsentId(rawConsentId);
      if (!consentIdResult.ok) return Err(consentIdResult.error);
      const consent = this.repository.findById(consentIdResult.value);
      if (consent === undefined) {
        return Err(`Consent record not found: ${rawConsentId}`);
      }

      return Ok(consent.status);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Track session ───────────────────────────────────────────────────────────

  /**
   * Record that a session has started (or resumed).
   * Silently no-ops when consent has not been granted for the session.
   *
   * @param rawSessionId - Session identifier.
   * @param data - Arbitrary session metadata.
   * @returns Ok(void) always (consent check is a silent drop, not an error).
   */
  async trackSession(
    rawSessionId: string,
    data: Record<string, unknown> = {},
  ): Promise<Result<void>> {
    try {
      const sessionIdResult = toAnalyticsSessionId(rawSessionId);
      if (!sessionIdResult.ok) return Err(sessionIdResult.error);
      const sessionId = sessionIdResult.value;

      const consent = this.repository.findBySession(sessionId);
      if (consent === undefined || !consent.isGranted()) {
        return Ok(undefined);
      }

      const projectId = consent.projectId;
      this.eventBus.dispatch([
        makeSessionTracked(consent.id.toString(), rawSessionId, projectId.toString()),
      ]);

      this.tracker?.trackSession(rawSessionId, data);

      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Capture event ───────────────────────────────────────────────────────────

  /**
   * Capture a named analytics event for a session.
   * Silently no-ops when consent has not been granted for the session.
   *
   * @param rawSessionId - Session identifier.
   * @param name - Event name.
   * @param properties - Optional event properties.
   * @returns Ok(void) always (consent check is a silent drop, not an error).
   */
  async captureEvent(
    rawSessionId: string,
    name: string,
    properties?: Record<string, unknown>,
  ): Promise<Result<void>> {
    try {
      const sessionIdResult = toAnalyticsSessionId(rawSessionId);
      if (!sessionIdResult.ok) return Err(sessionIdResult.error);
      const sessionId = sessionIdResult.value;

      const consent = this.repository.findBySession(sessionId);
      if (consent === undefined || !consent.isGranted()) {
        return Ok(undefined);
      }

      const capturedAt = Date.now();
      const entry: CapturedEvent = {
        sessionId: rawSessionId,
        eventType: name,
        payload: { ...(properties ?? {}) },
        capturedAt,
      };

      const log = capturedEventLog.get(sessionId.toString()) ?? [];
      log.push(entry);
      capturedEventLog.set(sessionId.toString(), log);

      this.eventBus.dispatch([
        makeEventCaptured(consent.id.toString(), rawSessionId, name),
      ]);

      this.tracker?.captureEvent(name, properties);

      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Track event (legacy alias for captureEvent) ──────────────────────────────

  /**
   * @deprecated Use captureEvent() instead.
   */
  async trackEvent(
    rawSessionId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<Result<void>> {
    return this.captureEvent(rawSessionId, eventType, payload);
  }

  // ── Query events ────────────────────────────────────────────────────────────

  async queryEvents(rawSessionId: string): Promise<Result<CapturedEvent[]>> {
    try {
      const sessionIdResult = toAnalyticsSessionId(rawSessionId);
      if (!sessionIdResult.ok) return Err(sessionIdResult.error);
      const sessionId = sessionIdResult.value;
      const log = capturedEventLog.get(sessionId.toString()) ?? [];
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
