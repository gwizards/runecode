/**
 * Project bounded context — Repository port (domain-facing interface).
 *
 * Application services depend on this interface; concrete implementations
 * (InMemoryProjectRepository, Tauri backend, etc.) are injected at runtime.
 */

import type { ProjectId } from '../types';
import type { ProjectAggregate } from '../types';

export interface IProjectRepository {
  /** Retrieve a project by its ID, or null if not found. */
  getProject(id: ProjectId): Promise<ProjectAggregate | null>;

  /** Find a project whose path matches exactly, or null if not found. */
  findByPath(path: string): Promise<ProjectAggregate | null>;

  /**
   * Persist a project (insert or update).
   * Overwrites any existing entry with the same ID.
   */
  saveProject(project: ProjectAggregate): Promise<void>;

  /** Remove a project by ID. Silently succeeds if not present. */
  deleteProject(id: ProjectId): Promise<void>;

  /** Return all persisted projects, ordered by insertion. */
  listProjects(): Promise<ProjectAggregate[]>;
}
