/**
 * Settings client — Claude settings, system prompt, hooks configuration,
 * and slash commands.
 */
import { apiCall } from '../apiAdapter';
import type { HooksConfiguration } from '@/types/hooks';
import type { ClaudeSettings, SlashCommand } from './types';

export type { ClaudeSettings, SlashCommand };

/**
 * Reads the Claude settings file
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
 */
export async function saveSystemPrompt(content: string): Promise<string> {
  try {
    return await apiCall<string>('save_system_prompt', { content });
  } catch (error) {
    console.error('Failed to save system prompt:', error);
    throw error;
  }
}

// Hooks configuration

/**
 * Get hooks configuration for a specific scope
 */
export async function getHooksConfig(
  scope: 'user' | 'project' | 'local',
  projectPath?: string
): Promise<HooksConfiguration> {
  try {
    return await apiCall<HooksConfiguration>('get_hooks_config', { scope, projectPath });
  } catch (error) {
    console.error('Failed to get hooks config:', error);
    throw error;
  }
}

/**
 * Update hooks configuration for a specific scope
 */
export async function updateHooksConfig(
  scope: 'user' | 'project' | 'local',
  hooks: HooksConfiguration,
  projectPath?: string
): Promise<string> {
  try {
    return await apiCall<string>('update_hooks_config', { scope, projectPath, hooks });
  } catch (error) {
    console.error('Failed to update hooks config:', error);
    throw error;
  }
}

/**
 * Validate a hook command syntax
 */
export async function validateHookCommand(
  command: string
): Promise<{ valid: boolean; message: string }> {
  try {
    return await apiCall<{ valid: boolean; message: string }>('validate_hook_command', {
      command,
    });
  } catch (error) {
    console.error('Failed to validate hook command:', error);
    throw error;
  }
}

/**
 * Get merged hooks configuration (respecting priority: user < project < local)
 */
export async function getMergedHooksConfig(projectPath: string): Promise<HooksConfiguration> {
  try {
    const [userHooks, projectHooks, localHooks] = await Promise.all([
      getHooksConfig('user'),
      getHooksConfig('project', projectPath),
      getHooksConfig('local', projectPath),
    ]);

    const { HooksManager } = await import('@/lib/hooksManager');
    return HooksManager.mergeConfigs(userHooks, projectHooks, localHooks);
  } catch (error) {
    console.error('Failed to get merged hooks config:', error);
    throw error;
  }
}

// Slash commands

/**
 * Lists all available slash commands
 */
export async function slashCommandsList(projectPath?: string): Promise<SlashCommand[]> {
  try {
    const result = await apiCall<SlashCommand[]>('slash_commands_list', { projectPath });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to list slash commands:', error);
    return [];
  }
}

/**
 * Gets a single slash command by ID
 */
export async function slashCommandGet(commandId: string): Promise<SlashCommand> {
  try {
    return await apiCall<SlashCommand>('slash_command_get', { commandId });
  } catch (error) {
    console.error('Failed to get slash command:', error);
    throw error;
  }
}

/**
 * Creates or updates a slash command
 */
export async function slashCommandSave(
  scope: string,
  name: string,
  namespace: string | undefined,
  content: string,
  description: string | undefined,
  allowedTools: string[],
  projectPath?: string
): Promise<SlashCommand> {
  try {
    return await apiCall<SlashCommand>('slash_command_save', {
      scope,
      name,
      namespace,
      content,
      description,
      allowedTools,
      projectPath,
    });
  } catch (error) {
    console.error('Failed to save slash command:', error);
    throw error;
  }
}

/**
 * Deletes a slash command
 */
export async function slashCommandDelete(
  commandId: string,
  projectPath?: string
): Promise<string> {
  try {
    return await apiCall<string>('slash_command_delete', { commandId, projectPath });
  } catch (error) {
    console.error('Failed to delete slash command:', error);
    throw error;
  }
}
