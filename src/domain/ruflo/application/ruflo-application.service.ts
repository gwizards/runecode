/**
 * RuFloApplicationService — Application service for ruflo bounded context.
 *
 * Thin command handlers that:
 *   1. Load aggregate from repository
 *   2. Call domain method (which records events internally)
 *   3. Save aggregate back
 *   4. Dispatch recorded events to event bus
 *   5. Return Result<T>
 *
 * No business logic lives here — only orchestration.
 */

import type { DomainEventBus } from '../../shared/event-bus';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type { IRuFloRepository } from './ruflo.repository';
import { RuFloSwarmAggregate } from '../aggregates/swarm.aggregate';
import { RuFloInstallationAggregate } from '../aggregates/installation.aggregate';
import type { RuFloAgent } from '../types';

export class RuFloApplicationService {
  constructor(
    private readonly repo: IRuFloRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Installation Commands ─────────────────────────────────────────────────

  async markInstalled(version: string, isSupported: boolean): Promise<Result<void>> {
    try {
      const installation = await this.repo.getInstallation();
      const domainResult = installation.markInstalled(version, isSupported);
      if (!domainResult.ok) return domainResult;
      const result = await this.repo.saveInstallation(installation);
      if (!result.ok) return result;
      this.eventBus.dispatch(installation.events);
      installation.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async markInstallationFailed(reason: string): Promise<Result<void>> {
    try {
      const installation = await this.repo.getInstallation();
      installation.markFailed(reason);
      const result = await this.repo.saveInstallation(installation);
      if (!result.ok) return result;
      this.eventBus.dispatch(installation.events);
      installation.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async activateMcp(namespace: string): Promise<Result<void>> {
    try {
      const installation = await this.repo.getInstallation();
      const domainResult = installation.activateMcp(namespace);
      if (!domainResult.ok) return domainResult;
      const result = await this.repo.saveInstallation(installation);
      if (!result.ok) return result;
      this.eventBus.dispatch(installation.events);
      installation.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async changeMemoryBackend(
    backend: 'agentdb' | 'hnsw' | 'hybrid',
  ): Promise<Result<void>> {
    try {
      const installation = await this.repo.getInstallation();
      const domainResult = installation.setMemoryBackend(backend);
      if (!domainResult.ok) return domainResult;
      const result = await this.repo.saveInstallation(installation);
      if (!result.ok) return result;
      this.eventBus.dispatch(installation.events);
      installation.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Swarm Commands ────────────────────────────────────────────────────────

  async initializeSwarm(params: {
    id: string;
    topology: string;
    maxAgents?: number;
    memoryNamespace?: string;
  }): Promise<Result<RuFloSwarmAggregate>> {
    try {
      const createResult = RuFloSwarmAggregate.create(params);
      if (!createResult.ok) return createResult;
      const swarm = createResult.value;
      const result = await this.repo.saveSwarm(swarm);
      if (!result.ok) return result;
      this.eventBus.dispatch(swarm.events);
      swarm.clearEvents();
      return Ok(swarm);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async addAgentToSwarm(agent: RuFloAgent): Promise<Result<void>> {
    try {
      const swarm = await this.repo.getSwarm();
      if (!swarm) return Err('No active swarm');
      const domainResult = swarm.addAgent(agent);
      if (!domainResult.ok) return domainResult;
      const result = await this.repo.saveSwarm(swarm);
      if (!result.ok) return result;
      this.eventBus.dispatch(swarm.events);
      swarm.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async removeAgentFromSwarm(agentId: string): Promise<Result<void>> {
    try {
      const swarm = await this.repo.getSwarm();
      if (!swarm) return Err('No active swarm');
      const domainResult = swarm.removeAgent(agentId);
      if (!domainResult.ok) return domainResult;
      const result = await this.repo.saveSwarm(swarm);
      if (!result.ok) return result;
      this.eventBus.dispatch(swarm.events);
      swarm.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async getInstallation(): Promise<Result<RuFloInstallationAggregate>> {
    try {
      return Ok(await this.repo.getInstallation());
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async getSwarm(): Promise<Result<RuFloSwarmAggregate | null>> {
    try {
      return Ok(await this.repo.getSwarm());
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
