/**
 * API Adapter - Compatibility layer for Tauri vs Web environments
 * 
 * This module detects whether we're running in Tauri (desktop app) or web browser
 * and provides a unified interface that switches between:
 * - Tauri invoke calls (for desktop)
 * - REST API calls (for web/phone browser)
 */

import { invoke } from "@tauri-apps/api/core";

// Persistent WebSocket connections per session tab
const sessionSockets = new Map<string, WebSocket>();

/**
 * Get or create a persistent WebSocket for a session.
 * The connectionId is unique per tab (not per Claude session, since we don't have the session ID yet at connect time).
 */
function getOrCreateSocket(connectionId: string): WebSocket {
  let ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) return ws;

  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/ws/claude`;
  ws = new WebSocket(wsUrl);
  sessionSockets.set(connectionId, ws);

  ws.onclose = () => {
    sessionSockets.delete(connectionId);
    // Signal completion so the UI does not remain in a loading state when the
    // connection closes before a "done" message arrives (e.g. abrupt disconnect).
    // Include connectionId in detail so listeners can filter to their own session.
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('claude-complete', { detail: { aborted: true, connectionId } }));
    });
  };
  ws.onerror = () => {
    sessionSockets.delete(connectionId);
  };

  return ws;
}

function closeSessionSocket(connectionId: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'close' })); } catch { /* ignore */ }
    }
    ws.close();
    sessionSockets.delete(connectionId);
  }
}

/**
 * Initialize a persistent session. Called once when a tab starts a conversation.
 * Returns a connectionId for subsequent prompts.
 */
async function initSession(params: {
  projectPath: string;
  prompt: string;
  model?: string;
  sessionId?: string;
  thinkingMode?: string;
  permissionMode?: string;
  effort?: string;
  resumeAt?: string;
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
}): Promise<string> {
  const connectionId = `conn_${Date.now()}_${crypto.randomUUID()}`;
  const ws = getOrCreateSocket(connectionId);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('Session init timeout')); }
    }, 30000);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const onOpen = () => {
      ws.send(JSON.stringify({
        type: 'init',
        project_path: params.projectPath,
        text: params.prompt,
        model: params.model || 'sonnet',
        session_id: params.sessionId,
        thinking_mode: params.thinkingMode || 'auto',
        permission_mode: params.permissionMode || 'default',
        effort: params.effort || 'high',
        resume_at: params.resumeAt,
        teams_enabled: params.teamsEnabled,
        environment: params.environment,
      }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      onOpen();
    } else {
      ws.addEventListener('open', onOpen, { once: true });
    }

    // Persistent message handler for this connection — stays active for the entire session
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Resolve init promise on first meaningful response from server.
        // Backend (ws_types.rs WsServerMessage) uses "output" and "done".
        if (!settled && (msg.type === 'session_id' || msg.type === 'output' || msg.type === 'done' || msg.type === 'start')) {
          settle(() => resolve(connectionId));
        }

        // Backend sends type:"output" with a "content" string (one JSONL line).
        if (msg.type === 'output') {
          const claudeMessage = typeof msg.content === 'string'
            ? JSON.parse(msg.content) : msg.content;

          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-output', { detail: claudeMessage }));
          });

          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-output:${sid}`, { detail: claudeMessage }));
            });
          }
        }

        // Backend sends type:"done" when the turn is complete.
        if (msg.type === 'done') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-complete', { detail: { connectionId } }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-complete:${sid}`, { detail: true }));
            });
          }
        }

        if (msg.type === 'error') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-error', { detail: msg.error ?? msg.message }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-error:${sid}`, { detail: msg.error ?? msg.message }));
            });
          }
        }

        // Rewind acknowledgement — server emits RewindAck (snake_case: rewind_ack)
        if (msg.type === 'rewind_ack') {
          window.dispatchEvent(new CustomEvent('runecode:rewind-result', { detail: msg }));
        }

        // Interrupt acknowledgement — server emits Interrupted (snake_case: interrupted)
        if (msg.type === 'interrupted') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-complete', { detail: { connectionId, interrupted: true } }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-complete:${sid}`, { detail: { interrupted: true } }));
            });
          }
        }

        // Model/permission change confirmations
        if (msg.type === 'model_changed' || msg.type === 'permission_mode_changed') {
          window.dispatchEvent(new CustomEvent('runecode:config-changed', { detail: msg }));
        }

        // Sub-agent lifecycle events
        if (msg.type === 'subagent_event') {
          window.dispatchEvent(new CustomEvent('runecode:subagent-event', { detail: msg }));
        }

        // Team events
        if (msg.type === 'team_event') {
          window.dispatchEvent(new CustomEvent('runecode:team-event', { detail: msg }));
        }
      } catch {
        // ignore parse errors from non-JSON messages
      }
    };

    ws.onerror = () => {
      settle(() => reject(new Error('WebSocket connection failed')));
    };
  });
}

