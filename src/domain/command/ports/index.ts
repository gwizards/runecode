/**
 * Command bounded context — Ports barrel.
 *
 * Re-exports all port (interface) definitions for this bounded context.
 * Consumers import from this path to access domain port contracts.
 */

export type { ICommandRepository } from './ICommandRepository';
