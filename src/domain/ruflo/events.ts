// Domain events for the RuFlo bounded context
// Centralizes all custom event names and payloads

export const RUFLO_EVENTS = {
  STATUS_CHANGED: 'runecode:ruflo-status-changed',
  OPEN_SETTINGS: 'runecode:open-settings',
} as const;

export type RuFloEventName = typeof RUFLO_EVENTS[keyof typeof RUFLO_EVENTS];

/** Dispatch a RuFlo domain event */
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
