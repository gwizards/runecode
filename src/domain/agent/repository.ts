/**
 * Agent bounded context — Repository interface and in-memory implementation.
 *
 * IAgentRepository is the domain-facing port (defined in ./ports/IAgentRepository).
 * InMemoryAgentRepository is the default adapter (suitable for tests and dev).
 */

import type { AgentId, RawLiveAgent } from './types';
import { LiveAgentAggregate } from './types';
import { AgentSnapshotQuantizer, QuantizedSnapshotStore } from '../shared/quantization';
import { unwrap } from '../shared/result';
import type { IAgentRepository } from './ports/IAgentRepository';

export type { IAgentRepository };

// ─── In-Memory Implementation ──────────────────────────────────────────────

export class InMemoryAgentRepository implements IAgentRepository {
  private readonly agents = new QuantizedSnapshotStore<RawLiveAgent, string>(
    new AgentSnapshotQuantizer(),
  );

  async getAgent(id: AgentId): Promise<LiveAgentAggregate | null> {
    const snapshot = this.agents.get(id);
    if (!snapshot) return null;
    return unwrap(LiveAgentAggregate.fromSnapshot(snapshot));
  }

  async saveAgent(agent: LiveAgentAggregate): Promise<void> {
    this.agents.set(agent.id, agent.toSnapshot());
  }

  async removeAgent(id: AgentId): Promise<void> {
    this.agents.delete(id);
  }

  async listActiveAgents(): Promise<LiveAgentAggregate[]> {
    return this.agents.values()
      .map((s) => unwrap(LiveAgentAggregate.fromSnapshot(s)))
      .filter((a) => a.isActive);
  }

  async listAll(): Promise<LiveAgentAggregate[]> {
    return this.agents.values().map((s) => unwrap(LiveAgentAggregate.fromSnapshot(s)));
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
