/**
 * Usage bounded context — Repository port.
 *
 * IUsageRepository is the domain-facing port that application services
 * depend on. Concrete adapters (InMemoryUsageLedgerRepository, SQL, etc.)
 * implement this interface in the infrastructure layer.
 *
 * Re-exports IUsageLedgerRepository under the canonical short name so
 * consumers can import from the ports barrel without coupling to the
 * internal implementation file.
 */

export type { IUsageLedgerRepository as IUsageRepository } from '../repository';