/**
 * Send a follow-up prompt to an existing persistent session.
 */
async function sendPrompt(connectionId: string, text: string, thinkingMode?: string): Promise<void> {
  const ws = sessionSockets.get(connectionId);
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error('Session not connected');
  }

  ws.send(JSON.stringify({
    type: 'prompt',
    text,
    thinking_mode: thinkingMode || 'auto',
  }));
}

/**
 * Interrupt the current turn without closing the session.
 */
function interruptSession(connectionId: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'interrupt' }));
  }
}

/**
 * Change the model mid-session without restarting.
 */
function setSessionModel(connectionId: string, model: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_model', model }));
  }
}

/**
 * Change permission mode mid-session.
 */
function setSessionPermissionMode(connectionId: string, mode: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_permission_mode', mode }));
  }
}

/**
 * Rewind files to a specific message checkpoint.
 */
function rewindSessionFiles(connectionId: string, userMessageId: string, dryRun = false) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'rewind_files', user_message_id: userMessageId, dry_run: dryRun }));
  }
}

/**
 * Stop a background task in the session.
 */
function stopSessionTask(connectionId: string, taskId: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop_task', task_id: taskId }));
  }
}

// Extend Window interface for Tauri
declare global {
  interface Window {
    __TAURI__?: Record<string, unknown>;
    __TAURI_METADATA__?: Record<string, unknown>;
    __TAURI_INTERNALS__?: {
      __WEB_MODE_MOCK__?: boolean;
      transformCallback?: (callback: ((response: any) => void) | undefined, once?: boolean) => string | number;
      [key: string]: any;
    };
  }
}

// Environment detection
let isTauriEnvironment: boolean | null = null;

/**
 * Detect if we're running in Tauri environment
 */
function detectEnvironment(): boolean {
  if (isTauriEnvironment !== null) {
    return isTauriEnvironment;
  }

  // Check if we're in a browser environment first
  if (typeof window === 'undefined') {
    isTauriEnvironment = false;
    return false;
  }

  // Check for Tauri-specific indicators, but exclude our web-mode mock
  const isWebModeMock = !!(window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);
  const isTauri = !isWebModeMock && !!(
    window.__TAURI__ ||
    window.__TAURI_METADATA__ ||
    window.__TAURI_INTERNALS__ ||
    // Check user agent for Tauri
    navigator.userAgent.includes('Tauri')
  );

  isTauriEnvironment = isTauri;
  return isTauri;
}

/**
 * Make a REST API call to our web server
 */
