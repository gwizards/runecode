/**
 * Command bounded context — SlashCommandEntry aggregate + CommandApplicationService tests.
 *
 * Uses InMemoryCommandRepository and a real DomainEventBus.
 * No mocks — every test exercises the full domain stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { SlashCommandEntry, CommandId, CommandName, CommandScope } from './types';
import type { RawCommand } from './types';
import { COMMAND_EVENT_TYPES } from './events';
import { InMemoryCommandRepository } from './repository';
import { CommandApplicationService } from './service';

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

function makeRawCommand(overrides: Partial<RawCommand> = {}): RawCommand {
  return {
    id: 'cmd-001',
    name: 'optimize',
    full_command: '/project:optimize',
    scope: 'project',
    namespace: 'project',
    content: 'Run optimization pass',
    allowed_tools: [],
    has_bash_commands: false,
    has_file_references: false,
    accepts_arguments: false,
    ...overrides,
  };
}

/** Convenience: unwrap a register result or throw in test setup. */
function registerOrThrow(raw: RawCommand): SlashCommandEntry {
  const result = SlashCommandEntry.register(raw);
  if (!result.ok) throw new Error(`Test setup failed: ${result.error}`);
  return result.value;
}

// ─── CommandId VO ─────────────────────────────────────────────────────────────

describe('CommandId', () => {
  it('creates successfully for a non-empty string', () => {
    const result = CommandId.create('cmd-001');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('cmd-001');
  });

  it('returns Err for an empty string', () => {
    const result = CommandId.create('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });

  it('returns Err for a whitespace-only string', () => {
    const result = CommandId.create('   ');
    expect(result.ok).toBe(false);
  });

  it('trims leading/trailing whitespace', () => {
    const result = CommandId.create('  cmd-001  ');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('cmd-001');
  });
});

// ─── CommandName VO ───────────────────────────────────────────────────────────

describe('CommandName', () => {
  it('creates successfully for a valid name', () => {
    const result = CommandName.create('optimize');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.value).toBe('optimize');
  });

  it('returns Err for an empty string', () => {
    const result = CommandName.create('');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });

  it('returns Err for a name exceeding 64 characters', () => {
    const result = CommandName.create('a'.repeat(65));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/64 characters/i);
  });

  it('returns Err when name contains whitespace', () => {
    const result = CommandName.create('my command');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/whitespace/i);
  });

  it('returns Err when name contains "/"', () => {
    const result = CommandName.create('project/optimize');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must not contain/i);
  });
});

// ─── CommandScope VO ──────────────────────────────────────────────────────────

describe('CommandScope', () => {
  it('creates successfully for each valid scope', () => {
    for (const s of ['builtin', 'user', 'project', 'skill'] as const) {
      const result = CommandScope.create(s);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.value).toBe(s);
    }
  });

  it('returns Err for an invalid scope', () => {
    const result = CommandScope.create('invalid-scope');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/invalid commandscope/i);
  });
});

// ─── SlashCommandEntry.register() ─────────────────────────────────────────────

