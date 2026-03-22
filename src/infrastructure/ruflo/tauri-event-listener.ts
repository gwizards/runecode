/**
 * Infrastructure adapter: IRuFloEventListener → @tauri-apps/api/event.
 *
 * This is the only place in the ruflo bounded context that is allowed to
 * import from @tauri-apps. The domain layer receives events through the
 * IRuFloEventListener port, never through Tauri directly.
 */

import type {
  IRuFloEventListener,
  RuFloEventType,
  UnlistenFn,
} from '@/domain/ruflo/ports/i-ruflo-event-listener';

export class TauriRuFloEventListener implements IRuFloEventListener {
  async listen(event: RuFloEventType, handler: (payload: unknown) => void): Promise<UnlistenFn> {
    const { listen } = await import('@tauri-apps/api/event');
    return listen(event, (tauriEvent) => handler(tauriEvent.payload));
  }
}

/** Singleton instance — import and call setRuFloEventListener() with this. */
export const tauriRuFloEventListener = new TauriRuFloEventListener();
