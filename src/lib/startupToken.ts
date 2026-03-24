/**
 * Startup token store — fetches the one-time secret from the Rust backend
 * and provides a helper to inject it as `X-Startup-Token` on every HTTP
 * request that goes to the local embedded web server.
 *
 * This module is a pure singleton; `initStartupToken` is idempotent and
 * safe to call multiple times.  External (non-localhost) API calls must
 * never receive this header — use `applyStartupToken` only for requests
 * to `window.location.origin` / localhost.
 */

let _token: string | null = null;

/**
 * Fetch the startup token from the Tauri backend once.
 * No-ops on subsequent calls or when not running inside Tauri.
 */
export async function initStartupToken(): Promise<void> {
  if (_token !== null) return;
  // Only relevant when running as a Tauri desktop app
  if (typeof window === 'undefined' || !window.__TAURI__) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    _token = await invoke<string>('get_startup_token');
  } catch {
    // Not fatal — the server will reject unauthorized requests with 401
    console.warn('[startupToken] Could not fetch startup token from backend');
  }
}

/** Return the cached token, or null if not yet initialised / unavailable. */
export function getStartupToken(): string | null {
  return _token;
}

/**
 * Merge the startup token into an existing headers object.
 * Returns a new object; never mutates the argument.
 * Only injects the header when the token is available.
 *
 * @example
 * const headers = applyStartupToken({ 'Content-Type': 'application/json' });
 */
export function applyStartupToken(
  headers: Record<string, string>,
): Record<string, string> {
  if (_token) {
    return { ...headers, 'X-Startup-Token': _token };
  }
  return headers;
}
