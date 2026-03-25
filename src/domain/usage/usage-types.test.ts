/**
 * Usage bounded context — Value Object and pure function tests.
 *
 * Focuses on gaps not covered by usage.test.ts:
 *   - LedgerId value object (valid/invalid/equality/fromTrusted)
 *   - makeUsageRecord() validation and micro-dollar conversion
 *   - UsageLedger.toSnapshot() round-trip fidelity
 *   - UsageLedger.open() validation edge cases
 *   - Defensive copy on records accessor
 */

import { describe, it, expect } from 'vitest';
import {
  LedgerId,
  makeUsageRecord,
  UsageLedger,
  unsafeLedgerId,
} from './types';
import type { RawUsageRecord } from './types';
import { UserId } from '../shared/user-id';
import { unwrap } from '../shared/result';

// ─── LedgerId ────────────────────────────────────────────────────────────────

describe('LedgerId', () => {
  it('creates from a valid non-empty string', () => {
    const r = LedgerId.create('ledger-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('ledger-001');
  });

  it('trims whitespace', () => {
    const r = LedgerId.create('  ledger-002  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('ledger-002');
  });

  it('returns Err for empty string', () => {
    const r = LedgerId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = LedgerId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('generate() produces unique values', () => {
    const a = LedgerId.generate();
    const b = LedgerId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(LedgerId.create('same'));
    const b = unwrap(LedgerId.create('same'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(LedgerId.create('one'));
    const b = unwrap(LedgerId.create('two'));
    expect(a.equals(b)).toBe(false);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(LedgerId.create('hello'));
    expect(id.toString()).toBe('hello');
  });

  it('fromTrusted() bypasses validation', () => {
    const id = LedgerId.fromTrusted('trusted-id');
    expect(id.value).toBe('trusted-id');
  });
});

// ─── unsafeLedgerId ──────────────────────────────────────────────────────────

describe('unsafeLedgerId', () => {
  it('creates a LedgerId without validation', () => {
    const id = unsafeLedgerId('unsafe-value');
    expect(id.value).toBe('unsafe-value');
  });
});

// ─── makeUsageRecord ─────────────────────────────────────────────────────────

describe('makeUsageRecord()', () => {
  const validRaw: RawUsageRecord = {
    model: 'claude-3-5-sonnet',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
  };

  it('creates a valid record with required fields only', () => {
    const r = makeUsageRecord(validRaw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.model).toBe('claude-3-5-sonnet');
    expect(r.value.inputTokens).toBe(100);
    expect(r.value.outputTokens).toBe(50);
  });

  it('converts costUsd to integer micro-dollars', () => {
    const r = makeUsageRecord({ ...validRaw, costUsd: 0.123456 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costMicroUsd).toBe(123456);
    // Display costUsd should be derived from micro-dollars
    expect(r.value.costUsd).toBeCloseTo(0.123456);
  });

  it('rounds micro-dollars to nearest integer', () => {
    // 0.0000005 USD = 0.5 micro-USD, should round to 1
    const r = makeUsageRecord({ ...validRaw, costUsd: 0.0000005 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costMicroUsd).toBe(1);
  });

  it('handles zero cost', () => {
    const r = makeUsageRecord({ ...validRaw, costUsd: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.costMicroUsd).toBe(0);
    expect(r.value.costUsd).toBe(0);
  });

  it('defaults cacheCreationTokens to 0', () => {
    const r = makeUsageRecord(validRaw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cacheCreationTokens).toBe(0);
  });

  it('defaults cacheReadTokens to 0', () => {
    const r = makeUsageRecord(validRaw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.cacheReadTokens).toBe(0);
  });

  it('accepts explicit cache token counts', () => {
    const r = makeUsageRecord({ ...validRaw, cacheCreationTokens: 42, cacheReadTokens: 99 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.cacheCreationTokens).toBe(42);
    expect(r.value.cacheReadTokens).toBe(99);
  });

  it('uses provided recordedAt timestamp', () => {
    const ts = 1700000000000;
    const r = makeUsageRecord({ ...validRaw, recordedAt: ts });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.recordedAt).toBe(ts);
  });

  it('generates recordedAt when not provided', () => {
    const before = Date.now();
    const r = makeUsageRecord(validRaw);
    const after = Date.now();
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.recordedAt).toBeGreaterThanOrEqual(before);
      expect(r.value.recordedAt).toBeLessThanOrEqual(after);
    }
  });

  it('trims model name whitespace', () => {
    const r = makeUsageRecord({ ...validRaw, model: '  gpt-4  ' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.model).toBe('gpt-4');
  });

  // --- Validation errors ---

  it('returns Err for empty model', () => {
    const r = makeUsageRecord({ ...validRaw, model: '' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('model');
  });

  it('returns Err for whitespace-only model', () => {
    const r = makeUsageRecord({ ...validRaw, model: '   ' });
    expect(r.ok).toBe(false);
  });

  it('returns Err for negative inputTokens', () => {
    const r = makeUsageRecord({ ...validRaw, inputTokens: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('inputTokens');
  });

  it('returns Err for negative outputTokens', () => {
    const r = makeUsageRecord({ ...validRaw, outputTokens: -5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('outputTokens');
  });

  it('returns Err for negative costUsd', () => {
    const r = makeUsageRecord({ ...validRaw, costUsd: -0.01 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('costUsd');
  });

  it('returns Err for negative cacheCreationTokens', () => {
    const r = makeUsageRecord({ ...validRaw, cacheCreationTokens: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cacheCreationTokens');
  });

  it('returns Err for negative cacheReadTokens', () => {
    const r = makeUsageRecord({ ...validRaw, cacheReadTokens: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('cacheReadTokens');
  });

  it('accepts zero tokens', () => {
    const r = makeUsageRecord({ ...validRaw, inputTokens: 0, outputTokens: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.inputTokens).toBe(0);
    expect(r.value.outputTokens).toBe(0);
  });
});

// ─── UsageLedger.open() validation ───────────────────────────────────────────

describe('UsageLedger.open() validation', () => {
  const userId = unwrap(UserId.create('test-user'));

  it('returns Err for empty sessionId', () => {
    const r = UsageLedger.open({ id: 'l-1', sessionId: '', projectId: 'p-1', userId });
    expect(r.ok).toBe(false);
  });

  it('returns Err for empty projectId', () => {
    const r = UsageLedger.open({ id: 'l-1', sessionId: 's-1', projectId: '', userId });
    expect(r.ok).toBe(false);
  });

  it('returns Err for empty ledgerId', () => {
    const r = UsageLedger.open({ id: '', sessionId: 's-1', projectId: 'p-1', userId });
    expect(r.ok).toBe(false);
  });
});

// ─── UsageLedger.records defensive copy ──────────────────────────────────────

describe('UsageLedger.records defensive copy', () => {
  it('returns a different array reference each time', () => {
    const userId = unwrap(UserId.create('test-user'));
    const ledger = unwrap(UsageLedger.open({ id: 'dc-1', sessionId: 's-dc', projectId: 'p-dc', userId }));
    unwrap(ledger.addRecord({ model: 'gpt-4', inputTokens: 10, outputTokens: 5, costUsd: 0.001 }));

    const a = ledger.records;
    const b = ledger.records;
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ─── UsageLedger.toSnapshot() fidelity ───────────────────────────────────────

describe('UsageLedger.toSnapshot() fidelity', () => {
  it('includes userId in snapshot', () => {
    const userId = unwrap(UserId.create('snapshot-user'));
    const ledger = unwrap(UsageLedger.open({ id: 'sf-1', sessionId: 's-sf', projectId: 'p-sf', userId }));
    const snap = ledger.toSnapshot();

    expect(snap.userId).toBe('snapshot-user');
    expect(snap.id).toBe('sf-1');
    expect(snap.sessionId).toBe('s-sf');
    expect(snap.projectId).toBe('p-sf');
    expect(snap.sealed).toBe(false);
    expect(snap.sealedAt).toBeNull();
    expect(snap.records).toHaveLength(0);
  });

  it('records in snapshot are a copy', () => {
    const userId = unwrap(UserId.create('snap-copy-user'));
    const ledger = unwrap(UsageLedger.open({ id: 'sf-2', sessionId: 's-sf2', projectId: 'p-sf2', userId }));
    unwrap(ledger.addRecord({ model: 'gpt-4', inputTokens: 10, outputTokens: 5, costUsd: 0.001 }));

    const snap1 = ledger.toSnapshot();
    const snap2 = ledger.toSnapshot();
    expect(snap1.records).not.toBe(snap2.records);
    expect(snap1.records).toEqual(snap2.records);
  });
});

// ─── Micro-dollar accumulation precision ─────────────────────────────────────

describe('Micro-dollar accumulation avoids float drift', () => {
  it('accumulates many small costs without IEEE-754 drift', () => {
    const userId = unwrap(UserId.create('precision-user'));
    const ledger = unwrap(UsageLedger.open({ id: 'prec-1', sessionId: 's-prec', projectId: 'p-prec', userId }));

    // Add 1000 records each costing $0.001
    for (let i = 0; i < 1000; i++) {
      unwrap(ledger.addRecord({ model: 'model', inputTokens: 1, outputTokens: 1, costUsd: 0.001 }));
    }

    const summary = ledger.summary();
    // With float accumulation, 1000 * 0.001 can drift. Integer micro-dollars should be exact.
    expect(summary.totalCostUsd).toBe(1.0);
    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(1000);
    expect(summary.recordCount).toBe(1000);
  });
});
