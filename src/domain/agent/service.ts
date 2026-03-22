/**
 * Agent bounded context — Application Service.
 *
 * Orchestrates domain operations: load aggregate → call domain method →
 * persist → dispatch events → clear events → return Result.
 *
 * This layer is the only caller of IAgentRepository and DomainEventBus.
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { toAgentId, LiveAgentAggregate } from './types';
import type { IAgentRepository } from './repository';

export class AgentApplicationService {
  constructor(
    private readonly repo: IAgentRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Private helpers ───────────────────────────────────────────────────────

  private async load(agentId: string): Promise<Result<LiveAgentAggregate | null>> {
    const idResult = toAgentId(agentId);
    if (!idResult.ok) return idResult;
    return Ok(await this.repo.getAgent(idResult.value));
  }

  private async persist(agent: LiveAgentAggregate): Promise<void> {
    await this.repo.saveAgent(agent);
    this.eventBus.dispatch(agent.events);
    agent.clearEvents();
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Create and persist a new agent in 'running' state.
   * Returns the new aggregate on success.
   */
  async startAgent(id: string, name: string): Promise<Result<LiveAgentAggregate>> {
    try {
      const agentResult = LiveAgentAggregate.start(id, name);
      if (!agentResult.ok) return agentResult;
      const agent = agentResult.value;
      await this.persist(agent);
      return Ok(agent);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Transition an existing agent to 'thinking'.
   */
  async markThinking(agentId: string): Promise<Result<void>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      const domainResult = agent.think();
      if (!domainResult.ok) return domainResult;
      await this.persist(agent);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Update elapsed time and token count for an agent.
   */
  async tickAgent(
    agentId: string,
    elapsedMs: number,
    tokenCount: number,
  ): Promise<Result<void>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      agent.tick(elapsedMs, tokenCount);
      await this.persist(agent);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Mark an agent as successfully completed.
   */
  async completeAgent(agentId: string): Promise<Result<void>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      const domainResult = agent.complete();
      if (!domainResult.ok) return domainResult;
      await this.persist(agent);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Mark an agent as failed with a descriptive reason.
   */
  async failAgent(agentId: string, reason: string): Promise<Result<void>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      const domainResult = agent.fail(reason);
      if (!domainResult.ok) return domainResult;
      await this.persist(agent);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Resume a thinking agent back to 'running' state.
   */
  async resumeAgent(agentId: string): Promise<Result<void>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      const domainResult = agent.resume();
      if (!domainResult.ok) return domainResult;
      await this.persist(agent);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /**
   * Return a single agent by id.
   */
  async getAgent(agentId: string): Promise<Result<LiveAgentAggregate>> {
    try {
      const loadResult = await this.load(agentId);
      if (!loadResult.ok) return loadResult;
      const agent = loadResult.value;
      if (!agent) return Err(`Agent '${agentId}' not found`);
      return Ok(agent);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Return all agents in an active state (running or thinking).
   */
  async listActiveAgents(): Promise<Result<LiveAgentAggregate[]>> {
    try {
      const agents = await this.repo.listActiveAgents();
      return Ok(agents);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
