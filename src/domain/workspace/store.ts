/**
 * Workspace bounded context — Zustand UI store.
 *
 * Thin adapter that delegates every mutation to WorkspaceApplicationService
 * and exposes reactive state to React components.
 *
 * Instantiated with the in-memory repository and the globalEventBus so that
 * the store is self-contained in development. Production builds can replace
 * the repository by supplying a different implementation at startup.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { WorkspaceId, TabId, RawWorkspace, RawTab } from './types';
import type { SessionId } from '../session/types';
import type { ProjectId } from '../project/types';
import { InMemoryWorkspaceRepository } from './repository';
import { WorkspaceApplicationService } from './service';

// ─── Store State ──────────────────────────────────────────────────────────────

export interface WorkspaceState {
  /** The currently active workspace snapshot, or null if none loaded. */
  workspace: RawWorkspace | null;
  /** The ID of the currently active workspace, or null. */
  currentWorkspaceId: WorkspaceId | null;
  /** True while any operation is in progress. */
  loading: boolean;
  /** Last error message, or null if no error. */
  error: string | null;
}

// ─── Store Actions ────────────────────────────────────────────────────────────

export interface WorkspaceActions {
  /** Create a new workspace for the given session + project. */
  createWorkspace(sessionId: SessionId, projectId: ProjectId): Promise<void>;
  /** Load an existing workspace by ID. */
  loadWorkspace(workspaceId: WorkspaceId): Promise<void>;
  /** Open a tab in the current workspace, with optional extended metadata. */
  openTab(
    path: string,
    title: string,
    rawTabId?: string,
    opts?: Pick<RawTab, 'tabType' | 'status' | 'sessionId' | 'agentRunId' | 'icon' | 'hasUnsavedChanges'>,
  ): Promise<void>;
  /** Close a tab by ID. */
  closeTab(tabId: TabId): Promise<void>;
  /** Activate a tab by ID. */
  activateTab(tabId: TabId): Promise<void>;
  /** Reorder tabs by providing the desired tab ID order. */
  reorderTabs(newOrder: TabId[]): Promise<void>;
  /** Rename a tab. */
  renameTab(tabId: TabId, title: string): Promise<void>;
  /** Delete the current workspace. */
  deleteWorkspace(): Promise<void>;
  /** Clear any stored error message. */
  clearError(): void;
}

export type WorkspaceStore = WorkspaceState & WorkspaceActions;

// ─── Service singleton ────────────────────────────────────────────────────────

const defaultService = new WorkspaceApplicationService(
  new InMemoryWorkspaceRepository(),
  globalEventBus,
);

// ─── Store factory ────────────────────────────────────────────────────────────

/**
 * Builds a Zustand store backed by the supplied service.
 * Exported for testing; application code should use `useWorkspaceStore`.
 */
export function createWorkspaceStore(
  service: WorkspaceApplicationService = defaultService,
) {
  return create<WorkspaceStore>((set, get) => ({
    // ── Initial state ──────────────────────────────────────────────────────
    workspace:            null,
    currentWorkspaceId:   null,
    loading:              false,
    error:                null,

    // ── Actions ────────────────────────────────────────────────────────────

    async createWorkspace(sessionId, projectId) {
      set({ loading: true, error: null });
      const result = await service.createWorkspace(sessionId, projectId);
      if (result.ok) {
        const workspaceId = result.value;
        const wsResult = await service.getWorkspace(workspaceId);
        if (wsResult.ok) {
          set({ workspace: wsResult.value, currentWorkspaceId: workspaceId, loading: false });
        } else {
          set({ currentWorkspaceId: workspaceId, loading: false });
        }
      } else {
        set({ error: result.error, loading: false });
      }
    },

    async loadWorkspace(workspaceId) {
      set({ loading: true, error: null });
      const result = await service.getWorkspace(workspaceId);
      if (result.ok) {
        set({ workspace: result.value, currentWorkspaceId: workspaceId, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    },

    async openTab(path, title, rawTabId, opts) {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) {
        set({ error: 'No active workspace' });
        return;
      }
      const result = await service.openTab(currentWorkspaceId, path, title, rawTabId, opts);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({ workspace: result.value.toSnapshot() });
    },

    async closeTab(tabId) {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) return;
      const result = await service.closeTab(currentWorkspaceId, tabId);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      const wsResult = await service.getWorkspace(currentWorkspaceId);
      if (wsResult.ok) set({ workspace: wsResult.value });
    },

    async activateTab(tabId) {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) return;
      const result = await service.activateTab(currentWorkspaceId, tabId);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({ workspace: result.value.toSnapshot() });
    },

    async reorderTabs(newOrder) {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) return;
      const result = await service.reorderTabs(currentWorkspaceId, newOrder);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({ workspace: result.value.toSnapshot() });
    },

    async renameTab(tabId, title) {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) return;
      const result = await service.renameTab(currentWorkspaceId, tabId, title);
      if (!result.ok) {
        set({ error: result.error });
        return;
      }
      set({ workspace: result.value.toSnapshot() });
    },

    async deleteWorkspace() {
      const { currentWorkspaceId } = get();
      if (!currentWorkspaceId) return;
      set({ loading: true, error: null });
      const result = await service.deleteWorkspace(currentWorkspaceId);
      if (result.ok) {
        set({ workspace: null, currentWorkspaceId: null, loading: false });
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
 * Application-wide workspace store.
 * Import this hook inside React components:
 *
 *   const workspace = useWorkspaceStore(s => s.workspace);
 *   const openTab   = useWorkspaceStore(s => s.openTab);
 */
export const useWorkspaceStore = createWorkspaceStore();
