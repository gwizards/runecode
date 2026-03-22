/**
 * Agent bounded context — AgentApplicationService tests.
 *
 * Groups:
 *  1. not-found paths        — all commands/queries return Err when agent absent
 *  2. happy paths            — startAgent persists + dispatches; status transitions
 *  3. domain error propagation — complete on terminal agent returns Err
 *  4. full lifecycle         — start → think → tick → complete with event order
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { DomainEventBus } from '../shared/event-bus';
import type { DomainEvent } from '../shared/event-bus';
import { unwrap } from '../shared/result';
import { InMemoryAgentRepository } from './repository';
import { AGENT_EVENT_TYPES } from './events';
import type { AgentStartedEvent, AgentThinkingEvent, AgentCompletedEvent } from './events';
import { AgentApplicationService } from './service';
import { toAgentId } from './types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeService(): {
  repo: InMemoryAgentRepository;
  bus: DomainEventBus;
  svc: AgentApplicationService;
} {
  const repo = new InMemoryAgentRepository();
  const bus  = new DomainEventBus();
  const svc  = new AgentApplicationService(repo, bus);
  return { repo, bus, svc };
}

// ─── 1. not-found paths ──────────────────────────────────────────────────────

describe('AgentApplicationService — not-found paths', () => {
  let svc: AgentApplicationService;

  beforeEach(() => {
    ({ svc } = makeService());
  });

  it('markThinking returns Err when agent does not exist', async () => {
    const result = await svc.markThinking('no-such-agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });

  it('completeAgent returns Err when agent does not exist', async () => {
    const result = await svc.completeAgent('no-such-agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });

  it('failAgent returns Err when agent does not exist', async () => {
    const result = await svc.failAgent('no-such-agent', 'something broke');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });

  it('tickAgent returns Err when agent does not exist', async () => {
    const result = await svc.tickAgent('no-such-agent', 500, 10);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });

  it('getAgent returns Err when agent does not exist', async () => {
    const result = await svc.getAgent('no-such-agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });
});

// ─── 2. happy paths ───────────────────────────────────────────────────────────

describe('AgentApplicationService — happy paths', () => {
  let repo: InMemoryAgentRepository;
  let bus: DomainEventBus;
  let svc: AgentApplicationService;

  beforeEach(() => {
    ({ repo, bus, svc } = makeService());
  });

  it('startAgent persists the agent and returns Ok with the aggregate', async () => {
    const result = await svc.startAgent('agent-a', 'Alpha');
    expect(result.ok).toBe(true);
    const agent = unwrap(result);
    expect(agent.id).toBe('agent-a');
    expect(agent.name).toBe('Alpha');
    expect(agent.status).toBe('running');

    // Should be retrievable from the repo
    const stored = await repo.getAgent(toAgentId('agent-a'));
    expect(stored).not.toBeNull();
    expect(stored!.id).toBe('agent-a');
  });

  it('startAgent dispatches AgentStartedEvent', async () => {
    const captured: DomainEvent[] = [];
    bus.on(AGENT_EVENT_TYPES.AGENT_STARTED, (e) => { captured.push(e); });

    await svc.startAgent('agent-b', 'Beta');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as AgentStartedEvent;
    expect(evt.type).toBe(AGENT_EVENT_TYPES.AGENT_STARTED);
    expect(evt.agentId).toBe('agent-b');
    expect(evt.name).toBe('Beta');
  });

  it('events are cleared on the aggregate after dispatch', async () => {
    const result = await svc.startAgent('agent-c', 'Gamma');
    const agent = unwrap(result);
    // After startAgent the service calls clearEvents(), so the returned
    // aggregate's event list should be empty.
    expect(agent.events).toHaveLength(0);
  });

  it('markThinking transitions the agent to thinking status', async () => {
    await svc.startAgent('agent-d', 'Delta');
    const thinkResult = await svc.markThinking('agent-d');
    expect(thinkResult.ok).toBe(true);

    const getResult = await svc.getAgent('agent-d');
    const agent = unwrap(getResult);
    expect(agent.status).toBe('thinking');
  });

  it('markThinking dispatches AgentThinkingEvent', async () => {
    await svc.startAgent('agent-e', 'Epsilon');

    const captured: DomainEvent[] = [];
    bus.on(AGENT_EVENT_TYPES.AGENT_THINKING, (e) => { captured.push(e); });

    await svc.markThinking('agent-e');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as AgentThinkingEvent;
    expect(evt.agentId).toBe('agent-e');
  });

  it('completeAgent transitions the agent to completed status', async () => {
    await svc.startAgent('agent-f', 'Zeta');
    const completeResult = await svc.completeAgent('agent-f');
    expect(completeResult.ok).toBe(true);

    const getResult = await svc.getAgent('agent-f');
    const agent = unwrap(getResult);
    expect(agent.status).toBe('completed');
    expect(agent.isTerminal).toBe(true);
  });

  it('completeAgent dispatches AgentCompletedEvent', async () => {
    await svc.startAgent('agent-g', 'Eta');

    const captured: DomainEvent[] = [];
    bus.on(AGENT_EVENT_TYPES.AGENT_COMPLETED, (e) => { captured.push(e); });

    await svc.completeAgent('agent-g');

    expect(captured).toHaveLength(1);
    const evt = captured[0] as AgentCompletedEvent;
    expect(evt.agentId).toBe('agent-g');
  });

  it('listActiveAgents excludes agents in terminal states', async () => {
    await svc.startAgent('active-1', 'Runner');
    await svc.startAgent('active-2', 'Thinker');
    await svc.markThinking('active-2');
    await svc.startAgent('done-1', 'Finisher');
    await svc.completeAgent('done-1');
    await svc.startAgent('dead-1', 'Failer');
    await svc.failAgent('dead-1', 'network error');

    const listResult = await svc.listActiveAgents();
    expect(listResult.ok).toBe(true);
    const active = unwrap(listResult);
    expect(active).toHaveLength(2);
    const ids = active.map((a) => a.id).sort();
    expect(ids).toEqual(['active-1', 'active-2']);
  });

  it('getAgent returns Ok with the correct aggregate', async () => {
    await svc.startAgent('agent-h', 'Theta');
    const result = await svc.getAgent('agent-h');
    expect(result.ok).toBe(true);
    const agent = unwrap(result);
    expect(agent.id).toBe('agent-h');
    expect(agent.name).toBe('Theta');
  });
});

// ─── 2b. resumeAgent ─────────────────────────────────────────────────────────

describe('AgentApplicationService — resumeAgent', () => {
  let svc: AgentApplicationService;

  beforeEach(() => {
    ({ svc } = makeService());
  });

  it('resumeAgent returns Err when agent does not exist', async () => {
    const result = await svc.resumeAgent('no-such-agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('no-such-agent');
    }
  });

  it('resumeAgent transitions a thinking agent back to running', async () => {
    await svc.startAgent('resume-1', 'Resumable');
    await svc.markThinking('resume-1');

    const resumeResult = await svc.resumeAgent('resume-1');
    expect(resumeResult.ok).toBe(true);

    const getResult = await svc.getAgent('resume-1');
    const agent = unwrap(getResult);
    expect(agent.status).toBe('running');
  });

  it('resumeAgent on a running agent returns Ok (no-op — domain does not throw)', async () => {
    await svc.startAgent('resume-2', 'Already Running');
    // resume() only throws for terminal agents; running → running is allowed
    const result = await svc.resumeAgent('resume-2');
    expect(result.ok).toBe(true);
  });

  it('resumeAgent on a terminal (completed) agent returns Err', async () => {
    await svc.startAgent('resume-3', 'Done');
    await svc.completeAgent('resume-3');
    const result = await svc.resumeAgent('resume-3');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/terminal/i);
    }
  });
});

// ─── 2c. tickAgent happy path ─────────────────────────────────────────────────

describe('AgentApplicationService — tickAgent happy path', () => {
  let svc: AgentApplicationService;

  beforeEach(() => {
    ({ svc } = makeService());
  });

  it('tickAgent returns Ok when agent exists', async () => {
    await svc.startAgent('tick-1', 'Ticker');
    const result = await svc.tickAgent('tick-1', 1000, 50);
    expect(result.ok).toBe(true);
  });

  it('tickAgent with zero elapsed and zero tokens returns Ok', async () => {
    await svc.startAgent('tick-2', 'ZeroTicker');
    const result = await svc.tickAgent('tick-2', 0, 0);
    expect(result.ok).toBe(true);
  });
});

// ─── 3. domain error propagation ─────────────────────────────────────────────

describe('AgentApplicationService — domain error propagation', () => {
  let svc: AgentApplicationService;

  beforeEach(() => {
    ({ svc } = makeService());
  });

  it('completeAgent on an already-completed agent returns Err (domain throws on terminal)', async () => {
    await svc.startAgent('terminal-agent', 'Omega');
    await svc.completeAgent('terminal-agent');

    // Second call should fail — domain throws "terminal" guard
    const result = await svc.completeAgent('terminal-agent');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/terminal/i);
    }
  });

  it('failAgent on a completed agent returns Err', async () => {
    await svc.startAgent('done-agent', 'Sigma');
    await svc.completeAgent('done-agent');

    const result = await svc.failAgent('done-agent', 'too late');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/terminal/i);
    }
  });
});

// ─── 4. full lifecycle ────────────────────────────────────────────────────────

describe('AgentApplicationService — full lifecycle with event order', () => {
  it('start → think → tick → complete fires events in correct order', async () => {
    const { svc, bus } = makeService();
    const capturedTypes: string[] = [];

    bus.on(AGENT_EVENT_TYPES.AGENT_STARTED,   (e) => { capturedTypes.push(e.type); });
    bus.on(AGENT_EVENT_TYPES.AGENT_THINKING,  (e) => { capturedTypes.push(e.type); });
    bus.on(AGENT_EVENT_TYPES.AGENT_COMPLETED, (e) => { capturedTypes.push(e.type); });

    const startResult = await svc.startAgent('lifecycle-1', 'LifecycleAgent');
    expect(startResult.ok).toBe(true);

    const thinkResult = await svc.markThinking('lifecycle-1');
    expect(thinkResult.ok).toBe(true);

    // tickAgent does not raise a domain event but must not fail
    const tickResult = await svc.tickAgent('lifecycle-1', 2500, 55);
    expect(tickResult.ok).toBe(true);

    const completeResult = await svc.completeAgent('lifecycle-1');
    expect(completeResult.ok).toBe(true);

    // Verify event ordering
    expect(capturedTypes).toEqual([
      AGENT_EVENT_TYPES.AGENT_STARTED,
      AGENT_EVENT_TYPES.AGENT_THINKING,
      AGENT_EVENT_TYPES.AGENT_COMPLETED,
    ]);

    // Final state must be terminal
    const finalResult = await svc.getAgent('lifecycle-1');
    const finalAgent = unwrap(finalResult);
    expect(finalAgent.status).toBe('completed');
    expect(finalAgent.isTerminal).toBe(true);
    expect(finalAgent.isActive).toBe(false);
  });
});
