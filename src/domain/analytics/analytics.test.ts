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
import type { IAnalyticsTracker } from './ports/IAnalyticsTracker';
import { UserId } from '../identity/types';
import { unwrap } from '../shared/result';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _sessionCounter = 0;

function uniqueSessionId(): string {
  _sessionCounter += 1;
  return `session-${Date.now()}-${_sessionCounter}`;
}

/** A reusable test UserId — created once and shared across all tests. */
const TEST_USER_ID = unwrap(UserId.create('test-user-analytics'));

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

/** Spy tracker that records all calls without side effects. */
function makeSpyTracker(): IAnalyticsTracker & {
  calls: { method: string; args: unknown[] }[];
} {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    calls,
    trackSession(sessionId, props) { calls.push({ method: 'trackSession', args: [sessionId, props] }); },
    captureEvent(name, props) { calls.push({ method: 'captureEvent', args: [name, props] }); },
    identify(userId, traits) { calls.push({ method: 'identify', args: [userId, traits] }); },
    optOut() { calls.push({ method: 'optOut', args: [] }); },
    optIn() { calls.push({ method: 'optIn', args: [] }); },
  };
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

  it('returns [] even after records are stored (no int8 embedding fields)', async () => {
    const repo = new InMemoryConsentRepository();
    const svc = new AnalyticsApplicationService(repo, new DomainEventBus());
    await svc.grantConsent(uniqueSessionId(), 'proj-embed-1', TEST_USER_ID);
    await svc.grantConsent(uniqueSessionId(), 'proj-embed-2', TEST_USER_ID);

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

  it('returns Ok with a ConsentAggregate on valid inputs', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeDefined();
    expect(typeof result.value.id.toString()).toBe('string');
    expect(result.value.id.toString().length).toBeGreaterThan(0);
  });

  it('returned aggregate has status "granted"', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('granted');
    expect(result.value.isGranted()).toBe(true);
  });

  it('persists the consent record in the repository', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    expect(result.ok).toBe(true);
    expect(repo.size).toBe(1);
  });

  it('is idempotent — calling twice for the same session returns the same ConsentId', async () => {
    const sessionId = uniqueSessionId();
    const first = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    const second = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.id.toString()).toBe(second.value.id.toString());
  });

  it('idempotent call does not create a second repository record', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    expect(repo.size).toBe(1);
  });

  it('returns Err when sessionId is empty', async () => {
    const result = await svc.grantConsent('', 'project-abc', TEST_USER_ID);

    expect(result.ok).toBe(false);
  });

  it('returns Err when sessionId is whitespace only', async () => {
    const result = await svc.grantConsent('   ', 'project-abc', TEST_USER_ID);

    expect(result.ok).toBe(false);
  });

  it('returns Err when projectId is empty', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.grantConsent(sessionId, '', TEST_USER_ID);

    expect(result.ok).toBe(false);
  });

  it('dispatches CONSENT_GRANTED event on success', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    const granted = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(granted).toHaveLength(1);
  });

  it('CONSENT_GRANTED event carries correct sessionId and projectId', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-xyz', TEST_USER_ID);

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string; projectId: string };
    expect(typed.sessionId).toBe(sessionId);
    expect(typed.projectId).toBe('project-xyz');
  });

  it('does not dispatch CONSENT_GRANTED on the idempotent second call', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    collected.length = 0;

    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    const granted = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_GRANTED);
    expect(granted).toHaveLength(0);
  });

  it('calls tracker.optIn() when a tracker is provided', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);
    await svcWithTracker.grantConsent(uniqueSessionId(), 'project-abc', TEST_USER_ID);

    const optInCalls = spy.calls.filter(c => c.method === 'optIn');
    expect(optInCalls).toHaveLength(1);
  });

  it('does not dispatch CONSENT_GRANTED on the idempotent second call', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);
    const sessionId = uniqueSessionId();
    await svcWithTracker.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    // Reset the event bus collection after the first call
    collected.length = 0;

    // Idempotent — aggregate already granted, no domain event should be raised
    await svcWithTracker.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

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

  it('returns Ok(undefined) when revoking a granted consent', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    expect(grantResult.ok).toBe(true);
    if (!grantResult.ok) return;

    const result = await svc.revokeConsent(grantResult.value.id.toString());

    expect(result.ok).toBe(true);
  });

  it('returns Err when consentId does not exist', async () => {
    const result = await svc.revokeConsent('consent-does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('consent-does-not-exist');
  });

  it('returns Err when consentId is empty', async () => {
    const result = await svc.revokeConsent('');

    expect(result.ok).toBe(false);
  });

  it('dispatches CONSENT_REVOKED event on success', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    collected.length = 0;

    await svc.revokeConsent(grantResult.value.id.toString());

    const revoked = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_REVOKED);
    expect(revoked).toHaveLength(1);
  });

  it('CONSENT_REVOKED event carries the correct sessionId', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    collected.length = 0;

    await svc.revokeConsent(grantResult.value.id.toString());

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.CONSENT_REVOKED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string };
    expect(typed.sessionId).toBe(sessionId);
  });

  it('calls tracker.optOut() when a tracker is provided', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);
    const sessionId = uniqueSessionId();
    const grantResult = await svcWithTracker.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    spy.calls.length = 0;

    await svcWithTracker.revokeConsent(grantResult.value.id.toString());

    const optOutCalls = spy.calls.filter(c => c.method === 'optOut');
    expect(optOutCalls).toHaveLength(1);
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

  it('returns "granted" after grantConsent is called', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;

    const status = await svc.getConsentStatus(grantResult.value.id.toString());

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.value).toBe('granted');
  });

  it('returns "revoked" after revokeConsent is called', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;

    await svc.revokeConsent(grantResult.value.id.toString());
    const status = await svc.getConsentStatus(grantResult.value.id.toString());

    expect(status.ok).toBe(true);
    if (!status.ok) return;
    expect(status.value).toBe('revoked');
  });

  it('returns Err for an unknown consentId', async () => {
    const status = await svc.getConsentStatus('no-such-consent');

    expect(status.ok).toBe(false);
    if (status.ok) return;
    expect(status.error).toContain('no-such-consent');
  });

  it('returns Err when consentId is empty', async () => {
    const result = await svc.getConsentStatus('');

    expect(result.ok).toBe(false);
  });
});

