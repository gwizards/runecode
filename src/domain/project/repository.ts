/**
 * Project bounded context — Repository interface and in-memory implementation.
 *
 * IProjectRepository is the domain-facing port (defined in ./ports/IProjectRepository).
 * Concrete implementations (Tauri backend, IndexedDB, in-memory for tests) are
 * injected at runtime.
 */

import type { ProjectId, RawProject } from './types';
import { ProjectAggregate } from './types';
import { unwrap } from '../shared/result';
import { ProjectSnapshotQuantizer, QuantizedSnapshotStore } from '../shared/quantization';
import type { IProjectRepository } from './ports/IProjectRepository';

export type { IProjectRepository };

// ─── In-Memory Implementation ─────────────────────────────────────────────────

/**
 * Volatile, in-process store.
 * Intended for tests and development stubs — not for production persistence.
 */
export class InMemoryProjectRepository implements IProjectRepository {
  private readonly projects = new QuantizedSnapshotStore<RawProject, string>(
    new ProjectSnapshotQuantizer(),
  );

  async getProject(id: ProjectId): Promise<ProjectAggregate | null> {
    const snapshot = this.projects.get(id.toString());
    if (!snapshot) return null;
    return unwrap(ProjectAggregate.fromSnapshot(snapshot));
  }

  async findByPath(path: string): Promise<ProjectAggregate | null> {
    for (const snapshot of this.projects.values()) {
      if (snapshot.path === path) return unwrap(ProjectAggregate.fromSnapshot(snapshot));
    }
    return null;
  }

  async saveProject(project: ProjectAggregate): Promise<void> {
    this.projects.set(project.id.toString(), project.toSnapshot());
  }

  async deleteProject(id: ProjectId): Promise<void> {
    this.projects.delete(id.toString());
  }

  async listProjects(): Promise<ProjectAggregate[]> {
    return this.projects.values().map((s) => unwrap(ProjectAggregate.fromSnapshot(s)));
  }

  /**
   * Test helper: directly insert an aggregate without going through domain logic.
   * Useful to pre-populate state before exercising a use-case.
   */
  seed(project: ProjectAggregate): void {
    this.projects.set(project.id.toString(), project.toSnapshot());
  }
}
