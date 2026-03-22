/**
 * RuFloSwarmAggregate — Aggregate root for swarm state.
 *
 * Enforces:
 * - Agent count ≤ maxAgents
 * - Agents must have valid IDs
 * - Events are recorded internally and dispatched by application service
 *
 * NOTE: The existing RuFloSwarm interface in types.ts is preserved for
 * backwards compatibility. This aggregate is the authoritative model.
 */

import type { DomainEvent } from '../../shared/event-bus';
import type { RuFloAgent, AgentCapability } from '../types';
import { type SwarmId, toSwarmId } from '../types';
import {
  makeSwarmInitialized,
  makeSwarmAgentAdded,
  makeSwarmAgentRemoved,
} from '../domain-events';
import { SwarmTopology } from '../value-objects/swarm-topology';

export class RuFloSwarmAggregate {
  private _agents: RuFloAgent[];
  private _events: DomainEvent[] = [];

  private constructor(
    private readonly _id: SwarmId,
    private readonly _topology: SwarmTopology,
    private readonly _maxAgents: number,
    private readonly _memoryNamespace: string,
    agents: RuFloAgent[],
  ) {
    this._agents = [...agents];
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /**
   * Create a new swarm. Raises SwarmInitializedEvent.
   * @throws if topology is invalid or maxAgents < 1
   */
  static create(params: {
    id: string;
    topology: string;
    maxAgents?: number;
    memoryNamespace?: string;
    agents?: RuFloAgent[];
  }): RuFloSwarmAggregate {
    const topologyResult = SwarmTopology.create(params.topology);
    if (!topologyResult.ok) throw new Error(topologyResult.error);

    const maxAgents = params.maxAgents ?? 15;
    if (maxAgents < 1) throw new Error('maxAgents must be at least 1');

    const agents = params.agents ?? [];
    const swarmIdResult = toSwarmId(params.id);
    if (!swarmIdResult.ok) throw new Error(swarmIdResult.error);
    const swarmId = swarmIdResult.value;
    const swarm = new RuFloSwarmAggregate(
      swarmId,
      topologyResult.value,
      maxAgents,
      params.memoryNamespace ?? 'default',
      agents,
    );

    swarm._events.push(
      makeSwarmInitialized(swarmId, topologyResult.value.toString(), agents.length, maxAgents),
    );
    return swarm;
  }

  /**
   * Reconstitute from a raw snapshot (no event raised — state already exists).
   * Accepts any string topology value for forward-compatibility with persisted data.
   */
  static fromSnapshot(params: {
    id: string;
    topology: string;
    maxAgents?: number;
    memoryNamespace?: string;
    agents?: RuFloAgent[];
  }): RuFloSwarmAggregate {
    const topologyResult = SwarmTopology.create(params.topology);
    // Fallback to 'hierarchical' for unknown persisted topology values to avoid
    // breaking snapshot rehydration when topology names evolve.
    const fallback = SwarmTopology.create('hierarchical') as { ok: true; value: SwarmTopology };
    const topology = topologyResult.ok ? topologyResult.value : fallback.value;
    const swarmIdFallback = toSwarmId(params.id);
    const swarmId = swarmIdFallback.ok ? swarmIdFallback.value : (params.id as SwarmId);
    return new RuFloSwarmAggregate(
      swarmId,
      topology,
      params.maxAgents ?? 15,
      params.memoryNamespace ?? 'default',
      params.agents ?? [],
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get id(): SwarmId { return this._id; }
  get topology(): string { return this._topology.toString(); }
  get maxAgents(): number { return this._maxAgents; }
  get memoryNamespace(): string { return this._memoryNamespace; }
  get agents(): ReadonlyArray<RuFloAgent> { return this._agents; }

  get activeAgentCount(): number {
    return this._agents.filter(a => a.isActive).length;
  }

  get isHealthy(): boolean {
    return this._agents.length > 0 && this._agents.some(a => a.isActive);
  }

  get isAtCapacity(): boolean {
    return this._agents.length >= this._maxAgents;
  }

  findAgentById(id: string): RuFloAgent | undefined {
    return this._agents.find(a => a.id === id);
  }

  hasAgentWithCapability(cap: AgentCapability): boolean {
    return this._agents.some(a => a.capabilities.includes(cap));
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Add an agent to the swarm.
   * @throws if swarm is at capacity or agent ID already exists
   */
  addAgent(agent: RuFloAgent): void {
    if (this.isAtCapacity) {
      throw new Error(
        `Swarm at capacity: ${this._agents.length}/${this._maxAgents} agents`,
      );
    }
    if (!agent.id.trim()) throw new Error('Agent ID must not be empty');
    if (this.findAgentById(agent.id)) {
      throw new Error(`Agent ${agent.id} already exists in swarm`);
    }
    this._agents = [...this._agents, agent];
    this._events.push(
      makeSwarmAgentAdded(this._id, agent.id, agent.agentType),
    );
  }

  /**
   * Remove an agent from the swarm.
   * @throws if agent not found
   */
  removeAgent(agentId: string): void {
    const idx = this._agents.findIndex(a => a.id === agentId);
    if (idx === -1) throw new Error(`Agent ${agentId} not found in swarm`);
    this._agents = this._agents.filter(a => a.id !== agentId);
    this._events.push(makeSwarmAgentRemoved(this._id, agentId));
  }

  // ── Event Management ──────────────────────────────────────────────────────

  /** Collect recorded events (read-only). */
  get events(): ReadonlyArray<DomainEvent> { return this._events; }

  /** Clear events after dispatch. Called by application service. */
  clearEvents(): void { this._events = []; }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /** Export as plain object for storage / API response. */
  toSnapshot(): {
    id: string;
    topology: string;
    maxAgents: number;
    memoryNamespace: string;
    agents: RuFloAgent[];
  } {
    return {
      id: this._id,
      topology: this._topology.toString(),
      maxAgents: this._maxAgents,
      memoryNamespace: this._memoryNamespace,
      agents: [...this._agents],
    };
  }
}