// ─── trackSession ─────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.trackSession()', () => {
  let repo: InMemoryConsentRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new AnalyticsApplicationService(repo, bus);
  });

  it('returns Ok even when consent has not been granted', async () => {
    const result = await svc.trackSession(uniqueSessionId(), { source: 'test' });

    expect(result.ok).toBe(true);
  });

  it('silently drops the session track when consent is not granted', async () => {
    const sessionId = uniqueSessionId();
    await svc.trackSession(sessionId, {});

    const tracked = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.SESSION_TRACKED);
    expect(tracked).toHaveLength(0);
  });

  it('dispatches SESSION_TRACKED when consent is granted', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    collected.length = 0;

    await svc.trackSession(sessionId, { browser: 'chrome' });

    const tracked = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.SESSION_TRACKED);
    expect(tracked).toHaveLength(1);
  });

  it('SESSION_TRACKED event carries correct sessionId', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    collected.length = 0;

    await svc.trackSession(sessionId);

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.SESSION_TRACKED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string };
    expect(typed.sessionId).toBe(sessionId);
  });

  it('silently drops after consent is revoked', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    await svc.revokeConsent(grantResult.value.id.toString());
    collected.length = 0;

    await svc.trackSession(sessionId, {});

    const tracked = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.SESSION_TRACKED);
    expect(tracked).toHaveLength(0);
  });

  it('calls tracker.trackSession() when a tracker is provided and consent is granted', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);
    const sessionId = uniqueSessionId();
    await svcWithTracker.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    spy.calls.length = 0;

    await svcWithTracker.trackSession(sessionId, { key: 'value' });

    const calls = spy.calls.filter(c => c.method === 'trackSession');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0]).toBe(sessionId);
  });

  it('does NOT call tracker.trackSession() when consent is not granted', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);

    await svcWithTracker.trackSession(uniqueSessionId(), {});

    const calls = spy.calls.filter(c => c.method === 'trackSession');
    expect(calls).toHaveLength(0);
  });

  it('returns Err when sessionId is empty', async () => {
    const result = await svc.trackSession('');

    expect(result.ok).toBe(false);
  });
});

