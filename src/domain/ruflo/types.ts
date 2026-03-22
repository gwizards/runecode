// Strict domain types for the RuFlo bounded context
import type {
  RuFloStatus,
  RuFloAgent as ApiAgent,
  RuFloSwarmStatus,
  RuFloProjectStatus as ApiProjectStatus,
} from '@/lib/api';

// ─── Branded / Newtype IDs ────────────────────────────────────────────────────

declare const _agentId: unique symbol;
/** Branded type for agent identifiers — prevents mixing with other string IDs */
export type AgentId = string & { readonly [_agentId]: true };

declare const _swarmId: unique symbol;
/** Branded type for swarm identifiers */
export type SwarmId = string & { readonly [_swarmId]: true };

export function toAgentId(raw: string): AgentId {
  if (!raw || !raw.trim()) throw new Error('AgentId cannot be empty');
  return raw as AgentId;
}

export function toSwarmId(raw: string): SwarmId {
  if (!raw || !raw.trim()) throw new Error('SwarmId cannot be empty');
  return raw as SwarmId;
}

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

/** Agent capability — mirrors Rust AgentCapability enum */
export type AgentCapability =
  | 'code-generation'
  | 'code-review'
  | 'testing'
  | 'security-audit'
  | 'performance-analysis'
  | 'memory-optimization'
  | 'documentation'
  | 'planning'
  | 'research'
  | 'unknown';

export const ALL_AGENT_CAPABILITIES: readonly AgentCapability[] = [
  'code-generation', 'code-review', 'testing', 'security-audit',
  'performance-analysis', 'memory-optimization', 'documentation',
  'planning', 'research',
] as const;

export interface RuFloInstallation {
  installed: boolean;
  version: string | null;
  mcpActive: boolean;
  slashCommandExists: boolean;
  isSupported: boolean;
}

export interface RuFloAgent {
  id: AgentId;
  name: string;
  agentType: AgentType;
  status: AgentStatus;
  isActive: boolean; // derived: status is running/waiting/active/busy/initializing
  capabilities: AgentCapability[];
}

export interface RuFloSwarm {
  active: boolean;
  agents: RuFloAgent[];
  memoryEntries: number;
  maxAgents?: number;
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
    isSupported: raw.is_supported ?? false,
  };
}

export function toRuFloAgent(raw: ApiAgent): RuFloAgent {
  const status = (raw.status as AgentStatus) ?? 'unknown';
  return {
    id: toAgentId(raw.id),
    name: raw.name,
    agentType: raw.agent_type,
    status,
    isActive: isActiveStatus(status),
    capabilities: ((raw as any).capabilities ?? []) as AgentCapability[],
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

// ─── Domain Invariants ────────────────────────────────────────────────────────

/** Parse a semantic version string "X.Y.Z" or "vX.Y.Z" */
export function parseVersion(raw: string): { major: number; minor: number; patch: number } | null {
  const cleaned = raw.trim().replace(/^v/, '');
  const match = cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

/** True if installation is fully configured (installed + MCP + slash command) */
export function isFullyConfigured(inst: RuFloInstallation): boolean {
  return inst.installed && inst.mcpActive && inst.slashCommandExists;
}

/** True if version is >= minimum supported (3.0.0) */
export function isVersionSupported(versionStr: string | null): boolean {
  if (!versionStr) return false;
  const v = parseVersion(versionStr);
  if (!v) return false;
  return v.major >= 3;
}

/** Returns true if the agent has the specified capability. */
export function agentHasCapability(agent: RuFloAgent, cap: AgentCapability): boolean {
  return agent.capabilities.includes(cap);
}

/**
 * Returns the fraction of agent slots currently used (0.0–1.0).
 * Returns 0 if maxAgents is not set.
 */
export function swarmCapacityRatio(swarm: RuFloSwarm): number {
  if (!swarm.maxAgents || swarm.maxAgents === 0) return 0;
  return Math.min(1, swarm.agents.length / swarm.maxAgents);
}

/** Summarize swarm health as a string */
export function swarmHealthLabel(swarm: RuFloSwarm): 'healthy' | 'idle' | 'inactive' {
  if (!swarm.active) return 'inactive';
  const activeCount = swarm.agents.filter(a => a.isActive).length;
  return activeCount > 0 ? 'healthy' : 'idle';
}
