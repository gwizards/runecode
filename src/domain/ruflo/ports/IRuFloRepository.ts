/**
 * RuFlo domain port — repository interface.
 *
 * Extracted from application/ruflo.repository.ts to follow the DDD ports
 * convention: interfaces live in ports/, implementations in infrastructure/.
 *
 * MemoryStats is co-located here because it is part of the repository contract.
 */

import type { Result } from '../../shared/result';
import type { RuFloInstallationAggregate } from '../aggregates/installation.aggregate';
import type { RuFloSwarmAggregate } from '../aggregates/swarm.aggregate';

/** Statistics about the RuFlo memory subsystem. */
export interface MemoryStats {
  totalEntries: number;
  backend: string;
  sizeBytes?: number;
  namespaces?: string[];
}

export interface IRuFloRepository {
  // Installation
  getInstallation(): Promise<RuFloInstallationAggregate>;
  saveInstallation(agg: RuFloInstallationAggregate): Promise<Result<void>>;

  // Swarm
  getSwarm(): Promise<RuFloSwarmAggregate | null>;
  saveSwarm(agg: RuFloSwarmAggregate): Promise<Result<void>>;

  // Memory
  getMemoryStats(): Promise<MemoryStats | null>;
}
