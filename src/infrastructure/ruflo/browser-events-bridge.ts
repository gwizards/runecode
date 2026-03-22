/**
 * Browser Events Bridge — infrastructure adapter for the ruflo bounded context.
 *
 * This module owns the browser-side window.dispatchEvent / window.addEventListener
 * wiring. It lives in infrastructure (not domain) because it depends on the
 * browser runtime (window / CustomEvent).
 *
 * Domain code that needs to raise or observe these events should import from
 * this file (or from src/domain/ruflo/events.ts which re-exports from here).
 */

export const RUFLO_EVENTS = {
  STATUS_CHANGED: 'runecode:ruflo-status-changed',
  OPEN_SETTINGS: 'runecode:open-settings',
} as const;

export type RuFloEventName = typeof RUFLO_EVENTS[keyof typeof RUFLO_EVENTS];

/** Dispatch a RuFlo domain event via the browser CustomEvent API */
export function dispatchRuFloEvent(name: typeof RUFLO_EVENTS.STATUS_CHANGED): void;
export function dispatchRuFloEvent(
  name: typeof RUFLO_EVENTS.OPEN_SETTINGS,
  detail: { section: string }
): void;
export function dispatchRuFloEvent(name: RuFloEventName, detail?: unknown): void {
  window.dispatchEvent(new CustomEvent(name, detail !== undefined ? { detail } : undefined));
}

/** Subscribe to a RuFlo domain event, returns an unsubscribe function */
export function onRuFloEvent(
  name: RuFloEventName,
  handler: (event: CustomEvent) => void
): () => void {
  window.addEventListener(name, handler as EventListener);
  return () => window.removeEventListener(name, handler as EventListener);
}

/** Payload for STATUS_CHANGED event */
export interface RuFloStatusChangedPayload {
  isInstalled: boolean;
  isSupported: boolean;
  version?: string;
}

/** Payload for memory changed event */
export interface RuFloMemoryChangedPayload {
  backend: string;
  totalEntries: number;
  bytesUsed: number;
}

/** Payload for project changed event */
export interface RuFloProjectChangedPayload {
  completionRate: number;
  hasBlockedTasks: boolean;
}
