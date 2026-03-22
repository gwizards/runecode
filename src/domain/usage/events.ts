/**
 * Usage bounded context — Domain Event factories.
 *
 * Each factory produces a fully-formed, immutable DomainEvent.
 * Aggregates push these into their internal event queue; application
 * services dispatch them to the bus after persistence.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event type discriminants ──────────────────────────────────────────────

export const USAGE_EVENT_TYPES = {
  LEDGER_OPENED: 'usage/ledger.opened',
  RECORD_ADDED:  'usage/record.added',
  LEDGER_SEALED: 'usage/ledger.sealed',
} as const;

export type UsageEventType = (typeof USAGE_EVENT_TYPES)[keyof typeof USAGE_EVENT_TYPES];

// ─── Event interfaces ──────────────────────────────────────────────────────

export interface UsageLedgerOpenedEvent extends DomainEvent {
  readonly type: typeof USAGE_EVENT_TYPES.LEDGER_OPENED;
  readonly ledgerId: string;
  readonly sessionId: string;
  readonly projectId: string;
}

export interface UsageRecordAddedEvent extends DomainEvent {
  readonly type: typeof USAGE_EVENT_TYPES.RECORD_ADDED;
  readonly ledgerId: string;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costUsd: number;
}

export interface UsageLedgerSealedEvent extends DomainEvent {
  readonly type: typeof USAGE_EVENT_TYPES.LEDGER_SEALED;
  readonly ledgerId: string;
  readonly totalCostUsd: number;
  readonly totalTokens: number;
}

// ─── Event factories ───────────────────────────────────────────────────────

export function makeUsageLedgerOpened(
  ledgerId: string,
  sessionId: string,
  projectId: string,
): UsageLedgerOpenedEvent {
  return {
    type: USAGE_EVENT_TYPES.LEDGER_OPENED,
    occurredAt: Date.now(),
    aggregateId: ledgerId,
    ledgerId,
    sessionId,
    projectId,
  };
}

export function makeUsageRecordAdded(
  ledgerId: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
): UsageRecordAddedEvent {
  return {
    type: USAGE_EVENT_TYPES.RECORD_ADDED,
    occurredAt: Date.now(),
    aggregateId: ledgerId,
    ledgerId,
    model,
    inputTokens,
    outputTokens,
    costUsd,
  };
}

export function makeUsageLedgerSealed(
  ledgerId: string,
  totalCostUsd: number,
  totalTokens: number,
): UsageLedgerSealedEvent {
  return {
    type: USAGE_EVENT_TYPES.LEDGER_SEALED,
    occurredAt: Date.now(),
    aggregateId: ledgerId,
    ledgerId,
    totalCostUsd,
    totalTokens,
  };
}
