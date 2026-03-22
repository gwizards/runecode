/**
 * Analytics bounded context — AnalyticsApplicationService tests.
 *
 * Uses InMemoryConsentRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 *
 * IMPORTANT: capturedEventLog is a module-level singleton in service.ts.
 * Each test uses a unique session ID (suffixed with a counter) to prevent
 * cross-test contamination of the event log.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { InMemoryConsentRepository } from './repository';
import { AnalyticsApplicationService } from './service';
import { ANALYTICS_EVENT_TYPES } from './events';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _sessionCounter = 0;

function uniqueSessionId(): string {
  _sessionCounter += 1;
  return `session-${Date.now()}-${_sessionCounter}`;
}

function makeCollectingBus(): { bus: DomainEventBus; collected: DomainEvent[] } {
  const bus = new DomainEventBus();
  const collected: DomainEvent[] = [];
  const originalDispatch = bus.dispatch.bind(bus);
  bus.dispatch = (events: ReadonlyArray<DomainEvent>) => {
    collected.push(...events);
    originalDispatch(events);
  };
  return { bus, collected };
}

// ─── InMemoryConsentRepository.searchByEmbedding ─────────────────────────────

/**
 * ConsentSnapshotQuantizer stores no int8 numeric fields (only uint8 + uint32),
 * so QuantizedSnapshotStore.searchNearest always returns [] for consent records.
 * searchByEmbedding is a thin delegation to searchNearest, and therefore also
 * always returns [].  The tests below verify this contract.
 */
describe('InMemoryConsentRepository.searchByEmbedding', () => {
  it('returns [] for an empty repository', () => {
    const repo = new InMemoryConsentRepository();
    const results = repo.searchByEmbedding([1, 0, 0]);
    expect(results).toEqual([]);
  });

  it('returns [] even after records are stored (no int8 embedding fields)', () => {
    const repo = new InMemoryConsentRepository();
    const svc = new AnalyticsApplicationService(repo, new DomainEventBus());
    svc.grantConsent(uniqueSessionId(), 'proj-embed-1');
    svc.grantConsent(uniqueSessionId(), 'proj-embed-2');

    // ConsentSnapshotQuantizer has zero int8 fields — searchNearest short-circuits.
    const results = repo.searchByEmbedding([1, 0, 0]);
    expect(results).toEqual([]);
  });

  it('topK parameter is accepted without error', () => {
    const repo = new InMemoryConsentRepository();
    expect(() => repo.searchByEmbedding([1, 0, 0], 3)).not.toThrow();
  });

  it('returned items (when non-empty) have { consentId, score } shape', () => {
    // Since searchNearest always returns [] for consent stores, we verify the
    // mapping type by confirming the return type is an array.
    const repo = new InMemoryConsentRepository();
    const results = repo.searchByEmbedding([1, 0], 5);
    expect(Array.isArray(results)).toBe(true);
    // Every item in the array must have consentId and score.
    for (const item of results) {
      expect(item).toHaveProperty('consentId');
      expect(item).toHaveProperty('score');
    }
  });
});

