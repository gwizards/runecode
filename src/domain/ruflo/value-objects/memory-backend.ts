/**
 * MemoryBackend Value Object — ruflo bounded context.
 *
 * Encapsulates the valid memory backend values for a RuFlo swarm and prevents
 * invalid backend strings from entering the domain model.
 */

import { Result, Ok, Err } from '../../shared/result';

export type MemoryBackendValue = 'sqlite' | 'hnsw' | 'hybrid' | 'in-memory';

const VALID_BACKENDS: readonly MemoryBackendValue[] = ['sqlite', 'hnsw', 'hybrid', 'in-memory'];

export class MemoryBackend {
  private constructor(readonly value: MemoryBackendValue) {}

  static create(raw: string): Result<MemoryBackend> {
    if (!VALID_BACKENDS.includes(raw as MemoryBackendValue)) {
      return Err(
        `Invalid memory backend: '${raw}'. Must be one of: ${VALID_BACKENDS.join(', ')}`,
      );
    }
    return Ok(new MemoryBackend(raw as MemoryBackendValue));
  }

  static hybrid(): MemoryBackend { return new MemoryBackend('hybrid'); }
  static inMemory(): MemoryBackend { return new MemoryBackend('in-memory'); }
  toString(): string { return this.value; }
}
