/**
 * Command bounded context — Domain Event factories.
 *
 * Event interfaces use plain string IDs (not VO classes) so that events
 * remain plain serialisable data objects.
 */
import type { DomainEvent } from '../shared/event-bus';
import type { CommandScopeValue, SelectionMethod } from './types';

export const COMMAND_EVENT_TYPES = {
  COMMAND_REGISTERED: 'command/command.registered',
  COMMAND_SELECTED:   'command/command.selected',
  COMMAND_EXECUTED:   'command/command.executed',
  COMMAND_DELETED:    'command/command.deleted',
} as const;

/**
 * Alias for COMMAND_EVENT_TYPES — satisfies the DDD requirement for a
 * `DOMAIN_EVENT_TYPES` export on every bounded context's events module.
 */
export const DOMAIN_EVENT_TYPES = COMMAND_EVENT_TYPES;

export type CommandEventType = (typeof COMMAND_EVENT_TYPES)[keyof typeof COMMAND_EVENT_TYPES];

export interface CommandRegisteredEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_REGISTERED;
  readonly commandId: string;
  readonly name: string;
  readonly scope: CommandScopeValue;
}

export interface CommandSelectedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_SELECTED;
  readonly commandId: string;
  readonly method: SelectionMethod;
}

export interface CommandExecutedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_EXECUTED;
  readonly commandId: string;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface CommandDeletedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_DELETED;
  readonly commandId: string;
}

export function makeCommandRegistered(
  commandId: string,
  name: string,
  scope: CommandScopeValue,
): CommandRegisteredEvent {
  return {
    type: COMMAND_EVENT_TYPES.COMMAND_REGISTERED,
    occurredAt: Date.now(),
    aggregateId: commandId,
    commandId,
    name,
    scope,
  };
}

export function makeCommandSelected(
  commandId: string,
  method: SelectionMethod,
): CommandSelectedEvent {
  return {
    type: COMMAND_EVENT_TYPES.COMMAND_SELECTED,
    occurredAt: Date.now(),
    aggregateId: commandId,
    commandId,
    method,
  };
}

export function makeCommandExecuted(
  commandId: string,
  durationMs: number,
  success: boolean,
): CommandExecutedEvent {
  return {
    type: COMMAND_EVENT_TYPES.COMMAND_EXECUTED,
    occurredAt: Date.now(),
    aggregateId: commandId,
    commandId,
    durationMs,
    success,
  };
}

export function makeCommandDeleted(commandId: string): CommandDeletedEvent {
  return {
    type: COMMAND_EVENT_TYPES.COMMAND_DELETED,
    occurredAt: Date.now(),
    aggregateId: commandId,
    commandId,
  };
}
