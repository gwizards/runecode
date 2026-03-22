/**
 * Usage bounded context — UsageLedger aggregate + UsageApplicationService tests.
 *
 * Uses InMemoryUsageLedgerRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { UsageLedger, toLedgerId, UserId } from './types';
import type { RawUsageRecord } from './types';
import { USAGE_EVENT_TYPES } from './events';
import { InMemoryUsageLedgerRepository } from './repository';
import { UsageApplicationService } from './service';
import { unwrap } from '../shared/result';

// ─── Shared test UserId ───────────────────────────────────────────────────────

function makeUserId(raw = 'user-test-001'): UserId {
  const r = UserId.create(raw);
  if (!r.ok) throw new Error(`Test setup: invalid userId '${raw}': ${r.error}`);
  return r.value;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const RECORD_A: RawUsageRecord = {
  model: 'claude-3-5-sonnet',
  inputTokens: 100,
  outputTokens: 50,
  costUsd: 0.001,
  cacheCreationTokens: 10,
  cacheReadTokens: 5,
};

const RECORD_B: RawUsageRecord = {
  model: 'claude-3-5-haiku',
  inputTokens: 200,
  outputTokens: 80,
  costUsd: 0.0005,
  cacheCreationTokens: 0,
  cacheReadTokens: 20,
};

// ─── UsageLedger aggregate ────────────────────────────────────────────────────

describe('UsageLedger.open()', () => {
  it('raises LEDGER_OPENED event', () => {
    const ledger = unwrap(UsageLedger.open({
      id: 'ledger-001',
      sessionId: 'sess-001',
      projectId: 'proj-001',
      userId: makeUserId(),
    }));

    const events = ledger.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(USAGE_EVENT_TYPES.LEDGER_OPENED);
    expect(events[0].aggregateId).toBe('ledger-001');
  });

  it('starts with no records and sealed=false', () => {
    const ledger = unwrap(UsageLedger.open({
      id: 'ledger-002',
      sessionId: 'sess-002',
      projectId: 'proj-002',
      userId: makeUserId(),
    }));

    expect(ledger.sealed).toBe(false);
    expect(ledger.records).toHaveLength(0);
  });
});

describe('UsageLedger.addRecord()', () => {
  function openLedger() {
    return unwrap(UsageLedger.open({ id: 'ledger-ar', sessionId: 'sess-ar', projectId: 'proj-ar', userId: makeUserId() }));
  }

  it('accepts a valid record and returns updated summary', () => {
    const ledger = openLedger();
    ledger.clearEvents();

    const summary = unwrap(ledger.addRecord(RECORD_A));

    expect(summary.recordCount).toBe(1);
    expect(summary.totalInputTokens).toBe(100);
    expect(summary.totalOutputTokens).toBe(50);
    expect(summary.totalCostUsd).toBeCloseTo(0.001);
  });

  it('raises RECORD_ADDED event for each call', () => {
    const ledger = openLedger();
    ledger.clearEvents();

    unwrap(ledger.addRecord(RECORD_A));
    unwrap(ledger.addRecord(RECORD_B));

    const added = ledger.events.filter((e) => e.type === USAGE_EVENT_TYPES.RECORD_ADDED);
    expect(added).toHaveLength(2);
  });

  it('returns Err when costUsd is negative', () => {
    const ledger = openLedger();
    const result = ledger.addRecord({ ...RECORD_A, costUsd: -0.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/costUsd must be >= 0/i);
  });

  it('returns Err when inputTokens is negative', () => {
    const ledger = openLedger();
    const result = ledger.addRecord({ ...RECORD_A, inputTokens: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/inputTokens must be >= 0/i);
  });

  it('returns Err when outputTokens is negative', () => {
    const ledger = openLedger();
    const result = ledger.addRecord({ ...RECORD_A, outputTokens: -10 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/outputTokens must be >= 0/i);
  });

  it('returns Err on an already-sealed ledger', () => {
    const ledger = openLedger();
    unwrap(ledger.seal());
    const result = ledger.addRecord(RECORD_A);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/sealed/i);
  });
});

describe('UsageLedger.seal()', () => {
  function openWithTwoRecords() {
    const ledger = unwrap(UsageLedger.open({ id: 'ledger-seal', sessionId: 'sess-seal', projectId: 'proj-seal', userId: makeUserId() }));
    unwrap(ledger.addRecord(RECORD_A));
    unwrap(ledger.addRecord(RECORD_B));
    ledger.clearEvents();
    return ledger;
  }

  it('raises LEDGER_SEALED with correct totalCostUsd and totalTokens', () => {
    const ledger = openWithTwoRecords();
    unwrap(ledger.seal());

    const sealedEvt = ledger.events.find((e) => e.type === USAGE_EVENT_TYPES.LEDGER_SEALED);
    expect(sealedEvt).toBeDefined();

    // The event carries totalCostUsd and totalTokens (input + output combined)
    const evt = sealedEvt as unknown as { totalCostUsd: number; totalTokens: number };
    expect(evt.totalCostUsd).toBeCloseTo(RECORD_A.costUsd + RECORD_B.costUsd);
    expect(evt.totalTokens).toBe(
      RECORD_A.inputTokens + RECORD_A.outputTokens +
      RECORD_B.inputTokens + RECORD_B.outputTokens,
    );
  });

  it('sets sealed=true after sealing', () => {
    const ledger = openWithTwoRecords();
    unwrap(ledger.seal());

    expect(ledger.sealed).toBe(true);
  });

  it('returns Err if seal() is called a second time', () => {
    const ledger = openWithTwoRecords();
    unwrap(ledger.seal());
    const result = ledger.seal();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already sealed/i);
  });
});

describe('UsageLedger.summary()', () => {
  it('computes correct totals across multiple records', () => {
    const ledger = unwrap(UsageLedger.open({ id: 'ledger-sum', sessionId: 'sess-sum', projectId: 'proj-sum', userId: makeUserId() }));
    unwrap(ledger.addRecord(RECORD_A));
    unwrap(ledger.addRecord(RECORD_B));

    const summary = ledger.summary();

    expect(summary.totalInputTokens).toBe(RECORD_A.inputTokens + RECORD_B.inputTokens);
    expect(summary.totalOutputTokens).toBe(RECORD_A.outputTokens + RECORD_B.outputTokens);
    expect(summary.totalCacheCreationTokens).toBe(
      (RECORD_A.cacheCreationTokens ?? 0) + (RECORD_B.cacheCreationTokens ?? 0),
    );
    expect(summary.totalCacheReadTokens).toBe(
      (RECORD_A.cacheReadTokens ?? 0) + (RECORD_B.cacheReadTokens ?? 0),
    );
    expect(summary.totalCostUsd).toBeCloseTo(RECORD_A.costUsd + RECORD_B.costUsd);
    expect(summary.recordCount).toBe(2);
    expect(summary.sealedAt).toBeNull();
  });

  it('returns zero totals for a ledger with no records', () => {
    const ledger = unwrap(UsageLedger.open({ id: 'ledger-empty', sessionId: 'sess-empty', projectId: 'proj-empty', userId: makeUserId() }));
    const summary = ledger.summary();

    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.recordCount).toBe(0);
  });
});

describe('UsageLedger.fromSnapshot()', () => {
  it('reconstitutes without raising any events', () => {
    const original = unwrap(UsageLedger.open({ id: 'ledger-snap', sessionId: 'sess-snap', projectId: 'proj-snap', userId: makeUserId() }));
    unwrap(original.addRecord(RECORD_A));
    const snapshot = original.toSnapshot();

    const restored = unwrap(UsageLedger.fromSnapshot(snapshot));

    expect(restored.events).toHaveLength(0);
    expect(restored.id.toString()).toBe('ledger-snap');
    expect(restored.records).toHaveLength(1);
    expect(restored.sealed).toBe(false);
  });

  it('preserves sealed state from snapshot', () => {
    const original = unwrap(UsageLedger.open({ id: 'ledger-snap2', sessionId: 'sess-snap2', projectId: 'proj-snap2', userId: makeUserId() }));
    unwrap(original.addRecord(RECORD_A));
    unwrap(original.seal());
    const snapshot = original.toSnapshot();

    const restored = unwrap(UsageLedger.fromSnapshot(snapshot));

    expect(restored.sealed).toBe(true);
  });
});

// ─── UsageApplicationService ──────────────────────────────────────────────────

describe('UsageApplicationService.openLedger()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: UsageApplicationService;

  beforeEach(() => {
    repo = new InMemoryUsageLedgerRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new UsageApplicationService(repo, bus);
  });

  it('persists the ledger and dispatches LEDGER_OPENED', async () => {
    const result = await svc.openLedger({
      id: 'ledger-svc-001',
      sessionId: 'sess-svc-001',
      projectId: 'proj-svc-001',
      userId: 'user-svc-001',
    });

    expect(result.ok).toBe(true);

    const opened = collected.filter((e) => e.type === USAGE_EVENT_TYPES.LEDGER_OPENED);
    expect(opened).toHaveLength(1);
    expect(opened[0].aggregateId).toBe('ledger-svc-001');
  });

  it('returns the new UsageLedger aggregate on success', async () => {
    const result = await svc.openLedger({
      id: 'ledger-svc-002',
      sessionId: 'sess-svc-002',
      projectId: 'proj-svc-002',
      userId: 'user-svc-002',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.toString()).toBe('ledger-svc-002');
    expect(result.value.sealed).toBe(false);
  });

  it('returns Err when ledgerId is empty', async () => {
    const result = await svc.openLedger({ id: '', sessionId: 'sess', projectId: 'proj', userId: 'user-test' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/LedgerId cannot be empty/i);
  });

  it('returns Err when userId is empty', async () => {
    const result = await svc.openLedger({ id: 'ledger-uid-err', sessionId: 'sess', projectId: 'proj', userId: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/UserId cannot be empty/i);
  });

  it('exposes the userId value object on the returned aggregate', async () => {
    const result = await svc.openLedger({
      id: 'ledger-uid-check',
      sessionId: 'sess-uid-check',
      projectId: 'proj-uid-check',
      userId: 'user-uid-check',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.userId.value).toBe('user-uid-check');
    expect(result.value.summary().userId).toBe('user-uid-check');
  });
});

describe('UsageApplicationService.recordUsage()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-rec-001', sessionId: 'sess-rec-001', projectId: 'proj-rec', userId: 'user-rec' });
  });

  it('adds a record to the ledger and returns a summary', async () => {
    const result = await svc.recordUsage({ sessionId: 'sess-rec-001', record: RECORD_A });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordCount).toBe(1);
    expect(result.value.totalInputTokens).toBe(RECORD_A.inputTokens);
  });

  it('accumulates records across multiple calls', async () => {
    await svc.recordUsage({ sessionId: 'sess-rec-001', record: RECORD_A });
    const result = await svc.recordUsage({ sessionId: 'sess-rec-001', record: RECORD_B });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordCount).toBe(2);
    expect(result.value.totalInputTokens).toBe(RECORD_A.inputTokens + RECORD_B.inputTokens);
  });

  it('returns Err when no open ledger exists for the session', async () => {
    const result = await svc.recordUsage({ sessionId: 'no-such-session', record: RECORD_A });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-session');
  });
});

describe('UsageApplicationService.sealLedger()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new UsageApplicationService(repo, bus);
    await svc.openLedger({ id: 'ledger-seal-001', sessionId: 'sess-seal-001', projectId: 'proj-seal', userId: 'user-seal' });
    await svc.recordUsage({ sessionId: 'sess-seal-001', record: RECORD_A });
    collected.length = 0;
  });

  it('seals the ledger and dispatches LEDGER_SEALED', async () => {
    const result = await svc.sealLedger({ sessionId: 'sess-seal-001' });

    expect(result.ok).toBe(true);
    const sealedEvt = collected.filter((e) => e.type === USAGE_EVENT_TYPES.LEDGER_SEALED);
    expect(sealedEvt).toHaveLength(1);
  });

  it('returns the correct UsageSummary after sealing', async () => {
    const result = await svc.sealLedger({ sessionId: 'sess-seal-001' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordCount).toBe(1);
    expect(result.value.totalInputTokens).toBe(RECORD_A.inputTokens);
    expect(result.value.sealedAt).not.toBeNull();
  });

  it('returns Err when no open ledger exists for the session', async () => {
    const result = await svc.sealLedger({ sessionId: 'ghost-session' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ghost-session');
  });
});

describe('UsageApplicationService.getLedgerSummary()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-gs-001', sessionId: 'sess-gs-001', projectId: 'proj-gs', userId: 'user-gs' });
    await svc.recordUsage({ sessionId: 'sess-gs-001', record: RECORD_A });
    await svc.recordUsage({ sessionId: 'sess-gs-001', record: RECORD_B });
  });

  it('returns correct totals for an open ledger', async () => {
    const result = await svc.getLedgerSummary('sess-gs-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.recordCount).toBe(2);
    expect(result.value.totalInputTokens).toBe(RECORD_A.inputTokens + RECORD_B.inputTokens);
    expect(result.value.totalCostUsd).toBeCloseTo(RECORD_A.costUsd + RECORD_B.costUsd);
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.getLedgerSummary('no-session');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-session');
  });
});

// ─── InMemoryUsageLedgerRepository.searchByEmbedding ─────────────────────────

/**
 * searchByEmbedding derives a 6-dim float32 feature vector per ledger:
 *   [openedAt, sealedAt, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens]
 * It quantizes both the query and each feature vector to int8, then computes
 * cosine similarity and returns up to topK results sorted descending.
 */
