/**
 * Shared DDD kernel — Result<T, E> edge case tests.
 *
 * Supplements result.test.ts with additional edge cases:
 *  1. flatMap chaining with type changes
 *  2. mapErr with type transformations
 *  3. tryResult with various throwing patterns
 *  4. unwrap edge cases
 *  5. Composition patterns
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

// ─── 1. flatMap chaining with type changes ──────────────────────────────────

describe('flatMap — advanced chaining', () => {
  it('chains three operations with different types', () => {
    const parseNumber = (s: string): Result<number> => {
      const n = Number(s);
      return isNaN(n) ? Err('NaN') : Ok(n);
    };
    const toArray = (n: number): Result<number[]> => Ok(Array(n).fill(0));
    const toLength = (arr: number[]): Result<string> => Ok(`length=${arr.length}`);

    const result = flatMap(flatMap(parseNumber('3'), toArray), toLength);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe('length=3');
  });

  it('short-circuits at the second step in a three-step chain', () => {
    const step1 = (n: number): Result<number> => Ok(n * 2);
    const step2 = (_n: number): Result<number> => Err('step2 failed');
    const step3 = (n: number): Result<string> => Ok(`result: ${n}`);

    const result = flatMap(flatMap(step1(5), step2), step3);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('step2 failed');
  });

  it('preserves the error type through the chain', () => {
    const r: Result<number> = Err('original error');
    const chained = flatMap(flatMap(r, (n) => Ok(n + 1)), (n) => Ok(String(n)));
    expect(chained.ok).toBe(false);
    if (!chained.ok) expect(chained.error).toBe('original error');
  });
});

// ─── 2. mapErr with type transformations ────────────────────────────────────

describe('mapErr — advanced transformations', () => {
  it('transforms string error to a structured error object', () => {
    const r: Result<number, string> = Err('not found');
    const mapped = mapErr(r, (e) => ({ code: 404, message: e, timestamp: 0 }));

    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.error.code).toBe(404);
      expect(mapped.error.message).toBe('not found');
    }
  });

  it('can be chained to wrap errors with context', () => {
    const r: Result<number, string> = Err('timeout');
    const wrapped = mapErr(
      mapErr(r, (e) => `Database: ${e}`),
      (e) => `UserService: ${e}`,
    );

    expect(wrapped.ok).toBe(false);
    if (!wrapped.ok) expect(wrapped.error).toBe('UserService: Database: timeout');
  });

  it('preserves Ok value through multiple mapErr calls', () => {
    const r: Result<number, string> = Ok(42);
    const mapped = mapErr(mapErr(r, () => 'replaced'), () => 'replaced again');

    expect(mapped.ok).toBe(true);
    if (mapped.ok) expect(mapped.value).toBe(42);
  });
});

// ─── 3. tryResult with various throwing patterns ────────────────────────────

describe('tryResult — edge cases', () => {
  it('catches TypeError', () => {
    const r = tryResult(() => {
      const obj: Record<string, unknown> = {};
      // Force a runtime TypeError
      return (obj as unknown as { nested: { value: number } }).nested.value;
    });
    expect(r.ok).toBe(false);
  });

  it('catches RangeError', () => {
    const r = tryResult(() => {
      const arr = new Array(-1);
      return arr;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Invalid array length');
  });

  it('handles throwing null', () => {
    const r = tryResult(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw null;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('null');
  });

  it('handles throwing undefined', () => {
    const r = tryResult(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw undefined;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('undefined');
  });

  it('handles throwing a number', () => {
    const r = tryResult(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 42;
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('42');
  });

  it('returns Ok for synchronous function returning a Promise object', () => {
    const r = tryResult(() => Promise.resolve(99));
    expect(r.ok).toBe(true);
    // tryResult wraps the return value; it does not await the promise
    if (r.ok) expect(r.value).toBeInstanceOf(Promise);
  });
});

// ─── 4. unwrap edge cases ───────────────────────────────────────────────────

describe('unwrap — edge cases', () => {
  it('returns Ok(0) without throwing (zero is a valid value)', () => {
    const r = Ok(0);
    expect(unwrap(r)).toBe(0);
  });

  it('returns Ok(false) without throwing (false is a valid value)', () => {
    const r = Ok(false);
    expect(unwrap(r)).toBe(false);
  });

  it('returns Ok("") without throwing (empty string is a valid value)', () => {
    const r = Ok('');
    expect(unwrap(r)).toBe('');
  });

  it('returns Ok(null) without throwing', () => {
    const r = Ok(null);
    expect(unwrap(r)).toBeNull();
  });

  it('thrown error message includes stringified Err value for objects', () => {
    const r = Err({ code: 500, detail: 'internal' });
    expect(() => unwrap(r)).toThrow('[object Object]');
  });
});

// ─── 5. Composition patterns ────────────────────────────────────────────────

describe('Result composition patterns', () => {
  it('mapResult + flatMap compose for validation pipelines', () => {
    const parseAge = (s: string): Result<number> => {
      const n = Number(s);
      return isNaN(n) ? Err('not a number') : Ok(n);
    };
    const validateRange = (n: number): Result<number> =>
      n >= 0 && n <= 150 ? Ok(n) : Err('age out of range');

    // Valid case
    const valid = flatMap(parseAge('25'), validateRange);
    expect(valid.ok).toBe(true);
    if (valid.ok) expect(valid.value).toBe(25);

    // Parse failure
    const parseFail = flatMap(parseAge('abc'), validateRange);
    expect(parseFail.ok).toBe(false);
    if (!parseFail.ok) expect(parseFail.error).toBe('not a number');

    // Range failure
    const rangeFail = flatMap(parseAge('200'), validateRange);
    expect(rangeFail.ok).toBe(false);
    if (!rangeFail.ok) expect(rangeFail.error).toBe('age out of range');
  });

  it('mapResult preserves identity: map(Ok(x), id) === Ok(x)', () => {
    const r = Ok(42);
    const mapped = mapResult(r, (x) => x);
    expect(mapped.ok).toBe(true);
    if (mapped.ok) expect(mapped.value).toBe(42);
  });

  it('flatMap preserves identity: flatMap(Ok(x), Ok) === Ok(x)', () => {
    const r: Result<number> = Ok(42);
    const chained = flatMap(r, (x) => Ok(x));
    expect(chained.ok).toBe(true);
    if (chained.ok) expect(chained.value).toBe(42);
  });
});
