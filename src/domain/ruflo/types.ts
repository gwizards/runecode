// Strict domain types for the RuFlo bounded context
import type {
  RuFloStatus,
  RuFloAgent as ApiAgent,
  RuFloSwarmStatus,
  RuFloProjectStatus as ApiProjectStatus,
} from '@/lib/api';

export type AgentStatus =
  | 'running'
  | 'waiting'
  | 'active'
  | 'busy'
  | 'initializing'
  | 'idle'
  | 'stopped'
  | 'unknown';

export type AgentType =
  | 'coder'
  | 'reviewer'
  | 'tester'
  | 'planner'
  | 'researcher'
  | string; // extensible

export interface RuFloInstallation {
  installed: boolean;
  version: string | null;
  mcpActive: boolean;
  slashCommandExists: boolean;
}

export interface RuFloAgent {
  id: string;
  name: string;
  agentType: AgentType;
  status: AgentStatus;
  isActive: boolean; // derived: status is running/waiting/active/busy/initializing
}

export interface RuFloSwarm {
  active: boolean;
  agents: RuFloAgent[];
  memoryEntries: number;
}

export interface RuFloProjectStatus {
  initialized: boolean;
  pending: number;
  completed: number;
  blocked: number;
  total: number; // derived
}

// Type guard helpers
export function isActiveStatus(status: AgentStatus): boolean {
  return ['running', 'waiting', 'active', 'busy', 'initializing'].includes(status);
}

// Mappers from raw API types (snake_case) to domain types (camelCase)

export function toRuFloInstallation(raw: RuFloStatus): RuFloInstallation {
  return {
    installed: raw.installed,
    version: raw.version ?? null,
    mcpActive: raw.mcp_active,
    slashCommandExists: raw.slash_command_exists,
  };
}

export function toRuFloAgent(raw: ApiAgent): RuFloAgent {
  const status = (raw.status as AgentStatus) ?? 'unknown';
  return {
    id: raw.id,
    name: raw.name,
    agentType: raw.agent_type,
    status,
    isActive: isActiveStatus(status),
  };
}

export function toRuFloSwarm(raw: RuFloSwarmStatus): RuFloSwarm {
  const agents = (raw.agents ?? []).map(toRuFloAgent);
  return {
    active: raw.swarm_active,
    agents,
    memoryEntries: raw.memory_entries,
  };
}

export function toRuFloProjectStatus(raw: ApiProjectStatus): RuFloProjectStatus {
  return {
    initialized: raw.initialized,
    pending: raw.pending,
    completed: raw.completed,
    blocked: raw.blocked,
    total: raw.pending + raw.completed + raw.blocked,
  };
}
