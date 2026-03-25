/**
 * API Adapter — REST API call logic
 *
 * Handles REST API calls for web mode, including the command-to-endpoint
 * mapping table and path/query parameter interpolation.
 */

import { applyStartupToken } from '../../lib/startupToken';

// ---------------------------------------------------------------------------
// Window augmentation (shared across adapter modules)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
    __TAURI_METADATA__?: Record<string, unknown>;
    __TAURI_INTERNALS__?: {
      __WEB_MODE_MOCK__?: boolean;
      transformCallback?: (callback: ((response: unknown) => void) | undefined, once?: boolean) => string | number;
      invoke?: (cmd: string, ...args: unknown[]) => Promise<unknown>;
      metadata?: Record<string, unknown>;
      [key: string]: unknown;
    };
  }
}

// ---------------------------------------------------------------------------
// Command-to-endpoint mapping
// ---------------------------------------------------------------------------

const commandToEndpoint: Record<string, string> = {
  // Project and session commands
  'list_projects': '/api/projects',
  'get_project_sessions': '/api/projects/{projectId}/sessions',

  // Agent commands (native .md format)
  'list_agents': '/api/agents',
  'get_agent': '/api/agents/{id}',
  'create_agent': '/api/agents',
  'update_agent': '/api/agents/{name}',
  'delete_agent': '/api/agents/{name}',
  'export_agent': '/api/agents/{name}/export',
  'import_agent': '/api/agents/import',
  'fetch_github_agents': '/api/agents/github',
  'fetch_github_agent_content': '/api/agents/github/content',
  'import_agent_from_github': '/api/agents/import/github',
  'list_running_sessions': '/api/sessions/running',
  'load_agent_session_history': '/api/agents/sessions/{sessionId}/history',

  // Usage commands
  'get_usage_stats': '/api/usage',
  'get_usage_by_date_range': '/api/usage/range',
  'get_session_stats': '/api/usage/sessions',
  'get_usage_details': '/api/usage/details',

  // Settings and configuration
  'get_claude_settings': '/api/settings/claude',
  'save_claude_settings': '/api/settings/claude',
  'get_system_prompt': '/api/settings/system-prompt',
  'save_system_prompt': '/api/settings/system-prompt',
  'check_claude_version': '/api/settings/claude/version',
  'find_claude_md_files': '/api/claude-md',
  'read_claude_md_file': '/api/claude-md/read',
  'save_claude_md_file': '/api/claude-md/save',

  // Session management
  'open_new_session': '/api/sessions/new',
  'load_session_history': '/api/sessions/{sessionId}/history/{projectId}',
  'list_running_claude_sessions': '/api/sessions/running',
  'execute_claude_code': '/api/sessions/execute',
  'continue_claude_code': '/api/sessions/continue',
  'resume_claude_code': '/api/sessions/resume',
  'cancel_claude_execution': '/api/sessions/{sessionId}/cancel',
  'get_claude_session_output': '/api/sessions/{sessionId}/output',

  // MCP commands
  'mcp_add': '/api/mcp/servers',
  'mcp_list': '/api/mcp/servers',
  'mcp_get': '/api/mcp/servers/{name}',
  'mcp_remove': '/api/mcp/servers/{name}',
  'mcp_add_json': '/api/mcp/servers/json',
  'mcp_add_from_claude_desktop': '/api/mcp/import/claude-desktop',
  'mcp_serve': '/api/mcp/serve',
  'mcp_test_connection': '/api/mcp/servers/{name}/test',
  'mcp_reset_project_choices': '/api/mcp/reset-choices',
  'mcp_get_server_status': '/api/mcp/status',
  'mcp_read_project_config': '/api/mcp/project-config',
  'mcp_save_project_config': '/api/mcp/project-config',

  // Binary and installation management
  'get_claude_binary_path': '/api/settings/claude/binary-path',
  'set_claude_binary_path': '/api/settings/claude/binary-path',
  'list_claude_installations': '/api/settings/claude/installations',

  // Storage commands
  'storage_list_tables': '/api/storage/tables',
  'storage_read_table': '/api/storage/tables/{tableName}',
  'storage_update_row': '/api/storage/tables/{tableName}/rows/{id}',
  'storage_delete_row': '/api/storage/tables/{tableName}/rows/{id}',
  'storage_insert_row': '/api/storage/tables/{tableName}/rows',
  'storage_execute_sql': '/api/storage/sql',
  'storage_reset_database': '/api/storage/reset',

  // Hooks configuration
  'get_hooks_config': '/api/hooks/config',
  'update_hooks_config': '/api/hooks/config',
  'validate_hook_command': '/api/hooks/validate',

  // Slash commands
  'slash_commands_list': '/api/slash-commands',
  'slash_command_get': '/api/slash-commands/{commandId}',
  'slash_command_save': '/api/slash-commands',
  'slash_command_delete': '/api/slash-commands/{commandId}',

  // Checkpoint management
  'clear_checkpoint_manager': '/api/checkpoints/clear',
  'create_checkpoint': '/api/checkpoints/create',
  'restore_checkpoint': '/api/checkpoints/restore',
  'list_checkpoints': '/api/checkpoints',
  'delete_checkpoint': '/api/checkpoints/{checkpointId}',
  'get_checkpoint_diff': '/api/checkpoints/{checkpointId}/diff',

  // Proxy settings
  'get_proxy_settings': '/api/settings/proxy',
  'save_proxy_settings': '/api/settings/proxy',

  // Home directory
  'get_home_directory': '/api/home-directory',

  // File browsing
  'list_directory_contents': '/api/files/list',
  'search_files': '/api/files/search',

  // Additional checkpoint commands
  'fork_from_checkpoint': '/api/checkpoints/fork',
  'get_session_timeline': '/api/checkpoints/timeline',
  'update_checkpoint_settings': '/api/checkpoints/settings',
  'get_checkpoint_settings': '/api/checkpoints/settings',
  'track_checkpoint_message': '/api/checkpoints/track-message',
  'check_auto_checkpoint': '/api/checkpoints/auto-check',
  'cleanup_old_checkpoints': '/api/checkpoints/cleanup',
  'track_session_messages': '/api/checkpoints/track-sessions',

  // Project management
  'create_project': '/api/project/init',
  'initialize_project': '/api/project/init',
};

