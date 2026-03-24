/**
 * Tauri environment detection utility.
 *
 * Centralises the "are we running inside a real Tauri desktop app?" check
 * so callers don't have to repeat the cast / mock-exclusion dance.
 *
 * The Window interface augmentation for __TAURI__  / __TAURI_INTERNALS__ /
 * __TAURI_METADATA__ lives in api-adapter.ts and is globally available.
 */

/**
 * Returns `true` when running inside a genuine Tauri desktop shell,
 * excluding the web-mode mock that `api-adapter.ts` installs.
 */
export function isRealTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(
    window.__TAURI__ ||
    window.__TAURI_INTERNALS__ ||
    window.__TAURI_METADATA__
  ) && !window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__;
}
