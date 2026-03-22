/**
 * Shared DDD kernel — DomainEventBus tests.
 *
 * Groups:
 *  1. on() + dispatch()          — handler is called with the event
 *  2. handler isolation          — other-type handlers are not called
 *  3. unsubscribe                — returned function stops future calls
 *  4. clear(type)                — removes only that type's handlers
 *  5. clear() (no args)          — removes all handlers
 *  6. registration order         — multiple handlers called in order
 *  7. empty dispatch             — no-op when event array is empty
 *  8. handler isolation on throw — throwing handler does not block others
 */

import { describe, it, expect, vi } from 'vitest';

import { DomainEventBus } from './event-bus';
import type { DomainEvent } from './event-bus';

// ─── Test event factories ─────────────────────────────────────────────────────

function makeEvent(type: string, aggregateId = 'agg-1'): DomainEvent {
  return { type, aggregateId, occurredAt: Date.now() };
}

// ─── 1. on() + dispatch() ─────────────────────────────────────────────────────

describe('DomainEventBus — on() + dispatch()', () => {
  it('calls the handler with the dispatched event', () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const event = makeEvent('test.event');

    bus.on('test.event', handler);
    bus.dispatch([event]);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('calls the handler for every matching event in the array', () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const e1 = makeEvent('foo', 'a');
    const e2 = makeEvent('foo', 'b');

    bus.on('foo', handler);
    bus.dispatch([e1, e2]);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, e1);
    expect(handler).toHaveBeenNthCalledWith(2, e2);
  });
});

// ─── 2. handler isolation ─────────────────────────────────────────────────────

describe('DomainEventBus — handler isolation by type', () => {
  it('does not call handlers registered for a different type', () => {
    const bus = new DomainEventBus();
    const fooHandler = vi.fn();
    const barHandler = vi.fn();

    bus.on('foo', fooHandler);
    bus.on('bar', barHandler);

    bus.dispatch([makeEvent('foo')]);

    expect(fooHandler).toHaveBeenCalledOnce();
    expect(barHandler).not.toHaveBeenCalled();
  });

  it('dispatches each event only to handlers of its own type', () => {
    const bus = new DomainEventBus();
    const aHandler = vi.fn();
    const bHandler = vi.fn();

    bus.on('type.a', aHandler);
    bus.on('type.b', bHandler);

    bus.dispatch([makeEvent('type.a'), makeEvent('type.b')]);

    expect(aHandler).toHaveBeenCalledOnce();
    expect(bHandler).toHaveBeenCalledOnce();
    expect(aHandler.mock.calls[0][0].type).toBe('type.a');
    expect(bHandler.mock.calls[0][0].type).toBe('type.b');
  });
});

// ─── 3. unsubscribe ───────────────────────────────────────────────────────────

describe('DomainEventBus — on() returns unsubscribe function', () => {
  it('stops calling the handler after unsubscribe is called', () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();
    const unsubscribe = bus.on('unsub.event', handler);

    bus.dispatch([makeEvent('unsub.event')]);
    expect(handler).toHaveBeenCalledOnce();

    unsubscribe();
    bus.dispatch([makeEvent('unsub.event')]);
    expect(handler).toHaveBeenCalledOnce(); // still only once
  });

  it('unsubscribing one handler does not affect other handlers for the same type', () => {
    const bus = new DomainEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    const unsub1 = bus.on('shared', h1);
    bus.on('shared', h2);

    unsub1();
    bus.dispatch([makeEvent('shared')]);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).toHaveBeenCalledOnce();
  });
});

// ─── 4. clear(type) ───────────────────────────────────────────────────────────

describe('DomainEventBus — clear(type)', () => {
  it('removes only handlers for the specified type', () => {
    const bus = new DomainEventBus();
    const aHandler = vi.fn();
    const bHandler = vi.fn();

    bus.on('clear.a', aHandler);
    bus.on('clear.b', bHandler);

    bus.clear('clear.a');
    bus.dispatch([makeEvent('clear.a'), makeEvent('clear.b')]);

    expect(aHandler).not.toHaveBeenCalled();
    expect(bHandler).toHaveBeenCalledOnce();
  });
});

// ─── 5. clear() with no args ──────────────────────────────────────────────────

describe('DomainEventBus — clear() with no argument', () => {
  it('removes all handlers for all types', () => {
    const bus = new DomainEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();

    bus.on('all.a', h1);
    bus.on('all.b', h2);

    bus.clear();
    bus.dispatch([makeEvent('all.a'), makeEvent('all.b')]);

    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});

// ─── 6. registration order ────────────────────────────────────────────────────

describe('DomainEventBus — multiple handlers called in registration order', () => {
  it('calls all handlers for the same type in the order they were registered', () => {
    const bus = new DomainEventBus();
    const callOrder: number[] = [];

    bus.on('ordered', () => { callOrder.push(1); });
    bus.on('ordered', () => { callOrder.push(2); });
    bus.on('ordered', () => { callOrder.push(3); });

    bus.dispatch([makeEvent('ordered')]);

    expect(callOrder).toEqual([1, 2, 3]);
  });
});

// ─── 7. empty dispatch ────────────────────────────────────────────────────────

describe('DomainEventBus — dispatch with empty array', () => {
  it('is a no-op and does not call any handler', () => {
    const bus = new DomainEventBus();
    const handler = vi.fn();

    bus.on('some.event', handler);
    bus.dispatch([]);

    expect(handler).not.toHaveBeenCalled();
  });
});

// ─── 8. handler isolation on throw ───────────────────────────────────────────

describe('DomainEventBus — handler that throws does not prevent others from running', () => {
  it('continues calling subsequent handlers even if one throws', () => {
    const bus = new DomainEventBus();
    const goodHandler = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.on('fault.event', () => {
      throw new Error('boom');
    });
    bus.on('fault.event', goodHandler);

    bus.dispatch([makeEvent('fault.event')]);

    expect(goodHandler).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });

  it('the dispatching call does not throw even if a handler throws', () => {
    const bus = new DomainEventBus();
    bus.on('safe.event', () => {
      throw new Error('should be swallowed');
    });

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => bus.dispatch([makeEvent('safe.event')])).not.toThrow();
    consoleError.mockRestore();
  });
});
