/**
 * API Adapter - Compatibility layer for Tauri vs Web environments
 *
 * This module detects whether we're running in Tauri (desktop app) or web browser
 * and provides a unified interface that switches between:
 * - Tauri invoke calls (for desktop)
 * - REST API calls (for web/phone browser)
 *
 * WebSocket session management lives in ./api-adapter-ws.ts
 * REST call logic and endpoint mapping lives in ./api-adapter-rest.ts
 */

import { invoke } from "@tauri-apps/api/core";
import {
  sessionSockets,
  initSession,
  sendPrompt,
  interruptSession,
} from './api-adapter-ws';
import type { SessionEnvironment } from './api-adapter-ws';
import {
  restApiCall,
  restApiPost,
  mapCommandToEndpoint,
  writeCommands,
} from './api-adapter-rest';

// ---------------------------------------------------------------------------
// Environment detection
// ---------------------------------------------------------------------------

let isTauriEnvironment: boolean | null = null;

/**
 * Detect if we're running in Tauri environment
 */
function detectEnvironment(): boolean {
  if (isTauriEnvironment !== null) {
    return isTauriEnvironment;
  }

  if (typeof window === 'undefined') {
    isTauriEnvironment = false;
    return false;
  }

  const isWebModeMock = !!(window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);
  const isTauri = !isWebModeMock && !!(
    window.__TAURI__ ||
    window.__TAURI_METADATA__ ||
    window.__TAURI_INTERNALS__ ||
    navigator.userAgent.includes('Tauri')
  );

  isTauriEnvironment = isTauri;
  return isTauri;
}

// ---------------------------------------------------------------------------
// Unified API call
// ---------------------------------------------------------------------------

/**
 * Unified API adapter that works in both Tauri and web environments
 */
export async function apiCall<T>(command: string, params?: Record<string, unknown>): Promise<T> {
  const isWeb = !detectEnvironment();

  if (!isWeb) {
    try {
      return await invoke<T>(command, params);
    } catch (error) {
      console.warn(`[Tauri] invoke failed, falling back to web mode:`, error);
    }
  }

  // Web environment — use REST API

  // Special handling for cancel — interrupt via persistent connectionId
  if (command === 'cancel_claude_execution') {
    const connId = params?.connectionId as string | undefined;
    if (connId) {
      interruptSession(connId);
    }
    return {} as T;
  }

  // Streaming commands: init a new session or send a follow-up prompt
  const streamingCommands = ['execute_claude_code', 'continue_claude_code', 'resume_claude_code'];
  if (streamingCommands.includes(command)) {
    const connId = params?.connectionId as string | undefined;
    if (connId && sessionSockets.has(connId)) {
      await sendPrompt(connId, params!.prompt as string, params!.thinkingMode as string | undefined);
      return {} as T;
    }
    const newConnId = await initSession({
      projectPath: (params?.projectPath as string) || '',
      prompt: (params?.prompt as string) || '',
      model: params?.model as string | undefined,
      sessionId: params?.sessionId as string | undefined,
      thinkingMode: params?.thinkingMode as string | undefined,
      permissionMode: params?.permissionMode as string | undefined,
      effort: params?.effort as string | undefined,
      resumeAt: params?.resumeAt as string | undefined,
      teamsEnabled: params?.teamsEnabled as boolean | undefined,
      environment: params?.environment as SessionEnvironment | undefined,
    });
    return { connectionId: newConnId } as T;
  }

  // Write commands — POST
  if (writeCommands.includes(command)) {
    const endpoint = mapCommandToEndpoint(command, params);
    return await restApiPost<T>(endpoint, params);
  }

  // Default — GET
  const endpoint = mapCommandToEndpoint(command, params);
  return await restApiCall<T>(endpoint, params);
}

// ---------------------------------------------------------------------------
// Environment info
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Web mode initialization
// ---------------------------------------------------------------------------

/**
 * Initialize web mode compatibility.
 * Sets up mocks for Tauri APIs when running in web mode.
 */
export function initializeWebMode() {
  if (!detectEnvironment()) {
    if (!window.__TAURI_INTERNALS__) {
      window.__TAURI_INTERNALS__ = {
        transformCallback: (callback?: (response: unknown) => void, once?: boolean) => {
          const id = `_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const win = window as unknown as Record<string, unknown>;
          win[id] = (response: unknown) => {
            if (once) delete win[id];
            if (callback) callback(response);
          };
          return id;
        },
        invoke: (cmd: string, ..._args: unknown[]) => {
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

    if (!window.__TAURI__) {
      window.__TAURI__ = {
        event: {
          listen: (eventName: string, callback: (event: { payload: unknown }) => void) => {
            const handler = (e: Event) => callback({ payload: (e as CustomEvent).detail });
            window.addEventListener(`${eventName}`, handler);
            return Promise.resolve(() => {
              window.removeEventListener(`${eventName}`, handler);
            });
          },
          emit: () => Promise.resolve(),
        },
        invoke: (...args: unknown[]) => {
          console.debug('[Web] Tauri invoke called in web mode:', args[0]);
          return Promise.reject(new Error('Not available in web mode'));
        },
        core: {
          invoke: (...args: unknown[]) => {
            console.debug('[Web] Tauri core.invoke called in web mode:', args[0]);
            return Promise.reject(new Error('Not available in web mode'));
          },
          transformCallback: window.__TAURI_INTERNALS__?.transformCallback,
        }
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Re-exports — keeps existing import paths working
// ---------------------------------------------------------------------------

export {
  initSession,
  initAgentSession,
  sendPrompt,
  interruptSession,
  closeSessionSocket,
  sessionSockets,
  setSessionModel,
  setSessionPermissionMode,
  rewindSessionFiles,
  stopSessionTask,
} from './api-adapter-ws';
