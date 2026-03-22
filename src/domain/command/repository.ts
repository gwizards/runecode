/**
 * Command bounded context — Repository interface and in-memory implementation.
 *
 * ICommandRepository is the domain-facing port.
 * InMemoryCommandRepository is the default adapter (suitable for tests and dev).
 */

import type { CommandId, CommandScope } from './types';
import { SlashCommandEntry } from './types';

// ─── Repository Interface ──────────────────────────────────────────────────

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

// ─── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryCommandRepository implements ICommandRepository {
  private readonly store = new Map<
    string,
    ReturnType<SlashCommandEntry['toSnapshot']>
  >();

  async getById(id: CommandId): Promise<SlashCommandEntry | null> {
    const snapshot = this.store.get(id);
    if (!snapshot) return null;
    return SlashCommandEntry.fromSnapshot(snapshot);
  }

  async getByFullCommand(fullCommand: string): Promise<SlashCommandEntry | null> {
    for (const snapshot of this.store.values()) {
      if (snapshot.fullCommand === fullCommand) {
        return SlashCommandEntry.fromSnapshot(snapshot);
      }
    }
    return null;
  }

  async save(command: SlashCommandEntry): Promise<void> {
    this.store.set(command.id, command.toSnapshot());
  }

  async delete(id: CommandId): Promise<void> {
    this.store.delete(id);
  }

  async listByScope(scope: CommandScope): Promise<SlashCommandEntry[]> {
    return Array.from(this.store.values())
      .filter((s) => s.scope === scope)
      .map(SlashCommandEntry.fromSnapshot);
  }

  async listAll(): Promise<SlashCommandEntry[]> {
    return Array.from(this.store.values()).map(SlashCommandEntry.fromSnapshot);
  }

  /**
   * Test helper — seed a command directly into the store without going
   * through save() so that tests can set up state without triggering
   * any service-layer side effects.
   */
  seed(command: SlashCommandEntry): void {
    this.store.set(command.id, command.toSnapshot());
  }
}
