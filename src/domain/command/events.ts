/**
 * Command bounded context — Domain Event factories.
 */
import type { DomainEvent } from '../shared/event-bus';
import type { CommandId, CommandScope, SelectionMethod } from './types';

export const COMMAND_EVENT_TYPES = {
  COMMAND_REGISTERED: 'command/registered',
  COMMAND_SELECTED:   'command/selected',
  COMMAND_EXECUTED:   'command/executed',
  COMMAND_DELETED:    'command/deleted',
} as const;

export type CommandEventType = (typeof COMMAND_EVENT_TYPES)[keyof typeof COMMAND_EVENT_TYPES];

export interface CommandRegisteredEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_REGISTERED;
  readonly commandId: CommandId;
  readonly name: string;
  readonly scope: CommandScope;
}

export interface CommandSelectedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_SELECTED;
  readonly commandId: CommandId;
  readonly method: SelectionMethod;
}

export interface CommandExecutedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_EXECUTED;
  readonly commandId: CommandId;
  readonly durationMs: number;
  readonly success: boolean;
}

export interface CommandDeletedEvent extends DomainEvent {
  readonly type: typeof COMMAND_EVENT_TYPES.COMMAND_DELETED;
  readonly commandId: CommandId;
}

export function makeCommandRegistered(
  commandId: CommandId,
  name: string,
  scope: CommandScope,
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
  commandId: CommandId,
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
  commandId: CommandId,
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

export function makeCommandDeleted(commandId: CommandId): CommandDeletedEvent {
  return {
    type: COMMAND_EVENT_TYPES.COMMAND_DELETED,
    occurredAt: Date.now(),
    aggregateId: commandId,
    commandId,
  };
}
