/**
 * Agent bounded context — Repository interface and in-memory implementation.
 *
 * IAgentRepository is the domain-facing port.
 * InMemoryAgentRepository is the default adapter (suitable for tests and dev).
 */

import type { AgentId } from './types';
import { LiveAgentAggregate } from './types';

// ─── Repository Interface ──────────────────────────────────────────────────

export interface IAgentRepository {
  /** Return the aggregate for the given id, or null if not found. */
  getAgent(id: AgentId): Promise<LiveAgentAggregate | null>;

  /** Persist (upsert) an aggregate. */
  saveAgent(agent: LiveAgentAggregate): Promise<void>;

  /** Remove an agent by id. No-op if not found. */
  removeAgent(id: AgentId): Promise<void>;

  /** Return all agents whose status is active (running or thinking). */
  listActiveAgents(): Promise<LiveAgentAggregate[]>;

  /** Return all tracked agents regardless of status. */
  listAll(): Promise<LiveAgentAggregate[]>;
}

// ─── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryAgentRepository implements IAgentRepository {
  private readonly agents = new Map<string, ReturnType<LiveAgentAggregate['toSnapshot']>>();

  async getAgent(id: AgentId): Promise<LiveAgentAggregate | null> {
    const snapshot = this.agents.get(id);
    if (!snapshot) return null;
    return LiveAgentAggregate.fromSnapshot(snapshot);
  }

  async saveAgent(agent: LiveAgentAggregate): Promise<void> {
    this.agents.set(agent.id, agent.toSnapshot());
  }

  async removeAgent(id: AgentId): Promise<void> {
    this.agents.delete(id);
  }

  async listActiveAgents(): Promise<LiveAgentAggregate[]> {
    return Array.from(this.agents.values())
      .map(LiveAgentAggregate.fromSnapshot)
      .filter((a) => a.isActive);
  }

  async listAll(): Promise<LiveAgentAggregate[]> {
    return Array.from(this.agents.values()).map(LiveAgentAggregate.fromSnapshot);
  }

  /**
   * Test helper — seed an agent directly into the store without going
   * through saveAgent so that tests can set up state without triggering
   * any service-layer side effects.
   */
  seed(agent: LiveAgentAggregate): void {
    this.agents.set(agent.id, agent.toSnapshot());
  }
}
