/**
 * Shared Kernel — ProjectId
 *
 * ProjectId is referenced by both the project and session bounded contexts.
 * Rather than each context independently declaring the same branded type,
 * both import from this shared kernel module.
 *
 * This is the ONLY shared kernel type. Contexts must NOT share aggregates,
 * value objects, or domain events — only scalar identity types may be shared.
 */

import { Result, Ok, Err } from './result';

export type ProjectId = string & { readonly _brand: 'ProjectId' };

export function toProjectId(id: string): Result<ProjectId> {
  if (!id || !id.trim()) return Err('ProjectId cannot be empty');
  return Ok(id as ProjectId);
}
