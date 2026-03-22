/**
 * Workspace bounded context — Aggregates and Value Objects.
 *
 * WorkspaceAggregate owns the tab collection for a session/project pair.
 * All mutations go through aggregate methods; domain events are raised
 * internally and dispatched by the application service after persistence.
 *
 * No imports from React, Tauri, window, or localStorage are permitted here.
 */

import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { DomainEvent } from '../shared/event-bus';
import type { SessionId } from '../session/types';
import type { ProjectId } from '../project/types';
import {
  makeTabOpened,
  makeTabClosed,
  makeTabActivated,
  makeTabsReordered,
  makeTabRenamed,
} from './events';

// ─── Branded IDs ──────────────────────────────────────────────────────────────

export type TabId = string & { readonly _brand: 'TabId' };
export type WorkspaceId = string & { readonly _brand: 'WorkspaceId' };

/**
 * Validate and brand a raw string as TabId.
 * Returns Err if the string is empty or whitespace-only.
 */
export function toTabId(raw: string): Result<TabId> {
  if (!raw || !raw.trim()) return Err('TabId cannot be empty');
  return Ok(raw as TabId);
}

/**
 * Validate and brand a raw string as WorkspaceId.
 * Returns Err if the string is empty or whitespace-only.
 */
export function toWorkspaceId(raw: string): Result<WorkspaceId> {
  if (!raw || !raw.trim()) return Err('WorkspaceId cannot be empty');
  return Ok(raw as WorkspaceId);
}

// ─── Raw snapshot shapes ──────────────────────────────────────────────────────

export interface RawTab {
  id: string;
  path: string;
  title: string;
  isPinned: boolean;
  isActive: boolean;
  // Extended metadata — all optional so existing code keeps compiling.
  tabType?: 'chat' | 'agent' | 'settings' | 'projects' | 'browser' | 'terminal' | 'agentExecution';
  status?: 'idle' | 'running' | 'completed' | 'error';
  sessionId?: string;
  agentRunId?: string;
  icon?: string;
  hasUnsavedChanges?: boolean;
}

export interface RawWorkspace {
  id: string;
  sessionId: string;
  projectId: string;
  tabs: RawTab[];
  createdAt: number;
}

// ─── Value Object: TabRecord ──────────────────────────────────────────────────

/**
 * Immutable snapshot of a single tab's state.
 * Constructed via TabRecord.create() or TabRecord.fromRaw().
 */
export class TabRecord {
  private constructor(
    readonly id: TabId,
    readonly path: string,
    readonly title: string,
    readonly isPinned: boolean,
    readonly isActive: boolean,
    // Extended optional metadata
    readonly tabType?: RawTab['tabType'],
    readonly status?: RawTab['status'],
    readonly sessionId?: string,
    readonly agentRunId?: string,
    readonly icon?: string,
    readonly hasUnsavedChanges?: boolean,
  ) {}

  static create(
    id: TabId,
    path: string,
    title: string,
    opts?: Pick<RawTab, 'tabType' | 'status' | 'sessionId' | 'agentRunId' | 'icon' | 'hasUnsavedChanges'>,
  ): Result<TabRecord> {
    if (!path.trim()) return Err('TabRecord.path cannot be empty');
    if (!title.trim()) return Err('TabRecord.title cannot be empty');
    return Ok(new TabRecord(
      id, path, title, false, false,
      opts?.tabType, opts?.status, opts?.sessionId, opts?.agentRunId, opts?.icon, opts?.hasUnsavedChanges,
    ));
  }

  static fromRaw(raw: RawTab): Result<TabRecord> {
    const idResult = toTabId(raw.id);
    if (!idResult.ok) return idResult;
    return Ok(new TabRecord(
      idResult.value,
      raw.path,
      raw.title,
      raw.isPinned,
      raw.isActive,
      raw.tabType,
      raw.status,
      raw.sessionId,
      raw.agentRunId,
      raw.icon,
      raw.hasUnsavedChanges,
    ));
  }

  withTitle(title: string): Result<TabRecord> {
    if (!title.trim()) return Err('TabRecord.title cannot be empty');
    return Ok(new TabRecord(
      this.id, this.path, title, this.isPinned, this.isActive,
      this.tabType, this.status, this.sessionId, this.agentRunId, this.icon, this.hasUnsavedChanges,
    ));
  }

