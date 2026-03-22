/**
 * Project bounded context — Repository interface and in-memory implementation.
 *
 * Application services depend on IProjectRepository; concrete implementations
 * (Tauri backend, IndexedDB, in-memory for tests) are injected at runtime.
 */

import type { ProjectId } from './types';
import { ProjectAggregate } from './types';

// ─── Repository Interface ─────────────────────────────────────────────────────

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

// ─── In-Memory Implementation ─────────────────────────────────────────────────

/**
 * Volatile, in-process store.
 * Intended for tests and development stubs — not for production persistence.
 */
export class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects = new Map<string, ReturnType<ProjectAggregate['toSnapshot']>>();

  async getProject(id: ProjectId): Promise<ProjectAggregate | null> {
    const snapshot = this.projects.get(id);
    if (!snapshot) return null;
    return ProjectAggregate.fromSnapshot(snapshot);
  }

  async findByPath(path: string): Promise<ProjectAggregate | null> {
    for (const snapshot of this.projects.values()) {
      if (snapshot.path === path) return ProjectAggregate.fromSnapshot(snapshot);
    }
    return null;
  }

  async saveProject(project: ProjectAggregate): Promise<void> {
    this.projects.set(project.id, project.toSnapshot());
  }

  async deleteProject(id: ProjectId): Promise<void> {
    this.projects.delete(id);
  }

  async listProjects(): Promise<ProjectAggregate[]> {
    return Array.from(this.projects.values()).map(ProjectAggregate.fromSnapshot);
  }

  /**
   * Test helper: directly insert an aggregate without going through domain logic.
   * Useful to pre-populate state before exercising a use-case.
   */
  seed(project: ProjectAggregate): void {
    this.projects.set(project.id, project.toSnapshot());
  }
}
