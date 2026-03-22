/**
 * Command bounded context — Repository port (interface).
 *
 * This is the domain-facing port that application services depend on.
 * Adapters (InMemoryCommandRepository, etc.) live outside this directory
 * and implement this interface.
 *
 * Follows Ports & Adapters (Hexagonal Architecture): the domain owns the
 * interface; infrastructure owns the implementations.
 */

import type { CommandId, CommandScope } from '../types';
import type { SlashCommandEntry } from '../types';

export interface ICommandRepository {
  /** Return the aggregate for the given id, or null if not found. */
  getById(id: CommandId): Promise<SlashCommandEntry | null>;

  /** Return the aggregate matching a full command string (e.g. "/project:optimize"), or null. */
  getByFullCommand(fullCommand: string): Promise<SlashCommandEntry | null>;

  /** Persist (upsert) an aggregate. */
  save(command: SlashCommandEntry): Promise<void>;

  /** Remove a command by id. No-op if not found. */
  delete(id: CommandId): Promise<void>;

  /** Return all commands whose scope matches the given value. */
  listByScope(scope: CommandScope): Promise<SlashCommandEntry[]>;

  /** Return all tracked commands regardless of scope. */
  listAll(): Promise<SlashCommandEntry[]>;
}