  withActive(isActive: boolean): TabRecord {
    return new TabRecord(
      this.id, this.path, this.title, this.isPinned, isActive,
      this.tabType, this.status, this.sessionId, this.agentRunId, this.icon, this.hasUnsavedChanges,
    );
  }

  withPinned(isPinned: boolean): TabRecord {
    return new TabRecord(
      this.id, this.path, this.title, isPinned, this.isActive,
      this.tabType, this.status, this.sessionId, this.agentRunId, this.icon, this.hasUnsavedChanges,
    );
  }

  toRaw(): RawTab {
    return {
      id: this.id,
      path: this.path,
      title: this.title,
      isPinned: this.isPinned,
      isActive: this.isActive,
      tabType: this.tabType,
      status: this.status,
      sessionId: this.sessionId,
      agentRunId: this.agentRunId,
      icon: this.icon,
      hasUnsavedChanges: this.hasUnsavedChanges,
    };
  }
}

// ─── WorkspaceAggregate ───────────────────────────────────────────────────────

/**
 * Aggregate root for the workspace bounded context.
 *
 * Invariants enforced:
 *   - At least one tab must remain open (cannot close the last tab).
 *   - Tab IDs within a workspace are unique.
 *   - Only one tab may be active at a time.
 *
 * Domain events are accumulated in _events and dispatched by the
 * WorkspaceApplicationService after save(). Call clearEvents() afterward.
 */
export class WorkspaceAggregate {
  private _tabs: TabRecord[];
  private _activeTabId: TabId | null;
  private _events: DomainEvent[];

  private constructor(
    readonly id: WorkspaceId,
    readonly sessionId: SessionId,
    readonly projectId: ProjectId,
    tabs: TabRecord[],
    activeTabId: TabId | null,
    readonly createdAt: number,
    events: DomainEvent[],
  ) {
    this._tabs = tabs;
    this._activeTabId = activeTabId;
    this._events = events;
  }

  // ─── Factories ─────────────────────────────────────────────────────────────

  /**
   * Creates a new empty workspace. No events are raised on creation;
   * the caller should call openTab() immediately to add an initial tab.
   */
  static create(sessionId: SessionId, projectId: ProjectId): WorkspaceAggregate {
    // Generated ID is always non-empty — safe to cast directly.
    const id = `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}` as WorkspaceId;
    return new WorkspaceAggregate(id, sessionId, projectId, [], null, Date.now(), []);
  }

  /**
   * Rehydrates an aggregate from a persisted snapshot. No events are raised.
   * Returns Err if any tab ID in the snapshot is invalid.
   */
  static fromSnapshot(raw: RawWorkspace): Result<WorkspaceAggregate> {
    const tabs: TabRecord[] = [];
    for (const rawTab of raw.tabs) {
      const tabResult = TabRecord.fromRaw(rawTab);
      if (!tabResult.ok) return tabResult;
      tabs.push(tabResult.value);
    }

    const idResult = toWorkspaceId(raw.id);
    if (!idResult.ok) return idResult;

    const activeTab = tabs.find(t => t.isActive) ?? tabs[0] ?? null;
    const activeTabId: TabId | null = activeTab ? activeTab.id : null;
    return Ok(new WorkspaceAggregate(
      idResult.value,
      raw.sessionId as SessionId,
      raw.projectId as ProjectId,
      tabs,
      activeTabId,
      raw.createdAt,
      [],
    ));
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  /**
   * Opens a new tab and makes it active.
   * Raises TabOpened then TabActivated.
   * Returns Err if path or title is empty.
   *
   * @param opts - Optional extended metadata (tabType, status, sessionId, etc.)
   */
  openTab(
    tabId: TabId,
    path: string,
    title: string,
    opts?: Pick<RawTab, 'tabType' | 'status' | 'sessionId' | 'agentRunId' | 'icon' | 'hasUnsavedChanges'>,
  ): Result<void> {
    const existing = this._tabs.find(t => t.id === tabId);
    if (existing) {
      // Tab already open — just activate it.
      this.activateTab(tabId);
      return Ok(undefined);
    }

    const tabResult = TabRecord.create(tabId, path, title, opts);
    if (!tabResult.ok) return tabResult;

    this._tabs = [...this._tabs, tabResult.value];
    this._events.push(makeTabOpened(this.id, tabId, path, title, opts));

    this._setActive(tabId);
    return Ok(undefined);
  }

  /**
   * Closes the tab with the given ID.
   * Raises TabClosed.
   *
   * Invariant: cannot close the last tab — returns without mutation if only
   * one tab remains.
   */
  closeTab(tabId: TabId): void {
    if (this._tabs.length <= 1) {
      // Invariant: cannot close last tab.
      return;
    }

    const index = this._tabs.findIndex(t => t.id === tabId);
    if (index === -1) return;

    const wasActive = this._activeTabId === tabId;
    this._tabs = this._tabs.filter(t => t.id !== tabId);
    this._events.push(makeTabClosed(this.id, tabId));

    if (wasActive && this._tabs.length > 0) {
      const nextIndex = Math.min(index, this._tabs.length - 1);
      const next = this._tabs[nextIndex];
      if (next) this._setActive(next.id);
    }
  }

  /**
   * Makes the specified tab the active tab.
   * Raises TabActivated.
   */
  activateTab(tabId: TabId): void {
    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab) return;
    if (this._activeTabId === tabId) return;

    this._setActive(tabId);
  }

