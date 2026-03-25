/**
 * API Adapter — WebSocket session management
 *
 * Manages persistent WebSocket connections for Claude sessions (both regular
 * and agent sessions). Each tab gets its own connectionId and socket.
 */

import { isWslMode, getWslDistro, windowsToWslPath } from '../../lib/platformMode';

// ---------------------------------------------------------------------------
// Socket registry
// ---------------------------------------------------------------------------

/** Persistent WebSocket connections keyed by connectionId (one per tab). */
export const sessionSockets = new Map<string, WebSocket>();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get or create a persistent WebSocket for a session.
 * The connectionId is unique per tab (not per Claude session, since we don't
 * have the session ID yet at connect time).
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
    // connection closes before a "done" message arrives.
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('claude-complete', { detail: { aborted: true, connectionId } }));
    });
  };
  ws.onerror = () => {
    sessionSockets.delete(connectionId);
  };

  return ws;
}

/**
 * Shared WebSocket message handler attached to every session socket.
 * Dispatches CustomEvents for each backend message type so the UI can
 * subscribe to a single event bus regardless of session kind.
 */
function attachMessageHandler(ws: WebSocket, connectionId: string) {
  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

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

      // Rewind acknowledgement
      if (msg.type === 'rewind_ack') {
        window.dispatchEvent(new CustomEvent('runecode:rewind-result', { detail: msg }));
      }

      // Interrupt acknowledgement
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
}

/** Resolve the effective project path and environment taking WSL into account. */
function resolveWslOverrides(projectPath: string, environment?: SessionEnvironment) {
  let effectivePath = projectPath;
  let effectiveEnv = environment;
  if (isWslMode()) {
    effectivePath = windowsToWslPath(projectPath);
    const wslDistro = getWslDistro();
    if (wslDistro) {
      effectiveEnv = { type: 'wsl', ...environment, wslDistro };
    }
  }
  return { effectivePath, effectiveEnv };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SessionEnvironment {
  type: string;
  sshHost?: string;
  sshPort?: number;
  sshIdentityFile?: string;
  startDirectory?: string;
  wslDistro?: string;
  dockerContainer?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function closeSessionSocket(connectionId: string) {
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
export async function initSession(params: {
  projectPath: string;
  prompt: string;
  model?: string;
  sessionId?: string;
  thinkingMode?: string;
  permissionMode?: string;
  effort?: string;
  resumeAt?: string;
  teamsEnabled?: boolean;
  environment?: SessionEnvironment;
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
      const { effectivePath, effectiveEnv } = resolveWslOverrides(params.projectPath, params.environment);

      ws.send(JSON.stringify({
        type: 'init',
        project_path: effectivePath,
        text: params.prompt,
        model: params.model || 'sonnet',
        session_id: params.sessionId,
        thinking_mode: params.thinkingMode || 'auto',
        permission_mode: params.permissionMode || 'default',
        effort: params.effort || 'high',
        resume_at: params.resumeAt,
        teams_enabled: params.teamsEnabled,
        environment: effectiveEnv,
      }));
    };

    if (ws.readyState === WebSocket.OPEN) {
      onOpen();
    } else {
      ws.addEventListener('open', onOpen, { once: true });
    }

    // Attach the shared message handler
    const origOnMessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        // Resolve init promise on first meaningful response from server.
        if (!settled && (msg.type === 'session_id' || msg.type === 'output' || msg.type === 'done' || msg.type === 'start')) {
          settle(() => resolve(connectionId));
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener('message', origOnMessage);
    attachMessageHandler(ws, connectionId);

    ws.onerror = () => {
      settle(() => reject(new Error('WebSocket connection failed')));
    };
  });
}

/**
 * Send a follow-up prompt to an existing persistent session.
 */
export async function sendPrompt(connectionId: string, text: string, thinkingMode?: string): Promise<void> {
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
export function interruptSession(connectionId: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'interrupt' }));
  }
}

/**
 * Change the model mid-session without restarting.
 */
export function setSessionModel(connectionId: string, model: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_model', model }));
  }
}

/**
 * Change permission mode mid-session.
 */
export function setSessionPermissionMode(connectionId: string, mode: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'set_permission_mode', mode }));
  }
}

/**
 * Rewind files to a specific message checkpoint.
 */
export function rewindSessionFiles(connectionId: string, userMessageId: string, dryRun = false) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'rewind_files', user_message_id: userMessageId, dry_run: dryRun }));
  }
}

/**
 * Stop a background task in the session.
 */
export function stopSessionTask(connectionId: string, taskId: string) {
  const ws = sessionSockets.get(connectionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop_task', task_id: taskId }));
  }
}

/**
 * Initialize an agent session. Sends an init_agent message over WebSocket
 * which triggers SDK query() with the agent option on the server.
 * Returns a connectionId for subsequent prompts.
 */
export async function initAgentSession(params: {
  agentName: string;
  projectPath: string;
  prompt: string;
  model?: string;
  thinkingMode?: string;
  permissionMode?: string;
  effort?: string;
  teamsEnabled?: boolean;
  environment?: SessionEnvironment;
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
        const { effectivePath, effectiveEnv } = resolveWslOverrides(params.projectPath, params.environment);

        ws.send(JSON.stringify({
          type: 'init_agent',
          agent_name: params.agentName,
          project_path: effectivePath,
          text: params.prompt,
          model: params.model || 'sonnet',
          thinking_mode: params.thinkingMode || 'auto',
          permission_mode: params.permissionMode || 'default',
          effort: params.effort || 'high',
          teams_enabled: params.teamsEnabled,
          environment: effectiveEnv,
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

    // Resolve init promise on first meaningful response
    const initListener = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (!settled && (msg.type === 'session_id' || msg.type === 'output' || msg.type === 'done' || msg.type === 'start')) {
          settle(() => resolve(connectionId));
        }
      } catch {
        // ignore
      }
    };
    ws.addEventListener('message', initListener);
    attachMessageHandler(ws, connectionId);

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