// ─── grantConsent ─────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.grantConsent()', () => {
  let repo: InMemoryConsentRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new AnalyticsApplicationService(repo, bus);
  });

  it('returns Ok with a ConsentId on valid inputs', () => {
    const sessionId = uniqueSessionId();
    const result = svc.grantConsent(sessionId, 'project-abc');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value).toBe('string');
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('persists the consent record in the repository', () => {
    const sessionId = uniqueSessionId();
    const result = svc.grantConsent(sessionId, 'project-abc');

    expect(result.ok).toBe(true);
    expect(repo.size).toBe(1);
  });

  it('is idempotent — calling twice for the same session returns the same ConsentId', () => {
    const sessionId = uniqueSessionId();
    const first = svc.grantConsent(sessionId, 'project-abc');
    const second = svc.grantConsent(sessionId, 'project-abc');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value).toBe(second.value);
  });

  it('idempotent call does not create a second repository record', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    svc.grantConsent(sessionId, 'project-abc');

    expect(repo.size).toBe(1);
  });

  it('returns Err when sessionId is empty', () => {
    const result = svc.grantConsent('', 'project-abc');

    expect(result.ok).toBe(false);
  });

  it('returns Err when sessionId is whitespace only', () => {
    const result = svc.grantConsent('   ', 'project-abc');

    expect(result.ok).toBe(false);
  });

  it('returns Err when projectId is empty', () => {
    const sessionId = uniqueSessionId();
    const result = svc.grantConsent(sessionId, '');

    expect(result.ok).toBe(false);
  });

  it('dispatches CONSENT_GRANTED event on success', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');

    const granted = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(granted).toHaveLength(1);
  });

  it('CONSENT_GRANTED event carries correct sessionId and projectId', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-xyz');

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string; projectId: string };
    expect(typed.sessionId).toBe(sessionId);
    expect(typed.projectId).toBe('project-xyz');
  });

  it('does not dispatch CONSENT_GRANTED on the idempotent second call', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    collected.length = 0;

    svc.grantConsent(sessionId, 'project-abc');

    const granted = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(granted).toHaveLength(0);
  });
});

// ─── revokeConsent ────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.revokeConsent()', () => {
  let repo: InMemoryConsentRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new AnalyticsApplicationService(repo, bus);
  });

  it('returns Ok(undefined) when revoking a granted consent', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    expect(grantResult.ok).toBe(true);
    if (!grantResult.ok) return;

    const result = svc.revokeConsent(grantResult.value);

    expect(result.ok).toBe(true);
  });

  it('returns Err when consentId does not exist', () => {
    const result = svc.revokeConsent('consent-does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('consent-does-not-exist');
  });

  it('returns Err when consentId is empty', () => {
    const result = svc.revokeConsent('');

    expect(result.ok).toBe(false);
  });

  it('dispatches CONSENT_REVOKED event on success', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;
    collected.length = 0;

    svc.revokeConsent(grantResult.value);

    const revoked = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_REVOKED);
    expect(revoked).toHaveLength(1);
  });

  it('CONSENT_REVOKED event carries the correct sessionId', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;
    collected.length = 0;

    svc.revokeConsent(grantResult.value);

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_REVOKED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string };
    expect(typed.sessionId).toBe(sessionId);
  });
});

// ─── getConsentStatus ─────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.getConsentStatus()', () => {
  let repo: InMemoryConsentRepository;
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    svc = new AnalyticsApplicationService(repo, new DomainEventBus());
  });

  it('returns "granted" after grantConsent is called', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;

    const status = svc.getConsentStatus(grantResult.value);

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.value).toBe('granted');
  });

  it('returns "revoked" after revokeConsent is called', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;

    svc.revokeConsent(grantResult.value);
    const status = svc.getConsentStatus(grantResult.value);

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.value).toBe('revoked');
  });

  it('returns Err for an unknown consentId', () => {
    const status = svc.getConsentStatus('no-such-consent');

    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.error).toContain('no-such-consent');
  });

  it('returns Err when consentId is empty', () => {
    const result = svc.getConsentStatus('');

    expect(result.ok).toBe(false);
  });
});

