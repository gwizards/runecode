/**
 * DDD v9 — Comprehensive domain tests.
 *
 * Groups:
 *  1. DomainEventBus      (tests 1–5)
 *  2. Result monad        (tests 6–10)
 *  3. RuFloSwarmAggregate (tests 11–17)
 *  4. RuFloInstallationAggregate (tests 18–23)
 *  5. InMemoryRuFloRepository   (tests 24–25)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { Ok, Err, mapResult, flatMap } from '../shared/result';
import { RuFloSwarmAggregate } from './aggregates/swarm.aggregate';
import { RuFloInstallationAggregate } from './aggregates/installation.aggregate';
import { DOMAIN_EVENT_TYPES } from './domain-events';
import { InMemoryRuFloRepository } from './application/ruflo.repository';
import type { RuFloAgent } from './types';
import { AgentId } from './types';
import { unwrap } from '../shared/result';

// ─── Shared Test Fixtures ─────────────────────────────────────────────────────

function makeAgent(id: string): RuFloAgent {
  return {
    id: unwrap(AgentId.create(id)),
    name: `agent-${id}`,
    agentType: 'coder',
    status: 'running',
    isActive: true,
    capabilities: ['code-generation'],
  };
}

function makeDomainEvent(type: string, aggregateId = 'agg-1'): DomainEvent {
  return { type, occurredAt: Date.now(), aggregateId };
}

function makeSwarm(overrides: Partial<Parameters<typeof RuFloSwarmAggregate.create>[0]> = {}) {
  return unwrap(RuFloSwarmAggregate.create({
    id: 'swarm-1',
    topology: 'hierarchical',
    maxAgents: 5,
    memoryNamespace: 'test',
    ...overrides,
  }));
}

// ─── Group 1: DomainEventBus ─────────────────────────────────────────────────

describe('DomainEventBus', () => {
  let bus: DomainEventBus;

  beforeEach(() => {
    bus = new DomainEventBus();
  });

  it('test 1 — dispatch() calls a registered handler', () => {
    const handler = vi.fn();
    bus.on('test.Event', handler);

    bus.dispatch([makeDomainEvent('test.Event')]);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('test 2 — dispatch() passes the exact event object to the handler', () => {
    const handler = vi.fn();
    bus.on('test.Typed', handler);

    const event = makeDomainEvent('test.Typed', 'aggregate-42');
    bus.dispatch([event]);

    expect(handler).toHaveBeenCalledWith(event);
    expect(handler.mock.calls[0][0]).toMatchObject({
      type: 'test.Typed',
      aggregateId: 'aggregate-42',
    });
  });

  it('test 3 — unsubscribe function returned by on() removes the handler', () => {
    const handler = vi.fn();
    const unsubscribe = bus.on('test.Remove', handler);

    unsubscribe();
    bus.dispatch([makeDomainEvent('test.Remove')]);

    expect(handler).not.toHaveBeenCalled();
  });

  it('test 4 — multiple handlers registered for the same type are all called', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on('test.Multi', handlerA);
    bus.on('test.Multi', handlerB);

    bus.dispatch([makeDomainEvent('test.Multi')]);

    expect(handlerA).toHaveBeenCalledTimes(1);
    expect(handlerB).toHaveBeenCalledTimes(1);
  });

  it('test 5 — clear() with no argument removes all handlers for every type', () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();
    bus.on('type.A', handlerA);
    bus.on('type.B', handlerB);

    bus.clear();
    bus.dispatch([makeDomainEvent('type.A'), makeDomainEvent('type.B')]);

    expect(handlerA).not.toHaveBeenCalled();
    expect(handlerB).not.toHaveBeenCalled();
  });
});

// ─── Group 2: Result monad ───────────────────────────────────────────────────

describe('Result monad', () => {
  it('test 6 — Ok() creates a successful result with ok=true', () => {
    const result = Ok(42);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(42);
  });

  it('test 7 — Err() creates a failed result with ok=false', () => {
    const result = Err('something went wrong');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('something went wrong');
  });

  it('test 8 — mapResult() transforms the value inside Ok', () => {
    const result = Ok(10);
    const mapped = mapResult(result, v => v * 3);

    expect(mapped.ok).toBe(true);
    if (mapped.ok) expect(mapped.value).toBe(30);
  });

  it('test 9 — flatMap() chains Ok → Ok correctly', () => {
    const result = Ok(5);
    const chained = flatMap(result, v => Ok(v + 1));

    expect(chained.ok).toBe(true);
    if (chained.ok) expect(chained.value).toBe(6);
  });

  it('test 10 — flatMap() short-circuits on Err and does not call the continuation', () => {
    const fn = vi.fn((v: number) => Ok(v + 1));
    const result = Err<string>('initial error');
    const chained = flatMap(result, fn);

    expect(fn).not.toHaveBeenCalled();
    expect(chained.ok).toBe(false);
    if (!chained.ok) expect(chained.error).toBe('initial error');
  });
});

// ─── Group 3: RuFloSwarmAggregate ────────────────────────────────────────────

describe('RuFloSwarmAggregate', () => {
  it('test 11 — create() records a SwarmInitializedEvent', () => {
    const swarm = makeSwarm();

    expect(swarm.events).toHaveLength(1);
    expect(swarm.events[0].type).toBe(DOMAIN_EVENT_TYPES.SWARM_INITIALIZED);
  });

  it('test 12 — create() with an empty topology string returns Err', () => {
    const result = RuFloSwarmAggregate.create({ id: 'swarm-1', topology: '   ' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/topology/i);
  });

  it('test 13 — addAgent() records a SwarmAgentAddedEvent', () => {
    const swarm = makeSwarm();
    swarm.clearEvents();

    unwrap(swarm.addAgent(makeAgent('agent-x')));

    expect(swarm.events).toHaveLength(1);
    expect(swarm.events[0].type).toBe(DOMAIN_EVENT_TYPES.SWARM_AGENT_ADDED);
  });

  it('test 14 — addAgent() returns Err when swarm is at capacity', () => {
    const swarm = makeSwarm({ maxAgents: 2 });
    swarm.clearEvents();

    unwrap(swarm.addAgent(makeAgent('a1')));
    unwrap(swarm.addAgent(makeAgent('a2')));

    const result = swarm.addAgent(makeAgent('a3'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/capacity/i);
  });

  it('test 15 — removeAgent() records a SwarmAgentRemovedEvent', () => {
    const swarm = makeSwarm();
    const agent = makeAgent('target');
    unwrap(swarm.addAgent(agent));
    swarm.clearEvents();

    unwrap(swarm.removeAgent(agent.id.toString()));

    expect(swarm.events).toHaveLength(1);
    expect(swarm.events[0].type).toBe(DOMAIN_EVENT_TYPES.SWARM_AGENT_REMOVED);
  });

  it('test 16 — removeAgent() returns Err when agent does not exist in the swarm', () => {
    const swarm = makeSwarm();

    const result = swarm.removeAgent('ghost-id');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not found/i);
  });

  it('test 17 — clearEvents() leaves the events array empty', () => {
    const swarm = makeSwarm();
    expect(swarm.events.length).toBeGreaterThan(0);

    swarm.clearEvents();

    expect(swarm.events).toHaveLength(0);
  });
});

// ─── Group 4: RuFloInstallationAggregate ────────────────────────────────────

describe('RuFloInstallationAggregate', () => {
  it('test 18 — unknown() creates aggregate with isInstalled=false', () => {
    const inst = RuFloInstallationAggregate.unknown();

    expect(inst.isInstalled).toBe(false);
    expect(inst.state).toBe('unknown');
  });

  it('test 19 — markInstalled() transitions state to installed and raises InstallationCompletedEvent', () => {
    const inst = RuFloInstallationAggregate.unknown();

    const result = inst.markInstalled('3.1.0', true);

    expect(result.ok).toBe(true);
    expect(inst.isInstalled).toBe(true);
    expect(inst.state).toBe('installed');
    expect(inst.version).toBe('3.1.0');
    expect(inst.events).toHaveLength(1);
    expect(inst.events[0].type).toBe(DOMAIN_EVENT_TYPES.INSTALLATION_COMPLETED);
  });

  it('test 20 — activateMcp() after install transitions to mcp_active and raises McpActivatedEvent', () => {
    const inst = RuFloInstallationAggregate.unknown();
    unwrap(inst.markInstalled('3.0.0', true));
    inst.clearEvents();

    const result = inst.activateMcp('test-namespace');

    expect(result.ok).toBe(true);
    expect(inst.isMcpActive).toBe(true);
    expect(inst.state).toBe('mcp_active');
    expect(inst.events).toHaveLength(1);
    expect(inst.events[0].type).toBe(DOMAIN_EVENT_TYPES.MCP_ACTIVATED);
  });

  it('test 21 — activateMcp() before install returns Err', () => {
    const inst = RuFloInstallationAggregate.unknown();

    const result = inst.activateMcp('ns');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/installed/i);
  });

  it('test 22 — setMemoryBackend() after install raises MemoryBackendChangedEvent', () => {
    const inst = RuFloInstallationAggregate.unknown();
    unwrap(inst.markInstalled('3.0.0', true));
    inst.clearEvents();

    const result = inst.setMemoryBackend('hnsw');

    expect(result.ok).toBe(true);
    expect(inst.memoryBackend).toBe('hnsw');
    expect(inst.events).toHaveLength(1);
    expect(inst.events[0].type).toBe(DOMAIN_EVENT_TYPES.MEMORY_BACKEND_CHANGED);
  });

  it('test 23 — setMemoryBackend() is idempotent: no event raised when backend unchanged', () => {
    const inst = RuFloInstallationAggregate.unknown();
    unwrap(inst.markInstalled('3.0.0', true));
    // default backend is 'agentdb'
    inst.clearEvents();

    const result = inst.setMemoryBackend('agentdb'); // same as default — should be no-op

    expect(result.ok).toBe(true);
    expect(inst.events).toHaveLength(0);
  });
});

// ─── Group 5: InMemoryRuFloRepository ────────────────────────────────────────

describe('InMemoryRuFloRepository', () => {
  it('test 24 — seedInstallation() + getInstallation() round-trips the aggregate', async () => {
    const repo = new InMemoryRuFloRepository();
    const installation = RuFloInstallationAggregate.unknown('seeded-id');
    unwrap(installation.markInstalled('4.0.0', true));

    repo.seedInstallation(installation);

    const retrieved = await repo.getInstallation();
    expect(retrieved.id).toBe('seeded-id');
    expect(retrieved.isInstalled).toBe(true);
    expect(retrieved.version).toBe('4.0.0');
  });

  it('test 25 — seedSwarm() + getSwarm() round-trips the aggregate', async () => {
    const repo = new InMemoryRuFloRepository();
    const swarm = unwrap(RuFloSwarmAggregate.create({
      id: 'swarm-seed',
      topology: 'mesh',
      maxAgents: 3,
    }));

    repo.seedSwarm(swarm);

    const retrieved = await repo.getSwarm();
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id.toString()).toBe('swarm-seed');
    expect(retrieved!.topology).toBe('mesh');
    expect(retrieved!.maxAgents).toBe(3);
  });
});
