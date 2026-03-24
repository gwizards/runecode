/**
 * Port: abstracts outbound browser event dispatch for the ruflo bounded context.
 * The concrete adapter lives in src/infrastructure/ruflo/browser-events-bridge.ts
 */
export interface IRuFloDispatcherPort {
  dispatch(event: string): void;
}
