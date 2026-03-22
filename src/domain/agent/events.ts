/**
 * Agent bounded context — Domain Events.
 *
 * All events are plain objects satisfying DomainEvent.
 * Factory functions stamp occurredAt automatically.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event Type Constants ──────────────────────────────────────────────────

export const AGENT_EVENT_TYPES = {
  AGENT_STARTED:   'agent/agent.started',
  AGENT_THINKING:  'agent/agent.thinking',
  AGENT_COMPLETED: 'agent/agent.completed',
  AGENT_FAILED:    'agent/agent.failed',
} as const;

export type AgentEventType = (typeof AGENT_EVENT_TYPES)[keyof typeof AGENT_EVENT_TYPES];

export const DOMAIN_EVENT_TYPES = AGENT_EVENT_TYPES;

// ─── Typed Event Interfaces ────────────────────────────────────────────────

export interface AgentStartedEvent extends DomainEvent {
  readonly type: typeof AGENT_EVENT_TYPES.AGENT_STARTED;
  readonly agentId: string;
  readonly name: string;
}

export interface AgentThinkingEvent extends DomainEvent {
  readonly type: typeof AGENT_EVENT_TYPES.AGENT_THINKING;
  readonly agentId: string;
}

export interface AgentCompletedEvent extends DomainEvent {
  readonly type: typeof AGENT_EVENT_TYPES.AGENT_COMPLETED;
  readonly agentId: string;
  readonly tokenCount: number;
  readonly elapsedMs: number;
}

export interface AgentFailedEvent extends DomainEvent {
  readonly type: typeof AGENT_EVENT_TYPES.AGENT_FAILED;
  readonly agentId: string;
  readonly reason: string;
}

// ─── Event Factories ───────────────────────────────────────────────────────

export function makeAgentStarted(agentId: string, name: string): AgentStartedEvent {
  return {
    type: AGENT_EVENT_TYPES.AGENT_STARTED,
    aggregateId: agentId,
    occurredAt: Date.now(),
    agentId,
    name,
  };
}

export function makeAgentThinking(agentId: string): AgentThinkingEvent {
  return {
    type: AGENT_EVENT_TYPES.AGENT_THINKING,
    aggregateId: agentId,
    occurredAt: Date.now(),
    agentId,
  };
}

export function makeAgentCompleted(
  agentId: string,
  tokenCount: number,
  elapsedMs: number,
): AgentCompletedEvent {
  return {
    type: AGENT_EVENT_TYPES.AGENT_COMPLETED,
    aggregateId: agentId,
    occurredAt: Date.now(),
    agentId,
    tokenCount,
    elapsedMs,
  };
}

export function makeAgentFailed(agentId: string, reason: string): AgentFailedEvent {
  return {
    type: AGENT_EVENT_TYPES.AGENT_FAILED,
    aggregateId: agentId,
    occurredAt: Date.now(),
    agentId,
    reason,
  };
}
