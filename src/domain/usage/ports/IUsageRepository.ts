/**
 * Usage bounded context — IUsageRepository port alias.
 *
 * IUsageRepository is the canonical short name that application services use.
 * It is an alias for IUsageLedgerRepository, defined in its own dedicated file.
 *
 * Re-exports from the canonical port definition so consumers can import from
 * the ports barrel without coupling to the internal implementation file.
 */

export type { IUsageLedgerRepository as IUsageRepository } from './IUsageLedgerRepository';
