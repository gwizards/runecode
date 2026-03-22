/**
 * MCP bounded context — Domain Events.
 *
 * All events are plain objects satisfying the DomainEvent contract.
 * Factory functions are the only way to construct them.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { ServerId, ServerStatusValue, ServerTransport } from './types';

// ─── Event type constants ──────────────────────────────────────────────────

export const MCP_EVENT_TYPES = {
  SERVER_ADDED: 'mcp/server.added',
  SERVER_REMOVED: 'mcp/server.removed',
  SERVER_STATUS_CHANGED: 'mcp/server.status_changed',
  SERVER_ENABLED: 'mcp/server.enabled',
  SERVER_DISABLED: 'mcp/server.disabled',
} as const;

export const DOMAIN_EVENT_TYPES = MCP_EVENT_TYPES;

// ─── Event interfaces ─────────────────────────────────────────────────────

export interface ServerAddedEvent extends DomainEvent {
  readonly type: typeof MCP_EVENT_TYPES.SERVER_ADDED;
  readonly serverId: ServerId;
  readonly name: string;
  readonly transport: ServerTransport;
  readonly url: string;
}

export interface ServerRemovedEvent extends DomainEvent {
  readonly type: typeof MCP_EVENT_TYPES.SERVER_REMOVED;
  readonly serverId: ServerId;
  readonly name: string;
}

export interface ServerStatusChangedEvent extends DomainEvent {
  readonly type: typeof MCP_EVENT_TYPES.SERVER_STATUS_CHANGED;
  readonly serverId: ServerId;
  readonly oldStatus: ServerStatusValue;
  readonly newStatus: ServerStatusValue;
  readonly reason?: string;
}

export interface ServerEnabledEvent extends DomainEvent {
  readonly type: typeof MCP_EVENT_TYPES.SERVER_ENABLED;
  readonly serverId: ServerId;
}

export interface ServerDisabledEvent extends DomainEvent {
  readonly type: typeof MCP_EVENT_TYPES.SERVER_DISABLED;
  readonly serverId: ServerId;
}

// ─── Factory functions ────────────────────────────────────────────────────

export function makeServerAdded(
  serverId: ServerId,
  name: string,
  transport: ServerTransport,
  url: string,
): ServerAddedEvent {
  return {
    type: MCP_EVENT_TYPES.SERVER_ADDED,
    occurredAt: Date.now(),
    aggregateId: serverId,
    serverId,
    name,
    transport,
    url,
  };
}

export function makeServerRemoved(
  serverId: ServerId,
  name: string,
): ServerRemovedEvent {
  return {
    type: MCP_EVENT_TYPES.SERVER_REMOVED,
    occurredAt: Date.now(),
    aggregateId: serverId,
    serverId,
    name,
  };
}

export function makeServerStatusChanged(
  serverId: ServerId,
  oldStatus: ServerStatusValue,
  newStatus: ServerStatusValue,
  reason?: string,
): ServerStatusChangedEvent {
  return {
    type: MCP_EVENT_TYPES.SERVER_STATUS_CHANGED,
    occurredAt: Date.now(),
    aggregateId: serverId,
    serverId,
    oldStatus,
    newStatus,
    reason,
  };
}

export function makeServerEnabled(serverId: ServerId): ServerEnabledEvent {
  return {
    type: MCP_EVENT_TYPES.SERVER_ENABLED,
    occurredAt: Date.now(),
    aggregateId: serverId,
    serverId,
  };
}

export function makeServerDisabled(serverId: ServerId): ServerDisabledEvent {
  return {
    type: MCP_EVENT_TYPES.SERVER_DISABLED,
    occurredAt: Date.now(),
    aggregateId: serverId,
    serverId,
  };
}
