/**
 * Analytics bounded context — IAnalyticsTracker port.
 *
 * Abstracts any external analytics tracking SDK (e.g. PostHog) from the domain.
 * Implementations live in src/infrastructure/analytics/.
 *
 * No browser APIs, localStorage, or Tauri imports — implementations may use them,
 * but this interface must remain pure TypeScript with no runtime dependencies.
 */

export interface IAnalyticsTracker {
  /**
   * Record that a session has started or resumed.
   * @param sessionId - Unique session identifier.
   * @param properties - Arbitrary metadata attached to the session.
   */
  trackSession(sessionId: string, properties?: Record<string, unknown>): void;

  /**
   * Capture a named domain event.
   * @param name - Event name (e.g. `'page_view'`, `'button_click'`).
   * @param properties - Optional key/value metadata.
   */
  captureEvent(name: string, properties?: Record<string, unknown>): void;

  /**
   * Associate an anonymous user identifier with subsequent events.
   * @param userId - Opaque, non-PII identifier.
   * @param traits - Optional additional traits.
   */
  identify(userId: string, traits?: Record<string, unknown>): void;

  /**
   * Permanently opt the current user out of all future tracking.
   * Must be called when consent is revoked.
   */
  optOut(): void;

  /**
   * Re-enable tracking after a previous opt-out.
   * Must be called when consent is granted.
   */
  optIn(): void;
}
