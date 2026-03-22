/**
 * Command bounded context — Repository adapter (in-memory implementation).
 *
 * ICommandRepository is the domain-facing port; it lives in ./ports/.
 * InMemoryCommandRepository is the default adapter (suitable for tests and dev).
 *
 * Storage uses QuantizedSnapshotStore<RawCommandSnapshot, CommandId> for ~81%
 * memory reduction on quantizable scope, capabilities, and timestamp fields.
 */

import type { CommandId, CommandScope, RawCommandSnapshot } from './types';
import { SlashCommandEntry } from './types';
import {
  CommandSnapshotQuantizer,
  QuantizedSnapshotStore,
} from '../shared/quantization';
import type { ICommandRepository } from './ports/ICommandRepository';

// ─── Port re-export ────────────────────────────────────────────────────────
// The interface lives in ./ports/ (canonical location). Re-exported here so
// existing imports from this file continue to resolve without changes.
export type { ICommandRepository } from './ports/ICommandRepository';

// ─── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryCommandRepository implements ICommandRepository {
  private readonly store = new QuantizedSnapshotStore<RawCommandSnapshot, CommandId>(
    new CommandSnapshotQuantizer(),
  );

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
    return this.store
      .values()
      .filter((s) => s.scope === scope)
      .map(SlashCommandEntry.fromSnapshot);
  }

  async listAll(): Promise<SlashCommandEntry[]> {
    return this.store.values().map(SlashCommandEntry.fromSnapshot);
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
