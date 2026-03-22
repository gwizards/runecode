/**
 * Shared DDD kernel — Repository base interfaces.
 *
 * Repositories abstract persistence from domain logic.
 * Each bounded context defines its own typed repository interfaces
 * that extend or follow these base contracts.
 */

import type { Result } from './result';

/**
 * Base read repository: find by ID and list all.
 * T = aggregate type, ID = identifier type.
 */
export interface IReadRepository<T, ID> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
}

/**
 * Base write repository: save and delete.
 */
export interface IWriteRepository<T, ID> {
  save(entity: T): Promise<Result<void>>;
  delete(id: ID): Promise<Result<void>>;
}

/**
 * Full CRUD repository. Combine IReadRepository + IWriteRepository.
 */
export interface IRepository<T, ID>
  extends IReadRepository<T, ID>,
    IWriteRepository<T, ID> {}

/**
 * Helper: build a simple in-memory repository over a Map.
 * Useful for tests and stubs.
 *
 * Usage:
 *   const repo = createInMemoryRepository<Session, string>(s => s.id);
 */
export function createInMemoryRepository<T, ID extends string | number>(
  getId: (entity: T) => ID,
): IRepository<T, ID> & { snapshot(): T[] } {
  const store = new Map<ID, T>();

  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
    async findAll() {
      return Array.from(store.values());
    },
    async save(entity) {
      store.set(getId(entity), entity);
      return { ok: true, value: undefined };
    },
    async delete(id) {
      const existed = store.delete(id);
      if (!existed) return { ok: false, error: `Entity ${String(id)} not found` };
      return { ok: true, value: undefined };
    },
    snapshot() {
      return Array.from(store.values());
    },
  };
}
