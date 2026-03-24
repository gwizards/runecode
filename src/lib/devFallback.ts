/**
 * Dev Mode Fallback Data
 *
 * When the Rust backend is not running and the frontend is served via
 * `bun run dev` on localhost:1420, API calls will fail. This module
 * provides placeholder data so the UI is still usable for frontend
 * development.
 *
 * Detection: no Tauri runtime AND the page is served from the Vite dev port.
 */

import type { Project, Session } from './api';
import { applyStartupToken } from './startupToken';

/** True when running in the Vite dev server without a Tauri / web backend. */
export function isDevMode(): boolean {
  if (typeof window === 'undefined') return false;
  const noTauri = !(
    window.__TAURI__ ||
    window.__TAURI_METADATA__ ||
    window.__TAURI_INTERNALS__
  );
  const isDevPort = window.location.port === '1420';
  return noTauri && isDevPort;
}

// ---------------------------------------------------------------------------
// Fallback data
// ---------------------------------------------------------------------------

const now = Date.now() / 1000; // unix seconds

export const DEV_PROJECTS: Project[] = [
  {
    id: 'dev-project-runecode',
    path: '/home/koves/GitHub/runecode',
    sessions: ['dev-session-1', 'dev-session-2'],
    created_at: now - 86400 * 7,
    most_recent_session: now - 300,
  },
  {
    id: 'dev-project-example',
    path: '/home/koves/projects/example-app',
    sessions: ['dev-session-3'],
    created_at: now - 86400 * 14,
    most_recent_session: now - 3600,
  },
];

export const DEV_SESSIONS: Session[] = [
  {
    id: 'dev-session-1',
    project_id: 'dev-project-runecode',
    project_path: '/home/koves/GitHub/runecode',
    created_at: now - 300,
    first_message: 'Add dev mode fallback data layer',
    message_timestamp: new Date((now - 300) * 1000).toISOString(),
  },
  {
    id: 'dev-session-2',
    project_id: 'dev-project-runecode',
    project_path: '/home/koves/GitHub/runecode',
    created_at: now - 7200,
    first_message: 'Fix sidebar layout on mobile',
    message_timestamp: new Date((now - 7200) * 1000).toISOString(),
  },
  {
    id: 'dev-session-3',
    project_id: 'dev-project-example',
    project_path: '/home/koves/projects/example-app',
    created_at: now - 3600,
    first_message: 'Set up project scaffolding',
    message_timestamp: new Date((now - 3600) * 1000).toISOString(),
  },
];

// ---------------------------------------------------------------------------
// Backend health check
// ---------------------------------------------------------------------------

let _backendStatus: boolean | null = null;
let _lastCheck = 0;
const CHECK_INTERVAL_MS = 10_000; // re-check every 10 s

/**
 * Returns true if the web backend (/api/projects) is reachable.
 * Caches the result for CHECK_INTERVAL_MS to avoid spamming.
 */
export async function checkBackendConnected(): Promise<boolean> {
  if (!isDevMode()) {
    // If we are in Tauri or a real web deployment, assume connected.
    return true;
  }

  const elapsed = Date.now() - _lastCheck;
  if (_backendStatus !== null && elapsed < CHECK_INTERVAL_MS) {
    return _backendStatus;
  }

  try {
    const res = await fetch('/api/projects', { method: 'GET', headers: applyStartupToken({}) });
    _backendStatus = res.ok;
  } catch {
    _backendStatus = false;
  }
  _lastCheck = Date.now();
  return _backendStatus;
}
