/**
 * Project bounded context — ProjectApplicationService tests.
 *
 * Groups:
 *  1. createProject  — happy path, duplicate path Err, invalid path Err
 *  2. openProject    — happy path + event, not-found Err
 *  3. renameProject  — happy path + event, not-found Err, invalid name Err (no persist)
 *  4. deleteProject  — happy path + event + removal, not-found Err
 *  5. getProject     — happy path, not-found Err
 *  6. listProjects   — returns all projects
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { unwrap } from '../shared/result';
import { InMemoryProjectRepository } from './repository';
import { ProjectAggregate } from './types';
import { PROJECT_EVENT_TYPES } from './events';
import type {
  ProjectCreatedEvent,
  ProjectOpenedEvent,
  ProjectRenamedEvent,
  ProjectDeletedEvent,
} from './events';
import { ProjectApplicationService } from './service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_PATH = '/home/user/projects/my-project';

function makeService(): {
  repo: InMemoryProjectRepository;
  bus: DomainEventBus;
  svc: ProjectApplicationService;
} {
  const repo = new InMemoryProjectRepository();
  const bus  = new DomainEventBus();
  const svc  = new ProjectApplicationService(repo, bus);
  return { repo, bus, svc };
}

async function seedProject(
  svc: ProjectApplicationService,
  id: string,
  path: string = VALID_PATH,
  name: string = 'Test Project',
): Promise<ProjectAggregate> {
  const result = await svc.createProject(id, path, name);
  return unwrap(result);
}

// ─── 1. createProject ─────────────────────────────────────────────────────────

describe('ProjectApplicationService — createProject', () => {
  let bus: DomainEventBus;
  let svc: ProjectApplicationService;

  beforeEach(() => {
    ({ bus, svc } = makeService());
  });

  it('createProject returns Ok with the new aggregate', async () => {
    const result = await svc.createProject('proj-1', VALID_PATH, 'My Project');
    expect(result.ok).toBe(true);
    const project = unwrap(result);
    expect(project.id).toBe('proj-1');
    expect(project.path).toBe(VALID_PATH);
    expect(project.name).toBe('My Project');
  });

  it('createProject dispatches ProjectCreatedEvent', async () => {
    const captured: DomainEvent[] = [];
    bus.on(PROJECT_EVENT_TYPES.CREATED, (e) => { captured.push(e); });

    await svc.createProject('proj-2', VALID_PATH, 'Event Project');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as ProjectCreatedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.CREATED);
    expect(evt.projectId).toBe('proj-2');
    expect(evt.path).toBe(VALID_PATH);
    expect(evt.name).toBe('Event Project');
  });

  it('events are cleared on the returned aggregate after creation', async () => {
    const result = await svc.createProject('proj-3', VALID_PATH, 'Clear Events');
    const project = unwrap(result);
    expect(project.events).toHaveLength(0);
  });

  it('createProject returns Err if a project with the same path already exists', async () => {
    await svc.createProject('proj-4', VALID_PATH, 'First');
    const duplicate = await svc.createProject('proj-5', VALID_PATH, 'Duplicate');
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(duplicate.error).toContain(VALID_PATH);
    }
  });

  it('createProject returns Err for a relative (non-absolute) path', async () => {
    const result = await svc.createProject('proj-6', 'relative/path', 'Invalid');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/absolute/i);
    }
  });

  it('createProject returns Err for an empty path', async () => {
    const result = await svc.createProject('proj-7', '', 'No Path');
    expect(result.ok).toBe(false);
  });

  it('createProject returns Err for a name exceeding 100 characters', async () => {
    const longName = 'x'.repeat(101);
    const result = await svc.createProject('proj-8', VALID_PATH, longName);
    expect(result.ok).toBe(false);
  });
});

// ─── 2. openProject ───────────────────────────────────────────────────────────

describe('ProjectApplicationService — openProject', () => {
  let bus: DomainEventBus;
  let svc: ProjectApplicationService;

  beforeEach(() => {
    ({ bus, svc } = makeService());
  });

  it('openProject returns Ok and updates lastOpenedAt', async () => {
    await seedProject(svc, 'open-1');
    const before = Date.now();
    const result = await svc.openProject('open-1');
    expect(result.ok).toBe(true);

    const project = unwrap(result);
    expect(project.lastOpenedAt).not.toBeNull();
    expect(project.lastOpenedAt!).toBeGreaterThanOrEqual(before);
  });

  it('openProject dispatches ProjectOpenedEvent', async () => {
    await seedProject(svc, 'open-2');

    const captured: DomainEvent[] = [];
    bus.on(PROJECT_EVENT_TYPES.OPENED, (e) => { captured.push(e); });

    await svc.openProject('open-2');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as ProjectOpenedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.OPENED);
    expect(evt.projectId).toBe('open-2');
    expect(evt.path).toBe(VALID_PATH);
  });

  it('openProject returns Err when project does not exist', async () => {
    const result = await svc.openProject('no-such-project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-project');
    }
  });
});

// ─── 3. renameProject ─────────────────────────────────────────────────────────

describe('ProjectApplicationService — renameProject', () => {
  let bus: DomainEventBus;
  let svc: ProjectApplicationService;

  beforeEach(() => {
    ({ bus, svc } = makeService());
  });

  it('renameProject returns Ok and persists the new name', async () => {
    await seedProject(svc, 'rename-1', VALID_PATH, 'Old Name');
    const result = await svc.renameProject('rename-1', 'New Name');
    expect(result.ok).toBe(true);

    // Verify persistence
    const getResult = await svc.getProject('rename-1');
    const project = unwrap(getResult);
    expect(project.name).toBe('New Name');
  });

  it('renameProject dispatches ProjectRenamedEvent', async () => {
    await seedProject(svc, 'rename-2', VALID_PATH, 'Before');

    const captured: DomainEvent[] = [];
    bus.on(PROJECT_EVENT_TYPES.RENAMED, (e) => { captured.push(e); });

    await svc.renameProject('rename-2', 'After');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as ProjectRenamedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.RENAMED);
    expect(evt.projectId).toBe('rename-2');
    expect(evt.oldName).toBe('Before');
    expect(evt.newName).toBe('After');
  });

  it('renameProject returns Err when project does not exist', async () => {
    const result = await svc.renameProject('ghost-proj', 'New Name');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ghost-proj');
    }
  });

  it('renameProject with empty string returns Err and does NOT persist', async () => {
    await seedProject(svc, 'rename-3', VALID_PATH, 'Stable Name');

    const result = await svc.renameProject('rename-3', '');
    expect(result.ok).toBe(false);

    // Name must be unchanged in the repo
    const getResult = await svc.getProject('rename-3');
    const project = unwrap(getResult);
    expect(project.name).toBe('Stable Name');
  });

  it('renameProject with name > 100 chars returns Err and does NOT persist', async () => {
    await seedProject(svc, 'rename-4', VALID_PATH, 'Stable');
    const longName = 'y'.repeat(101);

    const result = await svc.renameProject('rename-4', longName);
    expect(result.ok).toBe(false);

    const getResult = await svc.getProject('rename-4');
    const project = unwrap(getResult);
    expect(project.name).toBe('Stable');
  });
});

// ─── 4. deleteProject ─────────────────────────────────────────────────────────

describe('ProjectApplicationService — deleteProject', () => {
  let bus: DomainEventBus;
  let svc: ProjectApplicationService;

  beforeEach(() => {
    ({ bus, svc } = makeService());
  });

  it('deleteProject returns Ok', async () => {
    await seedProject(svc, 'del-1');
    const result = await svc.deleteProject('del-1');
    expect(result.ok).toBe(true);
  });

  it('deleteProject removes the project from the repository', async () => {
    await seedProject(svc, 'del-2');
    await svc.deleteProject('del-2');

    const getResult = await svc.getProject('del-2');
    expect(getResult.ok).toBe(false);
  });

  it('deleteProject dispatches ProjectDeletedEvent', async () => {
    await seedProject(svc, 'del-3', VALID_PATH, 'Farewell');

    const captured: DomainEvent[] = [];
    bus.on(PROJECT_EVENT_TYPES.DELETED, (e) => { captured.push(e); });

    await svc.deleteProject('del-3');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as ProjectDeletedEvent;
    expect(evt.type).toBe(PROJECT_EVENT_TYPES.DELETED);
    expect(evt.projectId).toBe('del-3');
    expect(evt.path).toBe(VALID_PATH);
  });

  it('deleteProject returns Err when project does not exist', async () => {
    const result = await svc.deleteProject('no-such-project');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-project');
    }
  });
});

// ─── 5. getProject ────────────────────────────────────────────────────────────

describe('ProjectApplicationService — getProject', () => {
  let svc: ProjectApplicationService;

  beforeEach(() => {
    ({ svc } = makeService());
  });

  it('getProject returns Ok with the correct aggregate', async () => {
    await svc.createProject('get-1', VALID_PATH, 'Readable');
    const result = await svc.getProject('get-1');
    expect(result.ok).toBe(true);
    const project = unwrap(result);
    expect(project.id).toBe('get-1');
    expect(project.name).toBe('Readable');
    expect(project.path).toBe(VALID_PATH);
  });

  it('getProject returns Err when project does not exist', async () => {
    const result = await svc.getProject('not-here');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not-here');
    }
  });
});

// ─── 6. listProjects ──────────────────────────────────────────────────────────

describe('ProjectApplicationService — listProjects', () => {
  it('listProjects returns empty array when no projects exist', async () => {
    const { svc } = makeService();
    const result = await svc.listProjects();
    expect(result.ok).toBe(true);
    expect(unwrap(result)).toHaveLength(0);
  });

  it('listProjects returns all created projects', async () => {
    const { svc } = makeService();
    await svc.createProject('list-1', '/home/user/a', 'Alpha');
    await svc.createProject('list-2', '/home/user/b', 'Beta');
    await svc.createProject('list-3', '/home/user/c', 'Gamma');

    const result = await svc.listProjects();
    expect(result.ok).toBe(true);
    const projects = unwrap(result);
    expect(projects).toHaveLength(3);
    const ids = projects.map((p) => p.id).sort();
    expect(ids).toEqual(['list-1', 'list-2', 'list-3']);
  });

  it('listProjects does not include deleted projects', async () => {
    const { svc } = makeService();
    await svc.createProject('keep-1', '/home/user/keep', 'Keep');
    await svc.createProject('del-x',  '/home/user/del',  'Delete Me');
    await svc.deleteProject('del-x');

    const result = await svc.listProjects();
    const projects = unwrap(result);
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe('keep-1');
  });
});
