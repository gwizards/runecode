/**
 * Session bounded context — SessionApplicationService tests.
 *
 * Uses InMemorySessionRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { SessionApplicationService } from './service';
import { InMemorySessionRepository } from './repository';
import { SESSION_EVENT_TYPES } from './events';
import { toSessionId, toProjectId, TokenUsage, SessionIdVO } from './types';
import { unwrap } from '../shared/result';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCollectingBus(): { bus: DomainEventBus; collected: DomainEvent[] } {
  const bus = new DomainEventBus();
  const collected: DomainEvent[] = [];
  // Capture every event type by subscribing with a wildcard approach:
  // we wrap dispatch so we can record all events.
  const originalDispatch = bus.dispatch.bind(bus);
  bus.dispatch = (events: ReadonlyArray<DomainEvent>) => {
    collected.push(...events);
    originalDispatch(events);
  };
  return { bus, collected };
}

function makeService(
  repo: InMemorySessionRepository,
  bus: DomainEventBus,
): SessionApplicationService {
  return new SessionApplicationService(repo, bus);
}

// ─── createSession ────────────────────────────────────────────────────────────

describe('SessionApplicationService.createSession()', () => {
  let repo: InMemorySessionRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: SessionApplicationService;

  beforeEach(() => {
    repo = new InMemorySessionRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = makeService(repo, bus);
  });

  it('happy path — returns Ok with the new aggregate', async () => {
    const result = await svc.createSession({
      id: 'sess-svc-001',
      projectId: 'proj-svc-001',
      title: 'Service test session',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(unwrap(toSessionId('sess-svc-001')));
    expect(result.value.projectId).toBe(unwrap(toProjectId('proj-svc-001')));
    expect(result.value.title).toBe('Service test session');
    expect(result.value.status).toBe('idle');
  });

  it('dispatches a SessionCreatedEvent', async () => {
    await svc.createSession({
      id: 'sess-svc-002',
      projectId: 'proj-svc-001',
      title: 'Event test',
    });

    const created = collected.filter(
      (e) => e.type === SESSION_EVENT_TYPES.SESSION_CREATED,
    );
    expect(created).toHaveLength(1);
    expect(created[0].aggregateId).toBe('sess-svc-002');
  });

  it('clears events on the returned aggregate after dispatch', async () => {
    const result = await svc.createSession({
      id: 'sess-svc-003',
      projectId: 'proj-svc-001',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.events).toHaveLength(0);
  });

  it('persists the session so getSession can retrieve it', async () => {
    await svc.createSession({
      id: 'sess-svc-004',
      projectId: 'proj-svc-001',
      title: 'Persist test',
    });

    const getResult = await svc.getSession('sess-svc-004');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.title).toBe('Persist test');
  });

  it('returns Err when id is empty (invalid id)', async () => {
    const result = await svc.createSession({
      id: '',
      projectId: 'proj-svc-001',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/SessionId cannot be empty/i);
  });

  it('returns Err when projectId is empty', async () => {
    const result = await svc.createSession({
      id: 'sess-svc-bad',
      projectId: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/ProjectId cannot be empty/i);
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe('SessionApplicationService.getSession()', () => {
  let repo: InMemorySessionRepository;
  let svc: SessionApplicationService;

  beforeEach(() => {
    repo = new InMemorySessionRepository();
    svc = makeService(repo, new DomainEventBus());
  });

  it('returns Err for an unknown id', async () => {
    const result = await svc.getSession('does-not-exist');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('does-not-exist');
  });

  it('returns Ok for a session that was just created', async () => {
    await svc.createSession({ id: 'sess-get-001', projectId: 'proj-get' });
    const result = await svc.getSession('sess-get-001');

    expect(result.ok).toBe(true);
  });
});

// ─── appendOutput ─────────────────────────────────────────────────────────────

describe('SessionApplicationService.appendOutput()', () => {
  let repo: InMemorySessionRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = makeService(repo, bus);
    await svc.createSession({ id: 'sess-out-001', projectId: 'proj-out' });
    collected.length = 0; // reset after create
  });

  it('appends a chunk and returns Ok', async () => {
    const result = await svc.appendOutput('sess-out-001', 'hello world');

    expect(result.ok).toBe(true);
  });

  it('dispatches an OutputAppendedEvent', async () => {
    await svc.appendOutput('sess-out-001', 'chunk-data');

    const appended = collected.filter(
      (e) => e.type === SESSION_EVENT_TYPES.OUTPUT_APPENDED,
    );
    expect(appended).toHaveLength(1);
  });

  it('multiple chunks each dispatch an OutputAppendedEvent', async () => {
    // The repository snapshot does not persist output[] (by design — it is
    // a streaming concern, not durable state). We verify the service correctly
    // dispatches one OutputAppendedEvent per appendOutput call instead.
    await svc.appendOutput('sess-out-001', 'alpha');
    await svc.appendOutput('sess-out-001', 'beta');
    await svc.appendOutput('sess-out-001', 'gamma');

    const appended = collected.filter(
      (e) => e.type === SESSION_EVENT_TYPES.OUTPUT_APPENDED,
    );
    expect(appended).toHaveLength(3);
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.appendOutput('no-such-session', 'data');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-session');
  });
});

// ─── completeSession ──────────────────────────────────────────────────────────

describe('SessionApplicationService.completeSession()', () => {
  let repo: InMemorySessionRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = makeService(repo, bus);
    await svc.createSession({ id: 'sess-cmp-001', projectId: 'proj-cmp' });
    collected.length = 0;
  });

  it('transitions status to completed and returns Ok', async () => {
    const result = await svc.completeSession('sess-cmp-001');

    expect(result.ok).toBe(true);

    const getResult = await svc.getSession('sess-cmp-001');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.status).toBe('completed');
  });

  it('dispatches a SessionCompletedEvent', async () => {
    await svc.completeSession('sess-cmp-001');

    const completed = collected.filter(
      (e) => e.type === SESSION_EVENT_TYPES.SESSION_COMPLETED,
    );
    expect(completed).toHaveLength(1);
    expect(completed[0].aggregateId).toBe('sess-cmp-001');
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.completeSession('phantom-session');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('phantom-session');
  });

  it('returns Err when called on an already-completed session', async () => {
    await svc.completeSession('sess-cmp-001');
    const result = await svc.completeSession('sess-cmp-001');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/terminal/i);
  });
});

// ─── failSession ──────────────────────────────────────────────────────────────

describe('SessionApplicationService.failSession()', () => {
  let repo: InMemorySessionRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = makeService(repo, bus);
    await svc.createSession({ id: 'sess-fail-001', projectId: 'proj-fail' });
    collected.length = 0;
  });

  it('transitions status to error and returns Ok', async () => {
    const result = await svc.failSession('sess-fail-001', 'process crashed');

    expect(result.ok).toBe(true);

    const getResult = await svc.getSession('sess-fail-001');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.status).toBe('error');
  });

  it('dispatches a SessionFailedEvent', async () => {
    await svc.failSession('sess-fail-001', 'timeout');

    const failed = collected.filter(
      (e) => e.type === SESSION_EVENT_TYPES.SESSION_FAILED,
    );
    expect(failed).toHaveLength(1);
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.failSession('ghost', 'reason');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ghost');
  });

  it('returns Err when called on an already-completed session', async () => {
    await svc.completeSession('sess-fail-001');
    const result = await svc.failSession('sess-fail-001', 'late failure');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/terminal/i);
  });
});

// ─── updateTokenUsage ─────────────────────────────────────────────────────────

describe('SessionApplicationService.updateTokenUsage()', () => {
  let repo: InMemorySessionRepository;
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    svc = makeService(repo, new DomainEventBus());
    await svc.createSession({ id: 'sess-tok-001', projectId: 'proj-tok' });
  });

  it('accumulates inputTokens across multiple calls', async () => {
    await svc.updateTokenUsage('sess-tok-001', { inputTokens: 100 });
    await svc.updateTokenUsage('sess-tok-001', { inputTokens: 250 });
    await svc.updateTokenUsage('sess-tok-001', { inputTokens: 50 });

    const result = await svc.getSession('sess-tok-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.tokenUsage.inputTokens).toBe(400);
  });

  it('accumulates all token fields independently', async () => {
    await svc.updateTokenUsage('sess-tok-001', {
      inputTokens: 10,
      outputTokens: 5,
      costUsd: 0.001,
      cacheReadTokens: 3,
      cacheCreationTokens: 2,
    });
    await svc.updateTokenUsage('sess-tok-001', {
      inputTokens: 20,
      outputTokens: 10,
      costUsd: 0.002,
      cacheReadTokens: 7,
      cacheCreationTokens: 8,
    });

    const result = await svc.getSession('sess-tok-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const usage = result.value.tokenUsage;
    expect(usage.inputTokens).toBe(30);
    expect(usage.outputTokens).toBe(15);
    expect(usage.costUsd).toBeCloseTo(0.003);
    expect(usage.cacheReadTokens).toBe(10);
    expect(usage.cacheCreationTokens).toBe(10);
  });

  it('partial update only touches provided fields', async () => {
    await svc.updateTokenUsage('sess-tok-001', { outputTokens: 42 });

    const result = await svc.getSession('sess-tok-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const usage = result.value.tokenUsage;
    expect(usage.inputTokens).toBe(0);
    expect(usage.outputTokens).toBe(42);
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.updateTokenUsage('no-such', { inputTokens: 1 });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such');
  });
});

// ─── deleteSession ────────────────────────────────────────────────────────────

describe('SessionApplicationService.deleteSession()', () => {
  let repo: InMemorySessionRepository;
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    svc = makeService(repo, new DomainEventBus());
    await svc.createSession({ id: 'sess-del-001', projectId: 'proj-del' });
  });

  it('removes the session so getSession returns Err afterwards', async () => {
    const delResult = await svc.deleteSession('sess-del-001');
    expect(delResult.ok).toBe(true);

    const getResult = await svc.getSession('sess-del-001');
    expect(getResult.ok).toBe(false);
  });

  it('is idempotent — deleting a non-existent session returns Ok', async () => {
    // The service delegates directly to repo.deleteSession which is a no-op.
    const result = await svc.deleteSession('never-existed');

    expect(result.ok).toBe(true);
  });
});

// ─── listSessions ─────────────────────────────────────────────────────────────

describe('SessionApplicationService.listSessions()', () => {
  let repo: InMemorySessionRepository;
  let svc: SessionApplicationService;

  beforeEach(async () => {
    repo = new InMemorySessionRepository();
    svc = makeService(repo, new DomainEventBus());

    await svc.createSession({ id: 'sess-list-A', projectId: 'proj-list-1' });
    await svc.createSession({ id: 'sess-list-B', projectId: 'proj-list-2' });
    await svc.createSession({ id: 'sess-list-C', projectId: 'proj-list-1' });
  });

  it('returns all sessions belonging to the given project', async () => {
    const result = await svc.listSessions('proj-list-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    const ids = result.value.map((s) => s.id);
    expect(ids).toContain(unwrap(toSessionId('sess-list-A')));
    expect(ids).toContain(unwrap(toSessionId('sess-list-C')));
  });

  it('returns only the session for a project that has one session', async () => {
    const result = await svc.listSessions('proj-list-2');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].id).toBe(unwrap(toSessionId('sess-list-B')));
  });

  it('returns an empty array for an unknown projectId', async () => {
    const result = await svc.listSessions('proj-unknown');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('returns Err when projectId is empty', async () => {
    const result = await svc.listSessions('');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/ProjectId cannot be empty/i);
  });
});

// ─── SessionIdVO — Value Object ───────────────────────────────────────────────

describe('SessionIdVO.create()', () => {
  it('returns Err for an empty string', () => {
    const result = SessionIdVO.create('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/SessionId cannot be empty/i);
  });

  it('returns Err for a whitespace-only string', () => {
    const result = SessionIdVO.create('   ');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/SessionId cannot be empty/i);
  });

  it('returns Ok for a valid id string', () => {
    const result = SessionIdVO.create('valid-session-id');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('valid-session-id');
  });

  it('trims surrounding whitespace from a valid id', () => {
    const result = SessionIdVO.create('  sess-abc  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('sess-abc');
  });
});

describe('SessionIdVO.generate()', () => {
  it('returns a SessionIdVO with a non-empty value', () => {
    const vo = SessionIdVO.generate();
    expect(vo.value).toBeTruthy();
    expect(vo.value.length).toBeGreaterThan(0);
  });

  it('generates unique values on consecutive calls', () => {
    const a = SessionIdVO.generate();
    const b = SessionIdVO.generate();
    expect(a.value).not.toBe(b.value);
  });
});

describe('SessionIdVO.equals()', () => {
  it('returns true when two VOs have the same value', () => {
    const a = SessionIdVO.create('same-id');
    const b = SessionIdVO.create('same-id');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(a.value.equals(b.value)).toBe(true);
  });

  it('returns false when two VOs have different values', () => {
    const a = SessionIdVO.create('id-one');
    const b = SessionIdVO.create('id-two');
    if (!a.ok || !b.ok) throw new Error('setup failed');
    expect(a.value.equals(b.value)).toBe(false);
  });
});

describe('SessionIdVO.toString() and toBranded()', () => {
  it('toString() returns the raw string value', () => {
    const result = SessionIdVO.create('my-session');
    if (!result.ok) throw new Error('setup failed');
    expect(result.value.toString()).toBe('my-session');
  });

  it('toBranded() returns the same string value (for legacy repo compatibility)', () => {
    const result = SessionIdVO.create('branded-test');
    if (!result.ok) throw new Error('setup failed');
    expect(result.value.toBranded()).toBe('branded-test');
  });
});

// ─── TokenUsage VO — negative validation ─────────────────────────────────────

describe('TokenUsage.create() — negative field validation', () => {
  it('returns Err when inputTokens is negative', () => {
    const result = TokenUsage.create({ inputTokens: -1 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/inputTokens cannot be negative/i);
  });

  it('returns Err when outputTokens is negative', () => {
    const result = TokenUsage.create({ outputTokens: -5 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/outputTokens cannot be negative/i);
  });

  it('returns Err when costUsd is negative', () => {
    const result = TokenUsage.create({ costUsd: -0.01 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/costUsd cannot be negative/i);
  });

  it('returns Ok for all-zero values', () => {
    const result = TokenUsage.create({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inputTokens).toBe(0);
    expect(result.value.outputTokens).toBe(0);
    expect(result.value.costUsd).toBe(0);
  });

  it('returns Ok for valid positive values and exposes them on the instance', () => {
    const result = TokenUsage.create({
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.005,
      cacheReadTokens: 10,
      cacheCreationTokens: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inputTokens).toBe(100);
    expect(result.value.outputTokens).toBe(50);
    expect(result.value.costUsd).toBeCloseTo(0.005);
    expect(result.value.cacheReadTokens).toBe(10);
    expect(result.value.cacheCreationTokens).toBe(3);
  });

  it('add() combines two TokenUsage VOs correctly', () => {
    const a = TokenUsage.create({ inputTokens: 10, outputTokens: 5 });
    const b = TokenUsage.create({ inputTokens: 20, costUsd: 0.003 });
    if (!a.ok || !b.ok) throw new Error('setup failed');
    const sum = a.value.add(b.value);
    expect(sum.inputTokens).toBe(30);
    expect(sum.outputTokens).toBe(5);
    expect(sum.costUsd).toBeCloseTo(0.003);
  });
});
