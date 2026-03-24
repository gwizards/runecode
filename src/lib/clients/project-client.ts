/**
 * Project client — project/workspace operations, agent management,
 * usage statistics, and CLAUDE.md file helpers.
 */
import { apiCall } from '../apiAdapter';
import { isDevMode, DEV_PROJECTS, DEV_SESSIONS } from '../devFallback';
import { applyStartupToken } from '../startupToken';
import { wslParam } from '../platformMode';
import type {
  Project,
  Session,
  Agent,
  AgentExport,
  GitHubAgentFile,
  ClaudeMdFile,
  UsageEntry,
  UsageStats,
  ProjectUsage,
} from './types';

export type {
  Project,
  Session,
  Agent,
  AgentExport,
  GitHubAgentFile,
  ClaudeMdFile,
  UsageEntry,
  UsageStats,
  ProjectUsage,
};

/**
 * Lists all projects in the ~/.claude/projects directory
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
 */
export async function createProject(path: string): Promise<Project> {
  try {
    return await apiCall<Project>('create_project', { path, ...wslParam() });
  } catch (error) {
    console.error('Failed to create project:', error);
    throw error;
  }
}

/**
 * Initializes a new project by creating .runecode/project.json in the given directory.
 * Falls back gracefully if the backend is unavailable.
 */
export async function initializeProject(
  projectPath: string,
  projectName: string
): Promise<void> {
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
 * Fetch list of agents from GitHub repository
 */
export async function fetchGitHubAgents(): Promise<GitHubAgentFile[]> {
  try {
    const result = await apiCall<GitHubAgentFile[]>('fetch_github_agents');
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to fetch GitHub agents:', error);
    return [];
  }
}

/**
 * Fetch and preview a specific agent from GitHub
 */
export async function fetchGitHubAgentContent(downloadUrl: string): Promise<AgentExport> {
  try {
    return await apiCall<AgentExport>('fetch_github_agent_content', { downloadUrl });
  } catch (error) {
    console.error('Failed to fetch GitHub agent content:', error);
    throw error;
  }
}

/**
 * Import an agent directly from GitHub
 */
export async function importAgentFromGitHub(downloadUrl: string): Promise<Agent> {
  try {
    return await apiCall<Agent>('import_agent_from_github', { downloadUrl });
  } catch (error) {
    console.error('Failed to import agent from GitHub:', error);
    throw error;
  }
}

// Agent CRUD

/**
 * Lists all CC agents
 */
export async function listAgents(): Promise<Agent[]> {
  try {
    const result = await apiCall<Agent[]>('list_agents');
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list agents:', error);
    return [];
  }
}

/**
 * Creates or updates an agent by writing a .md file
 */
export async function createAgent(agent: {
  name: string;
  description?: string;
  model?: string;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  maxTurns?: number;
  permissionMode?: string;
  isolation?: string;
  background?: boolean;
  system_prompt: string;
  scope?: 'user' | 'project';
}): Promise<Agent> {
  try {
    return await apiCall<Agent>('create_agent', agent);
  } catch (error) {
    console.error('Failed to create agent:', error);
    throw error;
  }
}

/**
 * Updates an existing agent by rewriting its .md file
 */
export async function updateAgent(
  originalName: string,
  agent: {
    name: string;
    description?: string;
    model?: string;
    tools?: string[];
    disallowedTools?: string[];
    skills?: string[];
    maxTurns?: number;
    permissionMode?: string;
    isolation?: string;
    background?: boolean;
    system_prompt: string;
    scope?: 'user' | 'project';
  }
): Promise<Agent> {
  try {
    // PUT requires direct fetch — apiCall's write path sends as POST body
    // but the URL needs the original name for the {name} placeholder
    const response = await fetch(
      new URL(
        `/api/agents/${encodeURIComponent(originalName)}`,
        window.location.origin
      ).toString(),
      {
        method: 'PUT',
        headers: applyStartupToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(agent),
      }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    return (json?.data ?? json) as Agent;
  } catch (error) {
    console.error('Failed to update agent:', error);
    throw error;
  }
}

/**
 * Deletes an agent by removing its .md file
 */
export async function deleteAgent(name: string, scope?: 'user' | 'project'): Promise<void> {
  try {
    const params = scope ? `?scope=${scope}` : '';
    // DELETE requires direct fetch (apiCall only supports GET/POST)
    const response = await fetch(
      new URL(
        `/api/agents/${encodeURIComponent(name)}${params}`,
        window.location.origin
      ).toString(),
      { method: 'DELETE', headers: applyStartupToken({}) }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error('Failed to delete agent:', error);
    throw error;
  }
}

/**
 * Gets a single agent by name
 */
export async function getAgent(name: string): Promise<Agent> {
  try {
    return await apiCall<Agent>('get_agent', { id: name });
  } catch (error) {
    console.error('Failed to get agent:', error);
    throw error;
  }
}

/**
 * Exports an agent as its raw .md file content
 */
export async function exportAgent(name: string): Promise<string> {
  try {
    const result = await apiCall<{ content: string }>('export_agent', { name });
    return result?.content || '';
  } catch (error) {
    console.error('Failed to export agent:', error);
    throw error;
  }
}

/**
 * Imports an agent from .md file content
 */
export async function importAgent(
  content: string,
  scope: 'user' | 'project' = 'user'
): Promise<Agent> {
  try {
    return await apiCall<Agent>('import_agent', { content, scope });
  } catch (error) {
    console.error('Failed to import agent:', error);
    throw error;
  }
}

// Usage statistics

/**
 * Gets overall usage statistics
 */
export async function getUsageStats(): Promise<UsageStats> {
  try {
    return await apiCall<UsageStats>('get_usage_stats');
  } catch (error) {
    console.error('Failed to get usage stats:', error);
    throw error;
  }
}

/**
 * Gets usage statistics filtered by date range
 */
export async function getUsageByDateRange(
  startDate: string,
  endDate: string
): Promise<UsageStats> {
  try {
    return await apiCall<UsageStats>('get_usage_by_date_range', { startDate, endDate });
  } catch (error) {
    console.error('Failed to get usage by date range:', error);
    throw error;
  }
}

/**
 * Gets usage statistics grouped by session
 */
export async function getSessionStats(
  since?: string,
  until?: string,
  order?: 'asc' | 'desc'
): Promise<ProjectUsage[]> {
  try {
    return await apiCall<ProjectUsage[]>('get_session_stats', { since, until, order });
  } catch (error) {
    console.error('Failed to get session stats:', error);
    throw error;
  }
}

/**
 * Gets detailed usage entries with optional filtering
 */
export async function getUsageDetails(limit?: number): Promise<UsageEntry[]> {
  try {
    return await apiCall<UsageEntry[]>('get_usage_details', { limit });
  } catch (error) {
    console.error('Failed to get usage details:', error);
    throw error;
  }
}

// CLAUDE.md helpers

/**
 * Finds all CLAUDE.md files in a project directory
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
 */
export async function saveClaudeMdFile(filePath: string, content: string): Promise<string> {
  try {
    return await apiCall<string>('save_claude_md_file', { filePath, content });
  } catch (error) {
    console.error('Failed to save CLAUDE.md file:', error);
    throw error;
  }
}
