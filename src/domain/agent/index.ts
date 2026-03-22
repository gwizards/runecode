/**
 * Agent bounded context — Public barrel.
 *
 * Import everything the outside world needs from this single entry point.
 * Do not import internal modules directly from outside this directory.
 */

// ── Types & value objects ──────────────────────────────────────────────────
export type { AgentId, AgentStatus, RawLiveAgent } from './types';
export {
  toAgentId,
  isTerminalStatus,
  isActiveStatus,
  AgentName,
  LiveAgentAggregate,
} from './types';

// ── Events ─────────────────────────────────────────────────────────────────
export type {
  AgentEventType,
  AgentStartedEvent,
  AgentThinkingEvent,
  AgentCompletedEvent,
  AgentFailedEvent,
} from './events';
export {
  AGENT_EVENT_TYPES,
  makeAgentStarted,
  makeAgentThinking,
  makeAgentCompleted,
  makeAgentFailed,
} from './events';

// ── Repository ─────────────────────────────────────────────────────────────
export type { IAgentRepository } from './repository';
export { InMemoryAgentRepository } from './repository';

// ── Application service ────────────────────────────────────────────────────
export { AgentApplicationService } from './service';

// ── Zustand store ──────────────────────────────────────────────────────────
export { useAgentDomainStore } from './store';
