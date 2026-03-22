/**
 * Usage bounded context — UsageLedger aggregate + UsageApplicationService tests.
 *
 * Uses InMemoryUsageLedgerRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { UsageLedger, toLedgerId } from './types';
import type { RawUsageRecord } from './types';
import { USAGE_EVENT_TYPES } from './events';
import { InMemoryUsageLedgerRepository } from './repository';
import { UsageApplicationService } from './service';

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
    const ledger = UsageLedger.open({
      id: 'ledger-001',
      sessionId: 'sess-001',
      projectId: 'proj-001',
    });

    const events = ledger.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(USAGE_EVENT_TYPES.LEDGER_OPENED);
    expect(events[0].aggregateId).toBe('ledger-001');
  });

  it('starts with no records and sealed=false', () => {
    const ledger = UsageLedger.open({
      id: 'ledger-002',
      sessionId: 'sess-002',
      projectId: 'proj-002',
    });

    expect(ledger.sealed).toBe(false);
    expect(ledger.records).toHaveLength(0);
  });
});

describe('UsageLedger.addRecord()', () => {
  function openLedger() {
    return UsageLedger.open({ id: 'ledger-ar', sessionId: 'sess-ar', projectId: 'proj-ar' });
  }

  it('accepts a valid record and returns updated summary', () => {
    const ledger = openLedger();
    ledger.clearEvents();

    const summary = ledger.addRecord(RECORD_A);

    expect(summary.recordCount).toBe(1);
    expect(summary.totalInputTokens).toBe(100);
    expect(summary.totalOutputTokens).toBe(50);
    expect(summary.totalCostUsd).toBeCloseTo(0.001);
  });

  it('raises RECORD_ADDED event for each call', () => {
    const ledger = openLedger();
    ledger.clearEvents();

    ledger.addRecord(RECORD_A);
    ledger.addRecord(RECORD_B);

    const added = ledger.events.filter((e) => e.type === USAGE_EVENT_TYPES.RECORD_ADDED);
    expect(added).toHaveLength(2);
  });

  it('throws when costUsd is negative', () => {
    const ledger = openLedger();

    expect(() =>
      ledger.addRecord({ ...RECORD_A, costUsd: -0.5 }),
    ).toThrow(/costUsd must be >= 0/i);
  });

  it('throws when inputTokens is negative', () => {
    const ledger = openLedger();

    expect(() =>
      ledger.addRecord({ ...RECORD_A, inputTokens: -1 }),
    ).toThrow(/inputTokens must be >= 0/i);
  });

  it('throws when outputTokens is negative', () => {
    const ledger = openLedger();

    expect(() =>
      ledger.addRecord({ ...RECORD_A, outputTokens: -10 }),
    ).toThrow(/outputTokens must be >= 0/i);
  });

  it('throws on an already-sealed ledger', () => {
    const ledger = openLedger();
    ledger.seal();

    expect(() => ledger.addRecord(RECORD_A)).toThrow(/sealed/i);
  });
});

describe('UsageLedger.seal()', () => {
  function openWithTwoRecords() {
    const ledger = UsageLedger.open({ id: 'ledger-seal', sessionId: 'sess-seal', projectId: 'proj-seal' });
    ledger.addRecord(RECORD_A);
    ledger.addRecord(RECORD_B);
    ledger.clearEvents();
    return ledger;
  }

  it('raises LEDGER_SEALED with correct totalCostUsd and totalTokens', () => {
    const ledger = openWithTwoRecords();
    ledger.seal();

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
    ledger.seal();

    expect(ledger.sealed).toBe(true);
  });

  it('throws if seal() is called a second time', () => {
    const ledger = openWithTwoRecords();
    ledger.seal();

    expect(() => ledger.seal()).toThrow(/already sealed/i);
  });
});

describe('UsageLedger.summary()', () => {
  it('computes correct totals across multiple records', () => {
    const ledger = UsageLedger.open({ id: 'ledger-sum', sessionId: 'sess-sum', projectId: 'proj-sum' });
    ledger.addRecord(RECORD_A);
    ledger.addRecord(RECORD_B);

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
    const ledger = UsageLedger.open({ id: 'ledger-empty', sessionId: 'sess-empty', projectId: 'proj-empty' });
    const summary = ledger.summary();

    expect(summary.totalInputTokens).toBe(0);
    expect(summary.totalCostUsd).toBe(0);
    expect(summary.recordCount).toBe(0);
  });
});

describe('UsageLedger.fromSnapshot()', () => {
  it('reconstitutes without raising any events', () => {
    const original = UsageLedger.open({ id: 'ledger-snap', sessionId: 'sess-snap', projectId: 'proj-snap' });
    original.addRecord(RECORD_A);
    const snapshot = original.toSnapshot();

    const restored = UsageLedger.fromSnapshot(snapshot);

    expect(restored.events).toHaveLength(0);
    expect(restored.id).toBe(toLedgerId('ledger-snap'));
    expect(restored.records).toHaveLength(1);
    expect(restored.sealed).toBe(false);
  });

  it('preserves sealed state from snapshot', () => {
    const original = UsageLedger.open({ id: 'ledger-snap2', sessionId: 'sess-snap2', projectId: 'proj-snap2' });
    original.addRecord(RECORD_A);
    original.seal();
    const snapshot = original.toSnapshot();

    const restored = UsageLedger.fromSnapshot(snapshot);

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
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(toLedgerId('ledger-svc-002'));
    expect(result.value.sealed).toBe(false);
  });

  it('returns Err when ledgerId is empty', async () => {
    const result = await svc.openLedger({ id: '', sessionId: 'sess', projectId: 'proj' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/LedgerId cannot be empty/i);
  });
});

describe('UsageApplicationService.recordUsage()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    await svc.openLedger({ id: 'ledger-rec-001', sessionId: 'sess-rec-001', projectId: 'proj-rec' });
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
    await svc.openLedger({ id: 'ledger-seal-001', sessionId: 'sess-seal-001', projectId: 'proj-seal' });
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
    await svc.openLedger({ id: 'ledger-gs-001', sessionId: 'sess-gs-001', projectId: 'proj-gs' });
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

describe('UsageApplicationService.queryUsage()', () => {
  let repo: InMemoryUsageLedgerRepository;
  let svc: UsageApplicationService;
  let now: number;

  beforeEach(async () => {
    repo = new InMemoryUsageLedgerRepository();
    svc = new UsageApplicationService(repo, new DomainEventBus());
    now = Date.now();

    // Two ledgers for project-A, one for project-B
    await svc.openLedger({ id: 'ledger-q-1', sessionId: 'sess-q-1', projectId: 'proj-query-A' });
    await svc.openLedger({ id: 'ledger-q-2', sessionId: 'sess-q-2', projectId: 'proj-query-A' });
    await svc.openLedger({ id: 'ledger-q-3', sessionId: 'sess-q-3', projectId: 'proj-query-B' });
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
});