// ---------------------------------------------------------------------------
// Write-command list (POST instead of GET)
// ---------------------------------------------------------------------------

export const writeCommands = [
  'save_claude_settings', 'save_system_prompt', 'save_proxy_settings',
  'update_hooks_config', 'storage_update_row', 'storage_insert_row',
  'save_claude_md_file', 'slash_command_save',
  'create_agent', 'update_agent', 'import_agent',
  'mcp_add', 'mcp_add_json', 'mcp_add_from_claude_desktop', 'mcp_remove',
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Map Tauri command names to REST API endpoints.
 * Interpolates path parameters from `params`.
 */
export function mapCommandToEndpoint(command: string, _params?: Record<string, unknown>): string {
  let endpoint = commandToEndpoint[command];
  if (!endpoint) {
    // Silently return a no-op endpoint
    console.debug(`[Web] No endpoint mapped for command: ${command}`);
    return `/api/noop/${command}`;
  }

  // Interpolate params into URL template placeholders like {tableName}, {id}, {projectId}
  if (_params && endpoint.includes('{')) {
    endpoint = endpoint.replace(/\{(\w+)\}/g, (_match, key: string) => {
      let val: unknown = _params[key];
      const pkValues = _params.primaryKeyValues as Record<string, unknown> | undefined;
      if (val == null) val = pkValues?.[key];
      // For storage {id}, try primaryKeyValues.key
      if (val == null && key === 'id') {
        val = pkValues?.key ?? _params.id;
      }
      return val != null ? encodeURIComponent(String(val)) : _match;
    });
  }

  return endpoint;
}

/**
 * Make a REST API call (GET) to our web server.
 */
export async function restApiCall<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  // First handle path parameters in the endpoint string
  let processedEndpoint = endpoint;
  if (params) {
    Object.keys(params).forEach(key => {
      const placeholders = [
        `{${key}}`,
        `{${key.charAt(0).toLowerCase() + key.slice(1)}}`,
        `{${key.charAt(0).toUpperCase() + key.slice(1)}}`
      ];

      placeholders.forEach(placeholder => {
        if (processedEndpoint.includes(placeholder)) {
          processedEndpoint = processedEndpoint.replace(placeholder, encodeURIComponent(String(params[key])));
        }
      });
    });
  }

  const url = new URL(processedEndpoint, window.location.origin);

  // Add remaining params as query parameters for GET requests
  if (params && !processedEndpoint.includes('{')) {
    Object.keys(params).forEach(key => {
      if (!endpoint.includes(`{${key}}`) &&
          !endpoint.includes(`{${key.charAt(0).toLowerCase() + key.slice(1)}}`) &&
          !endpoint.includes(`{${key.charAt(0).toUpperCase() + key.slice(1)}}`) &&
          params[key] !== undefined &&
          params[key] !== null) {
        url.searchParams.append(key, String(params[key]));
      }
    });
  }

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: applyStartupToken({
        'Content-Type': 'application/json',
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      console.debug('[API] Non-JSON response for', endpoint);
      return null as T;
    }

    const json = await response.json();

    // Handle both { success, data, error } and direct data formats
    if (json && typeof json === 'object' && 'success' in json) {
      if (!json.success) {
        throw new Error(json.error || 'API call failed');
      }
      return (json.data ?? json) as T;
    }

    // Direct data format (no wrapper)
    return (json?.data ?? json) as T;
  } catch (error) {
    // Suppress errors for endpoints expected to be unavailable in web mode
    const knownUnavailable = ['/api/storage/', '/api/hooks/', '/api/noop/', '/api/settings/proxy'];
    const isKnown = knownUnavailable.some((p) => endpoint.includes(p));
    if (isKnown) {
      console.debug(`[API] Expected unavailable: ${endpoint}`);
    } else {
      console.error(`REST API call failed for ${endpoint}:`, error);
    }
    throw error;
  }
}

/**
 * Make a REST API POST call for write commands.
 */
export async function restApiPost<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
  try {
    const response = await fetch(new URL(endpoint, window.location.origin).toString(), {
      method: 'POST',
      headers: applyStartupToken({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(params),
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) return null as T;
    const json = await response.json();
    return (json?.data ?? json) as T;
  } catch (error) {
    console.error(`REST API POST failed for ${endpoint}:`, error);
    throw error;
  }
}
