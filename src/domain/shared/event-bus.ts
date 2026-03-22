/**
 * Shared DDD kernel — Domain Event Bus.
 *
 * All bounded contexts raise events through this bus.
 * Enables loose coupling: aggregates record events internally;
 * application services dispatch them here after persistence.
 */

// ─── Domain Event Contract ────────────────────────────────────────────────────

export interface DomainEvent {
  /** Discriminator — must be unique across all bounded contexts */
  readonly type: string;
  /** Unix timestamp (ms) when the event occurred inside the domain */
  readonly occurredAt: number;
  /** ID of the aggregate that raised this event */
  readonly aggregateId: string;
}

// ─── Event Handler ────────────────────────────────────────────────────────────

export type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T,
) => void | Promise<void>;

// ─── Domain Event Bus ─────────────────────────────────────────────────────────

/**
 * In-process, synchronous event bus.
 * All handlers are called in registration order.
 * Async handlers are fire-and-forget (errors are swallowed to protect the caller).
 */
export class DomainEventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  /**
   * Subscribe to a specific event type.
   * Returns an unsubscribe function.
   */
  on<T extends DomainEvent>(type: string, handler: EventHandler<T>): () => void {
    const existing = this.handlers.get(type) ?? [];
    this.handlers.set(type, [...existing, handler as EventHandler]);
    return () => this.off(type, handler as EventHandler);
  }

  /**
   * Dispatch an array of domain events to all registered handlers.
   * Events are dispatched in order; each type's handlers are called in order.
   */
  dispatch(events: ReadonlyArray<DomainEvent>): void {
    for (const event of events) {
      const hs = this.handlers.get(event.type) ?? [];
      for (const h of hs) {
        try {
          const result = h(event);
          if (result instanceof Promise) {
            result.catch((err: unknown) => {
              console.error(`[DomainEventBus] async handler error for ${event.type}:`, err);
            });
          }
        } catch (err) {
          console.error(`[DomainEventBus] sync handler error for ${event.type}:`, err);
        }
      }
    }
  }

  /** Remove all handlers for a given type. Useful for testing. */
  clear(type?: string): void {
    if (type) {
      this.handlers.delete(type);
    } else {
      this.handlers.clear();
    }
  }

  private off(type: string, handler: EventHandler): void {
    const existing = this.handlers.get(type);
    if (!existing) return;
    const updated = existing.filter(h => h !== handler);
    if (updated.length === 0) {
      this.handlers.delete(type);
    } else {
      this.handlers.set(type, updated);
    }
  }
}

/** Singleton event bus for the application. */
export const globalEventBus = new DomainEventBus();
