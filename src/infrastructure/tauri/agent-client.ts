// Infrastructure client — Tauri IPC adapter for agent domain

import { apiCall } from '@/lib/apiAdapter';
import type { Agent, AgentExport, GitHubAgentFile } from './types';

/**
 * Lists all CC agents
 * @returns Promise resolving to an array of agents
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
 * @param agent - The agent data (name becomes the filename)
 * @returns Promise resolving to the created agent
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
 * @param originalName - The agent name (filename slug) before rename
 * @param agent - The updated agent data
 * @returns Promise resolving to the updated agent
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
      new URL(`/api/agents/${encodeURIComponent(originalName)}`, window.location.origin).toString(),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
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
 * @param name - The agent name (filename slug)
 * @param scope - Optional scope to disambiguate user vs project agents
 * @returns Promise resolving when the agent is deleted
 */
export async function deleteAgent(name: string, scope?: 'user' | 'project'): Promise<void> {
  try {
    const params = scope ? `?scope=${scope}` : '';
    // DELETE requires direct fetch (apiCall only supports GET/POST)
    const response = await fetch(
      new URL(`/api/agents/${encodeURIComponent(name)}${params}`, window.location.origin).toString(),
      { method: 'DELETE' }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error('Failed to delete agent:', error);
    throw error;
  }
}

/**
 * Gets a single agent by name
 * @param name - The agent name (filename slug)
 * @returns Promise resolving to the agent
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
 * @param name - The agent name
 * @returns Promise resolving to the .md file content
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
 * @param content - The .md file content (frontmatter + body)
 * @param scope - Where to save: "user" or "project"
 * @returns Promise resolving to the imported agent
 */
export async function importAgent(content: string, scope: 'user' | 'project' = 'user'): Promise<Agent> {
  try {
    return await apiCall<Agent>('import_agent', { content, scope });
  } catch (error) {
    console.error('Failed to import agent:', error);
    throw error;
  }
}

/**
 * Fetch list of agents from GitHub repository
 * @returns Promise resolving to list of available agents on GitHub
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
 * @param downloadUrl - The download URL for the agent file
 * @returns Promise resolving to the agent export data
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
 * @param downloadUrl - The download URL for the agent file
 * @returns Promise resolving to the imported agent
 */
export async function importAgentFromGitHub(downloadUrl: string): Promise<Agent> {
  try {
    return await apiCall<Agent>('import_agent_from_github', { downloadUrl });
  } catch (error) {
    console.error('Failed to import agent from GitHub:', error);
    throw error;
  }
}

/**
 * Reads the text content of a file chosen by the user for agent import.
 * Delegates to the Tauri `read_text_file` command rather than calling invoke
 * directly from UI components.
 * @param filePath - Absolute path to the file to read
 * @returns Promise resolving to the file contents as a string
 */
export async function readAgentImportFile(filePath: string): Promise<string> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string>('read_text_file', { path: filePath });
}

/**
 * Exports an agent to a file at the specified path via Tauri.
 * Delegates to the Tauri `export_agent_to_file` command rather than calling
 * invoke directly from UI components.
 * @param agentId - The agent name/id to export
 * @param filePath - Absolute destination path chosen by the user
 */
export async function exportAgentToFile(agentId: string, filePath: string): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<void>('export_agent_to_file', { id: agentId, filePath });
}
