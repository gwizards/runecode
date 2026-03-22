/**
 * Project bounded context — Domain Events.
 *
 * All event factory functions return plain objects satisfying DomainEvent.
 * No classes; keep events as cheap, serialisable value objects.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event Type Constants ─────────────────────────────────────────────────────

export const PROJECT_EVENT_TYPES = {
  CREATED: 'project/project.created',
  OPENED:  'project/project.opened',
  RENAMED: 'project/project.renamed',
  DELETED: 'project/project.deleted',
} as const;

/** Alias kept for consumers that import the generic name. */
export const DOMAIN_EVENT_TYPES = PROJECT_EVENT_TYPES;

export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[keyof typeof PROJECT_EVENT_TYPES];

// ─── Typed Event Interfaces ───────────────────────────────────────────────────

export interface ProjectCreatedEvent extends DomainEvent {
  readonly type: typeof PROJECT_EVENT_TYPES.CREATED;
  readonly projectId: string;
  readonly path: string;
  readonly name: string;
}

export interface ProjectOpenedEvent extends DomainEvent {
  readonly type: typeof PROJECT_EVENT_TYPES.OPENED;
  readonly projectId: string;
  readonly path: string;
}

export interface ProjectRenamedEvent extends DomainEvent {
  readonly type: typeof PROJECT_EVENT_TYPES.RENAMED;
  readonly projectId: string;
  readonly oldName: string;
  readonly newName: string;
}

export interface ProjectDeletedEvent extends DomainEvent {
  readonly type: typeof PROJECT_EVENT_TYPES.DELETED;
  readonly projectId: string;
  readonly path: string;
}

// ─── Factory Functions ────────────────────────────────────────────────────────

export function makeProjectCreated(
  projectId: string,
  path: string,
  name: string,
): ProjectCreatedEvent {
  return {
    type: PROJECT_EVENT_TYPES.CREATED,
    occurredAt: Date.now(),
    aggregateId: projectId,
    projectId,
    path,
    name,
  };
}

export function makeProjectOpened(
  projectId: string,
  path: string,
): ProjectOpenedEvent {
  return {
    type: PROJECT_EVENT_TYPES.OPENED,
    occurredAt: Date.now(),
    aggregateId: projectId,
    projectId,
    path,
  };
}

export function makeProjectRenamed(
  projectId: string,
  oldName: string,
  newName: string,
): ProjectRenamedEvent {
  return {
    type: PROJECT_EVENT_TYPES.RENAMED,
    occurredAt: Date.now(),
    aggregateId: projectId,
    projectId,
    oldName,
    newName,
  };
}

export function makeProjectDeleted(
  projectId: string,
  path: string,
): ProjectDeletedEvent {
  return {
    type: PROJECT_EVENT_TYPES.DELETED,
    occurredAt: Date.now(),
    aggregateId: projectId,
    projectId,
    path,
  };
}
