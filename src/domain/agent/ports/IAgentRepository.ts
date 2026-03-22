/**
 * Agent bounded context — Repository port (domain-facing interface).
 *
 * Application services depend on this interface; concrete implementations
 * (InMemoryAgentRepository, Tauri backend, etc.) are injected at runtime.
 */

import type { AgentId } from '../types';
import type { LiveAgentAggregate } from '../types';

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
