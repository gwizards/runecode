/**
 * Analytics bounded context — Value Object and ConsentAggregate tests.
 *
 * Focuses on gaps not covered by analytics.test.ts (which tests the service layer):
 *   - AnalyticsSessionId value object
 *   - ConsentId value object
 *   - ConsentAggregate.create() and .fromSnapshot() directly
 *   - ConsentAggregate state transitions (grant, revoke, idempotency)
 *   - toSnapshot() round-trip
 */

import { describe, it, expect } from 'vitest';
import {
  AnalyticsSessionId,
  ConsentId,
  ConsentAggregate,
} from './types';
import type { RawConsent } from './types';
import { UserId } from '../shared/user-id';
import { ProjectId } from '../shared/project-id';
import { unwrap } from '../shared/result';

// ─── AnalyticsSessionId ──────────────────────────────────────────────────────

describe('AnalyticsSessionId', () => {
  it('creates from a valid string', () => {
    const r = AnalyticsSessionId.create('sess-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('sess-001');
  });

  it('trims whitespace', () => {
    const r = AnalyticsSessionId.create('  sess-002  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('sess-002');
  });

  it('returns Err for empty string', () => {
    const r = AnalyticsSessionId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = AnalyticsSessionId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('generate() produces unique values', () => {
    const a = AnalyticsSessionId.generate();
    const b = AnalyticsSessionId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(AnalyticsSessionId.create('same'));
    const b = unwrap(AnalyticsSessionId.create('same'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(AnalyticsSessionId.create('one'));
    const b = unwrap(AnalyticsSessionId.create('two'));
    expect(a.equals(b)).toBe(false);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(AnalyticsSessionId.create('my-session'));
    expect(id.toString()).toBe('my-session');
  });
});

// ─── ConsentId ───────────────────────────────────────────────────────────────

describe('ConsentId', () => {
  it('creates from a valid string', () => {
    const r = ConsentId.create('consent-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('consent-001');
  });

  it('trims whitespace', () => {
    const r = ConsentId.create('  consent-002  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('consent-002');
  });

  it('returns Err for empty string', () => {
    const r = ConsentId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = ConsentId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('generate() produces unique values', () => {
    const a = ConsentId.generate();
    const b = ConsentId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(ConsentId.create('same'));
    const b = unwrap(ConsentId.create('same'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(ConsentId.create('one'));
    const b = unwrap(ConsentId.create('two'));
    expect(a.equals(b)).toBe(false);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(ConsentId.create('my-consent'));
    expect(id.toString()).toBe('my-consent');
  });
});

// ─── ConsentAggregate.create() ───────────────────────────────────────────────

describe('ConsentAggregate.create()', () => {
  const userId = unwrap(UserId.create('user-a'));
  const sessionId = unwrap(AnalyticsSessionId.create('sess-a'));
  const projectId = unwrap(ProjectId.create('proj-a'));

  it('returns Ok with a pending consent', () => {
    const r = ConsentAggregate.create(userId, sessionId, projectId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('pending');
    expect(r.value.isGranted()).toBe(false);
  });

  it('generates a ConsentId automatically', () => {
    const r = ConsentAggregate.create(userId, sessionId, projectId);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id.toString().length).toBeGreaterThan(0);
  });

  it('preserves the sessionId and projectId', () => {
    const r = ConsentAggregate.create(userId, sessionId, projectId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sessionId.toString()).toBe('sess-a');
    expect(r.value.projectId.toString()).toBe('proj-a');
  });

  it('starts with no grantedAt or revokedAt', () => {
    const r = ConsentAggregate.create(userId, sessionId, projectId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.grantedAt).toBeUndefined();
    expect(r.value.revokedAt).toBeUndefined();
  });
});

// ─── ConsentAggregate.grant() ────────────────────────────────────────────────

describe('ConsentAggregate.grant()', () => {
  function makePending() {
    const userId = unwrap(UserId.create('user-g'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-g'));
    const projectId = unwrap(ProjectId.create('proj-g'));
    return unwrap(ConsentAggregate.create(userId, sessionId, projectId));
  }

  it('transitions from pending to granted', () => {
    const consent = makePending();
    consent.grant();
    expect(consent.status).toBe('granted');
    expect(consent.isGranted()).toBe(true);
  });

  it('sets grantedAt timestamp', () => {
    const before = Date.now();
    const consent = makePending();
    consent.grant();
    const after = Date.now();

    expect(consent.grantedAt).toBeDefined();
    expect(consent.grantedAt!).toBeGreaterThanOrEqual(before);
    expect(consent.grantedAt!).toBeLessThanOrEqual(after);
  });

  it('raises a domain event on grant', () => {
    const consent = makePending();
    consent.grant();
    const events = consent.drainEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent -- second grant does not change state or raise events', () => {
    const consent = makePending();
    consent.grant();
    const firstGrantedAt = consent.grantedAt;
    consent.drainEvents();

    consent.grant(); // second call
    expect(consent.grantedAt).toBe(firstGrantedAt);
    expect(consent.drainEvents()).toHaveLength(0);
  });
});

// ─── ConsentAggregate.revoke() ───────────────────────────────────────────────

describe('ConsentAggregate.revoke()', () => {
  function makeGranted() {
    const userId = unwrap(UserId.create('user-r'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-r'));
    const projectId = unwrap(ProjectId.create('proj-r'));
    const consent = unwrap(ConsentAggregate.create(userId, sessionId, projectId));
    consent.grant();
    consent.drainEvents();
    return consent;
  }

  it('transitions from granted to revoked', () => {
    const consent = makeGranted();
    consent.revoke();
    expect(consent.status).toBe('revoked');
    expect(consent.isGranted()).toBe(false);
  });

  it('sets revokedAt timestamp', () => {
    const before = Date.now();
    const consent = makeGranted();
    consent.revoke();
    const after = Date.now();

    expect(consent.revokedAt).toBeDefined();
    expect(consent.revokedAt!).toBeGreaterThanOrEqual(before);
    expect(consent.revokedAt!).toBeLessThanOrEqual(after);
  });

  it('raises a domain event on revoke', () => {
    const consent = makeGranted();
    consent.revoke();
    const events = consent.drainEvents();
    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('is idempotent on pending consent (no-op)', () => {
    const userId = unwrap(UserId.create('user-nop'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-nop'));
    const projectId = unwrap(ProjectId.create('proj-nop'));
    const consent = unwrap(ConsentAggregate.create(userId, sessionId, projectId));

    consent.revoke(); // not yet granted, should be no-op
    expect(consent.status).toBe('pending');
    expect(consent.drainEvents()).toHaveLength(0);
  });
});

// ─── ConsentAggregate.fromSnapshot() ─────────────────────────────────────────

describe('ConsentAggregate.fromSnapshot()', () => {
  const validSnapshot: RawConsent = {
    id: 'consent-snap-1',
    userId: 'user-snap',
    sessionId: 'sess-snap',
    projectId: 'proj-snap',
    status: 'granted',
    grantedAt: 1700000000000,
    revokedAt: undefined,
  };

  it('reconstructs from a valid granted snapshot', () => {
    const r = ConsentAggregate.fromSnapshot(validSnapshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('granted');
    expect(r.value.isGranted()).toBe(true);
    expect(r.value.grantedAt).toBe(1700000000000);
  });

  it('reconstructs a revoked snapshot', () => {
    const snap: RawConsent = {
      ...validSnapshot,
      status: 'granted',
      revokedAt: 1700000001000,
    };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // status is derived: if revokedAt is set, status is 'revoked'
    expect(r.value.status).toBe('revoked');
    expect(r.value.isGranted()).toBe(false);
  });

  it('reconstructs a pending snapshot', () => {
    const snap: RawConsent = {
      ...validSnapshot,
      status: 'pending',
      grantedAt: undefined,
    };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.status).toBe('pending');
  });

  it('returns Err for empty userId', () => {
    const snap: RawConsent = { ...validSnapshot, userId: '' };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('userId');
  });

  it('returns Err for empty id', () => {
    const snap: RawConsent = { ...validSnapshot, id: '' };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('id');
  });

  it('returns Err for empty sessionId', () => {
    const snap: RawConsent = { ...validSnapshot, sessionId: '' };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('sessionId');
  });

  it('returns Err for empty projectId', () => {
    const snap: RawConsent = { ...validSnapshot, projectId: '' };
    const r = ConsentAggregate.fromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('projectId');
  });

  it('raises no domain events on reconstruction', () => {
    const r = ConsentAggregate.fromSnapshot(validSnapshot);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.drainEvents()).toHaveLength(0);
  });
});

// ─── ConsentAggregate.toSnapshot() round-trip ────────────────────────────────

describe('ConsentAggregate.toSnapshot() round-trip', () => {
  it('round-trips create -> grant -> toSnapshot -> fromSnapshot', () => {
    const userId = unwrap(UserId.create('user-rt'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-rt'));
    const projectId = unwrap(ProjectId.create('proj-rt'));

    const original = unwrap(ConsentAggregate.create(userId, sessionId, projectId));
    original.grant();
    original.drainEvents();

    const snap = original.toSnapshot();
    const restored = unwrap(ConsentAggregate.fromSnapshot(snap));

    expect(restored.id.toString()).toBe(original.id.toString());
    expect(restored.userId.toString()).toBe('user-rt');
    expect(restored.sessionId.toString()).toBe('sess-rt');
    expect(restored.projectId.toString()).toBe('proj-rt');
    expect(restored.status).toBe('granted');
    expect(restored.grantedAt).toBe(original.grantedAt);
  });

  it('round-trips a revoked consent', () => {
    const userId = unwrap(UserId.create('user-rev'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-rev'));
    const projectId = unwrap(ProjectId.create('proj-rev'));

    const original = unwrap(ConsentAggregate.create(userId, sessionId, projectId));
    original.grant();
    original.revoke();
    original.drainEvents();

    const snap = original.toSnapshot();
    const restored = unwrap(ConsentAggregate.fromSnapshot(snap));

    expect(restored.status).toBe('revoked');
    expect(restored.revokedAt).toBe(original.revokedAt);
  });
});

// ─── ConsentAggregate.drainEvents() ──────────────────────────────────────────

describe('ConsentAggregate.drainEvents()', () => {
  it('drains all events and subsequent call returns empty', () => {
    const userId = unwrap(UserId.create('user-drain'));
    const sessionId = unwrap(AnalyticsSessionId.create('sess-drain'));
    const projectId = unwrap(ProjectId.create('proj-drain'));
    const consent = unwrap(ConsentAggregate.create(userId, sessionId, projectId));
    consent.grant();

    const first = consent.drainEvents();
    expect(first.length).toBeGreaterThan(0);

    const second = consent.drainEvents();
    expect(second).toHaveLength(0);
  });
});
