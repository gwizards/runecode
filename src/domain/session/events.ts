/**
 * Session bounded context — Domain Event factories.
 *
 * Every factory returns a plain object satisfying DomainEvent plus a
 * typed `payload` field. No classes — just data.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { SessionId, ProjectId, TokenUsage } from './types';

// ─── Event type discriminators ────────────────────────────────────────────────

export const SESSION_EVENT_TYPES = {
  SESSION_CREATED: 'session/session.created',
  OUTPUT_APPENDED: 'session/output.appended',
  SESSION_COMPLETED: 'session/session.completed',
  SESSION_FAILED: 'session/session.failed',
  TOKEN_USAGE_UPDATED: 'session/token-usage.updated',
} as const;

export type SessionEventType =
  (typeof SESSION_EVENT_TYPES)[keyof typeof SESSION_EVENT_TYPES];

export const DOMAIN_EVENT_TYPES = SESSION_EVENT_TYPES;

// ─── Typed event interfaces ───────────────────────────────────────────────────

export interface SessionCreatedEvent extends DomainEvent {
  readonly type: typeof SESSION_EVENT_TYPES.SESSION_CREATED;
  readonly payload: {
    readonly sessionId: SessionId;
    readonly projectId: ProjectId;
    readonly title: string;
  };
}

export interface OutputAppendedEvent extends DomainEvent {
  readonly type: typeof SESSION_EVENT_TYPES.OUTPUT_APPENDED;
  readonly payload: {
    readonly sessionId: SessionId;
    readonly chunk: string;
  };
}

export interface SessionCompletedEvent extends DomainEvent {
  readonly type: typeof SESSION_EVENT_TYPES.SESSION_COMPLETED;
  readonly payload: {
    readonly sessionId: SessionId;
    readonly tokenUsage: TokenUsage;
  };
}

export interface SessionFailedEvent extends DomainEvent {
  readonly type: typeof SESSION_EVENT_TYPES.SESSION_FAILED;
  readonly payload: {
    readonly sessionId: SessionId;
    readonly reason: string;
  };
}

export interface TokenUsageUpdatedEvent extends DomainEvent {
  readonly type: typeof SESSION_EVENT_TYPES.TOKEN_USAGE_UPDATED;
  readonly sessionId: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheCreationTokens: number;
  readonly cacheReadTokens: number;
  readonly costUsd: number;
}

// ─── Factory functions ────────────────────────────────────────────────────────

export function makeSessionCreated(
  sessionId: SessionId,
  projectId: ProjectId,
  title: string,
): SessionCreatedEvent {
  return {
    type: SESSION_EVENT_TYPES.SESSION_CREATED,
    occurredAt: Date.now(),
    aggregateId: sessionId.toString(),
    payload: { sessionId, projectId, title },
  };
}

export function makeOutputAppended(
  sessionId: SessionId,
  chunk: string,
): OutputAppendedEvent {
  return {
    type: SESSION_EVENT_TYPES.OUTPUT_APPENDED,
    occurredAt: Date.now(),
    aggregateId: sessionId.toString(),
    payload: { sessionId, chunk },
  };
}

export function makeSessionCompleted(
  sessionId: SessionId,
  tokenUsage: TokenUsage,
): SessionCompletedEvent {
  return {
    type: SESSION_EVENT_TYPES.SESSION_COMPLETED,
    occurredAt: Date.now(),
    aggregateId: sessionId.toString(),
    payload: { sessionId, tokenUsage },
  };
}

export function makeSessionFailed(
  sessionId: SessionId,
  reason: string,
): SessionFailedEvent {
  return {
    type: SESSION_EVENT_TYPES.SESSION_FAILED,
    occurredAt: Date.now(),
    aggregateId: sessionId.toString(),
    payload: { sessionId, reason },
  };
}

export function makeTokenUsageUpdated(
  sessionId: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  },
): TokenUsageUpdatedEvent {
  return {
    type: SESSION_EVENT_TYPES.TOKEN_USAGE_UPDATED,
    occurredAt: Date.now(),
    aggregateId: sessionId,
    sessionId,
    ...usage,
  };
}