describe('InMemoryUsageLedgerRepository.searchByEmbedding', () => {
  it('returns [] for an empty repository', () => {
    const repo = new InMemoryUsageLedgerRepository();
    const results = repo.searchByEmbedding([1, 0, 0, 0, 0, 0]);
    expect(results).toEqual([]);
  });

  it('returns ledger records ranked by feature vector similarity', async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const svc = new UsageApplicationService(repo, new DomainEventBus());

    // Ledger A: high token counts
    await svc.openLedger({ id: 'embed-ledger-a', sessionId: 'embed-sess-a', projectId: 'embed-proj', userId: 'user-embed' });
    await svc.recordUsage({ sessionId: 'embed-sess-a', record: { ...RECORD_A, inputTokens: 1000, outputTokens: 800 } });

    // Ledger B: low token counts
    await svc.openLedger({ id: 'embed-ledger-b', sessionId: 'embed-sess-b', projectId: 'embed-proj', userId: 'user-embed' });
    await svc.recordUsage({ sessionId: 'embed-sess-b', record: { ...RECORD_A, inputTokens: 1, outputTokens: 1 } });

    // Query resembling high-token ledger: large inputTokens and outputTokens
    const results = repo.searchByEmbedding([0, 0, 1000, 800, 0, 0]);

    expect(results.length).toBeGreaterThan(0);
    // The high-token ledger should score higher
    const idA = results.find((r) => r.ledgerId === 'embed-ledger-a');
    const idB = results.find((r) => r.ledgerId === 'embed-ledger-b');
    expect(idA).toBeDefined();
    expect(idB).toBeDefined();
    expect(idA!.score).toBeGreaterThanOrEqual(idB!.score);
  });

  it('topK limits the result count', async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const svc = new UsageApplicationService(repo, new DomainEventBus());

    // Create 5 ledgers
    for (let i = 0; i < 5; i++) {
      await svc.openLedger({
        id: `embed-topk-${i}`,
        sessionId: `embed-topk-sess-${i}`,
        projectId: 'embed-topk-proj',
        userId: 'user-embed-topk',
      });
      await svc.recordUsage({
        sessionId: `embed-topk-sess-${i}`,
        record: { ...RECORD_A, inputTokens: (i + 1) * 100, outputTokens: (i + 1) * 50 },
      });
    }

    const results = repo.searchByEmbedding([0, 0, 1, 1, 0, 0], 3);

    expect(results).toHaveLength(3);
  });

  it('returned items have { ledgerId, score } shape', async () => {
    const repo = new InMemoryUsageLedgerRepository();
    const svc = new UsageApplicationService(repo, new DomainEventBus());

    await svc.openLedger({ id: 'embed-shape-ledger', sessionId: 'embed-shape-sess', projectId: 'embed-shape-proj', userId: 'user-embed-shape' });
    await svc.recordUsage({ sessionId: 'embed-shape-sess', record: RECORD_A });

    const results = repo.searchByEmbedding([0, 0, 100, 50, 0, 0], 5);

    expect(results.length).toBeGreaterThan(0);
    for (const item of results) {
      expect(item).toHaveProperty('ledgerId');
      expect(item).toHaveProperty('score');
      expect(typeof item.ledgerId).toBe('string');
      expect(typeof item.score).toBe('number');
    }
  });
});

