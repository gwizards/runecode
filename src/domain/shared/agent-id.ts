/**
 * Shared kernel — AgentId re-export shim.
 *
 * The canonical AgentId class VO lives in the agent bounded context.
 * This file exists for cross-context imports that need the type without
 * depending on the full agent domain module.
 *
 * @deprecated Import from 'domain/agent' directly when inside the agent context.
 */
export { AgentId } from '../agent/types';
