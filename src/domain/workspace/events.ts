/**
 * Workspace bounded context — Domain Events.
 *
 * All workspace mutations raise typed events that carry only plain data.
 * No browser APIs, React, or Tauri imports are permitted here.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { TabId, WorkspaceId, RawTab } from './types';

// ─── Event type discriminators ────────────────────────────────────────────────

export const WORKSPACE_EVENT_TYPES = {
  TAB_OPENED:     'workspace/tab.opened',
  TAB_CLOSED:     'workspace/tab.closed',
  TAB_ACTIVATED:  'workspace/tab.activated',
  TABS_REORDERED: 'workspace/tabs.reordered',
  TAB_RENAMED:    'workspace/tab.renamed',
} as const;

/** Alias that matches the project-wide DOMAIN_EVENT_TYPES convention. */
export const DOMAIN_EVENT_TYPES = WORKSPACE_EVENT_TYPES;

export type WorkspaceEventType = typeof WORKSPACE_EVENT_TYPES[keyof typeof WORKSPACE_EVENT_TYPES];

// ─── Event interfaces ─────────────────────────────────────────────────────────

export interface TabOpenedEvent extends DomainEvent {
  readonly type: typeof WORKSPACE_EVENT_TYPES.TAB_OPENED;
  readonly tabId: TabId;
  readonly path: string;
  readonly title: string;
  // Extended metadata — mirrors the optional fields in RawTab.
  readonly tabType?: RawTab['tabType'];
  readonly status?: RawTab['status'];
  readonly sessionId?: string;
  readonly agentRunId?: string;
  readonly icon?: string;
  readonly hasUnsavedChanges?: boolean;
}

export interface TabClosedEvent extends DomainEvent {
  readonly type: typeof WORKSPACE_EVENT_TYPES.TAB_CLOSED;
  readonly tabId: TabId;
}

export interface TabActivatedEvent extends DomainEvent {
  readonly type: typeof WORKSPACE_EVENT_TYPES.TAB_ACTIVATED;
  readonly tabId: TabId;
}

export interface TabsReorderedEvent extends DomainEvent {
  readonly type: typeof WORKSPACE_EVENT_TYPES.TABS_REORDERED;
  readonly newOrder: ReadonlyArray<TabId>;
}

export interface TabRenamedEvent extends DomainEvent {
  readonly type: typeof WORKSPACE_EVENT_TYPES.TAB_RENAMED;
  readonly tabId: TabId;
  readonly newTitle: string;
}

export type WorkspaceEvent =
  | TabOpenedEvent
  | TabClosedEvent
  | TabActivatedEvent
  | TabsReorderedEvent
  | TabRenamedEvent;

// ─── Factory functions ────────────────────────────────────────────────────────

export function makeTabOpened(
  workspaceId: WorkspaceId,
  tabId: TabId,
  path: string,
  title: string,
  opts?: Pick<RawTab, 'tabType' | 'status' | 'sessionId' | 'agentRunId' | 'icon' | 'hasUnsavedChanges'>,
): TabOpenedEvent {
  return {
    type: WORKSPACE_EVENT_TYPES.TAB_OPENED,
    occurredAt: Date.now(),
    aggregateId: workspaceId.toString(),
    tabId,
    path,
    title,
    tabType: opts?.tabType,
    status: opts?.status,
    sessionId: opts?.sessionId,
    agentRunId: opts?.agentRunId,
    icon: opts?.icon,
    hasUnsavedChanges: opts?.hasUnsavedChanges,
  };
}

export function makeTabClosed(
  workspaceId: WorkspaceId,
  tabId: TabId,
): TabClosedEvent {
  return {
    type: WORKSPACE_EVENT_TYPES.TAB_CLOSED,
    occurredAt: Date.now(),
    aggregateId: workspaceId.toString(),
    tabId,
  };
}

export function makeTabActivated(
  workspaceId: WorkspaceId,
  tabId: TabId,
): TabActivatedEvent {
  return {
    type: WORKSPACE_EVENT_TYPES.TAB_ACTIVATED,
    occurredAt: Date.now(),
    aggregateId: workspaceId.toString(),
    tabId,
  };
}

export function makeTabsReordered(
  workspaceId: WorkspaceId,
  newOrder: ReadonlyArray<TabId>,
): TabsReorderedEvent {
  return {
    type: WORKSPACE_EVENT_TYPES.TABS_REORDERED,
    occurredAt: Date.now(),
    aggregateId: workspaceId.toString(),
    newOrder: newOrder.slice(),
  };
}

export function makeTabRenamed(
  workspaceId: WorkspaceId,
  tabId: TabId,
  newTitle: string,
): TabRenamedEvent {
  return {
    type: WORKSPACE_EVENT_TYPES.TAB_RENAMED,
    occurredAt: Date.now(),
    aggregateId: workspaceId.toString(),
    tabId,
    newTitle,
  };
}
