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

// ─── 1. ProjectPath VO ────────────────────────────────────────────────────────

describe('ProjectPath', () => {
  it('accepts a valid Unix absolute path', () => {
    const p = ProjectPath.create('/home/user/my-project');
    expect(p.value).toBe('/home/user/my-project');
    expect(p.name).toBe('my-project');
  });

  it('accepts a valid Windows absolute path', () => {
    const p = ProjectPath.create('C:\\Users\\user\\my-project');
    expect(p.value).toBe('C:\\Users\\user\\my-project');
    expect(p.name).toBe('my-project');
  });

  it('throws for an empty string', () => {
    expect(() => ProjectPath.create('')).toThrow('Project path required');
    expect(() => ProjectPath.create('   ')).toThrow('Project path required');
  });

  it('throws for a relative path', () => {
    expect(() => ProjectPath.create('relative/path')).toThrow('Absolute path required');
    expect(() => ProjectPath.create('./another')).toThrow('Absolute path required');
  });
});

// ─── 2. ProjectName VO ────────────────────────────────────────────────────────

describe('ProjectName', () => {
  it('trims whitespace and returns a valid name', () => {
    const n = ProjectName.create('  My Project  ');
    expect(n.value).toBe('My Project');
  });

  it('throws for a name exceeding 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    expect(() => ProjectName.create(tooLong)).toThrow('Name must be 1-100 characters');
  });

  it('throws for an empty name', () => {
    expect(() => ProjectName.create('')).toThrow('Name must be 1-100 characters');
    expect(() => ProjectName.create('   ')).toThrow('Name must be 1-100 characters');
  });
});

// ─── 3. ProjectAggregate.create() ────────────────────────────────────────────

describe('ProjectAggregate.create()', () => {
  it('raises a ProjectCreatedEvent with correct payload', () => {
    const agg = ProjectAggregate.create('proj-1', '/home/user/proj', 'My Project');

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
    const agg = ProjectAggregate.create('proj-2', '/tmp/workspace', 'Workspace');
    expect(agg.path).toBe('/tmp/workspace');
    expect(agg.name).toBe('Workspace');
    expect(agg.id).toBe('proj-2');
  });
});

// ─── 4. ProjectAggregate.open() ───────────────────────────────────────────────

describe('ProjectAggregate.open()', () => {
  it('raises a ProjectOpenedEvent and sets lastOpenedAt', () => {
    const before = Date.now();
    const agg = ProjectAggregate.create('proj-3', '/tmp/x', 'X');
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
    const agg = ProjectAggregate.create('proj-4', '/tmp/y', 'OldName');
    agg.clearEvents();

    agg.rename('NewName');

    expect(agg.events).toHaveLength(1);
    const evt = agg.events[0] as ProjectRenamedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.RENAMED);
    expect(evt.oldName).toBe('OldName');
    expect(evt.newName).toBe('NewName');
    expect(agg.name).toBe('NewName');
  });

  it('throws when the new name is invalid', () => {
    const agg = ProjectAggregate.create('proj-5', '/tmp/z', 'Valid');
    agg.clearEvents();
    expect(() => agg.rename('')).toThrow('Name must be 1-100 characters');
    // Events must NOT have been pushed for a failed rename
    expect(agg.events).toHaveLength(0);
  });
});

// ─── 6. InMemoryProjectRepository ────────────────────────────────────────────

describe('InMemoryProjectRepository', () => {
  it('round-trips save and get', async () => {
    const repo = new InMemoryProjectRepository();
    const agg  = ProjectAggregate.create('proj-r1', '/home/user/roundtrip', 'RoundTrip');

    await repo.saveProject(agg);
    const found = await repo.getProject(toProjectId('proj-r1'));

    expect(found).not.toBeNull();
    expect(found?.id).toBe('proj-r1');
    expect(found?.path).toBe('/home/user/roundtrip');
    expect(found?.name).toBe('RoundTrip');
  });

  it('findByPath returns the matching aggregate', async () => {
    const repo  = new InMemoryProjectRepository();
    const agg   = ProjectAggregate.create('proj-r2', '/var/code/alpha', 'Alpha');
    const other = ProjectAggregate.create('proj-r3', '/var/code/beta',  'Beta');

    repo.seed(agg);
    repo.seed(other);

    const found = await repo.findByPath('/var/code/alpha');
    expect(found?.id).toBe('proj-r2');

    const missing = await repo.findByPath('/nonexistent');
    expect(missing).toBeNull();
  });

  it('listProjects returns all saved aggregates', async () => {
    const repo = new InMemoryProjectRepository();
    repo.seed(ProjectAggregate.create('p1', '/a', 'A'));
    repo.seed(ProjectAggregate.create('p2', '/b', 'B'));

    const all = await repo.listProjects();
    expect(all).toHaveLength(2);
  });

  it('deleteProject removes the aggregate', async () => {
    const repo = new InMemoryProjectRepository();
    const agg  = ProjectAggregate.create('proj-del', '/del/me', 'ToDelete');
    repo.seed(agg);

    await repo.deleteProject(toProjectId('proj-del'));
    const found = await repo.getProject(toProjectId('proj-del'));
    expect(found).toBeNull();
  });
});
