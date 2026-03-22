/**
 * Shared DDD kernel — Result<T, E> monad tests.
 *
 * Groups:
 *  1. Ok()          — construction and shape
 *  2. Err()         — construction and shape
 *  3. unwrap()      — returns value on Ok, throws on Err
 *  4. mapResult()   — maps the Ok value
 *  5. mapErr()      — maps the Err value
 *  6. flatMap()     — chains Results
 *  7. tryResult()   — wraps a throwing function
 */

import { describe, it, expect } from 'vitest';

import {
  Ok,
  Err,
  unwrap,
  mapResult,
  mapErr,
  flatMap,
  tryResult,
} from './result';
import type { Result } from './result';

// ─── 1. Ok() ─────────────────────────────────────────────────────────────────

describe('Ok()', () => {
  it('creates a result with ok: true', () => {
    const r = Ok(42);
    expect(r.ok).toBe(true);
  });

  it('exposes the wrapped value', () => {
    const r = Ok('hello');
    if (r.ok) {
      expect(r.value).toBe('hello');
    }
  });

  it('works with undefined as the value', () => {
    const r = Ok(undefined);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeUndefined();
    }
  });

  it('works with null as the value', () => {
    const r = Ok(null);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeNull();
    }
  });

  it('works with complex objects', () => {
    const obj = { id: '1', items: [1, 2, 3] };
    const r = Ok(obj);
    if (r.ok) {
      expect(r.value).toBe(obj);
    }
  });
});

// ─── 2. Err() ────────────────────────────────────────────────────────────────

describe('Err()', () => {
  it('creates a result with ok: false', () => {
    const r = Err('something went wrong');
    expect(r.ok).toBe(false);
  });

  it('exposes the error value', () => {
    const r = Err('bad input');
    if (!r.ok) {
      expect(r.error).toBe('bad input');
    }
  });

  it('works with non-string error types', () => {
    const r = Err({ code: 404, message: 'not found' });
    if (!r.ok) {
      expect(r.error.code).toBe(404);
    }
  });

  it('works with Error objects as the error value', () => {
    const err = new Error('oops');
    const r = Err(err);
    if (!r.ok) {
      expect(r.error).toBe(err);
    }
  });
});

// ─── 3. unwrap() ──────────────────────────────────────────────────────────────

describe('unwrap()', () => {
  it('returns the value when called on Ok', () => {
    const r = Ok(99);
    expect(unwrap(r)).toBe(99);
  });

  it('throws when called on Err with a string error', () => {
    const r = Err('division by zero');
    expect(() => unwrap(r)).toThrow('division by zero');
  });

  it('throws when called on Err with an object error', () => {
    const r = Err({ code: 500 });
    expect(() => unwrap(r)).toThrow();
  });

  it('the thrown error message contains the Err value', () => {
    const r = Err('the specific reason');
    let message = '';
    try {
      unwrap(r);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('the specific reason');
  });
});

// ─── 4. mapResult() ───────────────────────────────────────────────────────────

describe('mapResult()', () => {
  it('applies the function to the Ok value and returns a new Ok', () => {
    const r: Result<number> = Ok(5);
    const mapped = mapResult(r, (n) => n * 2);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value).toBe(10);
    }
  });

  it('passes the Err through unchanged when result is Err', () => {
    const r: Result<number> = Err('bad value');
    const mapped = mapResult(r, (n) => n * 2);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.error).toBe('bad value');
    }
  });

  it('can change the Ok value type', () => {
    const r: Result<number> = Ok(42);
    const mapped = mapResult(r, String);
    if (mapped.ok) {
      expect(mapped.value).toBe('42');
    }
  });

  it('does not call the mapping function on Err', () => {
    let called = false;
    const r: Result<number> = Err('skip me');
    mapResult(r, (n) => {
      called = true;
      return n;
    });
    expect(called).toBe(false);
  });
});

// ─── 5. mapErr() ──────────────────────────────────────────────────────────────

describe('mapErr()', () => {
  it('applies the function to the Err value and returns a new Err', () => {
    const r: Result<number, string> = Err('raw error');
    const mapped = mapErr(r, (e) => ({ message: e, code: 400 }));
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.error.message).toBe('raw error');
      expect(mapped.error.code).toBe(400);
    }
  });

  it('passes the Ok through unchanged when result is Ok', () => {
    const r: Result<string, string> = Ok('fine');
    const mapped = mapErr(r, (e) => `wrapped: ${e}`);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.value).toBe('fine');
    }
  });

  it('does not call the mapping function on Ok', () => {
    let called = false;
    const r: Result<number, string> = Ok(1);
    mapErr(r, (e) => {
      called = true;
      return e;
    });
    expect(called).toBe(false);
  });
});

// ─── 6. flatMap() ─────────────────────────────────────────────────────────────

describe('flatMap()', () => {
  it('chains a successful computation when Ok', () => {
    const r: Result<number> = Ok(10);
    const chained = flatMap(r, (n) => Ok(n + 5));
    expect(chained.ok).toBe(true);
    if (chained.ok) {
      expect(chained.value).toBe(15);
    }
  });

  it('returns the inner Err when the chained function returns Err', () => {
    const r: Result<number> = Ok(10);
    const chained = flatMap(r, (_n) => Err('inner failure'));
    expect(chained.ok).toBe(false);
    if (!chained.ok) {
      expect(chained.error).toBe('inner failure');
    }
  });

  it('short-circuits on the outer Err without calling the function', () => {
    let called = false;
    const r: Result<number> = Err('outer failure');
    const chained = flatMap(r, (n) => {
      called = true;
      return Ok(n);
    });
    expect(called).toBe(false);
    expect(chained.ok).toBe(false);
    if (!chained.ok) {
      expect(chained.error).toBe('outer failure');
    }
  });

  it('can compose multiple flatMap calls', () => {
    const parse = (s: string): Result<number> => {
      const n = Number(s);
      return isNaN(n) ? Err(`"${s}" is not a number`) : Ok(n);
    };
    const double = (n: number): Result<number> => Ok(n * 2);

    const result = flatMap(flatMap(parse('21'), double), double);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(84);
    }
  });

  it('stops at first failure in a chain', () => {
    const parse = (s: string): Result<number> => {
      const n = Number(s);
      return isNaN(n) ? Err(`"${s}" is not a number`) : Ok(n);
    };
    const result = flatMap(parse('not-a-number'), (n) => Ok(n * 2));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not-a-number');
    }
  });
});

// ─── 7. tryResult() ───────────────────────────────────────────────────────────

describe('tryResult()', () => {
  it('returns Ok with the function return value when no exception is thrown', () => {
    const r = tryResult(() => 42);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBe(42);
    }
  });

  it('returns Err with the error message when the function throws an Error', () => {
    const r = tryResult(() => {
      throw new Error('boom');
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('boom');
    }
  });

  it('returns Err with a stringified value when the function throws a non-Error', () => {
    const r = tryResult(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain string throw';
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('plain string throw');
    }
  });

  it('returns Ok(undefined) for a function that returns void', () => {
    const r = tryResult(() => { /* no-op */ });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toBeUndefined();
    }
  });
});
