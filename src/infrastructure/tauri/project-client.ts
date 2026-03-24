// Infrastructure client — Tauri IPC adapter for project domain

import { apiCall } from '@/lib/apiAdapter';
import { applyStartupToken } from '@/lib/startupToken';
import { isDevMode, DEV_PROJECTS, DEV_SESSIONS } from '@/lib/devFallback';
import { isWslMode, getWslDistro } from '@/lib/platformMode';
import type {
  Project,
  Session,
  ClaudeSettings,
  ClaudeVersionStatus,
  ClaudeMdFile,
  FileEntry,
  ClaudeInstallation,
} from './types';

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
 * Lists all projects in the ~/.claude/projects directory
 * @returns Promise resolving to an array of projects
 */
export async function listProjects(): Promise<Project[]> {
  try {
    const result = await apiCall<Project[]>('list_projects', wslParam());
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list projects:', error);
    if (isDevMode()) {
      console.info('[DevFallback] Returning placeholder projects');
      return DEV_PROJECTS;
    }
    return [];
  }
}

/**
 * Creates a new project for the given directory path
 * @param path - The directory path to create a project for
 * @returns Promise resolving to the created project
 */
export async function createProject(path: string): Promise<Project> {
  try {
    return await apiCall<Project>('create_project', { path });
  } catch (error) {
    console.error('Failed to create project:', error);
    throw error;
  }
}

/**
 * Initializes a new project by creating .runecode/project.json in the given directory.
 * Falls back gracefully if the backend is unavailable.
 * @param projectPath - Absolute path to the project directory
 * @param projectName - Display name for the project
 */
export async function initializeProject(projectPath: string, projectName: string): Promise<void> {
  try {
    await apiCall<void>('initialize_project', { projectPath, projectName });
  } catch {
    // If backend doesn't support this command yet, try the web endpoint
    try {
      const response = await fetch('/api/project/init', {
        method: 'POST',
        headers: applyStartupToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ path: projectPath, name: projectName }),
      });
      if (!response.ok) {
        console.warn('Project init endpoint returned non-OK status');
      }
    } catch {
      // If backend unavailable, that's OK — project will work without .runecode/
      console.warn('Could not initialize project directory — backend unavailable');
    }
  }
}

/**
 * Retrieves sessions for a specific project
 * @param projectId - The ID of the project to retrieve sessions for
 * @returns Promise resolving to an array of sessions
 */
export async function getProjectSessions(projectId: string): Promise<Session[]> {
  try {
    const result = await apiCall<Session[]>('get_project_sessions', { projectId, ...wslParam() });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to get project sessions:', error);
    if (isDevMode()) {
      console.info('[DevFallback] Returning placeholder sessions for', projectId);
      return DEV_SESSIONS.filter(s => s.project_id === projectId);
    }
    return [];
  }
}

/**
 * Reads the Claude settings file
 * @returns Promise resolving to the settings object
 */
export async function getClaudeSettings(): Promise<ClaudeSettings> {
  try {
    const result = await apiCall<{ data: ClaudeSettings }>('get_claude_settings');

    // The Rust backend returns ClaudeSettings { data: ... }
    // We need to extract the data field
    if (result && typeof result === 'object' && 'data' in result) {
      return result.data;
    }

    // If the result is already the settings object, return it
    return result as ClaudeSettings;
  } catch (error) {
    console.error('Failed to get Claude settings:', error);
    throw error;
  }
}

/**
 * Saves the Claude settings file
 * @param settings - The settings object to save
 * @returns Promise resolving when the settings are saved
 */
export async function saveClaudeSettings(settings: ClaudeSettings): Promise<string> {
  try {
    return await apiCall<string>('save_claude_settings', { settings });
  } catch (error) {
    console.error('Failed to save Claude settings:', error);
    throw error;
  }
}

/**
 * Reads the CLAUDE.md system prompt file
 * @returns Promise resolving to the system prompt content
 */
export async function getSystemPrompt(): Promise<string> {
  try {
    return await apiCall<string>('get_system_prompt');
  } catch (error) {
    console.error('Failed to get system prompt:', error);
    throw error;
  }
}

/**
 * Saves the CLAUDE.md system prompt file
 * @param content - The new content for the system prompt
 * @returns Promise resolving when the file is saved
 */
export async function saveSystemPrompt(content: string): Promise<string> {
  try {
    return await apiCall<string>('save_system_prompt', { content });
  } catch (error) {
    console.error('Failed to save system prompt:', error);
    throw error;
  }
}

/**
 * Finds all CLAUDE.md files in a project directory
 * @param projectPath - The absolute path to the project
 * @returns Promise resolving to an array of CLAUDE.md files
 */
export async function findClaudeMdFiles(projectPath: string): Promise<ClaudeMdFile[]> {
  try {
    const result = await apiCall<ClaudeMdFile[]>('find_claude_md_files', { projectPath });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to find CLAUDE.md files:', error);
    return [];
  }
}

/**
 * Reads a specific CLAUDE.md file
 * @param filePath - The absolute path to the file
 * @returns Promise resolving to the file content
 */
export async function readClaudeMdFile(filePath: string): Promise<string> {
  try {
    return await apiCall<string>('read_claude_md_file', { filePath });
  } catch (error) {
    console.error('Failed to read CLAUDE.md file:', error);
    throw error;
  }
}

/**
 * Saves a specific CLAUDE.md file
 * @param filePath - The absolute path to the file
 * @param content - The new content for the file
 * @returns Promise resolving when the file is saved
 */
export async function saveClaudeMdFile(filePath: string, content: string): Promise<string> {
  try {
    return await apiCall<string>('save_claude_md_file', { filePath, content });
  } catch (error) {
    console.error('Failed to save CLAUDE.md file:', error);
    throw error;
  }
}

/**
 * Checks if Claude Code is installed and gets its version
 * @returns Promise resolving to the version status
 */
export async function checkClaudeVersion(): Promise<ClaudeVersionStatus> {
  try {
    return await apiCall<ClaudeVersionStatus>('check_claude_version');
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
  return apiCall('check_node_installed', {});
}

export async function installNode(): Promise<string> {
  return apiCall('install_node', {});
}

export async function installClaudeCode(): Promise<string> {
  return apiCall('install_claude_code', {});
}

/**
 * Get the stored Claude binary path from settings
 * @returns Promise resolving to the path if set, null otherwise
 */
export async function getClaudeBinaryPath(): Promise<string | null> {
  try {
    return await apiCall<string | null>('get_claude_binary_path');
  } catch (error) {
    console.error('Failed to get Claude binary path:', error);
    throw error;
  }
}

/**
 * Set the Claude binary path in settings
 * @param path - The absolute path to the Claude binary
 * @returns Promise resolving when the path is saved
 */
export async function setClaudeBinaryPath(path: string): Promise<void> {
  try {
    return await apiCall<void>('set_claude_binary_path', { path });
  } catch (error) {
    console.error('Failed to set Claude binary path:', error);
    throw error;
  }
}

/**
 * List all available Claude installations on the system
 * @returns Promise resolving to an array of Claude installations
 */
export async function listClaudeInstallations(): Promise<ClaudeInstallation[]> {
  try {
    const result = await apiCall<ClaudeInstallation[]>('list_claude_installations');
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list Claude installations:', error);
    return [];
  }
}

/**
 * Lists files and directories in a given path
 */
export async function listDirectoryContents(directoryPath: string): Promise<FileEntry[]> {
  try {
    const result = await apiCall<FileEntry[]>('list_directory_contents', { directoryPath });
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
    const result = await apiCall<FileEntry[]>('search_files', { basePath, query });
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}
