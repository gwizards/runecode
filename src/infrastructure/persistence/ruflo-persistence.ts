/**
 * RuFlo persistence adapter — infrastructure layer.
 *
 * Wraps all localStorage access for the ruflo domain so that domain stores
 * remain free of browser-API concerns.  Domain stores import these helpers
 * instead of calling localStorage directly.
 *
 * All functions are pure wrappers: they never mutate domain state.
 */

import type { QuantizationMode } from '../../domain/ruflo/memory-store';
import type { QuantizedMemoryStore } from '../../domain/ruflo/memory-store';

// ── Storage keys ─────────────────────────────────────────────────────────────

const CODEBOOK_KEY    = 'runecode-ruflo-pq-codebook';
const CALIBRATION_KEY = 'runecode-ruflo-calibration';
const BACKEND_INIT_KEY = 'runecode-ruflo-backend-initialized';

// ── Quantization mode ─────────────────────────────────────────────────────────

/** Load the persisted quantization mode, falling back to 'scalar'. */
export function loadPersistedMode(): QuantizationMode {
  try {
    const raw = localStorage.getItem(CODEBOOK_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { mode?: QuantizationMode };
      if (parsed.mode === 'scalar' || parsed.mode === 'product' || parsed.mode === 'none') {
        return parsed.mode;
      }
    }
  } catch { /* ignore */ }
  return 'scalar';
}

/** Persist the current quantization mode. */
export function savePersistedMode(mode: QuantizationMode): void {
  try {
    localStorage.setItem(CODEBOOK_KEY, JSON.stringify({ mode }));
  } catch { /* ignore */ }
}

// ── Quantizer calibration ─────────────────────────────────────────────────────

/** Persist the calibration data from a QuantizedMemoryStore. */
export function saveCalibration(store: QuantizedMemoryStore): void {
  try {
    const cal = store.exportCalibration();
    if (cal) localStorage.setItem(CALIBRATION_KEY, JSON.stringify(cal));
  } catch { /* non-critical */ }
}

/** Restore calibration data into a QuantizedMemoryStore from localStorage. */
export function restoreCalibration(store: QuantizedMemoryStore): void {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (raw) store.importCalibration(JSON.parse(raw));
  } catch { /* non-critical — stale or malformed entry */ }
}

// ── Backend initialization flag ───────────────────────────────────────────────

/**
 * Returns true if the agentdb backend has already been initialized on a
 * previous page load, and marks it as initialized if not.
 */
export function checkAndMarkBackendInitialized(): boolean {
  try {
    if (localStorage.getItem(BACKEND_INIT_KEY)) {
      return true;
    }
    localStorage.setItem(BACKEND_INIT_KEY, '1');
    return false;
  } catch {
    // localStorage unavailable (e.g., test environment)
    return true; // treat as already initialized to avoid spurious API calls
  }
}
