/**
 * RuFlo Repository — interface + in-memory implementation.
 *
 * IRuFloRepository abstracts all persistence for the ruflo bounded context.
 * TauriRuFloRepository (not shown here) calls the Tauri backend.
 * InMemoryRuFloRepository is used in tests.
 */

import { Ok, type Result } from '../../shared/result';
import { RuFloInstallationAggregate } from '../aggregates/installation.aggregate';
import { RuFloSwarmAggregate } from '../aggregates/swarm.aggregate';
import type { IRuFloRepository, MemoryStats } from '../ports/IRuFloRepository';

// ─── Re-exports (ports/) ──────────────────────────────────────────────────────

// Keep existing consumers working — MemoryStats and IRuFloRepository were
// previously exported from this file.
export type { IRuFloRepository, MemoryStats };

// ─── In-Memory Implementation (for tests) ────────────────────────────────────

export class InMemoryRuFloRepository implements IRuFloRepository {
  private _installation: RuFloInstallationAggregate = RuFloInstallationAggregate.unknown();
  private _swarm: RuFloSwarmAggregate | null = null;
  private _memoryStats: MemoryStats | null = null;

  async getInstallation(): Promise<RuFloInstallationAggregate> {
    return this._installation;
  }

  async saveInstallation(agg: RuFloInstallationAggregate): Promise<Result<void>> {
    this._installation = agg;
    return Ok(undefined);
  }

  async getSwarm(): Promise<RuFloSwarmAggregate | null> {
    return this._swarm;
  }

  async saveSwarm(agg: RuFloSwarmAggregate): Promise<Result<void>> {
    this._swarm = agg;
    return Ok(undefined);
  }

  async getMemoryStats(): Promise<MemoryStats | null> {
    return this._memoryStats;
  }

  /** Test helper: seed the installation state. */
  seedInstallation(agg: RuFloInstallationAggregate): void {
    this._installation = agg;
  }

  /** Test helper: seed the swarm state. */
  seedSwarm(agg: RuFloSwarmAggregate): void {
    this._swarm = agg;
  }

  /** Test helper: seed memory stats. */
  seedMemoryStats(stats: MemoryStats): void {
    this._memoryStats = stats;
  }
}