async function restApiCall<T>(endpoint: string, params?: any): Promise<T> {
  // First handle path parameters in the endpoint string
  let processedEndpoint = endpoint;
  if (params) {
    Object.keys(params).forEach(key => {
      // Try different case variations for the placeholder
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
  
  // Add remaining params as query parameters for GET requests (if no placeholders remain)
  if (params && !processedEndpoint.includes('{')) {
    Object.keys(params).forEach(key => {
      // Only add as query param if it wasn't used as a path param
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
      headers: {
        'Content-Type': 'application/json',
      },
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
 * Unified API adapter that works in both Tauri and web environments
 */
export async function apiCall<T>(command: string, params?: any): Promise<T> {
  const isWeb = !detectEnvironment();
  
  if (!isWeb) {
    // Tauri environment - try invoke
    try {
      return await invoke<T>(command, params);
    } catch (error) {
      console.warn(`[Tauri] invoke failed, falling back to web mode:`, error);
      // Fall through to web mode
    }
  }
  
  // Web environment - use REST API

  // Special handling for cancel — interrupt via persistent connectionId
  if (command === 'cancel_claude_execution') {
    const connId = params?.connectionId;
    if (connId) {
      interruptSession(connId);
    }
    return {} as T;
  }

  // All three streaming commands (execute, continue, resume) are unified:
  // they either send a follow-up prompt on an existing connection or init a new session.
  // The server distinguishes the intent via session_id presence in the init payload.
  const streamingCommands = ['execute_claude_code', 'continue_claude_code', 'resume_claude_code'];
  if (streamingCommands.includes(command)) {
    // Check if this session already has a persistent connection
    const connId = params?.connectionId;
    if (connId && sessionSockets.has(connId)) {
      // Send follow-up prompt to existing session
      await sendPrompt(connId, params.prompt, params.thinkingMode);
      return {} as T;
    }
    // Initialize new persistent session
    const newConnId = await initSession({
      projectPath: params?.projectPath || '',
      prompt: params?.prompt || '',
      model: params?.model,
      sessionId: params?.sessionId,
      thinkingMode: params?.thinkingMode,
      permissionMode: params?.permissionMode,
      effort: params?.effort,
      resumeAt: params?.resumeAt,
      teamsEnabled: params?.teamsEnabled,
      environment: params?.environment,
    });
    // Return the connectionId so the caller can use it for follow-up prompts
    return { connectionId: newConnId } as T;
  }

  // Special handling for write commands — use POST instead of GET
  const writeCommands = [
    'save_claude_settings', 'save_system_prompt', 'save_proxy_settings',
    'update_hooks_config', 'storage_update_row', 'storage_insert_row',
    'save_claude_md_file', 'slash_command_save',
    'create_agent', 'update_agent', 'import_agent',
    'mcp_add', 'mcp_add_json', 'mcp_add_from_claude_desktop', 'mcp_remove',
  ];
  if (writeCommands.includes(command)) {
    const endpoint = mapCommandToEndpoint(command, params);
    try {
      const response = await fetch(new URL(endpoint, window.location.origin).toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  // Map Tauri commands to REST endpoints
  const endpoint = mapCommandToEndpoint(command, params);
  return await restApiCall<T>(endpoint, params);
}

/**
 * Map Tauri command names to REST API endpoints
 */
function mapCommandToEndpoint(command: string, _params?: any): string {
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

  let endpoint = commandToEndpoint[command];
  if (!endpoint) {
    // Silently return a no-op endpoint — don't spam console
    console.debug(`[Web] No endpoint mapped for command: ${command}`);
    return `/api/noop/${command}`;
  }

  // Interpolate params into URL template placeholders like {tableName}, {id}, {projectId}
  if (_params && endpoint.includes('{')) {
    endpoint = endpoint.replace(/\{(\w+)\}/g, (_match, key) => {
      // Check params directly, then common nested patterns
      let val = _params[key];
      if (val == null) val = _params.primaryKeyValues?.[key];
      // For storage {id}, try primaryKeyValues.key (common pattern for app_settings)
      if (val == null && key === 'id') {
        val = _params.primaryKeyValues?.key ?? _params.id;
      }
      return val != null ? encodeURIComponent(String(val)) : _match;
    });
  }

  return endpoint;
}

/**
 * Get environment info for debugging
 */
export function getEnvironmentInfo() {
  return {
    isTauri: detectEnvironment(),
    userAgent: navigator.userAgent,
    location: window.location.href,
  };
}

/**
 * Initialize web mode compatibility
 * Sets up mocks for Tauri APIs when running in web mode
 */
export function initializeWebMode() {
  if (!detectEnvironment()) {
    // Mock Tauri internals FIRST - this is what Tauri v2 APIs actually check
    // for transformCallback. Must exist before any @tauri-apps imports execute.
    if (!window.__TAURI_INTERNALS__) {
      window.__TAURI_INTERNALS__ = {
        transformCallback: (callback?: (response: any) => void, once?: boolean) => {
          const id = `_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          (window as any)[id] = (response: any) => {
            if (once) delete (window as any)[id];
            if (callback) callback(response);
          };
          return id;
        },
        invoke: (cmd: string, ..._args: any[]) => {
          // Handle Tauri event plugin specially — return a no-op listener
          if (cmd === 'plugin:event|listen' || cmd === 'plugin:event|unlisten') {
            return Promise.resolve(0);
          }
          console.debug('[Web] Tauri invoke called in web mode:', cmd);
          return Promise.reject(new Error('Not available in web mode'));
        },
        metadata: { currentWindow: { label: 'main' }, currentWebview: { label: 'main' } },
        __WEB_MODE_MOCK__: true,
      };
    }

    // Mock Tauri event system for web mode
    if (!window.__TAURI__) {
      window.__TAURI__ = {
        event: {
          listen: (eventName: string, callback: (event: any) => void) => {
            // Listen for custom events that simulate Tauri events
            const handler = (e: any) => callback({ payload: e.detail });
            window.addEventListener(`${eventName}`, handler);
            return Promise.resolve(() => {
              window.removeEventListener(`${eventName}`, handler);
            });
          },
          emit: () => Promise.resolve(),
        },
        invoke: (...args: any[]) => {
          console.debug('[Web] Tauri invoke called in web mode:', args[0]);
          return Promise.reject(new Error('Not available in web mode'));
        },
        // Mock the core module that includes transformCallback
        core: {
          invoke: (...args: any[]) => {
            console.debug('[Web] Tauri core.invoke called in web mode:', args[0]);
            return Promise.reject(new Error('Not available in web mode'));
          },
          transformCallback: window.__TAURI_INTERNALS__?.transformCallback,
        }
      };
    }
  }
}

/**
 * Initialize an agent session. Sends an init_agent message over WebSocket
 * which triggers SDK query() with the agent option on the server.
 * Returns a connectionId for subsequent prompts (reuses the same WebSocket protocol).
 */
async function initAgentSession(params: {
  agentName: string;
  projectPath: string;
  prompt: string;
  model?: string;
  thinkingMode?: string;
  permissionMode?: string;
  effort?: string;
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
}): Promise<string> {
  const connectionId = `conn_agent_${Date.now()}_${crypto.randomUUID()}`;
  const ws = getOrCreateSocket(connectionId);

  return new Promise((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('Agent session init timeout')); }
    }, 30000);

    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      fn();
    };

    const onOpen = () => {
      try {
        ws.send(JSON.stringify({
          type: 'init_agent',
          agent_name: params.agentName,
          project_path: params.projectPath,
          text: params.prompt,
          model: params.model || 'sonnet',
          thinking_mode: params.thinkingMode || 'auto',
          permission_mode: params.permissionMode || 'default',
          effort: params.effort || 'high',
          teams_enabled: params.teamsEnabled,
          environment: params.environment,
        }));
      } catch (err) {
        settle(() => reject(new Error(`Failed to send init_agent: ${err}`)));
      }
    };

    if (ws.readyState === WebSocket.OPEN) {
      onOpen();
    } else {
      ws.addEventListener('open', onOpen, { once: true });
    }

    // Persistent message handler — same as initSession
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Backend (ws_types.rs WsServerMessage) uses "output" and "done".
        if (!settled && (msg.type === 'session_id' || msg.type === 'output' || msg.type === 'done' || msg.type === 'start')) {
          settle(() => resolve(connectionId));
        }

        // Backend sends type:"output" with a "content" string (one JSONL line).
        if (msg.type === 'output') {
          const claudeMessage = typeof msg.content === 'string'
            ? JSON.parse(msg.content) : msg.content;
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-output', { detail: claudeMessage }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-output:${sid}`, { detail: claudeMessage }));
            });
          }
        }

        // Backend sends type:"done" when the turn is complete.
        if (msg.type === 'done') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-complete', { detail: { connectionId } }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-complete:${sid}`, { detail: true }));
            });
          }
        }

        if (msg.type === 'error') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-error', { detail: msg.error ?? msg.message }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-error:${sid}`, { detail: msg.error ?? msg.message }));
            });
          }
        }

        // Rewind acknowledgement — server emits RewindAck (snake_case: rewind_ack)
        if (msg.type === 'rewind_ack') {
          window.dispatchEvent(new CustomEvent('runecode:rewind-result', { detail: msg }));
        }

        // Interrupt acknowledgement — server emits Interrupted (snake_case: interrupted)
        if (msg.type === 'interrupted') {
          queueMicrotask(() => {
            window.dispatchEvent(new CustomEvent('claude-complete', { detail: { connectionId, interrupted: true } }));
          });
          if (msg.session_id) {
            const sid = msg.session_id;
            queueMicrotask(() => {
              window.dispatchEvent(new CustomEvent(`claude-complete:${sid}`, { detail: { interrupted: true } }));
            });
          }
        }

        if (msg.type === 'model_changed' || msg.type === 'permission_mode_changed') {
          window.dispatchEvent(new CustomEvent('runecode:config-changed', { detail: msg }));
        }

        // Sub-agent lifecycle events
        if (msg.type === 'subagent_event') {
          window.dispatchEvent(new CustomEvent('runecode:subagent-event', { detail: msg }));
        }

        // Team events
        if (msg.type === 'team_event') {
          window.dispatchEvent(new CustomEvent('runecode:team-event', { detail: msg }));
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onclose = () => {
      sessionSockets.delete(connectionId);
      settle(() => reject(new Error('Agent WebSocket closed before session was established')));
    };

    ws.onerror = () => {
      sessionSockets.delete(connectionId);
      settle(() => reject(new Error('WebSocket connection failed')));
    };
  });
}

export { initSession, initAgentSession, sendPrompt, interruptSession, closeSessionSocket, sessionSockets, setSessionModel, setSessionPermissionMode, rewindSessionFiles, stopSessionTask };