/**
 * Session bounded context — public barrel.
 *
 * Import everything session-related from this file.
 * Do NOT import directly from sub-modules outside this context.
 */

// Types and aggregate
export {
  toSessionId,
  toProjectId,
  emptyTokenUsage,
  addTokenUsage,
  SessionAggregate,
} from './types';
export type { SessionId, ProjectId, TokenUsage, RawTokenUsage, RawSession, SessionStatus } from './types';

// Events
export {
  SESSION_EVENT_TYPES,
  makeSessionCreated,
  makeOutputAppended,
  makeSessionCompleted,
  makeSessionFailed,
  makeTokenUsageUpdated,
} from './events';
export type {
  SessionEventType,
  SessionCreatedEvent,
  OutputAppendedEvent,
  SessionCompletedEvent,
  SessionFailedEvent,
  TokenUsageUpdatedEvent,
} from './events';

// Repository
export { InMemorySessionRepository } from './repository';
export type { ISessionRepository } from './repository';

// Application service
export { SessionApplicationService } from './service';

// Zustand store
export { useSessionStore } from './store';
export type { SessionStoreState } from './store';
