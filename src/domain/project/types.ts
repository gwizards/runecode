/**
 * Project bounded context — Core types, value objects, and aggregate.
 *
 * Follows DDD: private constructors, factory methods, encapsulated events.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  makeProjectCreated,
  makeProjectDeleted,
  makeProjectOpened,
  makeProjectRenamed,
} from './events';

// ─── Value Object: ProjectId ──────────────────────────────────────────────────

export class ProjectId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ProjectId> {
    if (!raw || !raw.trim()) return Err('ProjectId cannot be empty');
    return Ok(new ProjectId(raw.trim()));
  }

  static generate(): ProjectId { return new ProjectId(crypto.randomUUID()); }

  /** Internal: construct without validation (e.g., for sentinels). */
  static _unsafe(raw: string): ProjectId { return new ProjectId(raw); }

  equals(other: ProjectId): boolean { return this.value === other.value; }

  toString(): string { return this.value; }
}

// ─── Value Object: ProjectPath ────────────────────────────────────────────────

/**
 * Represents a validated, absolute filesystem path for a project.
 * Accepts both Unix (/foo/bar) and Windows (C:\foo\bar or C:/foo/bar) paths.
 */
export class ProjectPath {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ProjectPath> {
    const trimmed = raw.trim();
    if (!trimmed) {
      return Err('Project path required');
    }
    const isUnix    = trimmed.startsWith('/');
    const isWindows = /^[A-Za-z]:[/\\]/.test(trimmed);
    if (!isUnix && !isWindows) {
      return Err('Absolute path required');
    }
    return Ok(new ProjectPath(trimmed));
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

  static create(raw: string): Result<ProjectName> {
    const v = raw.trim();
    if (!v || v.length > 100) {
      return Err('Name must be 1-100 characters');
    }
    return Ok(new ProjectName(v));
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
  private _deleted = false;

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
  static create(id: string, path: string, name: string): Result<ProjectAggregate> {
    const pathResult = ProjectPath.create(path);
    if (!pathResult.ok) return pathResult;

    const nameResult = ProjectName.create(name);
    if (!nameResult.ok) return nameResult;

    const pathVO = pathResult.value;
    const nameVO = nameResult.value;
    const now    = Date.now();
    const projIdResult = ProjectId.create(id);
    if (!projIdResult.ok) return Err(projIdResult.error);

    const aggregate = new ProjectAggregate(projIdResult.value, pathVO, nameVO, now, null, []);
    aggregate._events.push(makeProjectCreated(projIdResult.value.toString(), pathVO.value, nameVO.value));
    return Ok(aggregate);
  }

  // ─── Factory: rehydrate from snapshot ────────────────────────────────────

  /**
   * Rehydrates an aggregate from a persisted snapshot. No events are raised.
   */
  static fromSnapshot(raw: RawProject): Result<ProjectAggregate> {
    const pathResult = ProjectPath.create(raw.path);
    if (!pathResult.ok) return pathResult;

    const pathVO = pathResult.value;
    const effectiveName = raw.name ?? pathVO.name;

    const nameResult = ProjectName.create(effectiveName);
    if (!nameResult.ok) return nameResult;

    const idResult = ProjectId.create(raw.id);
    if (!idResult.ok) return idResult;

    const createdAt   = raw.createdAt ? new Date(raw.createdAt).getTime() : 0;
    const lastOpenedAt = raw.lastOpenedAt
      ? new Date(raw.lastOpenedAt).getTime()
      : null;

    return Ok(new ProjectAggregate(
      idResult.value,
      pathResult.value,
      nameResult.value,
      createdAt,
      lastOpenedAt,
      [],
    ));
  }

  // ─── Commands ─────────────────────────────────────────────────────────────

  /**
   * Records that this project was opened and updates the last-opened timestamp.
   */
  open(): void {
    this._lastOpenedAt = Date.now();
    this._events.push(makeProjectOpened(this.id.toString(), this._path.value));
  }

  /**
   * Renames the project and records a ProjectRenamedEvent.
   * Returns Err if the new name is invalid — no event is pushed in that case.
   */
  rename(name: string): Result<void> {
    const nameResult = ProjectName.create(name);
    if (!nameResult.ok) return nameResult;
    const oldName  = this._name.value;
    this._name     = nameResult.value;
    this._events.push(makeProjectRenamed(this.id.toString(), oldName, this._name.value));
    return Ok(undefined);
  }

  /**
   * Marks the project as deleted and records a ProjectDeletedEvent.
   * Event is raised inside the aggregate and dispatched by the service.
   */
  markForDeletion(): void {
    this._deleted = true;
    this._events.push(makeProjectDeleted(this.id.toString(), this._path.value));
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

  get isDeleted(): boolean {
    return this._deleted;
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
      id:           this.id.toString(),
      path:         this._path.value,
      name:         this._name.value,
      createdAt:    new Date(this.createdAt).toISOString(),
      lastOpenedAt: this._lastOpenedAt
        ? new Date(this._lastOpenedAt).toISOString()
        : undefined,
    };
  }
}
