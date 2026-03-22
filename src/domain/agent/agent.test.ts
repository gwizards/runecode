/**
 * Agent bounded context — Unit tests.
 *
 * Groups:
 *  1. AgentStatus helpers         (2 tests)
 *  2. AgentName VO                (2 tests)
 *  3. LiveAgentAggregate.start()  (2 tests)
 *  4. LiveAgentAggregate.complete (2 tests)
 *  5. LiveAgentAggregate.fail()   (1 test)
 *  6. LiveAgentAggregate.think()  (1 test)
 *  7. InMemoryAgentRepository     (2 tests)
 */

import { describe, it, expect } from 'vitest';

import { isTerminalStatus, isActiveStatus, unsafeAgentId } from './types';
import { AgentName } from './types';
import { LiveAgentAggregate } from './types';
import { InMemoryAgentRepository } from './repository';
import { AGENT_EVENT_TYPES } from './events';
import { unwrap } from '../shared/result';

// ─── 1. AgentStatus helpers ────────────────────────────────────────────────

describe('AgentStatus helpers', () => {
  it('isTerminalStatus returns true only for completed and failed', () => {
    expect(isTerminalStatus('completed')).toBe(true);
    expect(isTerminalStatus('failed')).toBe(true);
    expect(isTerminalStatus('running')).toBe(false);
    expect(isTerminalStatus('thinking')).toBe(false);
    expect(isTerminalStatus('idle')).toBe(false);
  });

  it('isActiveStatus returns true only for running and thinking', () => {
    expect(isActiveStatus('running')).toBe(true);
    expect(isActiveStatus('thinking')).toBe(true);
    expect(isActiveStatus('completed')).toBe(false);
    expect(isActiveStatus('failed')).toBe(false);
    expect(isActiveStatus('idle')).toBe(false);
  });
});

// ─── 2. AgentName VO ──────────────────────────────────────────────────────

describe('AgentName value object', () => {
  it('accepts a valid trimmed name', () => {
    const result = AgentName.create('  RuneBot  ');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.value).toBe('RuneBot');
  });

  it('returns Err for empty string and for names exceeding 200 characters', () => {
    const emptyResult = AgentName.create('');
    expect(emptyResult.ok).toBe(false);
    if (!emptyResult.ok) expect(emptyResult.error).toBe('Agent name cannot be empty');

    const whitespaceResult = AgentName.create('   ');
    expect(whitespaceResult.ok).toBe(false);
    if (!whitespaceResult.ok) expect(whitespaceResult.error).toBe('Agent name cannot be empty');

    const tooLongResult = AgentName.create('x'.repeat(201));
    expect(tooLongResult.ok).toBe(false);
    if (!tooLongResult.ok) expect(tooLongResult.error).toBe('Agent name too long (max 200 chars)');
  });
});

// ─── 3. LiveAgentAggregate.start() ────────────────────────────────────────

describe('LiveAgentAggregate.start()', () => {
  it('records an AgentStartedEvent after creation', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-1', 'Rune'));
    const events = agent.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AGENT_EVENT_TYPES.AGENT_STARTED);
    expect((events[0] as unknown as { agentId: string }).agentId).toBe('agent-1');
  });

  it('initial status is running', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-2', 'Rune'));
    expect(agent.status).toBe('running');
    expect(agent.isActive).toBe(true);
    expect(agent.isTerminal).toBe(false);
  });
});

// ─── 4. LiveAgentAggregate.complete() ─────────────────────────────────────

describe('LiveAgentAggregate.complete()', () => {
  it('raises AgentCompletedEvent and transitions to completed', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-3', 'Rune'));
    agent.clearEvents();
    agent.tick(5000, 42);
    const result = agent.complete();
    expect(result.ok).toBe(true);
    const events = agent.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AGENT_EVENT_TYPES.AGENT_COMPLETED);
    expect(agent.status).toBe('completed');
    expect(agent.isTerminal).toBe(true);
  });

  it('returns Err if complete() is called a second time on an already completed agent', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-4', 'Rune'));
    agent.complete();
    const result = agent.complete();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/terminal/);
  });
});

// ─── 5. LiveAgentAggregate.fail() ─────────────────────────────────────────

describe('LiveAgentAggregate.fail()', () => {
  it('raises AgentFailedEvent with the supplied reason', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-5', 'Rune'));
    agent.clearEvents();
    const result = agent.fail('network timeout');
    expect(result.ok).toBe(true);
    const events = agent.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AGENT_EVENT_TYPES.AGENT_FAILED);
    expect((events[0] as unknown as { reason: string }).reason).toBe('network timeout');
    expect(agent.status).toBe('failed');
  });
});

// ─── 6. LiveAgentAggregate.think() ────────────────────────────────────────

describe('LiveAgentAggregate.think()', () => {
  it('transitions to thinking and raises AgentThinkingEvent', () => {
    const agent = unwrap(LiveAgentAggregate.start('agent-6', 'Rune'));
    agent.clearEvents();
    const result = agent.think();
    expect(result.ok).toBe(true);
    expect(agent.status).toBe('thinking');
    const events = agent.events;
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(AGENT_EVENT_TYPES.AGENT_THINKING);
  });
});

// ─── 7. InMemoryAgentRepository ───────────────────────────────────────────

describe('InMemoryAgentRepository', () => {
  it('save() then getAgent() returns the same aggregate', async () => {
    const repo = new InMemoryAgentRepository();
    const agent = unwrap(LiveAgentAggregate.start('agent-7', 'Rune'));
    await repo.saveAgent(agent);
    const retrieved = await repo.getAgent(unsafeAgentId('agent-7'));
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id.toString()).toBe('agent-7');
    expect(retrieved!.name).toBe('Rune');
    expect(retrieved!.status).toBe('running');
  });

  it('listActiveAgents() excludes agents in terminal states', async () => {
    const repo = new InMemoryAgentRepository();

    const running = unwrap(LiveAgentAggregate.start('r-1', 'Runner'));
    const completed = unwrap(LiveAgentAggregate.start('c-1', 'Completer'));
    completed.complete();
    const failed = unwrap(LiveAgentAggregate.start('f-1', 'Failer'));
    failed.fail('oops');

    await repo.saveAgent(running);
    await repo.saveAgent(completed);
    await repo.saveAgent(failed);

    const active = await repo.listActiveAgents();
    expect(active).toHaveLength(1);
    expect(active[0].id.toString()).toBe('r-1');
  });
});
