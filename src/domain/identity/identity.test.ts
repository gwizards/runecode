/**
 * Identity bounded context — tests.
 *
 * Uses real InMemoryIdentityRepository (no mocks).
 * vi.fn() is used only as an event bus spy.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserId, Email, DisplayName } from './types';
import { UserProfileAggregate } from './aggregate';
import { IDENTITY_EVENT_TYPES } from './events';
import { InMemoryIdentityRepository } from './repository';
import { IdentityApplicationService } from './service';
import { DomainEventBus } from '../shared/event-bus';
import { unwrap } from '../shared/result';

// ─── UserId ───────────────────────────────────────────────────────────────────

describe('UserId', () => {
  it('creates from a valid string', async () => {
    const r = UserId.create('550e8400-e29b-41d4-a716-446655440000');
    expect(r.ok).toBe(true);
  });

  it('returns Err for empty string', async () => {
    const r = UserId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', async () => {
    const r = UserId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('trims whitespace on valid id', async () => {
    const r = UserId.create('  abc-123  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('abc-123');
  });

  it('generate() returns a unique UserId each time', async () => {
    const a = UserId.generate();
    const b = UserId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('equals() compares by value', async () => {
    const a = unwrap(UserId.create('user-1'));
    const b = unwrap(UserId.create('user-1'));
    const c = unwrap(UserId.create('user-2'));
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('toString() returns the inner value', async () => {
    const id = unwrap(UserId.create('hello'));
    expect(id.toString()).toBe('hello');
  });
});

// ─── Email ────────────────────────────────────────────────────────────────────

describe('Email', () => {
  it('creates from a valid email', async () => {
    const r = Email.create('User@Example.COM');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('user@example.com');
  });

  it('normalizes to lowercase', async () => {
    const r = Email.create('HELLO@WORLD.ORG');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('hello@world.org');
  });

  it('returns Err for empty string', async () => {
    const r = Email.create('');
    expect(r.ok).toBe(false);
  });

  it('returns Err for missing @', async () => {
    const r = Email.create('notanemail.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Invalid email format');
  });

  it('returns Err for missing domain part', async () => {
    const r = Email.create('user@');
    expect(r.ok).toBe(false);
  });

  it('returns Err for double @', async () => {
    const r2 = Email.create('a@b@c.com');
    expect(r2.ok).toBe(false);
  });

  it('returns Err when email exceeds 254 chars', async () => {
    const longLocal = 'a'.repeat(250);
    const r2 = Email.create(`${longLocal}@b.com`); // 250+6=256 > 254
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain('too long');
  });

  it('equals() compares normalized values', async () => {
    const a = unwrap(Email.create('user@example.com'));
    const b = unwrap(Email.create('USER@EXAMPLE.COM'));
    expect(a.equals(b)).toBe(true);
  });
});

// ─── DisplayName ──────────────────────────────────────────────────────────────

describe('DisplayName', () => {
  it('creates from a valid name', async () => {
    const r = DisplayName.create('Alice');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('Alice');
  });

  it('returns Err for empty string', async () => {
    const r = DisplayName.create('');
    expect(r.ok).toBe(false);
  });

  it('returns Err for whitespace-only', async () => {
    const r = DisplayName.create('   ');
    expect(r.ok).toBe(false);
  });

  it('accepts exactly 100 characters', async () => {
    const r = DisplayName.create('a'.repeat(100));
    expect(r.ok).toBe(true);
  });

  it('returns Err for 101 characters', async () => {
    const r = DisplayName.create('a'.repeat(101));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('too long');
  });

  it('anonymous() returns "Anonymous"', async () => {
    expect(DisplayName.anonymous().value).toBe('Anonymous');
  });
});

// ─── UserProfileAggregate ─────────────────────────────────────────────────────

describe('UserProfileAggregate', () => {
  const makeEmail = () => unwrap(Email.create('test@example.com'));
  const makeName = () => unwrap(DisplayName.create('Test User'));

  it('creates successfully and raises profile.created event', async () => {
    const r = UserProfileAggregate.create({ email: makeEmail(), displayName: makeName() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const profile = r.value;
    const events = profile.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_CREATED);
  });

  it('create with explicit userId uses that id', async () => {
    const userId = unwrap(UserId.create('explicit-id'));
    const r = UserProfileAggregate.create({
      email: makeEmail(),
      displayName: makeName(),
      userId,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.userId.value).toBe('explicit-id');
  });

  it('update emits profile.updated event', async () => {
    const profile = unwrap(UserProfileAggregate.create({ email: makeEmail(), displayName: makeName() }));
    profile.pullEvents(); // drain created event

    const newEmail = unwrap(Email.create('updated@example.com'));
    const updateResult = profile.update({ email: newEmail });
    expect(updateResult.ok).toBe(true);

    const events = profile.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_UPDATED);
  });

  it('update returns Err when no fields provided', async () => {
    const profile = unwrap(UserProfileAggregate.create({ email: makeEmail(), displayName: makeName() }));
    profile.pullEvents();

    const r = profile.update({});
    expect(r.ok).toBe(false);
  });

  it('markDeleted emits profile.deleted event', async () => {
    const profile = unwrap(UserProfileAggregate.create({ email: makeEmail(), displayName: makeName() }));
    profile.pullEvents();

    profile.markDeleted();
    const events = profile.pullEvents();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_DELETED);
  });

  it('pullEvents() drains the event queue', async () => {
    const profile = unwrap(UserProfileAggregate.create({ email: makeEmail(), displayName: makeName() }));
    profile.pullEvents();
    const second = profile.pullEvents();
    expect(second).toHaveLength(0);
  });

  it('toSnapshot() returns plain object representation', async () => {
    const email = makeEmail();
    const name = makeName();
    const profile = unwrap(UserProfileAggregate.create({ email, displayName: name }));
    profile.pullEvents();

    const snap = profile.toSnapshot();
    expect(snap.email).toBe(email.value);
    expect(snap.displayName).toBe(name.value);
    expect(snap.deleted).toBe(false);
  });
});

// ─── InMemoryIdentityRepository ───────────────────────────────────────────────

describe('InMemoryIdentityRepository', () => {
  it('save and findById round-trip', async () => {
    const repo = new InMemoryIdentityRepository();
    const email = unwrap(Email.create('repo@test.com'));
    const name = unwrap(DisplayName.create('Repo Test'));
    const profile = unwrap(UserProfileAggregate.create({ email, displayName: name }));
    profile.pullEvents();

    await repo.save(profile);
    const found = await repo.findById(profile.userId);
    expect(found).not.toBeNull();
    expect(found?.userId.value).toBe(profile.userId.value);
  });

  it('findByEmail returns matching profile', async () => {
    const repo = new InMemoryIdentityRepository();
    const email = unwrap(Email.create('find@email.com'));
    const profile = unwrap(UserProfileAggregate.create({
      email,
      displayName: unwrap(DisplayName.create('Find Me')),
    }));
    profile.pullEvents();
    await repo.save(profile);

    const found = await repo.findByEmail(email);
    expect(found).not.toBeNull();
    expect(found?.email.value).toBe('find@email.com');
  });

  it('findById returns null for unknown id', async () => {
    const repo = new InMemoryIdentityRepository();
    const id = unwrap(UserId.create('nonexistent'));
    const found = await repo.findById(id);
    expect(found).toBeNull();
  });

  it('delete removes the profile', async () => {
    const repo = new InMemoryIdentityRepository();
    const profile = unwrap(UserProfileAggregate.create({
      email: unwrap(Email.create('del@test.com')),
      displayName: unwrap(DisplayName.create('Delete Me')),
    }));
    profile.pullEvents();
    await repo.save(profile);
    await repo.delete(profile.userId);

    const found = await repo.findById(profile.userId);
    expect(found).toBeNull();
  });

  it('findAll returns all saved profiles', async () => {
    const repo = new InMemoryIdentityRepository();
    const p1 = unwrap(UserProfileAggregate.create({
      email: unwrap(Email.create('a@a.com')),
      displayName: unwrap(DisplayName.create('A')),
    }));
    const p2 = unwrap(UserProfileAggregate.create({
      email: unwrap(Email.create('b@b.com')),
      displayName: unwrap(DisplayName.create('B')),
    }));
    p1.pullEvents();
    p2.pullEvents();

    await repo.save(p1);
    await repo.save(p2);
    const all = await repo.findAll();
    expect(all).toHaveLength(2);
  });
});

// ─── IdentityApplicationService ───────────────────────────────────────────────

describe('IdentityApplicationService', () => {
  let repo: InMemoryIdentityRepository;
  let bus: DomainEventBus;
  let svc: IdentityApplicationService;
  const dispatchSpy = vi.fn();

  beforeEach(() => {
    repo = new InMemoryIdentityRepository();
    bus = new DomainEventBus();
    bus.on('identity/profile.created', dispatchSpy);
    bus.on('identity/profile.updated', dispatchSpy);
    bus.on('identity/profile.deleted', dispatchSpy);
    svc = new IdentityApplicationService(repo, bus);
    dispatchSpy.mockClear();
  });

  it('createProfile succeeds and dispatches created event', async () => {
    const r = await svc.createProfile('alice@example.com', 'Alice');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email.value).toBe('alice@example.com');
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_CREATED);
  });

  it('createProfile with explicit userId uses that id', async () => {
    const r = await svc.createProfile('bob@example.com', 'Bob', 'custom-user-id');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.userId.value).toBe('custom-user-id');
  });

  it('createProfile returns Err for invalid email', async () => {
    const r = await svc.createProfile('not-an-email', 'Alice');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Invalid email format');
  });

  it('createProfile returns Err for duplicate email', async () => {
    await svc.createProfile('dup@example.com', 'First');
    const r = await svc.createProfile('dup@example.com', 'Second');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('already registered');
  });

  it('updateProfile succeeds and dispatches updated event', async () => {
    const created = await svc.createProfile('update@example.com', 'Original');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    dispatchSpy.mockClear();

    const r = await svc.updateProfile(created.value.userId.value, {
      displayName: 'Updated Name',
    });
    expect(r.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_UPDATED);
  });

  it('updateProfile returns Err when profile not found', async () => {
    const r = await svc.updateProfile('nonexistent-id', { displayName: 'New Name' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not found');
  });

  it('deleteProfile succeeds and dispatches deleted event', async () => {
    const created = await svc.createProfile('delete@example.com', 'ToDelete');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    dispatchSpy.mockClear();

    const r = await svc.deleteProfile(created.value.userId.value);
    expect(r.ok).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    expect(dispatchSpy.mock.calls[0][0].type).toBe(IDENTITY_EVENT_TYPES.PROFILE_DELETED);
  });

  it('deleteProfile returns Err when profile not found', async () => {
    const r = await svc.deleteProfile('ghost-id');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('not found');
  });

  it('lookupByEmail returns the profile', async () => {
    await svc.createProfile('lookup@example.com', 'LookupUser');
    const r = await svc.lookupByEmail('LOOKUP@EXAMPLE.COM');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.email.value).toBe('lookup@example.com');
  });

  it('lookupByEmail returns Err when not found', async () => {
    const r = await svc.lookupByEmail('missing@example.com');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('No profile found');
  });
});

// ─── Event type naming convention ─────────────────────────────────────────────

describe('IDENTITY_EVENT_TYPES naming convention', () => {
  it('all event type values match identity/noun.verb pattern', async () => {
    const pattern = /^identity\/[a-z]+\.[a-z]+$/;
    for (const value of Object.values(IDENTITY_EVENT_TYPES)) {
      expect(value).toMatch(pattern);
    }
  });
});
