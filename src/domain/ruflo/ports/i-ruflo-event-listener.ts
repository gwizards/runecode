/**
 * Port: abstracts Tauri backend event subscriptions for the ruflo bounded context.
 *
 * The concrete adapter (TauriRuFloEventListener) lives in
 * src/infrastructure/ruflo/tauri-event-listener.ts.
 *
 * Domain code must never import from @tauri-apps/* directly — it receives
 * events through this interface.
 */

export type RuFloEventType =
  | 'ruflo-mcp-changed'
  | 'ruflo-memory-changed'
  | 'ruflo-project-changed';

/** Function returned by listen() — calling it removes the subscription. */
export type UnlistenFn = () => void;

export interface IRuFloEventListener {
  listen(event: RuFloEventType, handler: (payload: unknown) => void): Promise<UnlistenFn>;
}
