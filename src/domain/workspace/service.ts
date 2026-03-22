/**
 * Workspace bounded context — Application Service.
 *
 * WorkspaceApplicationService is the single entry point for all workspace
 * mutations. It coordinates the repository and event bus, ensuring that:
 *   1. Aggregates are loaded from the repository.
 *   2. Commands are executed on the aggregate.
 *   3. The modified aggregate is persisted.
 *   4. Domain events raised inside the aggregate are dispatched.
 *   5. The aggregate's event buffer is cleared.
 *
 * All public methods return Result<T> — they never throw.
 *
 * No imports from React, Tauri, window, or localStorage are permitted here.
 */

import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { DomainEventBus } from '../shared/event-bus';
import { WorkspaceAggregate } from './types';
import type { WorkspaceId, RawWorkspace, RawTab } from './types';
import { TabId } from './types';
import type { IWorkspaceRepository } from './repository';
import type { SessionId } from '../session/types';
import type { ProjectId } from '../project/types';

// ─── WorkspaceApplicationService ─────────────────────────────────────────────

export class WorkspaceApplicationService {
  constructor(
    private readonly repository: IWorkspaceRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── Workspace lifecycle ──────────────────────────────────────────────────

  /**
   * Creates a new workspace for the given session + project pair.
   * Returns the new WorkspaceId on success.
   */
  async createWorkspace(sessionId: SessionId, projectId: ProjectId): Promise<Result<WorkspaceId>> {
    try {
      const workspace = WorkspaceAggregate.create(sessionId, projectId);
      const saveResult = this.repository.save(workspace);
      if (!saveResult.ok) return saveResult;
      this._dispatchAndClear(workspace);
      return Ok(workspace.id);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Retrieves the full aggregate snapshot for a workspace.
   */
  async getWorkspace(workspaceId: WorkspaceId): Promise<Result<RawWorkspace>> {
    try {
      const result = this.repository.findById(workspaceId);
      if (!result.ok) return result;
      return Ok(result.value.toSnapshot());
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Deletes a workspace by ID.
   */
  async deleteWorkspace(workspaceId: WorkspaceId): Promise<Result<void>> {
    try {
      return this.repository.delete(workspaceId);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ─── Tab commands ─────────────────────────────────────────────────────────

  /**
   * Opens a new tab (or focuses it if already open) in the workspace.
   * Returns the updated WorkspaceAggregate on success.
   *
   * @param workspaceId - target workspace
   * @param path        - filesystem or virtual path for the tab
   * @param label       - display title / label
   * @param rawTabId    - optional caller-supplied ID (e.g. the existing React tab id)
   * @param opts        - optional extended tab metadata (tabType, status, sessionId, etc.)
   */
  async openTab(
    workspaceId: WorkspaceId,
    path: string,
    label: string,
    rawTabId?: string,
    opts?: Pick<RawTab, 'tabType' | 'status' | 'sessionId' | 'agentRunId' | 'icon' | 'hasUnsavedChanges'>,
  ): Promise<Result<WorkspaceAggregate>> {
    return this._withWorkspace(workspaceId, (ws) => {
      const rawId = rawTabId ?? `tab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const tabIdResult = TabId.create(rawId);
      if (!tabIdResult.ok) return tabIdResult;
      const tabId = tabIdResult.value;

      const openResult = ws.openTab(tabId, path, label, opts);
      if (!openResult.ok) return openResult;
      return Ok(ws);
    });
  }

  /**
   * Closes the specified tab.
   * No-op (returns Ok) if the workspace has only one tab — the last tab
   * invariant is enforced by the aggregate.
   */
  async closeTab(workspaceId: WorkspaceId, tabId: TabId): Promise<Result<void>> {
    return this._withWorkspace(workspaceId, (ws) => {
      ws.closeTab(tabId);
      return Ok(undefined);
    });
  }

  /**
   * Makes the specified tab active.
   * Returns the updated WorkspaceAggregate on success.
   */
  async activateTab(workspaceId: WorkspaceId, tabId: TabId): Promise<Result<WorkspaceAggregate>> {
    return this._withWorkspace(workspaceId, (ws) => {
      ws.activateTab(tabId);
      return Ok(ws);
    });
  }

  /**
   * Reorders the tabs in the workspace to match the supplied order array.
   * Returns the updated WorkspaceAggregate on success.
   */
  async reorderTabs(workspaceId: WorkspaceId, newOrder: TabId[]): Promise<Result<WorkspaceAggregate>> {
    return this._withWorkspace(workspaceId, (ws) => {
      ws.reorderTabs(newOrder);
      return Ok(ws);
    });
  }

  /**
   * Renames the specified tab.
   * Returns the updated WorkspaceAggregate on success.
   */
  async renameTab(workspaceId: WorkspaceId, tabId: TabId, label: string): Promise<Result<WorkspaceAggregate>> {
    return this._withWorkspace(workspaceId, (ws) => {
      ws.renameTab(tabId, label);
      return Ok(ws);
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Load → mutate → save → dispatch pattern.
   * Any exception inside the callback is caught and returned as Err.
   */
  private _withWorkspace<T>(
    workspaceId: WorkspaceId,
    fn: (workspace: WorkspaceAggregate) => Result<T>,
  ): Result<T> {
    try {
      const findResult = this.repository.findById(workspaceId);
      if (!findResult.ok) return findResult;

      const workspace = findResult.value;
      const cmdResult = fn(workspace);
      if (!cmdResult.ok) return cmdResult;

      const saveResult = this.repository.save(workspace);
      if (!saveResult.ok) return saveResult;

      this._dispatchAndClear(workspace);
      return cmdResult;
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  private _dispatchAndClear(workspace: WorkspaceAggregate): void {
    this.eventBus.dispatch(workspace.events);
    workspace.clearEvents();
  }
}
