/**
 * Analytics bounded context — Zustand UI adapter.
 *
 * This file is the ONLY place that couples the analytics domain to the UI
 * framework. It delegates ALL operations to AnalyticsApplicationService —
 * it contains zero domain logic of its own.
 *
 * Import this in React components; never import service.ts directly from UI code.
 */

import { create } from 'zustand';
import { DomainEventBus } from '../shared/event-bus';
import { InMemoryConsentRepository } from './repository';
import { AnalyticsApplicationService } from './service';
import type { ConsentStatus, CapturedEvent, ConsentId, ConsentAggregate } from './types';
import { UserId } from './types';
import type { Result } from '../shared/result';

// ─── Bootstrap singletons ─────────────────────────────────────────────────────

const _repository = new InMemoryConsentRepository();
const _eventBus = new DomainEventBus();
const _service = new AnalyticsApplicationService(_repository, _eventBus);

// ─── Store shape ──────────────────────────────────────────────────────────────

interface AnalyticsStoreState {
  /** Last known consent ID for the current session, if one exists. */
  activeConsentId: ConsentId | null;
  /** Last known consent status. Null until a consent record is created. */
  consentStatus: ConsentStatus | null;
  /** Indicates an operation is in-flight. */
  loading: boolean;
  /** Last error string, or null if no error. */
  error: string | null;

  // ── Actions ──
  grantConsent(sessionId: string, projectId: string, userId: string): Promise<Result<ConsentAggregate>>;
  revokeConsent(consentId: string): Promise<Result<void>>;
  refreshStatus(consentId: string): void;
  captureEvent(
    sessionId: string,
    name: string,
    properties?: Record<string, unknown>,
  ): Promise<Result<void>>;
  trackSession(sessionId: string, data?: Record<string, unknown>): Promise<Result<void>>;
  /** @deprecated Use captureEvent() instead. */
  trackEvent(
    sessionId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Promise<Result<void>>;
  queryEvents(sessionId: string): Promise<Result<CapturedEvent[]>>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAnalyticsStore = create<AnalyticsStoreState>((set, _get) => ({
  activeConsentId: null,
  consentStatus: null,
  loading: false,
  error: null,

  grantConsent: async (sessionId, projectId, rawUserId) => {
    set({ loading: true, error: null });
    const userIdResult = UserId.create(rawUserId);
    if (!userIdResult.ok) {
      set({ loading: false, error: userIdResult.error });
      return { ok: false as const, error: userIdResult.error };
    }
    const result = await _service.grantConsent(sessionId, projectId, userIdResult.value);
    if (result.ok) {
      const aggregate = result.value;
      set({
        activeConsentId: aggregate.id,
        consentStatus: aggregate.status,
        loading: false,
      });
    } else {
      set({ loading: false, error: result.error });
    }
    return result;
  },

  revokeConsent: async (consentId) => {
    set({ loading: true, error: null });
    const result = await _service.revokeConsent(consentId);
    if (result.ok) {
      const statusResult = await _service.getConsentStatus(consentId);
      set({
        consentStatus: statusResult.ok ? statusResult.value : null,
        loading: false,
      });
    } else {
      set({ loading: false, error: result.error });
    }
    return result;
  },

  refreshStatus: async (consentId) => {
    const result = await _service.getConsentStatus(consentId);
    if (result.ok) {
      set({ consentStatus: result.value });
    }
  },

  captureEvent: async (sessionId, name, properties) => {
    return _service.captureEvent(sessionId, name, properties);
  },

  trackSession: async (sessionId, data) => {
    return _service.trackSession(sessionId, data);
  },

  trackEvent: async (sessionId, eventType, payload) => {
    return _service.trackEvent(sessionId, eventType, payload);
  },

  queryEvents: async (sessionId) => {
    return _service.queryEvents(sessionId);
  },
}));

// ─── Expose service and bus for advanced use ──────────────────────────────────

export { _service as analyticsService, _eventBus as analyticsBus };
