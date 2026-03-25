/**
 * Workspace bounded context — Value Object unit tests.
 *
 * Groups:
 *  1. TabId           (6 tests)
 *  2. WorkspaceId     (6 tests)
 *  3. TabRecord       (10 tests)
 *  4. TabLabel        (6 tests)
 *  5. TabPath         (4 tests)
 *  6. WorkspaceAggregate snapshot round-trip (3 tests)
 */

import { describe, it, expect } from 'vitest';

import { TabId, WorkspaceId, TabRecord, WorkspaceAggregate } from './types';
import type { RawTab } from './types';
import { TabLabel } from './value-objects/tab-label';
import { TabPath } from './value-objects/tab-label';
import { unwrap } from '../shared/result';
import { SessionId } from '../shared/session-id';
import { ProjectId } from '../shared/project-id';

// ─── 1. TabId ────────────────────────────────────────────────────────────────

describe('TabId', () => {
  it('creates from a valid string', () => {
    const r = TabId.create('tab-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('tab-001');
  });

  it('returns Err for empty string', () => {
    const r = TabId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = TabId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('trims whitespace on valid id', () => {
    const r = TabId.create('  tab-trimmed  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('tab-trimmed');
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(TabId.create('tab-eq'));
    const b = unwrap(TabId.create('tab-eq'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(TabId.create('tab-a'));
    const b = unwrap(TabId.create('tab-b'));
    expect(a.equals(b)).toBe(false);
  });

  it('generate() produces unique IDs', () => {
    const a = TabId.generate();
    const b = TabId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(TabId.create('tab-str'));
    expect(id.toString()).toBe('tab-str');
  });
});

// ─── 2. WorkspaceId ──────────────────────────────────────────────────────────

describe('WorkspaceId', () => {
  it('creates from a valid string', () => {
    const r = WorkspaceId.create('ws-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('ws-001');
  });

  it('returns Err for empty string', () => {
    const r = WorkspaceId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = WorkspaceId.create('   ');
    expect(r.ok).toBe(false);
  });

  it('trims whitespace on valid id', () => {
    const r = WorkspaceId.create('  ws-trimmed  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('ws-trimmed');
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(WorkspaceId.create('ws-eq'));
    const b = unwrap(WorkspaceId.create('ws-eq'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(WorkspaceId.create('ws-a'));
    const b = unwrap(WorkspaceId.create('ws-b'));
    expect(a.equals(b)).toBe(false);
  });

  it('generate() produces unique IDs with ws- prefix', () => {
    const a = WorkspaceId.generate();
    const b = WorkspaceId.generate();
    expect(a.value).toMatch(/^ws-/);
    expect(a.value).not.toBe(b.value);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(WorkspaceId.create('ws-str'));
    expect(id.toString()).toBe('ws-str');
  });
});

// ─── 3. TabRecord ────────────────────────────────────────────────────────────

describe('TabRecord', () => {
  const tabId = () => TabId.generate();

  it('creates successfully with valid path and title', () => {
    const r = TabRecord.create(tabId(), '/src/main.ts', 'main.ts');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.path).toBe('/src/main.ts');
    expect(r.value.title).toBe('main.ts');
    expect(r.value.isPinned).toBe(false);
    expect(r.value.isActive).toBe(false);
  });

  it('returns Err for empty path', () => {
    const r = TabRecord.create(tabId(), '  ', 'title');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('path');
  });

  it('returns Err for empty title', () => {
    const r = TabRecord.create(tabId(), '/valid/path', '  ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('title');
  });

  it('creates with optional metadata', () => {
    const id = tabId();
    const r = TabRecord.create(id, '/src/app.ts', 'app.ts', {
      tabType: 'chat',
      status: 'running',
      icon: 'chat-icon',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tabType).toBe('chat');
    expect(r.value.status).toBe('running');
    expect(r.value.icon).toBe('chat-icon');
  });

  it('fromRaw reconstitutes a tab from a raw snapshot', () => {
    const raw: RawTab = {
      id: 'tab-raw-1',
      path: '/src/index.ts',
      title: 'index.ts',
      isPinned: true,
      isActive: false,
      tabType: 'terminal',
    };
    const r = TabRecord.fromRaw(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.path).toBe('/src/index.ts');
    expect(r.value.isPinned).toBe(true);
    expect(r.value.tabType).toBe('terminal');
  });

  it('fromRaw returns Err for empty tab id', () => {
    const raw: RawTab = {
      id: '',
      path: '/src/a.ts',
      title: 'a.ts',
      isPinned: false,
      isActive: false,
    };
    const r = TabRecord.fromRaw(raw);
    expect(r.ok).toBe(false);
  });

  it('withTitle returns a new TabRecord with the updated title', () => {
    const original = unwrap(TabRecord.create(tabId(), '/a.ts', 'Old Title'));
    const renamed = unwrap(original.withTitle('New Title'));
    expect(renamed.title).toBe('New Title');
    expect(original.title).toBe('Old Title'); // immutable
  });

  it('withTitle returns Err for empty title', () => {
    const original = unwrap(TabRecord.create(tabId(), '/a.ts', 'Title'));
    const r = original.withTitle('   ');
    expect(r.ok).toBe(false);
  });

  it('withActive returns a new TabRecord with updated active flag', () => {
    const original = unwrap(TabRecord.create(tabId(), '/a.ts', 'A'));
    expect(original.isActive).toBe(false);
    const active = original.withActive(true);
    expect(active.isActive).toBe(true);
    expect(original.isActive).toBe(false); // immutable
  });

  it('withPinned returns a new TabRecord with updated pinned flag', () => {
    const original = unwrap(TabRecord.create(tabId(), '/a.ts', 'A'));
    expect(original.isPinned).toBe(false);
    const pinned = original.withPinned(true);
    expect(pinned.isPinned).toBe(true);
    expect(original.isPinned).toBe(false); // immutable
  });

  it('toRaw round-trips losslessly through fromRaw', () => {
    const id = tabId();
    const original = unwrap(TabRecord.create(id, '/src/file.ts', 'file.ts', {
      tabType: 'agent',
      status: 'completed',
      sessionId: 'sess-1',
      agentRunId: 'run-1',
      icon: 'agent-icon',
      hasUnsavedChanges: true,
    }));
    const raw = original.toRaw();
    const restored = unwrap(TabRecord.fromRaw(raw));

    expect(restored.path).toBe(original.path);
    expect(restored.title).toBe(original.title);
    expect(restored.tabType).toBe(original.tabType);
    expect(restored.status).toBe(original.status);
    expect(restored.sessionId).toBe(original.sessionId);
    expect(restored.agentRunId).toBe(original.agentRunId);
    expect(restored.icon).toBe(original.icon);
    expect(restored.hasUnsavedChanges).toBe(original.hasUnsavedChanges);
  });
});

// ─── 4. TabLabel ─────────────────────────────────────────────────────────────

describe('TabLabel', () => {
  it('creates from a valid string', () => {
    const r = TabLabel.create('main.ts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('main.ts');
  });

  it('returns Err for empty string', () => {
    const r = TabLabel.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = TabLabel.create('   ');
    expect(r.ok).toBe(false);
  });

  it('returns Err when exceeding 200 characters', () => {
    const r = TabLabel.create('a'.repeat(201));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('200');
  });

  it('accepts exactly 200 characters', () => {
    const r = TabLabel.create('a'.repeat(200));
    expect(r.ok).toBe(true);
  });

  it('fromPath extracts the filename from a path', () => {
    const label = TabLabel.fromPath('/src/domain/workspace/types.ts');
    expect(label.value).toBe('types.ts');
  });

  it('fromPath uses the full path when no slash is present', () => {
    const label = TabLabel.fromPath('README.md');
    expect(label.value).toBe('README.md');
  });

  it('toString() returns the inner value', () => {
    const label = unwrap(TabLabel.create('hello.ts'));
    expect(label.toString()).toBe('hello.ts');
  });
});

// ─── 5. TabPath ──────────────────────────────────────────────────────────────

describe('TabPath', () => {
  it('creates from a valid string', () => {
    const r = TabPath.create('/src/main.ts');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('/src/main.ts');
  });

  it('returns Err for empty string', () => {
    const r = TabPath.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = TabPath.create('   ');
    expect(r.ok).toBe(false);
  });

  it('trims whitespace', () => {
    const r = TabPath.create('  /src/index.ts  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('/src/index.ts');
  });

  it('toString() returns the inner value', () => {
    const path = unwrap(TabPath.create('/file.ts'));
    expect(path.toString()).toBe('/file.ts');
  });
});

// ─── 6. WorkspaceAggregate snapshot round-trip ───────────────────────────────

describe('WorkspaceAggregate snapshot round-trip', () => {
  it('create produces a valid aggregate with zero tabs', () => {
    const sessionId = SessionId._unsafe('session-snap-1');
    const projectId = ProjectId.generate();
    const r = WorkspaceAggregate.create(sessionId, projectId);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.tabCount).toBe(0);
    expect(r.value.activeTabId).toBeNull();
  });

  it('round-trips through toSnapshot and fromSnapshot', () => {
    const sessionId = SessionId._unsafe('session-snap-2');
    const projectId = ProjectId.generate();
    const ws = unwrap(WorkspaceAggregate.create(sessionId, projectId));
    const tabId = TabId.generate();
    ws.openTab(tabId, '/src/app.ts', 'app.ts');
    ws.clearEvents();

    const snapshot = ws.toSnapshot();
    const restored = unwrap(WorkspaceAggregate.fromSnapshot(snapshot));

    expect(restored.id.toString()).toBe(ws.id.toString());
    expect(restored.tabCount).toBe(1);
    expect(restored.tabs[0].title).toBe('app.ts');
  });

  it('fromSnapshot falls back to "unknown" for invalid projectId', () => {
    const sessionId = SessionId._unsafe('session-snap-3');
    const projectId = ProjectId.generate();
    const ws = unwrap(WorkspaceAggregate.create(sessionId, projectId));
    const snapshot = ws.toSnapshot();
    // Corrupt the projectId
    snapshot.projectId = '';

    const r = WorkspaceAggregate.fromSnapshot(snapshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.projectId.toString()).toBe('unknown');
  });

  it('fromSnapshot returns Err for invalid workspace id', () => {
    const r = WorkspaceAggregate.fromSnapshot({
      id: '',
      sessionId: 'sess-1',
      projectId: 'proj-1',
      tabs: [],
      createdAt: Date.now(),
    });
    expect(r.ok).toBe(false);
  });
});
