/**
 * Workspace bounded context — Public barrel export.
 *
 * Import from this file in application code and other bounded contexts.
 * Do NOT import from internal module files directly.
 */

// Types and Value Objects
export type { TabId, WorkspaceId, RawTab, RawWorkspace } from './types';
export { toTabId, toWorkspaceId, TabRecord, WorkspaceAggregate } from './types';

// Events
export { WORKSPACE_EVENT_TYPES, DOMAIN_EVENT_TYPES } from './events';
export type {
  WorkspaceEventType,
  WorkspaceEvent,
  TabOpenedEvent,
  TabClosedEvent,
  TabActivatedEvent,
  TabsReorderedEvent,
  TabRenamedEvent,
} from './events';

// Repository port (hexagonal architecture interface)
export type { IWorkspaceRepository } from './ports/workspace-repository.port';

// Repository adapter
export { InMemoryWorkspaceRepository, seed } from './repository';

// Application Service
export { WorkspaceApplicationService } from './service';

// Zustand Store
export type { WorkspaceState, WorkspaceActions, WorkspaceStore } from './store';
export { createWorkspaceStore, useWorkspaceStore } from './store';

// Class-based Value Objects
export { TabLabel, TabPath } from './value-objects/tab-label';
