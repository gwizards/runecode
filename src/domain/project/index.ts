/**
 * Project bounded context — Public API barrel.
 *
 * Import from this module only; never import internal files directly.
 */

// ── Types & Value Objects ────────────────────────────────────────────────────
export type { ProjectId, RawProject } from './types';
export { toProjectId, ProjectPath, ProjectName, ProjectAggregate } from './types';

// ── Events ───────────────────────────────────────────────────────────────────
export { PROJECT_EVENT_TYPES } from './events';
export type { ProjectEventType } from './events';
export type {
  ProjectCreatedEvent,
  ProjectOpenedEvent,
  ProjectRenamedEvent,
  ProjectDeletedEvent,
} from './events';
export {
  makeProjectCreated,
  makeProjectOpened,
  makeProjectRenamed,
  makeProjectDeleted,
} from './events';

// ── Repository ───────────────────────────────────────────────────────────────
export type { IProjectRepository } from './repository';
export { InMemoryProjectRepository } from './repository';

// ── Application Service ───────────────────────────────────────────────────────
export { ProjectApplicationService } from './service';

// ── Zustand Store ─────────────────────────────────────────────────────────────
export type { ProjectState, ProjectActions, ProjectStore } from './store';
export { createProjectStore, useProjectStore } from './store';
