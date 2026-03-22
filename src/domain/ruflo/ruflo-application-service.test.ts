/**
 * RuFloApplicationService — Application service unit tests.
 *
 * Uses InMemoryRuFloRepository (no mocks) to verify:
 *  - All happy-path Result<T> Ok returns
 *  - All Err paths: not found, invalid state, thrown errors
 *  - Domain events dispatched via DomainEventBus after each command
 *
 * Groups:
 *  1. markInstalled          (happy + error)
 *  2. markInstallationFailed (happy)
 *  3. activateMcp            (happy + error)
 *  4. changeMemoryBackend    (happy + error)
 *  5. initializeSwarm        (happy + error)
 *  6. addAgentToSwarm        (happy + error)
 *  7. removeAgentFromSwarm   (happy + error)
 *  8. getInstallation query
 *  9. getSwarm query
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import { RuFloApplicationService } from './application/ruflo-application.service';
import { InMemoryRuFloRepository } from './application/ruflo.repository';
import { RuFloInstallationAggregate } from './aggregates/installation.aggregate';
import { RuFloSwarmAggregate } from './aggregates/swarm.aggregate';
import { RUFLO_EVENT_TYPES } from './domain-events';
import type { RuFloAgent } from './types';
import { toAgentId } from './types';
import { unwrap } from '../shared/result';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeAgent(id: string, overrides: Partial<RuFloAgent> = {}): RuFloAgent {
  return {
    id: unwrap(toAgentId(id)),
    name: `agent-${id}`,
    agentType: 'coder',
    status: 'running',
    isActive: true,
    capabilities: ['code-generation'],
    ...overrides,
  };
}

function makeInstalledAggregate(version = '3.0.0'): RuFloInstallationAggregate {
  const inst = RuFloInstallationAggregate.unknown();
  inst.markInstalled(version, true);
  inst.clearEvents();
  return inst;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let repo: InMemoryRuFloRepository;
let bus: DomainEventBus;
let svc: RuFloApplicationService;

beforeEach(() => {
  repo = new InMemoryRuFloRepository();
  bus = new DomainEventBus();
  svc = new RuFloApplicationService(repo, bus);
});

// ─── 1. markInstalled ────────────────────────────────────────────────────────

describe('RuFloApplicationService.markInstalled', () => {
  it('returns Ok(undefined) when installation succeeds', async () => {
    const result = await svc.markInstalled('3.5.0', true);

    expect(result.ok).toBe(true);
  });

  it('persists the installed state in the repository', async () => {
    await svc.markInstalled('3.5.0', true);

    const saved = await repo.getInstallation();
    expect(saved.isInstalled).toBe(true);
    expect(saved.version).toBe('3.5.0');
  });

  it('dispatches InstallationCompletedEvent to the event bus', async () => {
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.INSTALLATION_COMPLETED, handler);

    await svc.markInstalled('3.5.0', true);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.INSTALLATION_COMPLETED,
      version: '3.5.0',
      isSupported: true,
    });
  });

  it('returns Err when called twice (already installed)', async () => {
    await svc.markInstalled('3.5.0', true);

    const second = await svc.markInstalled('3.6.0', true);

    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toMatch(/already installed/i);
  });

  it('returns Err when version string is empty', async () => {
    const result = await svc.markInstalled('   ', false);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/version/i);
  });

  it('clears events from the aggregate after dispatch', async () => {
    await svc.markInstalled('3.5.0', true);

    const saved = await repo.getInstallation();
    expect(saved.events).toHaveLength(0);
  });
});

// ─── 2. markInstallationFailed ────────────────────────────────────────────────

describe('RuFloApplicationService.markInstallationFailed', () => {
  it('returns Ok(undefined) on success', async () => {
    const result = await svc.markInstallationFailed('binary not found');

    expect(result.ok).toBe(true);
  });

  it('dispatches InstallationFailedEvent to the event bus', async () => {
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.INSTALLATION_FAILED, handler);

    await svc.markInstallationFailed('binary not found');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.INSTALLATION_FAILED,
      reason: 'binary not found',
    });
  });

  it('sets aggregate state to not_installed', async () => {
    await svc.markInstallationFailed('some error');

    const saved = await repo.getInstallation();
    expect(saved.state).toBe('not_installed');
  });
});

// ─── 3. activateMcp ──────────────────────────────────────────────────────────

describe('RuFloApplicationService.activateMcp', () => {
  it('returns Ok(undefined) when MCP activation succeeds', async () => {
    repo.seedInstallation(makeInstalledAggregate());

    const result = await svc.activateMcp('my-namespace');

    expect(result.ok).toBe(true);
  });

  it('transitions state to mcp_active', async () => {
    repo.seedInstallation(makeInstalledAggregate());

    await svc.activateMcp('my-namespace');

    const saved = await repo.getInstallation();
    expect(saved.isMcpActive).toBe(true);
    expect(saved.state).toBe('mcp_active');
  });

  it('dispatches McpActivatedEvent to the event bus', async () => {
    repo.seedInstallation(makeInstalledAggregate());
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.MCP_ACTIVATED, handler);

    await svc.activateMcp('prod-namespace');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.MCP_ACTIVATED,
      namespace: 'prod-namespace',
    });
  });

  it('returns Err when RuFlo is not installed yet', async () => {
    // default repo has 'unknown' installation state
    const result = await svc.activateMcp('ns');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/installed/i);
  });
});

// ─── 4. changeMemoryBackend ───────────────────────────────────────────────────

describe('RuFloApplicationService.changeMemoryBackend', () => {
  it('returns Ok(undefined) when backend change succeeds', async () => {
    repo.seedInstallation(makeInstalledAggregate());

    const result = await svc.changeMemoryBackend('hnsw');

    expect(result.ok).toBe(true);
  });

  it('dispatches MemoryBackendChangedEvent', async () => {
    repo.seedInstallation(makeInstalledAggregate());
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.MEMORY_BACKEND_CHANGED, handler);

    await svc.changeMemoryBackend('hybrid');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.MEMORY_BACKEND_CHANGED,
      newBackend: 'hybrid',
    });
  });

  it('is idempotent — no event dispatched when backend unchanged', async () => {
    repo.seedInstallation(makeInstalledAggregate());
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.MEMORY_BACKEND_CHANGED, handler);

    // default backend is 'agentdb' — calling with same value is a no-op
    await svc.changeMemoryBackend('agentdb');

    expect(handler).not.toHaveBeenCalled();
  });

  it('returns Err when RuFlo is not installed yet', async () => {
    const result = await svc.changeMemoryBackend('hnsw');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/installed/i);
  });
});

// ─── 5. initializeSwarm ──────────────────────────────────────────────────────

describe('RuFloApplicationService.initializeSwarm', () => {
  it('returns Ok(swarm) containing the created aggregate', async () => {
    const result = await svc.initializeSwarm({
      id: 'swarm-1',
      topology: 'hierarchical',
      maxAgents: 8,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(RuFloSwarmAggregate);
      expect(result.value.topology).toBe('hierarchical');
      expect(result.value.maxAgents).toBe(8);
    }
  });

  it('persists the swarm in the repository', async () => {
    await svc.initializeSwarm({ id: 'swarm-2', topology: 'mesh' });

    const stored = await repo.getSwarm();
    expect(stored).not.toBeNull();
    expect(stored?.topology).toBe('mesh');
  });

  it('dispatches SwarmInitializedEvent to the event bus', async () => {
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.SWARM_INITIALIZED, handler);

    await svc.initializeSwarm({ id: 'swarm-3', topology: 'hierarchical' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.SWARM_INITIALIZED,
      topology: 'hierarchical',
    });
  });

  it('clears swarm events after dispatch', async () => {
    await svc.initializeSwarm({ id: 'swarm-4', topology: 'hierarchical' });

    const stored = await repo.getSwarm();
    expect(stored?.events).toHaveLength(0);
  });

  it('returns Err when topology is empty', async () => {
    const result = await svc.initializeSwarm({ id: 'swarm-bad', topology: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/topology/i);
  });

  it('returns Err when maxAgents is 0', async () => {
    const result = await svc.initializeSwarm({
      id: 'swarm-bad2',
      topology: 'hierarchical',
      maxAgents: 0,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/maxAgents/i);
  });
});

// ─── 6. addAgentToSwarm ──────────────────────────────────────────────────────

describe('RuFloApplicationService.addAgentToSwarm', () => {
  it('returns Ok(undefined) when agent is added successfully', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });

    const result = await svc.addAgentToSwarm(makeAgent('coder-1'));

    expect(result.ok).toBe(true);
  });

  it('persists the agent inside the swarm', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    await svc.addAgentToSwarm(makeAgent('coder-1'));

    const stored = await repo.getSwarm();
    expect(stored?.agents).toHaveLength(1);
    expect(stored?.agents[0].id).toBe(unwrap(toAgentId('coder-1')));
  });

  it('dispatches SwarmAgentAddedEvent to the event bus', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.SWARM_AGENT_ADDED, handler);

    await svc.addAgentToSwarm(makeAgent('coder-1'));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.SWARM_AGENT_ADDED,
      agentId: unwrap(toAgentId('coder-1')),
      agentType: 'coder',
    });
  });

  it('returns Err when no active swarm exists', async () => {
    const result = await svc.addAgentToSwarm(makeAgent('orphan'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/swarm/i);
  });

  it('returns Err when swarm is at capacity', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 1 });
    await svc.addAgentToSwarm(makeAgent('first'));

    const result = await svc.addAgentToSwarm(makeAgent('second'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/capacity/i);
  });

  it('returns Err when agent ID already exists in the swarm', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    await svc.addAgentToSwarm(makeAgent('dup-id'));

    const result = await svc.addAgentToSwarm(makeAgent('dup-id'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already exists/i);
  });
});

// ─── 7. removeAgentFromSwarm ─────────────────────────────────────────────────

describe('RuFloApplicationService.removeAgentFromSwarm', () => {
  it('returns Ok(undefined) when agent is removed successfully', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    await svc.addAgentToSwarm(makeAgent('to-remove'));

    const result = await svc.removeAgentFromSwarm(unwrap(toAgentId('to-remove')));

    expect(result.ok).toBe(true);
  });

  it('removes the agent from persisted swarm state', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    await svc.addAgentToSwarm(makeAgent('to-remove'));

    await svc.removeAgentFromSwarm(unwrap(toAgentId('to-remove')));

    const stored = await repo.getSwarm();
    expect(stored?.agents).toHaveLength(0);
  });

  it('dispatches SwarmAgentRemovedEvent to the event bus', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });
    await svc.addAgentToSwarm(makeAgent('to-remove'));
    const handler = vi.fn();
    bus.on(RUFLO_EVENT_TYPES.SWARM_AGENT_REMOVED, handler);

    await svc.removeAgentFromSwarm(unwrap(toAgentId('to-remove')));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: RUFLO_EVENT_TYPES.SWARM_AGENT_REMOVED,
      agentId: unwrap(toAgentId('to-remove')),
    });
  });

  it('returns Err when no active swarm exists', async () => {
    const result = await svc.removeAgentFromSwarm('ghost-id');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/swarm/i);
  });

  it('returns Err when agent ID does not exist in the swarm', async () => {
    await svc.initializeSwarm({ id: 'swarm-1', topology: 'hierarchical', maxAgents: 5 });

    const result = await svc.removeAgentFromSwarm('nonexistent-agent');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });
});

// ─── 8. getInstallation (query) ───────────────────────────────────────────────

describe('RuFloApplicationService.getInstallation', () => {
  it('returns Ok(installation) with the current aggregate', async () => {
    const result = await svc.getInstallation();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(RuFloInstallationAggregate);
    }
  });

  it('reflects state changes after markInstalled', async () => {
    await svc.markInstalled('4.0.0', true);

    const result = await svc.getInstallation();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isInstalled).toBe(true);
      expect(result.value.version).toBe('4.0.0');
    }
  });
});

// ─── 9. getSwarm (query) ─────────────────────────────────────────────────────

describe('RuFloApplicationService.getSwarm', () => {
  it('returns Ok(null) when no swarm has been initialized', async () => {
    const result = await svc.getSwarm();

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBeNull();
  });

  it('returns Ok(swarm) after initializeSwarm succeeds', async () => {
    await svc.initializeSwarm({ id: 'swarm-q', topology: 'star', maxAgents: 4 });

    const result = await svc.getSwarm();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeInstanceOf(RuFloSwarmAggregate);
      expect(result.value?.topology).toBe('star');
    }
  });
});
