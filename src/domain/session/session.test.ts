/**
 * Session bounded context — unit tests.
 *
 * Groups:
 *   1. TokenUsage value object
 *   2. SessionAggregate.create()
 *   3. SessionAggregate.appendOutput()
 *   4. SessionAggregate.complete()
 *   5. InMemorySessionRepository
 */

import { describe, it, expect } from 'vitest';
import {
  emptyTokenUsage,
  addTokenUsage,
  SessionAggregate,
  toSessionId,
  toProjectId,
} from './types';
import { unwrap } from '../shared/result';
import { SESSION_EVENT_TYPES } from './events';
import { InMemorySessionRepository } from './repository';

// ─── 1. TokenUsage VO ─────────────────────────────────────────────────────────

describe('TokenUsage value object', () => {
  it('emptyTokenUsage() returns all-zero fields', () => {
    const usage = emptyTokenUsage();
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(0);
    expect(usage.costUsd).toBe(0);
    expect(usage.cacheReadTokens).toBe(0);
    expect(usage.cacheCreationTokens).toBe(0);
  });

  it('addTokenUsage() sums partial fields correctly', () => {
    const base = emptyTokenUsage();
    const delta = { inputTokens: 10, outputTokens: 5, costUsd: 0.002 };
    const result = addTokenUsage(base, delta);
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.costUsd).toBeCloseTo(0.002);
    expect(result.cacheReadTokens).toBe(0);
    expect(result.cacheCreationTokens).toBe(0);
  });
});

// ─── 2. SessionAggregate.create() ────────────────────────────────────────────

describe('SessionAggregate.create()', () => {
  const rawSession = {
    id: 'sess-001',
    projectId: 'proj-abc',
    title: 'My first session',
    status: 'idle',
  };

  it('raises a SessionCreatedEvent after creation', () => {
    const session = unwrap(SessionAggregate.create(rawSession));
    const events = session.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(SESSION_EVENT_TYPES.SESSION_CREATED);
    expect(events[0].aggregateId).toBe('sess-001');
  });

  it('sets the correct initial status from raw data', () => {
    const session = unwrap(SessionAggregate.create(rawSession));
    expect(session.status).toBe('idle');
    expect(session.title).toBe('My first session');
    expect(session.id).toBe(unwrap(toSessionId('sess-001')));
    expect(session.projectId).toBe(unwrap(toProjectId('proj-abc')));
  });
});

// ─── 3. SessionAggregate.appendOutput() ──────────────────────────────────────

describe('SessionAggregate.appendOutput()', () => {
  function makeSession() {
    return unwrap(SessionAggregate.create({
      id: 'sess-002',
      projectId: 'proj-abc',
      title: 'Output test',
    }));
  }

  it('raises an OutputAppendedEvent for each chunk', () => {
    const session = makeSession();
    session.clearEvents();
    session.appendOutput('hello ');
    const events = session.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(SESSION_EVENT_TYPES.OUTPUT_APPENDED);
  });

  it('accumulates multiple chunks in output array', () => {
    const session = makeSession();
    session.appendOutput('foo');
    session.appendOutput('bar');
    session.appendOutput('baz');
    expect(session.output).toEqual(['foo', 'bar', 'baz']);
  });
});

// ─── 4. SessionAggregate.complete() ──────────────────────────────────────────

describe('SessionAggregate.complete()', () => {
  function makeSession() {
    return unwrap(SessionAggregate.create({
      id: 'sess-003',
      projectId: 'proj-abc',
      title: 'Complete test',
    }));
  }

  it('raises a SessionCompletedEvent and sets status to completed', () => {
    const session = makeSession();
    session.clearEvents();
    const result = session.complete();
    expect(result.ok).toBe(true);
    expect(session.status).toBe('completed');
    const events = session.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(SESSION_EVENT_TYPES.SESSION_COMPLETED);
  });

  it('returns Err if complete() is called on an already-completed session', () => {
    const session = makeSession();
    session.complete();
    const result = session.complete();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/terminal/i);
  });
});

// ─── 5. InMemorySessionRepository ────────────────────────────────────────────

describe('InMemorySessionRepository', () => {
  it('save + getSession round-trips correctly', async () => {
    const repo = new InMemorySessionRepository();
    const session = unwrap(SessionAggregate.create({
      id: 'sess-100',
      projectId: 'proj-xyz',
      title: 'Round-trip test',
    }));

    await repo.saveSession(session);
    const retrieved = await repo.getSession(unwrap(toSessionId('sess-100')));

    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe(unwrap(toSessionId('sess-100')));
    expect(retrieved?.title).toBe('Round-trip test');
  });

  it('listSessionsByProject filters sessions by projectId', async () => {
    const repo = new InMemorySessionRepository();

    const sessionA = unwrap(SessionAggregate.create({
      id: 'sess-A',
      projectId: 'proj-1',
      title: 'Session A',
    }));
    const sessionB = unwrap(SessionAggregate.create({
      id: 'sess-B',
      projectId: 'proj-2',
      title: 'Session B',
    }));
    const sessionC = unwrap(SessionAggregate.create({
      id: 'sess-C',
      projectId: 'proj-1',
      title: 'Session C',
    }));

    await repo.saveSession(sessionA);
    await repo.saveSession(sessionB);
    await repo.saveSession(sessionC);

    const proj1Sessions = await repo.listSessionsByProject(unwrap(toProjectId('proj-1')));
    expect(proj1Sessions).toHaveLength(2);
    const ids = proj1Sessions.map(s => s.id);
    expect(ids).toContain(unwrap(toSessionId('sess-A')));
    expect(ids).toContain(unwrap(toSessionId('sess-C')));
  });
});
