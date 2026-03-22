/**
 * Usage bounded context — Public barrel.
 *
 * Import everything the outside world needs from this single entry point.
 * Do not import internal modules directly from outside this directory.
 */

// ── Value Objects ──────────────────────────────────────────────────────────
export { LedgerId, SessionId, ProjectId } from './types';

// ── Cross-context Value Objects ────────────────────────────────────────────
export { UserId } from './types';

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

// ── Repository port (canonical import path) ────────────────────────────────
export type { IUsageRepository } from './ports';

// ── Repository (full interface + in-memory adapter) ────────────────────────
export type { IUsageLedgerRepository } from './repository';
export { InMemoryUsageLedgerRepository } from './repository';

// ── Application service ────────────────────────────────────────────────────
export { UsageApplicationService } from './service';

// ── Zustand store ──────────────────────────────────────────────────────────
export { useUsageDomainStore } from './store';

// ── Class-based Value Objects ──────────────────────────────────────────────
export { UsageAmount, ModelId } from './value-objects/usage-amount';
