/**
 * Session client — session execution, output streaming, directory utilities,
 * Claude binary management, and file-system helpers.
 */
import { apiCall } from '../apiAdapter';
import {
  getSessionOutput as _getSessionOutput,
  getLiveSessionOutput as _getLiveSessionOutput,
  streamSessionOutput as _streamSessionOutput,
} from '@/infrastructure/tauri/session-client';
import { isDevMode, DEV_PROJECTS, DEV_SESSIONS } from '../devFallback';
import { isWslMode, getWslDistro } from '../platformMode';

/**
 * Convert a Windows-style path (e.g. C:\Users\foo) to a WSL mount path
 * (e.g. /mnt/c/Users/foo).  Non-Windows paths are returned unchanged.
 */
function windowsToWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, '/');
  if (normalized.length >= 2 && normalized[1] === ':') {
    const drive = normalized[0].toLowerCase();
    return `/mnt/${drive}${normalized.substring(2)}`;
  }
  return normalized;
}
import type {
  Project,
  Session,
  ClaudeVersionStatus,
  ClaudeInstallation,
  FileEntry,
} from './types';

// Re-export types owned by this domain so consumers can import from one place
export type {
  Project,
  Session,
  ClaudeVersionStatus,
  ClaudeInstallation,
  FileEntry,
};

/** Returns `{ wslDistro }` when WSL mode is active, or `{}` otherwise. */
function wslParam(): { wslDistro?: string } {
  if (isWslMode()) {
    const distro = getWslDistro();
    if (distro) return { wslDistro: distro };
  }
  return {};
}

/**
 * Gets the user's home directory path
 * @returns Promise resolving to the home directory path
 */
export async function getHomeDirectory(): Promise<string> {
  try {
    return await apiCall<string>('get_home_directory', wslParam());
  } catch (error) {
    console.error('Failed to get home directory:', error);
    return '/';
  }
}

/**
 * Lists files and directories in a given path
 */
export async function listDirectoryContents(directoryPath: string): Promise<FileEntry[]> {
  try {
    const result = await apiCall<FileEntry[]>('list_directory_contents', { directoryPath, ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Searches for files and directories matching a pattern
 */
export async function searchFiles(basePath: string, query: string): Promise<FileEntry[]> {
  try {
    const result = await apiCall<FileEntry[]>('search_files', { basePath, query, ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Checks if Claude Code is installed and gets its version
 */
export async function checkClaudeVersion(): Promise<ClaudeVersionStatus> {
  try {
    return await apiCall<ClaudeVersionStatus>('check_claude_version', { ...wslParam() });
  } catch (error) {
    console.error('Failed to check Claude version:', error);
    throw error;
  }
}

export async function checkNodeInstalled(): Promise<{
  installed: boolean;
  version: string | null;
  major: number;
  meets_minimum: boolean;
}> {
  return apiCall('check_node_installed', { ...wslParam() });
}

export async function installNode(): Promise<string> {
  return apiCall('install_node', { ...wslParam() });
}

export async function installClaudeCode(): Promise<string> {
  return apiCall('install_claude_code', { ...wslParam() });
}

/**
 * Get the stored Claude binary path from settings
 */
export async function getClaudeBinaryPath(): Promise<string | null> {
  try {
    return await apiCall<string | null>('get_claude_binary_path', { ...wslParam() });
  } catch (error) {
    console.error('Failed to get Claude binary path:', error);
    throw error;
  }
}

/**
 * Set the Claude binary path in settings
 */
export async function setClaudeBinaryPath(path: string): Promise<void> {
  try {
    return await apiCall<void>('set_claude_binary_path', { path, ...wslParam() });
  } catch (error) {
    console.error('Failed to set Claude binary path:', error);
    throw error;
  }
}

/**
 * List all available Claude installations on the system
 */
export async function listClaudeInstallations(): Promise<ClaudeInstallation[]> {
  try {
    const result = await apiCall<ClaudeInstallation[]>('list_claude_installations', { ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list Claude installations:', error);
    return [];
  }
}

/**
 * Opens a new Claude Code session
 */
export async function openNewSession(path?: string): Promise<string> {
  try {
    return await apiCall<string>('open_new_session', { path, ...wslParam() });
  } catch (error) {
    console.error('Failed to open new session:', error);
    throw error;
  }
}

/**
 * Get real-time output for a running session (with live output fallback)
 */
export const getSessionOutput = _getSessionOutput;

/**
 * Get live output directly from process stdout buffer
 */
export const getLiveSessionOutput = _getLiveSessionOutput;

/**
 * Start streaming real-time output for a running session
 */
export const streamSessionOutput = _streamSessionOutput;

/**
 * Loads the JSONL history for a specific session
 */
export async function loadSessionHistory(sessionId: string, projectId: string): Promise<any[]> {
  try {
    const result = await apiCall<any[]>('load_session_history', { sessionId, projectId, ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to load session history:', error);
    return [];
  }
}

/**
 * Loads the JSONL history for a specific agent session.
 * Searches across all project directories.
 */
export async function loadAgentSessionHistory(sessionId: string): Promise<any[]> {
  try {
    const result = await apiCall<any[]>('load_agent_session_history', { sessionId });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to load agent session history:', error);
    return [];
  }
}

/**
 * Executes a new interactive Claude Code session with streaming output.
 * If connectionId is provided, sends through an existing persistent WebSocket.
 * If sessionId is provided (without connectionId), resumes that session.
 */
export async function executeClaudeCode(
  projectPath: string,
  prompt: string,
  model: string,
  thinkingMode?: string,
  connectionId?: string,
  sessionId?: string,
  effort?: string,
  resumeAt?: string,
  permissionMode?: string,
  agentConfig?: {
    teamsEnabled?: boolean;
    environment?: {
      type: string;
      sshHost?: string;
      sshPort?: number;
      sshIdentityFile?: string;
      startDirectory?: string;
      wslDistro?: string;
      dockerContainer?: string;
    };
  }
): Promise<any> {
  // When WSL mode is active, convert Windows project path and inject distro
  let effectivePath = projectPath;
  let effectiveAgentConfig = agentConfig;
  if (isWslMode()) {
    const wslDistro = getWslDistro();
    effectivePath = windowsToWslPath(projectPath);
    if (wslDistro) {
      effectiveAgentConfig = {
        ...agentConfig,
        environment: {
          type: 'wsl',
          ...agentConfig?.environment,
          wslDistro,
        },
      };
    }
  }

  return apiCall('execute_claude_code', {
    projectPath: effectivePath,
    prompt,
    model,
    thinkingMode,
    connectionId,
    sessionId,
    effort,
    resumeAt,
    permissionMode,
    ...effectiveAgentConfig,
  });
}

/**
 * Cancels the currently running Claude Code execution
 */
export async function cancelClaudeExecution(
  connectionId?: string,
  sessionId?: string
): Promise<void> {
  return apiCall('cancel_claude_execution', { connectionId, sessionId });
}

/**
 * Lists all currently running Claude sessions
 */
export async function listRunningClaudeSessions(): Promise<any[]> {
  try {
    const result = await apiCall<any[]>('list_running_claude_sessions');
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Gets live output from a Claude session
 */
export async function getClaudeSessionOutput(sessionId: string): Promise<string> {
  return apiCall('get_claude_session_output', { sessionId });
}

// Make dev-fallback imports available for project-client (exported for re-use)
export { isDevMode, DEV_PROJECTS, DEV_SESSIONS };