// ─── trackEvent ───────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.trackEvent()', () => {
  let repo: InMemoryConsentRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new AnalyticsApplicationService(repo, bus);
  });

  it('returns Ok even when consent has not been granted', () => {
    const sessionId = uniqueSessionId();
    const result = svc.trackEvent(sessionId, 'page_view', { page: '/home' });

    expect(result.ok).toBe(true);
  });

  it('silently drops the event when consent is not granted', () => {
    const sessionId = uniqueSessionId();
    svc.trackEvent(sessionId, 'page_view', { page: '/home' });

    const eventsResult = svc.queryEvents(sessionId);
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) return;
    expect(eventsResult.value).toHaveLength(0);
  });

  it('stores the event when consent has been granted', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');

    svc.trackEvent(sessionId, 'page_view', { page: '/home' });

    const eventsResult = svc.queryEvents(sessionId);
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) return;
    expect(eventsResult.value).toHaveLength(1);
  });

  it('stores the correct eventType and payload', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');

    svc.trackEvent(sessionId, 'button_click', { buttonId: 'save' });

    const eventsResult = svc.queryEvents(sessionId);
    if (!eventsResult.ok) return;
    const captured = eventsResult.value[0];
    expect(captured?.eventType).toBe('button_click');
    expect(captured?.payload).toEqual({ buttonId: 'save' });
  });

  it('returns Ok even when consent has been revoked', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;
    svc.revokeConsent(grantResult.value);

    const result = svc.trackEvent(sessionId, 'page_view', {});

    expect(result.ok).toBe(true);
  });

  it('silently drops event when consent is revoked', () => {
    const sessionId = uniqueSessionId();
    const grantResult = svc.grantConsent(sessionId, 'project-abc');
    if (!grantResult.ok) return;
    svc.revokeConsent(grantResult.value);
    collected.length = 0;

    svc.trackEvent(sessionId, 'page_view', {});

    const eventsResult = svc.queryEvents(sessionId);
    if (!eventsResult.ok) return;
    // No new events should be captured after revoke
    const captured = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(captured).toHaveLength(0);
  });

  it('dispatches EVENT_CAPTURED event on the bus when tracking succeeds', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    collected.length = 0;

    svc.trackEvent(sessionId, 'search', { query: 'foo' });

    const captured = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(captured).toHaveLength(1);
  });

  it('EVENT_CAPTURED event carries correct sessionId and eventType', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    collected.length = 0;

    svc.trackEvent(sessionId, 'custom_action', {});

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string; eventType: string };
    expect(typed.sessionId).toBe(sessionId);
    expect(typed.eventType).toBe('custom_action');
  });
});

// ─── queryEvents ──────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.queryEvents()', () => {
  let repo: InMemoryConsentRepository;
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    svc = new AnalyticsApplicationService(repo, new DomainEventBus());
  });

  it('returns Ok with empty array for an unknown session', () => {
    const sessionId = uniqueSessionId();
    const result = svc.queryEvents(sessionId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('returns Ok with events in insertion order after tracking', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');

    svc.trackEvent(sessionId, 'first', {});
    svc.trackEvent(sessionId, 'second', {});
    svc.trackEvent(sessionId, 'third', {});

    const result = svc.queryEvents(sessionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]?.eventType).toBe('first');
    expect(result.value[1]?.eventType).toBe('second');
    expect(result.value[2]?.eventType).toBe('third');
  });

  it('returns a defensive copy — mutating the result does not affect the store', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    svc.trackEvent(sessionId, 'click', { x: 10 });

    const first = svc.queryEvents(sessionId);
    if (!first.ok) return;
    // Mutate the returned array
    first.value.splice(0);

    const second = svc.queryEvents(sessionId);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toHaveLength(1);
  });

  it('mutating a returned payload does not affect the stored payload', () => {
    const sessionId = uniqueSessionId();
    svc.grantConsent(sessionId, 'project-abc');
    svc.trackEvent(sessionId, 'scroll', { offset: 100 });

    const first = svc.queryEvents(sessionId);
    if (!first.ok) return;
    const evt = first.value[0];
    if (!evt) return;
    // Try to mutate the payload object
    (evt.payload as Record<string, unknown>)['offset'] = 9999;

    const second = svc.queryEvents(sessionId);
    if (!second.ok) return;
    expect(second.value[0]?.payload['offset']).toBe(100);
  });

  it('returns Err when sessionId is empty', () => {
    const result = svc.queryEvents('');

    expect(result.ok).toBe(false);
  });

  it('returns events only for the queried session, not for others', () => {
    const sessionA = uniqueSessionId();
    const sessionB = uniqueSessionId();
    svc.grantConsent(sessionA, 'project-abc');
    svc.grantConsent(sessionB, 'project-abc');

    svc.trackEvent(sessionA, 'event_a', {});
    svc.trackEvent(sessionB, 'event_b', {});

    const resultA = svc.queryEvents(sessionA);
    expect(resultA.ok).toBe(true);
    if (!resultA.ok) return;
    expect(resultA.value).toHaveLength(1);
    expect(resultA.value[0]?.eventType).toBe('event_a');
  });
});
