/**
 * Project bounded context — Core types, value objects, and aggregate.
 *
 * Follows DDD: private constructors, factory methods, encapsulated events.
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeProjectCreated,
  makeProjectOpened,
  makeProjectRenamed,
} from './events';

// ─── Branded ID ───────────────────────────────────────────────────────────────

export type ProjectId = string & { readonly _brand: 'ProjectId' };

export function toProjectId(id: string): ProjectId {
  if (!id || !id.trim()) throw new Error('ProjectId cannot be empty');
  return id as ProjectId;
}

// ─── Value Object: ProjectPath ────────────────────────────────────────────────

/**
 * Represents a validated, absolute filesystem path for a project.
 * Accepts both Unix (/foo/bar) and Windows (C:\foo\bar or C:/foo/bar) paths.
 */
export class ProjectPath {
  private constructor(readonly value: string) {}

  static create(raw: string): ProjectPath {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('Project path required');
    }
    const isUnix    = trimmed.startsWith('/');
    const isWindows = /^[A-Za-z]:[/\\]/.test(trimmed);
    if (!isUnix && !isWindows) {
      throw new Error('Absolute path required');
    }
    return new ProjectPath(trimmed);
  }

  /** The last path segment — used as the default display name. */
  get name(): string {
    return this.value.split(/[/\\]/).filter(Boolean).pop() ?? this.value;
  }

  equals(other: ProjectPath): boolean {
    return this.value === other.value;
  }
}

// ─── Value Object: ProjectName ────────────────────────────────────────────────

/**
 * Represents a human-readable project name (1–100 chars, trimmed).
 */
export class ProjectName {
  private constructor(readonly value: string) {}

  static create(raw: string): ProjectName {
    const v = raw.trim();
    if (!v || v.length > 100) {
      throw new Error('Name must be 1-100 characters');
    }
    return new ProjectName(v);
  }

  equals(other: ProjectName): boolean {
    return this.value === other.value;
  }
}

// ─── Raw Snapshot Shape ───────────────────────────────────────────────────────

export interface RawProject {
  id: string;
  path: string;
  name?: string;
  createdAt?: string;
  lastOpenedAt?: string;
}

// ─── Aggregate: ProjectAggregate ─────────────────────────────────────────────

/**
 * Core aggregate for the project bounded context.
 *
 * - Private constructor enforces construction through factory methods.
 * - Domain events are accumulated internally and dispatched by the
 *   application service after persistence.
 */
export class ProjectAggregate {
  private constructor(
    readonly id: ProjectId,
    private _path: ProjectPath,
    private _name: ProjectName,
    readonly createdAt: number,
    private _lastOpenedAt: number | null,
    private _events: DomainEvent[],
  ) {}

  // ─── Factory: new aggregate ───────────────────────────────────────────────

  /**
   * Creates a brand-new project and records a ProjectCreatedEvent.
   */
  static create(id: string, path: string, name: string): ProjectAggregate {
    const pathVO = ProjectPath.create(path);
    const nameVO = ProjectName.create(name);
    const now    = Date.now();
    const projId = toProjectId(id);

    const aggregate = new ProjectAggregate(projId, pathVO, nameVO, now, null, []);
    aggregate._events.push(makeProjectCreated(id, pathVO.value, nameVO.value));
    return aggregate;
  }

  // ─── Factory: rehydrate from snapshot ────────────────────────────────────

  /**
   * Rehydrates an aggregate from a persisted snapshot. No events are raised.
   */
  static fromSnapshot(raw: RawProject): ProjectAggregate {
    const pathVO      = ProjectPath.create(raw.path);
    const effectiveName = raw.name ?? pathVO.name;
    const nameVO      = ProjectName.create(effectiveName);
    const createdAt   = raw.createdAt ? new Date(raw.createdAt).getTime() : 0;
    const lastOpenedAt = raw.lastOpenedAt
      ? new Date(raw.lastOpenedAt).getTime()
      : null;

    return new ProjectAggregate(
      toProjectId(raw.id),
      pathVO,
      nameVO,
      createdAt,
      lastOpenedAt,
      [],
    );
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  /**
   * Records that this project was opened and updates the last-opened timestamp.
   */
  open(): void {
    this._lastOpenedAt = Date.now();
    this._events.push(makeProjectOpened(this.id, this._path.value));
  }

  /**
   * Renames the project and records a ProjectRenamedEvent.
   * Validates the new name via ProjectName.create() — throws on invalid input.
   */
  rename(name: string): void {
    const oldName = this._name.value;
    this._name    = ProjectName.create(name);
    this._events.push(makeProjectRenamed(this.id, oldName, this._name.value));
  }

  // ─── Getters ──────────────────────────────────────────────────────────────

  get path(): string {
    return this._path.value;
  }

  get name(): string {
    return this._name.value;
  }

  get lastOpenedAt(): number | null {
    return this._lastOpenedAt;
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  // ─── Event management ─────────────────────────────────────────────────────

  /** Called by the application service after events have been dispatched. */
  clearEvents(): void {
    this._events = [];
  }

  // ─── Persistence ──────────────────────────────────────────────────────────

  toSnapshot(): RawProject {
    return {
      id:           this.id,
      path:         this._path.value,
      name:         this._name.value,
      createdAt:    new Date(this.createdAt).toISOString(),
      lastOpenedAt: this._lastOpenedAt
        ? new Date(this._lastOpenedAt).toISOString()
        : undefined,
    };
  }
}
