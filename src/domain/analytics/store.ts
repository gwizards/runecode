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
import type { ConsentStatus, CapturedEvent, ConsentId } from './types';
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
  grantConsent(sessionId: string, projectId: string): Promise<Result<ConsentId>>;
  revokeConsent(consentId: string): Promise<Result<void>>;
  refreshStatus(consentId: string): void;
  trackEvent(
    sessionId: string,
    eventType: string,
    payload: Record<string, unknown>,
  ): Result<void>;
  queryEvents(sessionId: string): Result<CapturedEvent[]>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAnalyticsStore = create<AnalyticsStoreState>((set, _get) => ({
  activeConsentId: null,
  consentStatus: null,
  loading: false,
  error: null,

  grantConsent: async (sessionId, projectId) => {
    set({ loading: true, error: null });
    const result = _service.grantConsent(sessionId, projectId);
    if (result.ok) {
      const statusResult = _service.getConsentStatus(result.value);
      set({
        activeConsentId: result.value,
        consentStatus: statusResult.ok ? statusResult.value : null,
        loading: false,
      });
    } else {
      set({ loading: false, error: result.error });
    }
    return result;
  },

  revokeConsent: async (consentId) => {
    set({ loading: true, error: null });
    const result = _service.revokeConsent(consentId);
    if (result.ok) {
      const statusResult = _service.getConsentStatus(consentId);
      set({
        consentStatus: statusResult.ok ? statusResult.value : null,
        loading: false,
      });
    } else {
      set({ loading: false, error: result.error });
    }
    return result;
  },

  refreshStatus: (consentId) => {
    const result = _service.getConsentStatus(consentId);
    if (result.ok) {
      set({ consentStatus: result.value });
    }
  },

  trackEvent: (sessionId, eventType, payload) => {
    return _service.trackEvent(sessionId, eventType, payload);
  },

  queryEvents: (sessionId) => {
    return _service.queryEvents(sessionId);
  },
}));

// ─── Expose service and bus for advanced use ──────────────────────────────────

export { _service as analyticsService, _eventBus as analyticsBus };