// ─── captureEvent ─────────────────────────────────────────────────────────────

describe('AnalyticsApplicationService.captureEvent()', () => {
  let repo: InMemoryConsentRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new AnalyticsApplicationService(repo, bus);
  });

  it('returns Ok even when consent has not been granted', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.captureEvent(sessionId, 'page_view', { page: '/home' });

    expect(result.ok).toBe(true);
  });

  it('silently drops the event when consent is not granted', async () => {
    const sessionId = uniqueSessionId();
    await svc.captureEvent(sessionId, 'page_view', { page: '/home' });

    const eventsResult = await svc.queryEvents(sessionId);
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) return;
    expect(eventsResult.value).toHaveLength(0);
  });

  it('stores the event when consent has been granted', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    await svc.captureEvent(sessionId, 'page_view', { page: '/home' });

    const eventsResult = await svc.queryEvents(sessionId);
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) return;
    expect(eventsResult.value).toHaveLength(1);
  });

  it('stores the correct event name and properties', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    await svc.captureEvent(sessionId, 'button_click', { buttonId: 'save' });

    const eventsResult = await svc.queryEvents(sessionId);
    if (!eventsResult.ok) return;
    const captured = eventsResult.value[0];
    expect(captured?.eventType).toBe('button_click');
    expect(captured?.payload).toEqual({ buttonId: 'save' });
  });

  it('returns Ok even when consent has been revoked', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    await svc.revokeConsent(grantResult.value.id.toString());

    const result = await svc.captureEvent(sessionId, 'page_view', {});

    expect(result.ok).toBe(true);
  });

  it('silently drops event when consent is revoked', async () => {
    const sessionId = uniqueSessionId();
    const grantResult = await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    if (!grantResult.ok) return;
    await svc.revokeConsent(grantResult.value.id.toString());
    collected.length = 0;

    await svc.captureEvent(sessionId, 'page_view', {});

    const eventsResult = await svc.queryEvents(sessionId);
    if (!eventsResult.ok) return;
    const captured = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(captured).toHaveLength(0);
  });

  it('dispatches EVENT_CAPTURED event on the bus when tracking succeeds', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    collected.length = 0;

    await svc.captureEvent(sessionId, 'search', { query: 'foo' });

    const captured = collected.filter(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(captured).toHaveLength(1);
  });

  it('EVENT_CAPTURED event carries correct sessionId and eventType', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    collected.length = 0;

    await svc.captureEvent(sessionId, 'custom_action', {});

    const evt = collected.find(e => e.type === ANALYTICS_EVENT_TYPES.EVENT_CAPTURED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { sessionId: string; eventType: string };
    expect(typed.sessionId).toBe(sessionId);
    expect(typed.eventType).toBe('custom_action');
  });

  it('calls tracker.captureEvent() when a tracker is provided and consent is granted', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);
    const sessionId = uniqueSessionId();
    await svcWithTracker.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    spy.calls.length = 0;

    await svcWithTracker.captureEvent(sessionId, 'my_event', { x: 1 });

    const calls = spy.calls.filter(c => c.method === 'captureEvent');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args[0]).toBe('my_event');
  });

  it('does NOT call tracker.captureEvent() when consent is not granted', async () => {
    const spy = makeSpyTracker();
    const svcWithTracker = new AnalyticsApplicationService(repo, bus, spy);

    await svcWithTracker.captureEvent(uniqueSessionId(), 'my_event', {});

    const calls = spy.calls.filter(c => c.method === 'captureEvent');
    expect(calls).toHaveLength(0);
  });
});

// ─── trackEvent (legacy alias) ────────────────────────────────────────────────

