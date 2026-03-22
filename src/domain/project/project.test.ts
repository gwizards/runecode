/**
 * Project bounded context — Unit tests.
 *
 * Groups:
 *   1. ProjectPath VO
 *   2. ProjectName VO
 *   3. ProjectAggregate.create()
 *   4. ProjectAggregate.open()
 *   5. ProjectAggregate.rename()
 *   6. InMemoryProjectRepository
 */

import { describe, it, expect } from 'vitest';
import { ProjectPath, ProjectName, ProjectAggregate } from './types';
import { PROJECT_EVENT_TYPES } from './events';
import type { ProjectCreatedEvent, ProjectOpenedEvent, ProjectRenamedEvent } from './events';
import { InMemoryProjectRepository } from './repository';
import { toProjectId } from './types';
import { unwrap } from '../shared/result';

// ─── 1. ProjectPath VO ────────────────────────────────────────────────────────

describe('ProjectPath', () => {
  it('accepts a valid Unix absolute path', () => {
    const p = unwrap(ProjectPath.create('/home/user/my-project'));
    expect(p.value).toBe('/home/user/my-project');
    expect(p.name).toBe('my-project');
  });

  it('accepts a valid Windows absolute path', () => {
    const p = unwrap(ProjectPath.create('C:\\Users\\user\\my-project'));
    expect(p.value).toBe('C:\\Users\\user\\my-project');
    expect(p.name).toBe('my-project');
  });

  it('returns Err for an empty string', () => {
    const r1 = ProjectPath.create('');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('Project path required');

    const r2 = ProjectPath.create('   ');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('Project path required');
  });

  it('returns Err for a relative path', () => {
    const r1 = ProjectPath.create('relative/path');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('Absolute path required');

    const r2 = ProjectPath.create('./another');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('Absolute path required');
  });
});

// ─── 2. ProjectName VO ────────────────────────────────────────────────────────

describe('ProjectName', () => {
  it('trims whitespace and returns a valid name', () => {
    const n = unwrap(ProjectName.create('  My Project  '));
    expect(n.value).toBe('My Project');
  });

  it('returns Err for a name exceeding 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    const result = ProjectName.create(tooLong);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Name must be 1-100 characters');
  });

  it('returns Err for an empty name', () => {
    const r1 = ProjectName.create('');
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe('Name must be 1-100 characters');

    const r2 = ProjectName.create('   ');
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('Name must be 1-100 characters');
  });
});

// ─── 3. ProjectAggregate.create() ────────────────────────────────────────────

describe('ProjectAggregate.create()', () => {
  it('raises a ProjectCreatedEvent with correct payload', () => {
    const agg = unwrap(ProjectAggregate.create('proj-1', '/home/user/proj', 'My Project'));

    expect(agg.events).toHaveLength(1);
    const evt = agg.events[0] as ProjectCreatedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.CREATED);
    expect(evt.projectId).toBe('proj-1');
    expect(evt.path).toBe('/home/user/proj');
    expect(evt.name).toBe('My Project');
    expect(evt.aggregateId).toBe('proj-1');
    expect(typeof evt.occurredAt).toBe('number');
  });

  it('exposes path and name via getters', () => {
    const agg = unwrap(ProjectAggregate.create('proj-2', '/tmp/workspace', 'Workspace'));
    expect(agg.path).toBe('/tmp/workspace');
    expect(agg.name).toBe('Workspace');
    expect(agg.id).toBe('proj-2');
  });
});

// ─── 4. ProjectAggregate.open() ───────────────────────────────────────────────

describe('ProjectAggregate.open()', () => {
  it('raises a ProjectOpenedEvent and sets lastOpenedAt', () => {
    const before = Date.now();
    const agg = unwrap(ProjectAggregate.create('proj-3', '/tmp/x', 'X'));
    agg.clearEvents(); // discard create event for clean assertion

    agg.open();

    expect(agg.events).toHaveLength(1);
    const evt = agg.events[0] as ProjectOpenedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.OPENED);
    expect(evt.projectId).toBe('proj-3');
    expect(evt.path).toBe('/tmp/x');
    expect(agg.lastOpenedAt).toBeGreaterThanOrEqual(before);
  });
});

// ─── 5. ProjectAggregate.rename() ────────────────────────────────────────────

describe('ProjectAggregate.rename()', () => {
  it('raises a ProjectRenamedEvent with old and new names', () => {
    const agg = unwrap(ProjectAggregate.create('proj-4', '/tmp/y', 'OldName'));
    agg.clearEvents();

    unwrap(agg.rename('NewName'));

    expect(agg.events).toHaveLength(1);
    const evt = agg.events[0] as ProjectRenamedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.RENAMED);
    expect(evt.oldName).toBe('OldName');
    expect(evt.newName).toBe('NewName');
    expect(agg.name).toBe('NewName');
  });

  it('returns Err when the new name is invalid', () => {
    const agg = unwrap(ProjectAggregate.create('proj-5', '/tmp/z', 'Valid'));
    agg.clearEvents();
    const result = agg.rename('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Name must be 1-100 characters');
    // Events must NOT have been pushed for a failed rename
    expect(agg.events).toHaveLength(0);
  });
});

// ─── 6. InMemoryProjectRepository ────────────────────────────────────────────

describe('InMemoryProjectRepository', () => {
  it('round-trips save and get', async () => {
    const repo = new InMemoryProjectRepository();
    const agg  = unwrap(ProjectAggregate.create('proj-r1', '/home/user/roundtrip', 'RoundTrip'));

    await repo.saveProject(agg);
    const found = await repo.getProject(toProjectId('proj-r1'));

    expect(found).not.toBeNull();
    expect(found?.id).toBe('proj-r1');
    expect(found?.path).toBe('/home/user/roundtrip');
    expect(found?.name).toBe('RoundTrip');
  });

  it('findByPath returns the matching aggregate', async () => {
    const repo  = new InMemoryProjectRepository();
    const agg   = unwrap(ProjectAggregate.create('proj-r2', '/var/code/alpha', 'Alpha'));
    const other = unwrap(ProjectAggregate.create('proj-r3', '/var/code/beta',  'Beta'));

    repo.seed(agg);
    repo.seed(other);

    const found = await repo.findByPath('/var/code/alpha');
    expect(found?.id).toBe('proj-r2');

    const missing = await repo.findByPath('/nonexistent');
    expect(missing).toBeNull();
  });

  it('listProjects returns all saved aggregates', async () => {
    const repo = new InMemoryProjectRepository();
    repo.seed(unwrap(ProjectAggregate.create('p1', '/a', 'A')));
    repo.seed(unwrap(ProjectAggregate.create('p2', '/b', 'B')));

    const all = await repo.listProjects();
    expect(all).toHaveLength(2);
  });

  it('deleteProject removes the aggregate', async () => {
    const repo = new InMemoryProjectRepository();
    const agg  = unwrap(ProjectAggregate.create('proj-del', '/del/me', 'ToDelete'));
    repo.seed(agg);

    await repo.deleteProject(toProjectId('proj-del'));
    const found = await repo.getProject(toProjectId('proj-del'));
    expect(found).toBeNull();
  });
});
