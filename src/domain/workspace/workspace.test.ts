/**
 * Workspace bounded context — WorkspaceApplicationService tests.
 *
 * Uses InMemoryWorkspaceRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { InMemoryWorkspaceRepository } from './repository';
import { WorkspaceApplicationService } from './service';
import { WORKSPACE_EVENT_TYPES } from './events';
import type { WorkspaceId, TabId } from './types';
import { toTabId, toWorkspaceId } from './types';
import type { SessionId } from '../session/types';
import type { ProjectId } from '../project/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCollectingBus(): { bus: DomainEventBus; collected: DomainEvent[] } {
  const bus = new DomainEventBus();
  const collected: DomainEvent[] = [];
  const originalDispatch = bus.dispatch.bind(bus);
  bus.dispatch = (events: ReadonlyArray<DomainEvent>) => {
    collected.push(...events);
    originalDispatch(events);
  };
  return { bus, collected };
}

let _counter = 0;

function uniqueSessionId(): SessionId {
  _counter += 1;
  return `session-ws-${Date.now()}-${_counter}` as SessionId;
}

function uniqueProjectId(): ProjectId {
  _counter += 1;
  return `project-ws-${Date.now()}-${_counter}` as ProjectId;
}

// ─── createWorkspace ──────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.createWorkspace()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);
  });

  it('returns Ok with a WorkspaceId on valid inputs', () => {
    const result = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value).toBe('string');
    expect(result.value.length).toBeGreaterThan(0);
  });

  it('generates a unique WorkspaceId each call', () => {
    const r1 = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    const r2 = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.value).not.toBe(r2.value);
  });

  it('persists the workspace in the repository', () => {
    const result = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());

    expect(result.ok).toBe(true);
    expect(repo.size).toBe(1);
  });

  it('the created workspace can be retrieved by its ID', () => {
    const sessionId = uniqueSessionId();
    const projectId = uniqueProjectId();
    const createResult = svc.createWorkspace(sessionId, projectId);
    if (!createResult.ok) return;

    const getResult = svc.getWorkspace(createResult.value);

    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.sessionId).toBe(sessionId);
    expect(getResult.value.projectId).toBe(projectId);
  });

  it('dispatches no events on workspace creation', () => {
    svc.createWorkspace(uniqueSessionId(), uniqueProjectId());

    expect(collected).toHaveLength(0);
  });
});

// ─── openTab ──────────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.openTab()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;
  let workspaceId: WorkspaceId;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);
    const result = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!result.ok) throw new Error('setup failed');
    workspaceId = result.value;
    collected.length = 0;
  });

  it('returns Ok with a TabId on success', () => {
    const result = svc.openTab(workspaceId, '/src/main.ts', 'main.ts');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value).toBe('string');
  });

  it('uses the provided rawTabId when supplied', () => {
    const result = svc.openTab(workspaceId, '/src/index.ts', 'index.ts', 'my-tab-id');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('my-tab-id');
  });

  it('opening a tab with a duplicate tabId does not add a second tab', () => {
    svc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-dup');
    collected.length = 0;

    svc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-dup');

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    expect(ws.value.tabs).toHaveLength(1);
  });

  it('opening two distinct tabIds results in two tabs', () => {
    svc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-a');
    svc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-b');

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    expect(ws.value.tabs).toHaveLength(2);
  });

  it('dispatches TAB_OPENED event on first open', () => {
    svc.openTab(workspaceId, '/src/app.ts', 'app.ts', 'tab-new');

    const opened = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_OPENED);
    expect(opened).toHaveLength(1);
  });

  it('TAB_OPENED event carries correct tabId, path, and title', () => {
    svc.openTab(workspaceId, '/src/foo.ts', 'foo.ts', 'tab-foo');

    const evt = collected.find(e => e.type === WORKSPACE_EVENT_TYPES.TAB_OPENED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { tabId: TabId; path: string; title: string };
    expect(typed.tabId).toBe('tab-foo');
    expect(typed.path).toBe('/src/foo.ts');
    expect(typed.title).toBe('foo.ts');
  });

  it('dispatches TAB_ACTIVATED event when tab is opened', () => {
    svc.openTab(workspaceId, '/src/bar.ts', 'bar.ts', 'tab-bar');

    const activated = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_ACTIVATED);
    expect(activated).toHaveLength(1);
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.openTab(toWorkspaceId('ws-does-not-exist'), '/a.ts', 'a.ts');

    expect(result.ok).toBe(false);
  });
});

// ─── closeTab ─────────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.closeTab()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;
  let workspaceId: WorkspaceId;
  let tabA: TabId;
  let tabB: TabId;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);

    const wsResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!wsResult.ok) throw new Error('setup failed');
    workspaceId = wsResult.value;

    const r1 = svc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-a');
    const r2 = svc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-b');
    if (!r1.ok || !r2.ok) throw new Error('setup failed');
    tabA = r1.value;
    tabB = r2.value;
    collected.length = 0;
  });

  it('returns Ok when closing an existing tab', () => {
    const result = svc.closeTab(workspaceId, tabA);

    expect(result.ok).toBe(true);
  });

  it('the closed tab is no longer in the workspace', () => {
    svc.closeTab(workspaceId, tabA);

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const ids = ws.value.tabs.map(t => t.id);
    expect(ids).not.toContain(tabA);
  });

  it('the remaining tab is still in the workspace after close', () => {
    svc.closeTab(workspaceId, tabA);

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const ids = ws.value.tabs.map(t => t.id);
    expect(ids).toContain(tabB);
  });

  it('dispatches TAB_CLOSED event on success', () => {
    svc.closeTab(workspaceId, tabA);

    const closed = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_CLOSED);
    expect(closed).toHaveLength(1);
  });

  it('TAB_CLOSED event carries the correct tabId', () => {
    svc.closeTab(workspaceId, tabA);

    const evt = collected.find(e => e.type === WORKSPACE_EVENT_TYPES.TAB_CLOSED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { tabId: TabId };
    expect(typed.tabId).toBe(tabA);
  });

  it('cannot close the last remaining tab — aggregate enforces the invariant silently', () => {
    svc.closeTab(workspaceId, tabA); // now only tabB remains
    collected.length = 0;

    const result = svc.closeTab(workspaceId, tabB);

    // The service returns Ok (no-op, not an error)
    expect(result.ok).toBe(true);
    // No TAB_CLOSED event should have been dispatched
    const closed = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_CLOSED);
    expect(closed).toHaveLength(0);
  });

  it('workspace still has one tab after attempted close of last tab', () => {
    svc.closeTab(workspaceId, tabA); // close first
    svc.closeTab(workspaceId, tabB); // attempt to close last

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    expect(ws.value.tabs).toHaveLength(1);
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.closeTab(toWorkspaceId('ws-unknown'), tabA);

    expect(result.ok).toBe(false);
  });
});

// ─── activateTab ──────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.activateTab()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;
  let workspaceId: WorkspaceId;
  let tabA: TabId;
  let tabB: TabId;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);

    const wsResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!wsResult.ok) throw new Error('setup failed');
    workspaceId = wsResult.value;

    const r1 = svc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-a');
    const r2 = svc.openTab(workspaceId, '/src/b.ts', 'b.ts', 'tab-b');
    if (!r1.ok || !r2.ok) throw new Error('setup failed');
    tabA = r1.value;
    tabB = r2.value;
    collected.length = 0;
  });

  it('returns Ok when activating an existing tab', () => {
    const result = svc.activateTab(workspaceId, tabA);

    expect(result.ok).toBe(true);
  });

  it('dispatches TAB_ACTIVATED event when activating a different tab', () => {
    // tabB is currently active (opened last); activate tabA
    svc.activateTab(workspaceId, tabA);

    const activated = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_ACTIVATED);
    expect(activated).toHaveLength(1);
  });

  it('TAB_ACTIVATED event carries the correct tabId', () => {
    svc.activateTab(workspaceId, tabA);

    const evt = collected.find(e => e.type === WORKSPACE_EVENT_TYPES.TAB_ACTIVATED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { tabId: TabId };
    expect(typed.tabId).toBe(tabA);
  });

  it('activating the already-active tab produces no event', () => {
    // tabB is currently active (opened last)
    svc.activateTab(workspaceId, tabB);

    const activated = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_ACTIVATED);
    expect(activated).toHaveLength(0);
  });

  it('activating a non-existent tabId is a no-op — returns Ok', () => {
    const result = svc.activateTab(workspaceId, toTabId('tab-ghost'));

    expect(result.ok).toBe(true);
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.activateTab(toWorkspaceId('ws-unknown'), tabA);

    expect(result.ok).toBe(false);
  });
});

// ─── reorderTabs ──────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.reorderTabs()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;
  let workspaceId: WorkspaceId;
  let tabA: TabId;
  let tabB: TabId;
  let tabC: TabId;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);

    const wsResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!wsResult.ok) throw new Error('setup failed');
    workspaceId = wsResult.value;

    const r1 = svc.openTab(workspaceId, '/a.ts', 'a.ts', 'tab-a');
    const r2 = svc.openTab(workspaceId, '/b.ts', 'b.ts', 'tab-b');
    const r3 = svc.openTab(workspaceId, '/c.ts', 'c.ts', 'tab-c');
    if (!r1.ok || !r2.ok || !r3.ok) throw new Error('setup failed');
    tabA = r1.value;
    tabB = r2.value;
    tabC = r3.value;
    collected.length = 0;
  });

  it('returns Ok on a valid reorder', () => {
    const result = svc.reorderTabs(workspaceId, [tabC, tabA, tabB]);

    expect(result.ok).toBe(true);
  });

  it('persists the new tab order', () => {
    svc.reorderTabs(workspaceId, [tabC, tabA, tabB]);

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const ids = ws.value.tabs.map(t => t.id);
    expect(ids[0]).toBe(tabC);
    expect(ids[1]).toBe(tabA);
    expect(ids[2]).toBe(tabB);
  });

  it('dispatches TABS_REORDERED event', () => {
    svc.reorderTabs(workspaceId, [tabB, tabC, tabA]);

    const reordered = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TABS_REORDERED);
    expect(reordered).toHaveLength(1);
  });

  it('TABS_REORDERED event carries the new order', () => {
    svc.reorderTabs(workspaceId, [tabC, tabB, tabA]);

    const evt = collected.find(e => e.type === WORKSPACE_EVENT_TYPES.TABS_REORDERED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { newOrder: TabId[] };
    expect(typed.newOrder[0]).toBe(tabC);
    expect(typed.newOrder[1]).toBe(tabB);
    expect(typed.newOrder[2]).toBe(tabA);
  });

  it('unknown tabIds in newOrder are ignored — existing tabs are appended', () => {
    const result = svc.reorderTabs(workspaceId, [toTabId('no-such-tab'), tabA]);

    expect(result.ok).toBe(true);
    const ws = svc.getWorkspace(workspaceId);
    if (!ws.ok) return;
    // tabA first, then the remaining tabs (B and C) appended in original order
    expect(ws.value.tabs).toHaveLength(3);
    expect(ws.value.tabs[0]?.id).toBe(tabA);
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.reorderTabs(toWorkspaceId('ws-unknown'), [tabA]);

    expect(result.ok).toBe(false);
  });
});

// ─── renameTab ────────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.renameTab()', () => {
  let repo: InMemoryWorkspaceRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: WorkspaceApplicationService;
  let workspaceId: WorkspaceId;
  let tabA: TabId;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new WorkspaceApplicationService(repo, bus);

    const wsResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!wsResult.ok) throw new Error('setup failed');
    workspaceId = wsResult.value;

    const r1 = svc.openTab(workspaceId, '/src/a.ts', 'a.ts', 'tab-rename-a');
    if (!r1.ok) throw new Error('setup failed');
    tabA = r1.value;
    collected.length = 0;
  });

  it('returns Ok when renaming an existing tab', () => {
    const result = svc.renameTab(workspaceId, tabA, 'New Title');

    expect(result.ok).toBe(true);
  });

  it('persists the new title so getWorkspace reflects it', () => {
    svc.renameTab(workspaceId, tabA, 'Renamed Title');

    const ws = svc.getWorkspace(workspaceId);
    expect(ws.ok).toBe(true);
    if (!ws.ok) return;
    const tab = ws.value.tabs.find(t => t.id === tabA);
    expect(tab).toBeDefined();
    expect(tab?.title).toBe('Renamed Title');
  });

  it('dispatches TAB_RENAMED event on success', () => {
    svc.renameTab(workspaceId, tabA, 'Renamed Title');

    const renamed = collected.filter(e => e.type === WORKSPACE_EVENT_TYPES.TAB_RENAMED);
    expect(renamed).toHaveLength(1);
  });

  it('TAB_RENAMED event carries the correct tabId and new title', () => {
    svc.renameTab(workspaceId, tabA, 'My New Name');

    const evt = collected.find(e => e.type === WORKSPACE_EVENT_TYPES.TAB_RENAMED);
    expect(evt).toBeDefined();
    const typed = evt as unknown as { tabId: TabId; newTitle: string };
    expect(typed.tabId).toBe(tabA);
    expect(typed.newTitle).toBe('My New Name');
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.renameTab(toWorkspaceId('ws-unknown'), tabA, 'Title');

    expect(result.ok).toBe(false);
  });
});

// ─── getWorkspace ─────────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.getWorkspace()', () => {
  let repo: InMemoryWorkspaceRepository;
  let svc: WorkspaceApplicationService;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    svc = new WorkspaceApplicationService(repo, new DomainEventBus());
  });

  it('returns Ok with a RawWorkspace snapshot for a known id', () => {
    const sessionId = uniqueSessionId();
    const projectId = uniqueProjectId();
    const createResult = svc.createWorkspace(sessionId, projectId);
    if (!createResult.ok) return;

    const result = svc.getWorkspace(createResult.value);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id).toBe(createResult.value);
    expect(result.value.sessionId).toBe(sessionId);
    expect(result.value.projectId).toBe(projectId);
  });

  it('returns Err for an unknown workspaceId', () => {
    const result = svc.getWorkspace(toWorkspaceId('ws-ghost'));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ws-ghost');
  });
});

// ─── deleteWorkspace ──────────────────────────────────────────────────────────

describe('WorkspaceApplicationService.deleteWorkspace()', () => {
  let repo: InMemoryWorkspaceRepository;
  let svc: WorkspaceApplicationService;

  beforeEach(() => {
    repo = new InMemoryWorkspaceRepository();
    svc = new WorkspaceApplicationService(repo, new DomainEventBus());
  });

  it('returns Ok after deleting an existing workspace', () => {
    const createResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!createResult.ok) return;

    const result = svc.deleteWorkspace(createResult.value);

    expect(result.ok).toBe(true);
  });

  it('subsequent getWorkspace returns Err after deletion', () => {
    const createResult = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!createResult.ok) return;
    const wsId = createResult.value;

    svc.deleteWorkspace(wsId);
    const getResult = svc.getWorkspace(wsId);

    expect(getResult.ok).toBe(false);
  });

  it('repository size decreases after deletion', () => {
    const r1 = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    const r2 = svc.createWorkspace(uniqueSessionId(), uniqueProjectId());
    if (!r1.ok || !r2.ok) return;
    expect(repo.size).toBe(2);

    svc.deleteWorkspace(r1.value);

    expect(repo.size).toBe(1);
  });

  it('returns Ok even for an unknown workspaceId (no-op delete)', () => {
    const result = svc.deleteWorkspace(toWorkspaceId('ws-never-existed'));

    expect(result.ok).toBe(true);
  });
});