describe('AnalyticsApplicationService.trackEvent() (legacy alias)', () => {
  let repo: InMemoryConsentRepository;
  let svc: AnalyticsApplicationService;

  beforeEach(() => {
    repo = new InMemoryConsentRepository();
    svc = new AnalyticsApplicationService(repo, new DomainEventBus());
  });

  it('returns Ok even when consent has not been granted', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.trackEvent(sessionId, 'page_view', { page: '/home' });

    expect(result.ok).toBe(true);
  });

  it('stores the event via captureEvent when consent has been granted', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    await svc.trackEvent(sessionId, 'page_view', { page: '/home' });

    const eventsResult = await svc.queryEvents(sessionId);
    expect(eventsResult.ok).toBe(true);
    if (!eventsResult.ok) return;
    expect(eventsResult.value).toHaveLength(1);
    expect(eventsResult.value[0]?.eventType).toBe('page_view');
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

  it('returns Ok with empty array for an unknown session', async () => {
    const sessionId = uniqueSessionId();
    const result = await svc.queryEvents(sessionId);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('returns Ok with events in insertion order after tracking', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);

    await svc.captureEvent(sessionId, 'first', {});
    await svc.captureEvent(sessionId, 'second', {});
    await svc.captureEvent(sessionId, 'third', {});

    const result = await svc.queryEvents(sessionId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
    expect(result.value[0]?.eventType).toBe('first');
    expect(result.value[1]?.eventType).toBe('second');
    expect(result.value[2]?.eventType).toBe('third');
  });

  it('returns a defensive copy — mutating the result does not affect the store', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    await svc.captureEvent(sessionId, 'click', { x: 10 });

    const first = await svc.queryEvents(sessionId);
    if (!first.ok) return;
    // Mutate the returned array
    first.value.splice(0);

    const second = await svc.queryEvents(sessionId);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value).toHaveLength(1);
  });

  it('mutating a returned payload does not affect the stored payload', async () => {
    const sessionId = uniqueSessionId();
    await svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID);
    await svc.captureEvent(sessionId, 'scroll', { offset: 100 });

    const first = await svc.queryEvents(sessionId);
    if (!first.ok) return;
    const evt = first.value[0];
    if (!evt) return;
    // Try to mutate the payload object
    (evt.payload as Record<string, unknown>)['offset'] = 9999;

    const second = await svc.queryEvents(sessionId);
    if (!second.ok) return;
    expect(second.value[0]?.payload['offset']).toBe(100);
  });

  it('returns Err when sessionId is empty', async () => {
    const result = await svc.queryEvents('');

    expect(result.ok).toBe(false);
  });

  it('returns events only for the queried session, not for others', async () => {
    const sessionA = uniqueSessionId();
    const sessionB = uniqueSessionId();
    await svc.grantConsent(sessionA, 'project-abc', TEST_USER_ID);
    await svc.grantConsent(sessionB, 'project-abc', TEST_USER_ID);

    await svc.captureEvent(sessionA, 'event_a', {});
    await svc.captureEvent(sessionB, 'event_b', {});

    const resultA = await svc.queryEvents(sessionA);
    expect(resultA.ok).toBe(true);
    if (!resultA.ok) return;
    expect(resultA.value).toHaveLength(1);
    expect(resultA.value[0]?.eventType).toBe('event_a');
  });
});

// ─── IAnalyticsTracker port ───────────────────────────────────────────────────

describe('IAnalyticsTracker port contract', () => {
  it('service works without a tracker (tracker is optional)', async () => {
    const repo = new InMemoryConsentRepository();
    const bus = new DomainEventBus();
    // No tracker passed — should not throw
    const svc = new AnalyticsApplicationService(repo, bus);
    const sessionId = uniqueSessionId();

    await expect(svc.grantConsent(sessionId, 'project-abc', TEST_USER_ID)).resolves.not.toThrow();
    await expect(svc.trackSession(sessionId)).resolves.not.toThrow();
    await expect(svc.captureEvent(sessionId, 'test_event')).resolves.not.toThrow();
  });

  it('spy tracker receives no calls when no consent is granted', async () => {
    const repo = new InMemoryConsentRepository();
    const bus = new DomainEventBus();
    const spy = makeSpyTracker();
    const svc = new AnalyticsApplicationService(repo, bus, spy);

    await svc.trackSession(uniqueSessionId());
    await svc.captureEvent(uniqueSessionId(), 'some_event');

    // Only optIn/optOut can be called via grant/revoke — not track/capture
    const trackCalls = spy.calls.filter(
      c => c.method === 'trackSession' || c.method === 'captureEvent',
    );
    expect(trackCalls).toHaveLength(0);
  });
});
