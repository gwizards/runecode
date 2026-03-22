/**
 * Analytics infrastructure — PostHogTracker adapter.
 *
 * Implements the domain port IAnalyticsTracker using the PostHog SDK.
 * This is the only file in the analytics bounded context that imports posthog-js.
 *
 * All domain code (src/domain/analytics/) remains PostHog-free.
 */

import type { IAnalyticsTracker } from '../../domain/analytics/ports/IAnalyticsTracker';
import {
  trackEvent as posthogCapture,
  identifyUser as posthogIdentify,
  setEnabled as posthogSetEnabled,
} from './posthog-adapter';

export class PostHogTracker implements IAnalyticsTracker {
  trackSession(sessionId: string, properties?: Record<string, unknown>): void {
    posthogCapture('$session_start', {
      $session_id: sessionId,
      ...properties,
    });
  }

  captureEvent(name: string, properties?: Record<string, unknown>): void {
    posthogCapture(name, properties);
  }

  identify(userId: string, traits?: Record<string, unknown>): void {
    posthogIdentify(userId, traits);
  }

  optOut(): void {
    posthogSetEnabled(false);
  }

  optIn(): void {
    posthogSetEnabled(true);
  }
}
