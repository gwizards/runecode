/**
 * Port: abstracts all Tauri IPC calls needed by the ruflo domain service.
 * The adapter (TauriRuFloApiAdapter) lives in src/infrastructure/ruflo/.
 *
 * Raw API shapes (snake_case) are defined here so the domain is self-contained
 * and does not depend on the deprecated @/lib/api infrastructure shim.
 */

/** Raw Tauri response for ruflo installation state (snake_case from Rust). */
export interface RuFloStatus {
  installed: boolean;
  version: string | null;
  mcp_active: boolean;
  slash_command_exists: boolean;
  is_supported?: boolean;
}

/** Raw Tauri response for a single agent entry (snake_case from Rust). */
export interface RuFloAgent {
  id: string;
  name: string;
  agent_type: string;
  status: string;
  capabilities?: string[];
}

/** Raw Tauri response for swarm state (snake_case from Rust). */
export interface RuFloSwarmStatus {
  swarm_active: boolean;
  agents: RuFloAgent[];
  memory_entries: number;
}

/** Raw Tauri response for project task counts (snake_case from Rust). */
export interface RuFloProjectStatus {
  initialized: boolean;
  pending: number;
  completed: number;
  blocked: number;
}

export interface IRuFloApiPort {
  checkRufloInstalled(): Promise<RuFloStatus>;
  getRufloSwarmStatus(): Promise<RuFloSwarmStatus>;
  getRufloProjectStatus(path: string): Promise<RuFloProjectStatus>;
  installRuflo(): Promise<string>;
  uninstallRuflo(): Promise<string>;
  activateRufloMcp(): Promise<string>;
  deactivateRufloMcp(): Promise<string>;
  createRufloSlashCommand(): Promise<string>;
  initRufloProject(path: string): Promise<string>;
  getRufloMemoryStats(): Promise<Record<string, unknown>>;
  syncRufloMemoryLocal(destPath: string): Promise<string>;
  consolidateRufloMemory(): Promise<string>;
  setRufloMemoryBackend(backend: 'agentdb' | 'hnsw' | 'hybrid'): Promise<string>;
}