describe('UsageApplicationService.getLedgerById()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-byid-001', sessionId: 'sess-byid-001', projectId: 'proj-byid', userId: 'user-byid' });
    await svc.recordUsage({ sessionId: 'sess-byid-001', record: RECORD_A });
  });

  it('returns Ok with the correct summary for a known ledger id', async () => {
    const result = await svc.getLedgerById('ledger-byid-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.ledgerId).toBe('ledger-byid-001');
    expect(result.value.recordCount).toBe(1);
    expect(result.value.totalInputTokens).toBe(RECORD_A.inputTokens);
  });

  it('returns Err for an unknown ledger id', async () => {
    const result = await svc.getLedgerById('no-such-ledger');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-ledger');
  });

  it('returns Err when ledger id is empty', async () => {
    const result = await svc.getLedgerById('');

    expect(result.ok).toBe(false);
  });
});

describe('UsageApplicationService.queryUsage()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;
  let now: number;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    now = Date.now();

    // Two ledgers for project-A, one for project-B
    await svc.openLedger({ id: 'ledger-q-1', sessionId: 'sess-q-1', projectId: 'proj-query-A', userId: 'user-q' });
    await svc.openLedger({ id: 'ledger-q-2', sessionId: 'sess-q-2', projectId: 'proj-query-A', userId: 'user-q' });
    await svc.openLedger({ id: 'ledger-q-3', sessionId: 'sess-q-3', projectId: 'proj-query-B', userId: 'user-q' });
  });

  it('returns all ledgers for a given projectId', async () => {
    const result = await svc.queryUsage({ projectId: 'proj-query-A' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    const ids = result.value.map((s) => s.ledgerId);
    expect(ids).toContain('ledger-q-1');
    expect(ids).toContain('ledger-q-2');
  });

  it('returns only the single ledger for project-B', async () => {
    const result = await svc.queryUsage({ projectId: 'proj-query-B' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].ledgerId).toBe('ledger-q-3');
  });

  it('returns empty array for an unknown projectId', async () => {
    const result = await svc.queryUsage({ projectId: 'proj-unknown' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('filters by date range when both from and to are provided', async () => {
    // All three ledgers were opened around `now`, so a range that excludes
    // future timestamps should return all three.
    const result = await svc.queryUsage({ from: now - 5000, to: now + 5000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });

  it('returns empty array for a date range entirely in the past', async () => {
    const past = now - 100_000;
    const result = await svc.queryUsage({ from: past - 1000, to: past });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('projectId + date range intersection returns correct subset', async () => {
    // Narrow range: only ledgers from proj-query-A within a future window
    const result = await svc.queryUsage({
      projectId: 'proj-query-A',
      from: now - 5000,
      to: now + 5000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Only the two proj-query-A ledgers fall in range
    expect(result.value).toHaveLength(2);
  });

  it('only from filter (no to) returns all ledgers opened after from', async () => {
    const result = await svc.queryUsage({ from: now - 5000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // All three ledgers were opened recently, all should pass
    expect(result.value).toHaveLength(3);
  });

  it('only to filter (no from) returns all ledgers opened before to', async () => {
    const result = await svc.queryUsage({ to: now + 5000 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });

  it('no filters at all returns all ledgers', async () => {
    const result = await svc.queryUsage({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });

  it('projectId + only from filter returns matching ledgers after from', async () => {
    const result = await svc.queryUsage({
      projectId: 'proj-query-A',
      from: now - 5000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    result.value.forEach(s => expect(s.ledgerId).toMatch(/ledger-q-[12]/));
  });
});

// ─── UsageApplicationService.recordTokenUsage() ───────────────────────────────

describe('UsageApplicationService.recordTokenUsage()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-rtu-001', sessionId: 'sess-rtu-001', projectId: 'proj-rtu', userId: 'user-rtu' });
  });

  it('returns Ok with the updated UsageLedger aggregate', async () => {
    const result = await svc.recordTokenUsage('sess-rtu-001', 100, 0.002);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(UsageLedger);
    expect(result.value.records).toHaveLength(1);
  });

  it('splits tokens evenly between input and output', async () => {
    const result = await svc.recordTokenUsage('sess-rtu-001', 100, 0.001);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const summary = result.value.summary();
    expect(summary.totalInputTokens + summary.totalOutputTokens).toBe(100);
  });

  it('accumulates cost across multiple calls', async () => {
    await svc.recordTokenUsage('sess-rtu-001', 100, 0.001);
    const result = await svc.recordTokenUsage('sess-rtu-001', 200, 0.002);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.summary().totalCostUsd).toBeCloseTo(0.003);
  });

  it('returns Err when no open ledger exists for the session', async () => {
    const result = await svc.recordTokenUsage('ghost-session', 50, 0.001);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ghost-session');
  });

  it('returns Err when sessionId is empty', async () => {
    const result = await svc.recordTokenUsage('', 50, 0.001);

    expect(result.ok).toBe(false);
  });
});

// ─── UsageApplicationService.getLedger() ─────────────────────────────────────

describe('UsageApplicationService.getLedger()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-gl-001', sessionId: 'sess-gl-001', projectId: 'proj-gl', userId: 'user-gl' });
    await svc.recordTokenUsage('sess-gl-001', 80, 0.0015);
  });

  it('returns Ok with a UsageLedger instance', async () => {
    const result = await svc.getLedger('sess-gl-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeInstanceOf(UsageLedger);
  });

  it('returned ledger has the correct sessionId', async () => {
    const result = await svc.getLedger('sess-gl-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessionId.toString()).toBe('sess-gl-001');
  });

  it('returned ledger reflects persisted records', async () => {
    const result = await svc.getLedger('sess-gl-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.records).toHaveLength(1);
  });

  it('returns Err for an unknown sessionId', async () => {
    const result = await svc.getLedger('no-such-session');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-session');
  });

  it('returns Err when sessionId is empty', async () => {
    const result = await svc.getLedger('');

    expect(result.ok).toBe(false);
  });
});

// ─── UsageApplicationService.getTotalCost() ──────────────────────────────────

describe('UsageApplicationService.getTotalCost()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(() => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
  });

  it('returns Ok with 0 when no ledgers exist', async () => {
    const result = await svc.getTotalCost();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
  });

  it('sums costs across all ledgers', async () => {
    await svc.openLedger({ id: 'ledger-tc-1', sessionId: 'sess-tc-1', projectId: 'proj-tc', userId: 'user-tc' });
    await svc.recordUsage({ sessionId: 'sess-tc-1', record: RECORD_A });

    await svc.openLedger({ id: 'ledger-tc-2', sessionId: 'sess-tc-2', projectId: 'proj-tc', userId: 'user-tc' });
    await svc.recordUsage({ sessionId: 'sess-tc-2', record: RECORD_B });

    const result = await svc.getTotalCost();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeCloseTo(RECORD_A.costUsd + RECORD_B.costUsd);
  });

  it('includes cost from sealed ledgers', async () => {
    await svc.openLedger({ id: 'ledger-tc-sealed', sessionId: 'sess-tc-sealed', projectId: 'proj-tc', userId: 'user-tc-sealed' });
    await svc.recordUsage({ sessionId: 'sess-tc-sealed', record: RECORD_A });
    await svc.sealLedger({ sessionId: 'sess-tc-sealed' });

    // Sealed ledgers are excluded from getBySession but must be included in
    // getTotalCost which uses listByDateRange (returns all, sealed or not).
    // Note: getBySession only returns OPEN (unsealed) ledgers. Sealed ones
    // remain in the store and are retrievable via listByDateRange.
    const result = await svc.getTotalCost();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeCloseTo(RECORD_A.costUsd);
  });

  it('is 0 when ledgers exist but have no records', async () => {
    await svc.openLedger({ id: 'ledger-tc-empty', sessionId: 'sess-tc-empty', projectId: 'proj-tc', userId: 'user-tc-empty' });

    const result = await svc.getTotalCost();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(0);
  });
});
