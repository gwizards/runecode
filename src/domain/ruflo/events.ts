/**
 * DDD domain events barrel for the ruflo bounded context.
 *
 * Re-exports all pure domain event types, constants, interfaces, and factories
 * from the canonical domain-events module.
 *
 * Browser-side wiring (window.dispatchEvent / window.addEventListener)
 * lives in the infrastructure layer:
 *   src/infrastructure/ruflo/browser-events-bridge.ts
 *
 * Application code (stores, services) that needs to fire browser events should
 * import directly from the infrastructure module.
 */

export {
  RUFLO_EVENT_TYPES,
  DOMAIN_EVENT_TYPES,
  makeSwarmInitialized,
  makeSwarmAgentAdded,
  makeSwarmAgentRemoved,
  makeInstallationCompleted,
  makeInstallationFailed,
  makeMcpActivated,
  makeMemoryBackendChanged,
  makeProjectInitialized,
} from './domain-events';

export type {
  RuFloDomainEventType,
  RuFloDomainEvent,
  SwarmInitializedEvent,
  SwarmAgentAddedEvent,
  SwarmAgentRemovedEvent,
  InstallationCompletedEvent,
  InstallationFailedEvent,
  McpActivatedEvent,
  MemoryBackendChangedEvent,
  ProjectInitializedEvent,
} from './domain-events';
