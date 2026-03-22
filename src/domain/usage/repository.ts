/**
 * Usage bounded context — Repository interface and in-memory implementation.
 *
 * IUsageLedgerRepository is the domain-facing port.
 * InMemoryUsageLedgerRepository is the default adapter (suitable for tests and dev).
 */

import type { LedgerId, SessionId, ProjectId, RawLedger } from './types';
import { UsageLedger } from './types';

// ─── Repository interface ──────────────────────────────────────────────────

export interface IUsageLedgerRepository {
  /** Return the aggregate for the given id, or null if not found. */
  getById(id: LedgerId): Promise<UsageLedger | null>;

  /** Return the open (unsealed) ledger for a session, or null if none exists. */
  getBySession(sessionId: SessionId): Promise<UsageLedger | null>;

  /** Persist (upsert) a ledger aggregate by snapshot. */
  save(ledger: UsageLedger): Promise<void>;

  /** Remove a ledger by id. No-op if not found. */
  delete(id: LedgerId): Promise<void>;

  /** Return all ledgers belonging to a project. */
  listByProject(projectId: ProjectId): Promise<UsageLedger[]>;

  /**
   * Return all ledgers whose openedAt falls within [from, to] (inclusive, Unix ms).
   * Both bounds are optional; omitting one makes the range open-ended.
   */
  listByDateRange(from?: number, to?: number): Promise<UsageLedger[]>;
}

// ─── In-memory implementation ──────────────────────────────────────────────

export class InMemoryUsageLedgerRepository implements IUsageLedgerRepository {
  /** Internal store keyed by ledgerId. */
  private readonly ledgers = new Map<string, RawLedger>();

  async getById(id: LedgerId): Promise<UsageLedger | null> {
    const snapshot = this.ledgers.get(id);
    if (!snapshot) return null;
    return UsageLedger.fromSnapshot(snapshot);
  }

  async getBySession(sessionId: SessionId): Promise<UsageLedger | null> {
    for (const snapshot of this.ledgers.values()) {
      if (snapshot.sessionId === sessionId && !snapshot.sealed) {
        return UsageLedger.fromSnapshot(snapshot);
      }
    }
    return null;
  }

  async save(ledger: UsageLedger): Promise<void> {
    this.ledgers.set(ledger.id, ledger.toSnapshot());
  }

  async delete(id: LedgerId): Promise<void> {
    this.ledgers.delete(id);
  }

  async listByProject(projectId: ProjectId): Promise<UsageLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((s) => s.projectId === projectId)
      .map(UsageLedger.fromSnapshot);
  }

  async listByDateRange(from?: number, to?: number): Promise<UsageLedger[]> {
    return Array.from(this.ledgers.values())
      .filter((s) => {
        if (from !== undefined && s.openedAt < from) return false;
        if (to   !== undefined && s.openedAt > to)   return false;
        return true;
      })
      .map(UsageLedger.fromSnapshot);
  }

  /**
   * Test helper — seed a ledger directly into the store without going
   * through save() so that tests can set up state without triggering
   * any service-layer side effects.
   */
  seed(ledger: UsageLedger): void {
    this.ledgers.set(ledger.id, ledger.toSnapshot());
  }
}