describe('SlashCommandEntry.register()', () => {
  it('registers a valid command and raises COMMAND_REGISTERED', () => {
    const entry = registerOrThrow(makeRawCommand());

    const events = entry.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(COMMAND_EVENT_TYPES.COMMAND_REGISTERED);
    expect(events[0].aggregateId).toBe('cmd-001');
  });

  it('exposes the correct name, fullCommand, and scope', () => {
    const entry = registerOrThrow(makeRawCommand());

    expect(entry.name).toBe('optimize');
    expect(entry.fullCommand).toBe('/project:optimize');
    expect(entry.scope).toBe('project');
  });

  it('returns Err when full_command does not start with "/"', () => {
    const result = SlashCommandEntry.register(
      makeRawCommand({ full_command: 'project:optimize' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must start with/i);
  });

  it('returns Err when scope is builtin and file_path is provided', () => {
    const result = SlashCommandEntry.register(
      makeRawCommand({ scope: 'builtin', file_path: '/home/user/.config/cmd.md' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/builtin commands must not have a filePath/i);
  });

  it('returns Err when hasBashCommands=true but allowedTools is empty', () => {
    const result = SlashCommandEntry.register(
      makeRawCommand({ has_bash_commands: true, allowed_tools: [] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/hasBashCommands=true requires allowedTools.length > 0/i);
  });

  it('returns Ok when hasBashCommands=true and allowedTools is non-empty', () => {
    const result = SlashCommandEntry.register(
      makeRawCommand({ has_bash_commands: true, allowed_tools: ['Bash'] }),
    );
    expect(result.ok).toBe(true);
  });

  it('returns Err when name contains whitespace', () => {
    const result = SlashCommandEntry.register(makeRawCommand({ name: 'my command' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must not contain whitespace/i);
  });

  it('returns Err when name contains "/"', () => {
    const result = SlashCommandEntry.register(makeRawCommand({ name: 'project/optimize' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/must not contain/i);
  });

  it('returns Err when name is empty', () => {
    const result = SlashCommandEntry.register(makeRawCommand({ name: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });

  it('returns Err when id is empty', () => {
    const result = SlashCommandEntry.register(makeRawCommand({ id: '' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });
});

// ─── SlashCommandEntry.select() ───────────────────────────────────────────────

describe('SlashCommandEntry.select()', () => {
  it('raises COMMAND_SELECTED with the correct method', () => {
    const entry = registerOrThrow(makeRawCommand());
    entry.clearEvents();

    entry.select('keyboard');

    const events = entry.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(COMMAND_EVENT_TYPES.COMMAND_SELECTED);
    const evt = events[0] as unknown as { method: string };
    expect(evt.method).toBe('keyboard');
  });

  it('each selection method produces a distinct event', () => {
    const entry = registerOrThrow(makeRawCommand());
    entry.clearEvents();

    entry.select('click');
    entry.select('autocomplete');

    const selected = entry.events.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_SELECTED);
    expect(selected).toHaveLength(2);
    const methods = selected.map((e) => (e as unknown as { method: string }).method);
    expect(methods).toContain('click');
    expect(methods).toContain('autocomplete');
  });
});

// ─── SlashCommandEntry.recordExecution() ──────────────────────────────────────

describe('SlashCommandEntry.recordExecution()', () => {
  it('raises COMMAND_EXECUTED with durationMs and success=true', () => {
    const entry = registerOrThrow(makeRawCommand());
    entry.clearEvents();

    entry.recordExecution(150, true);

    const events = entry.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(COMMAND_EVENT_TYPES.COMMAND_EXECUTED);
    const evt = events[0] as unknown as { durationMs: number; success: boolean };
    expect(evt.durationMs).toBe(150);
    expect(evt.success).toBe(true);
  });

  it('raises COMMAND_EXECUTED with success=false on failure', () => {
    const entry = registerOrThrow(makeRawCommand());
    entry.clearEvents();

    entry.recordExecution(42, false);

    const evt = entry.events[0] as unknown as { durationMs: number; success: boolean };
    expect(evt.success).toBe(false);
    expect(evt.durationMs).toBe(42);
  });
});

// ─── SlashCommandEntry.markDeleted() ─────────────────────────────────────────

describe('SlashCommandEntry.markDeleted()', () => {
  it('raises COMMAND_DELETED', () => {
    const entry = registerOrThrow(makeRawCommand());
    entry.clearEvents();

    entry.markDeleted();

    expect(entry.events).toHaveLength(1);
    expect(entry.events[0].type).toBe(COMMAND_EVENT_TYPES.COMMAND_DELETED);
    expect(entry.events[0].aggregateId).toBe('cmd-001');
  });
});

// ─── SlashCommandEntry.fromSnapshot() ────────────────────────────────────────

describe('SlashCommandEntry.fromSnapshot()', () => {
  it('reconstitutes without raising any events', () => {
    const original = registerOrThrow(makeRawCommand());
    const snapshot = original.toSnapshot();

    const result = SlashCommandEntry.fromSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = result.value;

    expect(restored.events).toHaveLength(0);
    expect(restored.id.value).toBe('cmd-001');
    expect(restored.name).toBe('optimize');
    expect(restored.fullCommand).toBe('/project:optimize');
    expect(restored.scope).toBe('project');
  });

  it('preserves capabilities from snapshot', () => {
    const raw = makeRawCommand({ has_bash_commands: true, allowed_tools: ['Bash', 'Read'] });
    const original = registerOrThrow(raw);
    const snapshot = original.toSnapshot();

    const result = SlashCommandEntry.fromSnapshot(snapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const restored = result.value;

    expect(restored.capabilities.hasBashCommands).toBe(true);
    expect(restored.capabilities.allowedTools).toEqual(['Bash', 'Read']);
  });

  it('returns Err when snapshot has an invalid id', () => {
    const original = registerOrThrow(makeRawCommand());
    const snapshot = { ...original.toSnapshot(), id: '' };

    const result = SlashCommandEntry.fromSnapshot(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });

  it('returns Err when snapshot has an invalid name', () => {
    const original = registerOrThrow(makeRawCommand());
    const snapshot = { ...original.toSnapshot(), name: '' };

    const result = SlashCommandEntry.fromSnapshot(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/cannot be empty/i);
  });

  it('returns Err when snapshot has invalid capabilities', () => {
    const original = registerOrThrow(makeRawCommand());
    const snapshot = {
      ...original.toSnapshot(),
      capabilities: { hasBashCommands: true, hasFileReferences: false, acceptsArguments: false, allowedTools: [] },
    };

    const result = SlashCommandEntry.fromSnapshot(snapshot);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/hasBashCommands=true requires allowedTools/i);
  });
});

// ─── CommandApplicationService.registerCommand() ─────────────────────────────

describe('CommandApplicationService.registerCommand()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(() => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
  });

  it('persists the command and dispatches COMMAND_REGISTERED', async () => {
    const result = await svc.registerCommand(makeRawCommand());

    expect(result.ok).toBe(true);
    const registered = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_REGISTERED);
    expect(registered).toHaveLength(1);
  });

  it('returns the new SlashCommandEntry aggregate on success', async () => {
    const result = await svc.registerCommand(makeRawCommand());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.fullCommand).toBe('/project:optimize');
  });

  it('returns Err when full_command is already registered (duplicate)', async () => {
    await svc.registerCommand(makeRawCommand());
    const result = await svc.registerCommand(makeRawCommand({ id: 'cmd-002' }));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/project:optimize');
  });

  it('allows two commands with different full_command strings', async () => {
    await svc.registerCommand(makeRawCommand({ id: 'cmd-A', full_command: '/cmd:alpha' }));
    const result = await svc.registerCommand(makeRawCommand({ id: 'cmd-B', full_command: '/cmd:beta' }));

    expect(result.ok).toBe(true);
  });
});

// ─── CommandApplicationService.selectCommand() ───────────────────────────────

describe('CommandApplicationService.selectCommand()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
    await svc.registerCommand(makeRawCommand());
    collected.length = 0;
  });

  it('records selection and dispatches COMMAND_SELECTED', async () => {
    const result = await svc.selectCommand('cmd-001', 'autocomplete');

    expect(result.ok).toBe(true);
    const selected = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_SELECTED);
    expect(selected).toHaveLength(1);
    const evt = selected[0] as unknown as { method: string };
    expect(evt.method).toBe('autocomplete');
  });

  it('returns the updated aggregate on success', async () => {
    const result = await svc.selectCommand('cmd-001', 'click');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.value).toBe('cmd-001');
  });

  it('returns Err for an unknown id', async () => {
    const result = await svc.selectCommand('no-such-cmd', 'click');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-cmd');
  });
});

// ─── CommandApplicationService.executeCommand() ──────────────────────────────

describe('CommandApplicationService.executeCommand()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
    await svc.registerCommand(makeRawCommand());
    collected.length = 0;
  });

  it('returns Ok and dispatches COMMAND_EXECUTED', async () => {
    const result = await svc.executeCommand('cmd-001', 200, true);

    expect(result.ok).toBe(true);
    const executed = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_EXECUTED);
    expect(executed).toHaveLength(1);
    const evt = executed[0] as unknown as { durationMs: number; success: boolean };
    expect(evt.durationMs).toBe(200);
    expect(evt.success).toBe(true);
  });

  it('records a failed execution correctly', async () => {
    const result = await svc.executeCommand('cmd-001', 50, false);

    expect(result.ok).toBe(true);
    const executed = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_EXECUTED);
    const evt = executed[0] as unknown as { success: boolean };
    expect(evt.success).toBe(false);
  });

  it('returns Err for an unknown command id', async () => {
    const result = await svc.executeCommand('ghost-cmd', 100, true);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('ghost-cmd');
  });
});

// ─── CommandApplicationService.deleteCommand() ───────────────────────────────

describe('CommandApplicationService.deleteCommand()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
    await svc.registerCommand(makeRawCommand());
    collected.length = 0;
  });

  it('returns Ok and dispatches COMMAND_DELETED', async () => {
    const result = await svc.deleteCommand('cmd-001');

    expect(result.ok).toBe(true);
    const deleted = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_DELETED);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].aggregateId).toBe('cmd-001');
  });

  it('removes the command from the repo so getCommand returns Err', async () => {
    await svc.deleteCommand('cmd-001');
    const result = await svc.getCommand('cmd-001');

    expect(result.ok).toBe(false);
  });

  it('returns Err for an unknown command id', async () => {
    const result = await svc.deleteCommand('no-such-cmd');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-cmd');
  });
});

