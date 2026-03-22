/**
 * Workspace bounded context — Aggregates and Value Objects.
 *
 * WorkspaceAggregate owns the tab collection for a session/project pair.
 * All mutations go through aggregate methods; domain events are raised
 * internally and dispatched by the application service after persistence.
 *
 * No imports from React, Tauri, window, or localStorage are permitted here.
 */

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

export function toTabId(raw: string): TabId {
  if (!raw || !raw.trim()) throw new Error('TabId cannot be empty');
  return raw as TabId;
}

export function toWorkspaceId(raw: string): WorkspaceId {
  if (!raw || !raw.trim()) throw new Error('WorkspaceId cannot be empty');
  return raw as WorkspaceId;
}

// ─── Raw snapshot shapes ──────────────────────────────────────────────────────

export interface RawTab {
  id: string;
  path: string;
  title: string;
  isPinned: boolean;
  isActive: boolean;
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
  ) {}

  static create(id: TabId, path: string, title: string): TabRecord {
    if (!path.trim()) throw new Error('TabRecord.path cannot be empty');
    if (!title.trim()) throw new Error('TabRecord.title cannot be empty');
    return new TabRecord(id, path, title, false, false);
  }

  static fromRaw(raw: RawTab): TabRecord {
    return new TabRecord(
      toTabId(raw.id),
      raw.path,
      raw.title,
      raw.isPinned,
      raw.isActive,
    );
  }

  withTitle(title: string): TabRecord {
    if (!title.trim()) throw new Error('TabRecord.title cannot be empty');
    return new TabRecord(this.id, this.path, title, this.isPinned, this.isActive);
  }

  withActive(isActive: boolean): TabRecord {
    return new TabRecord(this.id, this.path, this.title, this.isPinned, isActive);
  }

  withPinned(isPinned: boolean): TabRecord {
    return new TabRecord(this.id, this.path, this.title, isPinned, this.isActive);
  }

  toRaw(): RawTab {
    return {
      id: this.id,
      path: this.path,
      title: this.title,
      isPinned: this.isPinned,
      isActive: this.isActive,
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
    const id = toWorkspaceId(`ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    return new WorkspaceAggregate(id, sessionId, projectId, [], null, Date.now(), []);
  }

  /**
   * Rehydrates an aggregate from a persisted snapshot. No events are raised.
   */
  static fromSnapshot(raw: RawWorkspace): WorkspaceAggregate {
    const tabs = raw.tabs.map(TabRecord.fromRaw);
    const activeTab = tabs.find(t => t.isActive) ?? tabs[0] ?? null;
    const activeTabId: TabId | null = activeTab ? activeTab.id : null;
    return new WorkspaceAggregate(
      toWorkspaceId(raw.id),
      raw.sessionId as SessionId,
      raw.projectId as ProjectId,
      tabs,
      activeTabId,
      raw.createdAt,
      [],
    );
  }

  // ─── Commands ──────────────────────────────────────────────────────────────

  /**
   * Opens a new tab and makes it active.
   * Raises TabOpened then TabActivated.
   */
  openTab(tabId: TabId, path: string, title: string): void {
    const existing = this._tabs.find(t => t.id === tabId);
    if (existing) {
      // Tab already open — just activate it.
      this.activateTab(tabId);
      return;
    }

    const tab = TabRecord.create(tabId, path, title);
    this._tabs = [...this._tabs, tab];
    this._events.push(makeTabOpened(this.id, tabId, path, title));

    this._setActive(tabId);
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
   */
  renameTab(tabId: TabId, title: string): void {
    const index = this._tabs.find(t => t.id === tabId);
    if (!index) return;
    if (!title.trim()) return;

    this._tabs = this._tabs.map(t => (t.id === tabId ? t.withTitle(title) : t));
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
