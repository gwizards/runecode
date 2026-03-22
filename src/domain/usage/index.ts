/**
 * Usage bounded context — Public barrel.
 *
 * Import everything the outside world needs from this single entry point.
 * Do not import internal modules directly from outside this directory.
 */

// ── Branded types & guards ─────────────────────────────────────────────────
export type { LedgerId, SessionId, ProjectId } from './types';
export { toLedgerId, toSessionId, toProjectId } from './types';

// ── Value objects & factories ──────────────────────────────────────────────
export type { UsageRecord, RawUsageRecord } from './types';
export { makeUsageRecord } from './types';

// ── Read model ─────────────────────────────────────────────────────────────
export type { UsageSummary } from './types';

// ── Snapshot ───────────────────────────────────────────────────────────────
export type { RawLedger } from './types';

// ── Aggregate ──────────────────────────────────────────────────────────────
export { UsageLedger } from './types';

// ── Events ─────────────────────────────────────────────────────────────────
export type {
  UsageEventType,
  UsageLedgerOpenedEvent,
  UsageRecordAddedEvent,
  UsageLedgerSealedEvent,
} from './events';
export {
  USAGE_EVENT_TYPES,
  makeUsageLedgerOpened,
  makeUsageRecordAdded,
  makeUsageLedgerSealed,
} from './events';

// ── Repository ─────────────────────────────────────────────────────────────
export type { IUsageLedgerRepository } from './repository';
export { InMemoryUsageLedgerRepository } from './repository';

// ── Application service ────────────────────────────────────────────────────
export { UsageApplicationService } from './service';

// ── Zustand store ──────────────────────────────────────────────────────────
export { useUsageDomainStore } from './store';