// ─── CommandApplicationService.listCommands() ────────────────────────────────

describe('CommandApplicationService.listCommands()', () => {
  let repo: InMemoryCommandRepository;
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    svc = new CommandApplicationService(repo, new DomainEventBus());

    await svc.registerCommand(makeRawCommand({
      id: 'cmd-builtin-1',
      name: 'help',
      full_command: '/help',
      scope: 'builtin',
      namespace: undefined,
    }));

    await svc.registerCommand(makeRawCommand({
      id: 'cmd-user-1',
      name: 'myalias',
      full_command: '/user:myalias',
      scope: 'user',
      namespace: 'user',
    }));

    await svc.registerCommand(makeRawCommand({
      id: 'cmd-project-1',
      name: 'optimize',
      full_command: '/project:optimize',
      scope: 'project',
      namespace: 'project',
    }));

    await svc.registerCommand(makeRawCommand({
      id: 'cmd-project-2',
      name: 'lint',
      full_command: '/project:lint',
      scope: 'project',
      namespace: 'project',
    }));
  });

  it('lists all commands when no filter is given', async () => {
    const result = await svc.listCommands({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(4);
  });

  it('filters by scope', async () => {
    const result = await svc.listCommands({ scope: 'project' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    result.value.forEach((c) => expect(c.scope).toBe('project'));
  });

  it('filters by namespace', async () => {
    const result = await svc.listCommands({ namespace: 'project' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
    result.value.forEach((c) => expect(c.namespace).toBe('project'));
  });

  it('filters by scope AND namespace simultaneously', async () => {
    const result = await svc.listCommands({ scope: 'project', namespace: 'project' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(2);
  });

  it('returns empty array for a scope with no commands', async () => {
    const result = await svc.listCommands({ scope: 'skill' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('returns empty array when namespace filter matches nothing', async () => {
    const result = await svc.listCommands({ namespace: 'no-such-ns' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('filters builtin scope correctly', async () => {
    const result = await svc.listCommands({ scope: 'builtin' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(result.value[0].id.value).toBe('cmd-builtin-1');
  });
});

// ─── CommandApplicationService.getCommand() ──────────────────────────────────

describe('CommandApplicationService.getCommand()', () => {
  let repo: InMemoryCommandRepository;
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    svc = new CommandApplicationService(repo, new DomainEventBus());
    await svc.registerCommand(makeRawCommand());
  });

  it('returns Ok with the correct entry for a known id', async () => {
    const result = await svc.getCommand('cmd-001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.id.value).toBe('cmd-001');
    expect(result.value.name).toBe('optimize');
  });

  it('returns Err for an unknown id', async () => {
    const result = await svc.getCommand('no-such-id');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-id');
  });
});

// ─── CommandApplicationService.register() — convenience method ───────────────

describe('CommandApplicationService.register()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(() => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
  });

  it('registers a builtin command by name and description', async () => {
    const result = await svc.register('help', 'Show help information');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('help');
    expect(result.value.fullCommand).toBe('/help');
    expect(result.value.scope).toBe('builtin');
    expect(result.value.description).toBe('Show help information');
  });

  it('dispatches COMMAND_REGISTERED with the correct noun.verb event type', async () => {
    const result = await svc.register('clear', 'Clear the terminal');

    expect(result.ok).toBe(true);
    const registered = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_REGISTERED);
    expect(registered).toHaveLength(1);
    expect(registered[0].type).toBe('command/command.registered');
  });

  it('stores handler content when provided', async () => {
    const result = await svc.register('build', 'Run build', 'npm run build');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe('npm run build');
  });

  it('stores empty string content when handler is omitted', async () => {
    const result = await svc.register('version', 'Show version');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toBe('');
  });

  it('returns Err on duplicate registration', async () => {
    await svc.register('help', 'First');
    const result = await svc.register('help', 'Second');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('/help');
  });

  it('returns Err for invalid command name (contains whitespace)', async () => {
    const result = await svc.register('my command', 'Invalid name');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('whitespace');
  });
});

// ─── CommandApplicationService.execute() — convenience method ────────────────

describe('CommandApplicationService.execute()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
    await svc.register('help', 'Show help');
    collected.length = 0;
  });

  it('returns Ok and dispatches COMMAND_EXECUTED for a known command name', async () => {
    const result = await svc.execute('help');

    expect(result.ok).toBe(true);
    const executed = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_EXECUTED);
    expect(executed).toHaveLength(1);
  });

  it('returns the updated aggregate on success', async () => {
    const result = await svc.execute('help');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('help');
  });

  it('returns Err for an unknown command name', async () => {
    const result = await svc.execute('no-such-command');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('no-such-command');
  });
});

// ─── CommandApplicationService.delete() — convenience method ─────────────────

describe('CommandApplicationService.delete()', () => {
  let repo: InMemoryCommandRepository;
  let bus: DomainEventBus;
  let collected: DomainEvent[];
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    ({ bus, collected } = makeCollectingBus());
    svc = new CommandApplicationService(repo, bus);
    await svc.register('help', 'Show help');
    collected.length = 0;
  });

  it('returns Ok and dispatches COMMAND_DELETED', async () => {
    const result = await svc.delete('builtin-help');

    expect(result.ok).toBe(true);
    const deleted = collected.filter((e) => e.type === COMMAND_EVENT_TYPES.COMMAND_DELETED);
    expect(deleted).toHaveLength(1);
  });

  it('removes the command so subsequent listAll does not include it', async () => {
    await svc.delete('builtin-help');
    const listResult = await svc.listAll();

    expect(listResult.ok).toBe(true);
    if (!listResult.ok) return;
    expect(listResult.value).toHaveLength(0);
  });

  it('returns Err for an unknown id', async () => {
    const result = await svc.delete('nonexistent-id');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('nonexistent-id');
  });
});

// ─── CommandApplicationService.listAll() — convenience method ────────────────

describe('CommandApplicationService.listAll()', () => {
  let repo: InMemoryCommandRepository;
  let svc: CommandApplicationService;

  beforeEach(async () => {
    repo = new InMemoryCommandRepository();
    svc = new CommandApplicationService(repo, new DomainEventBus());
    await svc.register('help', 'Show help');
    await svc.register('clear', 'Clear terminal');
    await svc.register('version', 'Show version');
  });

  it('returns all registered commands', async () => {
    const result = await svc.listAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(3);
  });

  it('returns an empty array when no commands are registered', async () => {
    const emptyRepo = new InMemoryCommandRepository();
    const emptySvc = new CommandApplicationService(emptyRepo, new DomainEventBus());

    const result = await emptySvc.listAll();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(0);
  });

  it('returns Ok (never throws)', async () => {
    const result = await svc.listAll();

    expect(result.ok).toBe(true);
  });
});

// ─── Event type naming convention ─────────────────────────────────────────────

describe('COMMAND_EVENT_TYPES naming convention', () => {
  it('uses command/noun.verb format for all event types', () => {
    const nounVerbPattern = /^command\/[a-z]+\.[a-z]+$/;
    for (const value of Object.values(COMMAND_EVENT_TYPES)) {
      expect(value).toMatch(nounVerbPattern);
    }
  });

  it('DOMAIN_EVENT_TYPES is the same reference as COMMAND_EVENT_TYPES', async () => {
    const { DOMAIN_EVENT_TYPES } = await import('./events');
    expect(DOMAIN_EVENT_TYPES).toBe(COMMAND_EVENT_TYPES);
  });
});
