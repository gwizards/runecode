/**
 * Shared DDD kernel — Result<T, E> monad.
 *
 * Replaces thrown exceptions at domain boundaries.
 * Inspired by Rust's Result type.
 *
 * Usage:
 *   function divide(a: number, b: number): Result<number> {
 *     if (b === 0) return Err('division by zero');
 *     return Ok(a / b);
 *   }
 *
 *   const r = divide(10, 2);
 *   if (r.ok) console.log(r.value); // 5
 *   else console.error(r.error);
 */

export type Result<T, E = string> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Construct a successful result. */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failed result. */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/** Unwrap a Result, throwing if it is Err. For use in tests only. */
export function unwrap<T>(result: Result<T, unknown>): T {
  if (result.ok) return result.value;
  throw new Error(`unwrap() called on Err: ${String(result.error)}`);
}

/** Map the Ok value of a Result. */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> {
  if (result.ok) return Ok(fn(result.value));
  return result;
}

/** Map the Err value of a Result. */
export function mapErr<T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> {
  if (!result.ok) return Err(fn(result.error));
  return result;
}

/** Flatten a Result<Result<T, E>, E> → Result<T, E>. */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> {
  if (result.ok) return fn(result.value);
  return result;
}

/** Convert a throwing function into a Result. */
export function tryResult<T>(fn: () => T): Result<T, string> {
  try {
    return Ok(fn());
  } catch (err) {
    return Err(err instanceof Error ? err.message : String(err));
  }
}
