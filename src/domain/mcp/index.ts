/**
 * MCP bounded context — public barrel export.
 *
 * Import everything you need for this bounded context from this file.
 */

// Types, value objects, aggregate
export type { ServerId, ServerTransport, ServerStatusValue, RawMCPServer } from './types';
export { ServerUrl, ServerName, MCPServerAggregate } from './types';

// Events
export { MCP_EVENT_TYPES } from './events';
export type {
  ServerAddedEvent,
  ServerRemovedEvent,
  ServerStatusChangedEvent,
  ServerEnabledEvent,
  ServerDisabledEvent,
} from './events';
export {
  makeServerAdded,
  makeServerRemoved,
  makeServerStatusChanged,
  makeServerEnabled,
  makeServerDisabled,
} from './events';

// Repository port
export type { IMCPRepository } from './ports';

// Repository implementation
export { InMemoryMCPRepository } from './repository';

// Application service
export { MCPApplicationService } from './service';

// Zustand store
export type { MCPStoreState } from './store';
export { useMCPStore } from './store';
