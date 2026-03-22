/**
 * Anti-Corruption Layer: Session → Analytics
 *
 * Translates domain events from the session bounded context into
 * analytics capture calls. This layer:
 *  - Subscribes to the session domain event bus
 *  - Maps session events to analytics event shapes (no session internals leak out)
 *  - Calls the analytics capture function (PostHog or stub)
 *
 * The analytics context must never import directly from src/domain/session/.
 * All session data arrives through this ACL.
 */

import type { DomainEventBus } from '../../domain/shared/event-bus';
// Import session event types only — no aggregates, no application services
import { SESSION_EVENT_TYPES } from '../../domain/session/events';
import type {
  SessionCompletedEvent,
  SessionFailedEvent,
} from '../../domain/session/events';

// ─── Analytics event shape (analytics context's own type) ─────────────────

export interface AnalyticsSessionEvent {
  readonly eventName: string;
  readonly properties: Record<string, string | number | boolean>;
  readonly timestamp: number;
}

export type AnalyticsCaptureFunction = (event: AnalyticsSessionEvent) => void;

// ─── ACL class ────────────────────────────────────────────────────────────

export class SessionAnalyticsAcl {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(
    private readonly eventBus: DomainEventBus,
    private readonly capture: AnalyticsCaptureFunction,
  ) {}

  /**
   * Start listening to session domain events and translating them.
   * Call once during application bootstrap.
   */
  start(): void {
    this.unsubscribers.push(
      this.eventBus.on<SessionCompletedEvent>(
        SESSION_EVENT_TYPES.SESSION_COMPLETED,
        (evt) => {
          this.capture({
            eventName: 'session_completed',
            properties: {
              sessionId: evt.payload.sessionId.toString(),
              inputTokens: evt.payload.tokenUsage.inputTokens,
              outputTokens: evt.payload.tokenUsage.outputTokens,
              costUsd: evt.payload.tokenUsage.costUsd,
            },
            timestamp: evt.occurredAt,
          });
        },
      ),
    );

    this.unsubscribers.push(
      this.eventBus.on<SessionFailedEvent>(
        SESSION_EVENT_TYPES.SESSION_FAILED,
        (evt) => {
          this.capture({
            eventName: 'session_failed',
            properties: {
              sessionId: evt.payload.sessionId.toString(),
              reason: evt.payload.reason,
            },
            timestamp: evt.occurredAt,
          });
        },
      ),
    );
  }

  /**
   * Stop listening. Call during teardown.
   */
  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers.length = 0;
  }
}
