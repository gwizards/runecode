/**
 * MCP client — MCP server add/list/remove/test and project config management.
 */
import { apiCall } from '../apiAdapter';
import { isWslMode, getWslDistro } from '../platformMode';
import type {
  MCPServer,
  MCPProjectConfig,
  AddServerResult,
  ImportResult,
  ServerStatus,
} from './types';

/** Helper: returns the WSL distro parameter when WSL mode is active. */
function wslParam(): { wslDistro: string | null } {
  return { wslDistro: isWslMode() ? getWslDistro() : null };
}

export type { MCPServer, MCPProjectConfig, AddServerResult, ImportResult, ServerStatus };

/**
 * Adds a new MCP server
 */
export async function mcpAdd(
  name: string,
  transport: string,
  command?: string,
  args: string[] = [],
  env: Record<string, string> = {},
  url?: string,
  scope: string = 'local'
): Promise<AddServerResult> {
  try {
    return await apiCall<AddServerResult>('mcp_add', {
      name,
      transport,
      command,
      args,
      env,
      url,
      scope,
      ...wslParam(),
    });
  } catch (error) {
    console.error('Failed to add MCP server:', error);
    throw error;
  }
}

/**
 * Lists all configured MCP servers
 */
export async function mcpList(): Promise<MCPServer[]> {
  try {
    const result = await apiCall<MCPServer[]>('mcp_list', { ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('API: Failed to list MCP servers:', error);
    return [];
  }
}

/**
 * Gets details for a specific MCP server
 */
export async function mcpGet(name: string): Promise<MCPServer> {
  try {
    return await apiCall<MCPServer>('mcp_get', { name, ...wslParam() });
  } catch (error) {
    console.error('Failed to get MCP server:', error);
    throw error;
  }
}

/**
 * Removes an MCP server
 */
export async function mcpRemove(name: string): Promise<string> {
  try {
    return await apiCall<string>('mcp_remove', { name, ...wslParam() });
  } catch (error) {
    console.error('Failed to remove MCP server:', error);
    throw error;
  }
}

/**
 * Adds an MCP server from JSON configuration
 */
export async function mcpAddJson(
  name: string,
  jsonConfig: string,
  scope: string = 'local'
): Promise<AddServerResult> {
  try {
    return await apiCall<AddServerResult>('mcp_add_json', { name, jsonConfig, scope, ...wslParam() });
  } catch (error) {
    console.error('Failed to add MCP server from JSON:', error);
    throw error;
  }
}

/**
 * Imports MCP servers from Claude Desktop
 */
export async function mcpAddFromClaudeDesktop(scope: string = 'local'): Promise<ImportResult> {
  try {
    return await apiCall<ImportResult>('mcp_add_from_claude_desktop', { scope, ...wslParam() });
  } catch (error) {
    console.error('Failed to import from Claude Desktop:', error);
    throw error;
  }
}

/**
 * Starts Claude Code as an MCP server
 */
export async function mcpServe(): Promise<string> {
  try {
    return await apiCall<string>('mcp_serve', { ...wslParam() });
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    throw error;
  }
}

/**
 * Tests connection to an MCP server
 */
export async function mcpTestConnection(name: string): Promise<string> {
  try {
    return await apiCall<string>('mcp_test_connection', { name, ...wslParam() });
  } catch (error) {
    console.error('Failed to test MCP connection:', error);
    throw error;
  }
}

/**
 * Resets project-scoped server approval choices
 */
export async function mcpResetProjectChoices(): Promise<string> {
  try {
    return await apiCall<string>('mcp_reset_project_choices', { ...wslParam() });
  } catch (error) {
    console.error('Failed to reset project choices:', error);
    throw error;
  }
}

/**
 * Gets the status of MCP servers
 */
export async function mcpGetServerStatus(): Promise<Record<string, ServerStatus>> {
  try {
    return await apiCall<Record<string, ServerStatus>>('mcp_get_server_status', { ...wslParam() });
  } catch (error) {
    console.error('Failed to get server status:', error);
    throw error;
  }
}

/**
 * Reads .mcp.json from the current project
 */
export async function mcpReadProjectConfig(projectPath: string): Promise<MCPProjectConfig> {
  try {
    return await apiCall<MCPProjectConfig>('mcp_read_project_config', { projectPath, ...wslParam() });
  } catch (error) {
    console.error('Failed to read project MCP config:', error);
    throw error;
  }
}

/**
 * Saves .mcp.json to the current project
 */
export async function mcpSaveProjectConfig(
  projectPath: string,
  config: MCPProjectConfig
): Promise<string> {
  try {
    return await apiCall<string>('mcp_save_project_config', { projectPath, config, ...wslParam() });
  } catch (error) {
    console.error('Failed to save project MCP config:', error);
    throw error;
  }
}
