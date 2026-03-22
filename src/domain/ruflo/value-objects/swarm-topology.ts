/**
 * SwarmTopology Value Object — ruflo bounded context.
 *
 * Encapsulates the valid topology values for a RuFlo swarm and prevents
 * invalid topology strings from entering the domain model.
 */

import { Result, Ok, Err } from '../../shared/result';

export type SwarmTopologyValue = 'hierarchical' | 'mesh' | 'ring' | 'star' | 'hybrid';

const VALID_TOPOLOGIES: readonly SwarmTopologyValue[] = [
  'hierarchical',
  'mesh',
  'ring',
  'star',
  'hybrid',
];

export class SwarmTopology {
  private constructor(readonly value: SwarmTopologyValue) {}

  static create(raw: string): Result<SwarmTopology> {
    if (!raw || !raw.trim()) {
      return Err('Swarm topology is required');
    }
    if (!VALID_TOPOLOGIES.includes(raw as SwarmTopologyValue)) {
      return Err(
        `Invalid swarm topology: '${raw}'. Must be one of: ${VALID_TOPOLOGIES.join(', ')}`,
      );
    }
    return Ok(new SwarmTopology(raw as SwarmTopologyValue));
  }

  toString(): string {
    return this.value;
  }
}
