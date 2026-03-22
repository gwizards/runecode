/**
 * Command bounded context — Repository adapter (in-memory implementation).
 *
 * ICommandRepository is the domain-facing port; it lives in ./ports/.
 * InMemoryCommandRepository is the default adapter (suitable for tests and dev).
 *
 * Storage uses QuantizedSnapshotStore<RawCommandSnapshot, string> for ~81%
 * memory reduction on quantizable scope, capabilities, and timestamp fields.
 */

import type { CommandScopeValue, RawCommandSnapshot } from './types';
import { CommandId, SlashCommandEntry } from './types';
import {
  CommandSnapshotQuantizer,
  QuantizedSnapshotStore,
} from '../shared/quantization';
import type { ICommandRepository } from './ports/ICommandRepository';

// ─── Port re-export ────────────────────────────────────────────────────────
// The interface lives in ./ports/ (canonical location). Re-exported here so
// existing imports from this file continue to resolve without changes.
export type { ICommandRepository } from './ports/ICommandRepository';

// ─── Helper: unwrap snapshot or return null ────────────────────────────────

function snapshotToEntry(snapshot: RawCommandSnapshot): SlashCommandEntry | null {
  const result = SlashCommandEntry.fromSnapshot(snapshot);
  return result.ok ? result.value : null;
}

// ─── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryCommandRepository implements ICommandRepository {
  // Key is the plain string value of CommandId (class no longer extends string)
  private readonly store = new QuantizedSnapshotStore<RawCommandSnapshot, string>(
    new CommandSnapshotQuantizer(),
  );

  async getById(id: CommandId): Promise<SlashCommandEntry | null> {
    const snapshot = this.store.get(id.value);
    if (!snapshot) return null;
    return snapshotToEntry(snapshot);
  }

  async getByFullCommand(fullCommand: string): Promise<SlashCommandEntry | null> {
    for (const snapshot of this.store.values()) {
      if (snapshot.fullCommand === fullCommand) {
        return snapshotToEntry(snapshot);
      }
    }
    return null;
  }

  async save(command: SlashCommandEntry): Promise<void> {
    this.store.set(command.id.value, command.toSnapshot());
  }

  async delete(id: CommandId): Promise<void> {
    this.store.delete(id.value);
  }

  async listByScope(scope: CommandScopeValue): Promise<SlashCommandEntry[]> {
    const entries: SlashCommandEntry[] = [];
    for (const snapshot of this.store.values()) {
      if (snapshot.scope === scope) {
        const entry = snapshotToEntry(snapshot);
        if (entry) entries.push(entry);
      }
    }
    return entries;
  }

  async listAll(): Promise<SlashCommandEntry[]> {
    const entries: SlashCommandEntry[] = [];
    for (const snapshot of this.store.values()) {
      const entry = snapshotToEntry(snapshot);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  /**
   * Test helper — seed a command directly into the store without going
   * through save() so that tests can set up state without triggering
   * any service-layer side effects.
   */
  seed(command: SlashCommandEntry): void {
    this.store.set(command.id.value, command.toSnapshot());
  }
}
