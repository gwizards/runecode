/**
 * Domain events re-export for the ruflo bounded context.
 *
 * The browser-side wiring (window.dispatchEvent / window.addEventListener)
 * lives in the infrastructure layer:
 *   src/infrastructure/ruflo/browser-events-bridge.ts
 *
 * This file re-exports everything from there so existing import paths
 * (e.g. store.ts, components) continue to compile without changes.
 */

export {
  RUFLO_EVENTS,
  dispatchRuFloEvent,
  onRuFloEvent,
} from '../../infrastructure/ruflo/browser-events-bridge';

export type {
  RuFloEventName,
  RuFloStatusChangedPayload,
  RuFloMemoryChangedPayload,
  RuFloProjectChangedPayload,
} from '../../infrastructure/ruflo/browser-events-bridge';
