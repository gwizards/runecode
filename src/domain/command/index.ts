/**
 * Command bounded context — Public barrel.
 *
 * Import everything the outside world needs from this single entry point.
 * Do not import internal modules directly from outside this directory.
 */

// ── Types & value objects ──────────────────────────────────────────────────
export type {
  CommandId,
  CommandName,
  CommandScope,
  SelectionMethod,
  CommandCapabilities,
  RawCommandCapabilities,
  RawCommand,
  RawCommandSnapshot,
} from './types';
export {
  toCommandId,
  toCommandName,
  toCommandScope,
  makeCommandCapabilities,
  SlashCommandEntry,
} from './types';

// ── Events ─────────────────────────────────────────────────────────────────
export type {
  CommandEventType,
  CommandRegisteredEvent,
  CommandSelectedEvent,
  CommandExecutedEvent,
  CommandDeletedEvent,
} from './events';
export {
  COMMAND_EVENT_TYPES,
  DOMAIN_EVENT_TYPES,
  makeCommandRegistered,
  makeCommandSelected,
  makeCommandExecuted,
  makeCommandDeleted,
} from './events';

// ── Repository port ────────────────────────────────────────────────────────
export type { ICommandRepository } from './ports/ICommandRepository';

// ── Repository adapter ─────────────────────────────────────────────────────
export { InMemoryCommandRepository } from './repository';

// ── Application service ────────────────────────────────────────────────────
export type { ListCommandsQuery } from './service';
export { CommandApplicationService } from './service';

// ── Zustand store ──────────────────────────────────────────────────────────
export { useCommandDomainStore } from './store';

// ── Class-based Value Objects ──────────────────────────────────────────────
export { CommandDescription, CommandCategory } from './value-objects/command-description';
