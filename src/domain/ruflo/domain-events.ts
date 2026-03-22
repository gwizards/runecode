/**
 * RuFlo typed domain events.
 *
 * Events are raised INSIDE aggregate methods (not by stores or services).
 * Aggregates collect events internally via _events[]; application services
 * dispatch them to the global event bus after persistence.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event Type Constants ─────────────────────────────────────────────────────

export const DOMAIN_EVENT_TYPES = {
  SWARM_INITIALIZED: 'ruflo.SwarmInitialized',
  SWARM_AGENT_ADDED: 'ruflo.SwarmAgentAdded',
  SWARM_AGENT_REMOVED: 'ruflo.SwarmAgentRemoved',
  INSTALLATION_COMPLETED: 'ruflo.InstallationCompleted',
  INSTALLATION_FAILED: 'ruflo.InstallationFailed',
  MCP_ACTIVATED: 'ruflo.McpActivated',
  MEMORY_BACKEND_CHANGED: 'ruflo.MemoryBackendChanged',
  PROJECT_INITIALIZED: 'ruflo.ProjectInitialized',
} as const;

export type RuFloDomainEventType = typeof DOMAIN_EVENT_TYPES[keyof typeof DOMAIN_EVENT_TYPES];

// ─── Concrete Domain Events ────────────────────────────────────────────────────

export interface SwarmInitializedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.SWARM_INITIALIZED;
  readonly topology: string;
  readonly agentCount: number;
  readonly maxAgents: number;
}

export interface SwarmAgentAddedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.SWARM_AGENT_ADDED;
  readonly agentId: string;
  readonly agentType: string;
}

export interface SwarmAgentRemovedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.SWARM_AGENT_REMOVED;
  readonly agentId: string;
}

export interface InstallationCompletedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.INSTALLATION_COMPLETED;
  readonly version: string;
  readonly isSupported: boolean;
}

export interface InstallationFailedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.INSTALLATION_FAILED;
  readonly reason: string;
}

export interface McpActivatedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.MCP_ACTIVATED;
  readonly namespace: string;
}

export interface MemoryBackendChangedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.MEMORY_BACKEND_CHANGED;
  readonly newBackend: 'agentdb' | 'hnsw' | 'hybrid';
  readonly previousBackend: string;
}

export interface ProjectInitializedEvent extends DomainEvent {
  readonly type: typeof DOMAIN_EVENT_TYPES.PROJECT_INITIALIZED;
  readonly projectPath: string;
}

export type RuFloDomainEvent =
  | SwarmInitializedEvent
  | SwarmAgentAddedEvent
  | SwarmAgentRemovedEvent
  | InstallationCompletedEvent
  | InstallationFailedEvent
  | McpActivatedEvent
  | MemoryBackendChangedEvent
  | ProjectInitializedEvent;

// ─── Event Factories ──────────────────────────────────────────────────────────

export function makeSwarmInitialized(
  aggregateId: string,
  topology: string,
  agentCount: number,
  maxAgents: number,
): SwarmInitializedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.SWARM_INITIALIZED,
    occurredAt: Date.now(),
    aggregateId,
    topology,
    agentCount,
    maxAgents,
  };
}

export function makeSwarmAgentAdded(
  aggregateId: string,
  agentId: string,
  agentType: string,
): SwarmAgentAddedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.SWARM_AGENT_ADDED,
    occurredAt: Date.now(),
    aggregateId,
    agentId,
    agentType,
  };
}

export function makeSwarmAgentRemoved(
  aggregateId: string,
  agentId: string,
): SwarmAgentRemovedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.SWARM_AGENT_REMOVED,
    occurredAt: Date.now(),
    aggregateId,
    agentId,
  };
}

export function makeInstallationCompleted(
  aggregateId: string,
  version: string,
  isSupported: boolean,
): InstallationCompletedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.INSTALLATION_COMPLETED,
    occurredAt: Date.now(),
    aggregateId,
    version,
    isSupported,
  };
}

export function makeInstallationFailed(
  aggregateId: string,
  reason: string,
): InstallationFailedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.INSTALLATION_FAILED,
    occurredAt: Date.now(),
    aggregateId,
    reason,
  };
}

export function makeMcpActivated(
  aggregateId: string,
  namespace: string,
): McpActivatedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.MCP_ACTIVATED,
    occurredAt: Date.now(),
    aggregateId,
    namespace,
  };
}

export function makeMemoryBackendChanged(
  aggregateId: string,
  newBackend: 'agentdb' | 'hnsw' | 'hybrid',
  previousBackend: string,
): MemoryBackendChangedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.MEMORY_BACKEND_CHANGED,
    occurredAt: Date.now(),
    aggregateId,
    newBackend,
    previousBackend,
  };
}

export function makeProjectInitialized(
  aggregateId: string,
  projectPath: string,
): ProjectInitializedEvent {
  return {
    type: DOMAIN_EVENT_TYPES.PROJECT_INITIALIZED,
    occurredAt: Date.now(),
    aggregateId,
    projectPath,
  };
}
