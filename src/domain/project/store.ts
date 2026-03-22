/**
 * Project bounded context — Zustand UI store.
 *
 * Thin adapter that delegates every mutation to ProjectApplicationService
 * and exposes reactive state to React components.
 *
 * Instantiated with the in-memory repository and the globalEventBus so that
 * the store is self-contained in development.  Production builds can replace
 * the repository by supplying a different implementation at startup.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { ProjectId } from './types';
import { ProjectAggregate } from './types';
import { InMemoryProjectRepository } from './repository';
import { ProjectApplicationService } from './service';

// ─── Store State ──────────────────────────────────────────────────────────────

export interface ProjectState {
  /** All loaded projects. */
  projects: ProjectAggregate[];
  /** The ID of the currently active project, or null. */
  currentProjectId: ProjectId | null;
  /** True while any async operation is in progress. */
  loading: boolean;
  /** Last error message, or null if no error. */
  error: string | null;
}

// ─── Store Actions ────────────────────────────────────────────────────────────

export interface ProjectActions {
  /** Reload all projects from the repository. */
  loadProjects(): Promise<void>;
  /** Set the active project (does not call openProject on the aggregate). */
  selectProject(id: ProjectId | null): void;
  /** Open a project by ID (updates lastOpenedAt and raises ProjectOpenedEvent). */
  openProject(id: string): Promise<void>;
  /** Create and persist a new project. */
  createProject(path: string, name: string): Promise<void>;
  /** Rename an existing project. */
  renameProject(id: string, newName: string): Promise<void>;
  /** Delete a project from the repository. */
  deleteProject(id: string): Promise<void>;
  /** Clear any stored error message. */
  clearError(): void;
}

export type ProjectStore = ProjectState & ProjectActions;

// ─── Service singleton ────────────────────────────────────────────────────────

// A module-scoped service instance.  Tests can shadow this by providing their
// own store via createProjectStore() below.
const defaultService = new ProjectApplicationService(
  new InMemoryProjectRepository(),
  globalEventBus,
);

// ─── Store factory ────────────────────────────────────────────────────────────

/**
 * Builds a Zustand store backed by the supplied service.
 * Exported for testing; application code should use `useProjectStore`.
 */
export function createProjectStore(
  service: ProjectApplicationService = defaultService,
) {
  return create<ProjectStore>((set, _get) => ({
    // ── Initial state ────────────────────────────────────────────────────
    projects:         [],
    currentProjectId: null,
    loading:          false,
    error:            null,

    // ── Actions ──────────────────────────────────────────────────────────

    async loadProjects() {
      set({ loading: true, error: null });
      const result = await service.listProjects();
      if (result.ok) {
        set({ projects: result.value, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    },

    selectProject(id) {
      set({ currentProjectId: id });
    },

    async openProject(id) {
      set({ loading: true, error: null });
      const result = await service.openProject(id);
      if (result.ok) {
        set(state => ({
          loading:          false,
          currentProjectId: result.value.id,
          projects:         state.projects.map(p =>
            p.id === result.value.id ? result.value : p,
          ),
        }));
      } else {
        set({ error: result.error, loading: false });
      }
    },

    async createProject(path, name) {
      set({ loading: true, error: null });
      const id     = crypto.randomUUID();
      const result = await service.createProject(id, path, name);
      if (result.ok) {
        set(state => ({
          loading:  false,
          projects: [...state.projects, result.value],
        }));
      } else {
        set({ error: result.error, loading: false });
      }
    },

    async renameProject(id, newName) {
      set({ loading: true, error: null });
      const result = await service.renameProject(id, newName);
      if (result.ok) {
        // Reload to pick up the updated aggregate
        const listResult = await service.listProjects();
        if (listResult.ok) {
          set({ loading: false, projects: listResult.value });
        } else {
          set({ loading: false, error: listResult.error });
        }
      } else {
        set({ error: result.error, loading: false });
      }
    },

    async deleteProject(id) {
      set({ loading: true, error: null });
      const result = await service.deleteProject(id);
      if (result.ok) {
        set(state => ({
          loading:          false,
          projects:         state.projects.filter(p => p.id !== id),
          currentProjectId: state.currentProjectId === id ? null : state.currentProjectId,
        }));
      } else {
        set({ error: result.error, loading: false });
      }
    },

    clearError() {
      set({ error: null });
    },
  }));
}

// ─── Default exported store ───────────────────────────────────────────────────

/**
 * Application-wide project store.
 * Import this hook inside React components:
 *
 *   const projects = useProjectStore(s => s.projects);
 *   const load     = useProjectStore(s => s.loadProjects);
 */
export const useProjectStore = createProjectStore();