  /**
   * Reorders the tab list to match the provided order.
   * Raises TabsReordered.
   *
   * Any IDs in newOrder that do not exist are ignored.
   * Tabs not present in newOrder are appended at the end.
   */
  reorderTabs(newOrder: TabId[]): void {
    const tabMap = new Map(this._tabs.map(t => [t.id, t]));
    const ordered: TabRecord[] = [];

    for (const id of newOrder) {
      const t = tabMap.get(id);
      if (t) {
        ordered.push(t);
        tabMap.delete(id);
      }
    }

    // Append any tabs that were missing from newOrder.
    for (const t of tabMap.values()) {
      ordered.push(t);
    }

    this._tabs = ordered;
    this._events.push(makeTabsReordered(this.id, ordered.map(t => t.id)));
  }

  /**
   * Renames the tab with the given ID.
   * Raises TabRenamed.
   * Empty title is silently ignored (no mutation, no event).
   */
  renameTab(tabId: TabId, title: string): void {
    const index = this._tabs.find(t => t.id === tabId);
    if (!index) return;
    if (!title.trim()) return;

    const newTabs: TabRecord[] = [];
    for (const t of this._tabs) {
      if (t.id === tabId) {
        const renamed = t.withTitle(title);
        if (!renamed.ok) return; // title was empty (already guarded above)
        newTabs.push(renamed.value);
      } else {
        newTabs.push(t);
      }
    }
    this._tabs = newTabs;
    this._events.push(makeTabRenamed(this.id, tabId, title));
  }

  // ─── Getters ───────────────────────────────────────────────────────────────

  get tabs(): ReadonlyArray<TabRecord> {
    return this._tabs.slice();
  }

  get activeTabId(): TabId | null {
    return this._activeTabId;
  }

  get activeTab(): TabRecord | null {
    if (!this._activeTabId) return null;
    return this._tabs.find(t => t.id === this._activeTabId) ?? null;
  }

  get tabCount(): number {
    return this._tabs.length;
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events.slice();
  }

  clearEvents(): void {
    this._events = [];
  }

  // ─── Snapshot ──────────────────────────────────────────────────────────────

  toSnapshot(): RawWorkspace {
    return {
      id: this.id,
      sessionId: this.sessionId,
      projectId: this.projectId,
      tabs: this._tabs.map(t =>
        t.id === this._activeTabId ? t.withActive(true).toRaw() : t.withActive(false).toRaw(),
      ),
      createdAt: this.createdAt,
    };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private _setActive(tabId: TabId): void {
    this._activeTabId = tabId;
    this._tabs = this._tabs.map(t => t.withActive(t.id === tabId));
    this._events.push(makeTabActivated(this.id, tabId));
  }
}
