/**
 * Shared kernel — UserId re-export shim.
 *
 * The canonical UserId class VO lives in the identity bounded context.
 * This file exists for cross-context imports that need the type without
 * depending on the full identity domain module.
 *
 * @deprecated Import from 'domain/identity' directly when inside the identity context.
 */
export { UserId } from '../identity/types';
