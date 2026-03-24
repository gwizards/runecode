/**
 * RuFlo client — RuFlo CLI install/uninstall, MCP activation, project
 * initialization, swarm status, and memory management.
 */
import { apiCall } from '../apiAdapter';
import { isWslMode, getWslDistro } from '../platformMode';
import type {
  RuFloStatus,
  RuFloProjectStatus,
  RuFloSwarmStatus,
} from './types';

export type { RuFloStatus, RuFloProjectStatus, RuFloSwarmStatus };

/** Helper: returns the WSL distro parameter when WSL mode is active. */
function wslParam(): { wslDistro: string | null } {
  return { wslDistro: isWslMode() ? getWslDistro() : null };
}

/** Checks whether the RuFlo CLI is installed and returns its status. */
export async function checkRufloInstalled(): Promise<RuFloStatus> {
  try {
    return await apiCall<RuFloStatus>('check_ruflo_installed', { ...wslParam() });
  } catch (error) {
    console.error('Failed to check RuFlo installation:', error);
    throw error;
  }
}

/** Installs the RuFlo CLI via npm. Streams progress via the ruflo-install-progress event. */
export async function installRuflo(): Promise<string> {
  try {
    return await apiCall<string>('install_ruflo', { ...wslParam() });
  } catch (error) {
    console.error('Failed to install RuFlo:', error);
    throw error;
  }
}

/** Activates the RuFlo MCP server in Claude Code's configuration. */
export async function activateRufloMcp(): Promise<string> {
  try {
    return await apiCall<string>('activate_ruflo_mcp', { ...wslParam() });
  } catch (error) {
    console.error('Failed to activate RuFlo MCP:', error);
    throw error;
  }
}

/** Deactivates the RuFlo MCP server from Claude Code's configuration. */
export async function deactivateRufloMcp(): Promise<string> {
  try {
    return await apiCall<string>('deactivate_ruflo_mcp', { ...wslParam() });
  } catch (error) {
    console.error('Failed to deactivate RuFlo MCP:', error);
    throw error;
  }
}

/** Creates the /setup-ruflo slash command in Claude Code's global commands. */
export async function createRufloSlashCommand(): Promise<string> {
  try {
    return await apiCall<string>('create_ruflo_slash_command', { ...wslParam() });
  } catch (error) {
    console.error('Failed to create RuFlo slash command:', error);
    throw error;
  }
}

export async function createDddOptimizationCommand(): Promise<string> {
  try {
    return await apiCall<string>('create_ddd_optimization_command', { ...wslParam() });
  } catch (error) {
    console.error('Failed to create DDD optimization command:', error);
    throw error;
  }
}

/** Initializes a project directory with RuFlo configuration files. */
export async function initRufloProject(path: string): Promise<string> {
  try {
    return await apiCall<string>('init_ruflo_project', { path, ...wslParam() });
  } catch (error) {
    console.error('Failed to initialize RuFlo project:', error);
    throw error;
  }
}

/** Returns the RuFlo initialization status of a specific project directory. */
export async function getRufloProjectStatus(path: string): Promise<RuFloProjectStatus> {
  try {
    return await apiCall<RuFloProjectStatus>('get_ruflo_project_status', { path, ...wslParam() });
  } catch (error) {
    console.error('Failed to get RuFlo project status:', error);
    throw error;
  }
}

/** Returns the current swarm status including active agents and tasks. */
export async function getRufloSwarmStatus(): Promise<RuFloSwarmStatus> {
  try {
    return await apiCall<RuFloSwarmStatus>('get_ruflo_swarm_status', { ...wslParam() });
  } catch (error) {
    console.error('Failed to get RuFlo swarm status:', error);
    throw error;
  }
}

/** Uninstalls the RuFlo CLI and removes its configuration. */
export const uninstallRuflo = (): Promise<string> => apiCall('uninstall_ruflo', { ...wslParam() });

/** Returns memory stats (total entries, backend name). */
export async function getRufloMemoryStats(): Promise<Record<string, unknown>> {
  try {
    return await apiCall<Record<string, unknown>>('get_ruflo_memory_stats', { ...wslParam() });
  } catch (error) {
    console.error('Failed to get RuFlo memory stats:', error);
    throw error;
  }
}

/** Exports memory to the given file path as JSON. */
export async function syncRufloMemoryLocal(destPath: string): Promise<string> {
  try {
    return await apiCall<string>('sync_ruflo_memory_local', { output_path: destPath, ...wslParam() });
  } catch (error) {
    console.error('Failed to sync RuFlo memory:', error);
    throw error;
  }
}

/** Compresses and cleans up memory storage. */
export async function consolidateRufloMemory(): Promise<string> {
  try {
    return await apiCall<string>('consolidate_ruflo_memory', { ...wslParam() });
  } catch (error) {
    console.error('Failed to consolidate RuFlo memory:', error);
    throw error;
  }
}

/** Switches the active memory backend. */
export async function setRufloMemoryBackend(
  backend: 'agentdb' | 'hnsw' | 'hybrid'
): Promise<string> {
  try {
    return await apiCall<string>('set_ruflo_memory_backend', { backend, ...wslParam() });
  } catch (error) {
    console.error('Failed to set RuFlo memory backend:', error);
    throw error;
  }
}
