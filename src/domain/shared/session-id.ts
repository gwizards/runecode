/**
 * Shared kernel — SessionId re-export shim.
 *
 * The canonical SessionId class VO lives in the session bounded context.
 * This file exists for cross-context imports that need the type without
 * depending on the full session domain module.
 *
 * @deprecated Import from 'domain/session' directly when inside the session context.
 */
export { SessionId } from '../session/types';
