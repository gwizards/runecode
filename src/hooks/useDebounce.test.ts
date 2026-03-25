/**
 * Unit tests for the useDebounce hook.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './useDebounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update the debounced value before the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 500 } },
    );

    rerender({ value: 'b', delay: 500 });
    // Advance only part of the delay
    act(() => { vi.advanceTimersByTime(200); });

    expect(result.current).toBe('a');
  });

  it('updates the debounced value after the delay', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } },
    );

    rerender({ value: 'b', delay: 300 });
    act(() => { vi.advanceTimersByTime(300); });

    expect(result.current).toBe('b');
  });

  it('only reflects the latest value when rapidly changed', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 200 } },
    );

    // Rapid changes
    rerender({ value: 'b', delay: 200 });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: 'c', delay: 200 });
    act(() => { vi.advanceTimersByTime(50); });
    rerender({ value: 'd', delay: 200 });

    // Before delay passes, still original
    expect(result.current).toBe('a');

    // After full delay from last change
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toBe('d');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 100 } },
    );

    rerender({ value: 42, delay: 100 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(42);
  });

  it('works with object values (reference identity)', () => {
    const obj1 = { key: 'value1' };
    const obj2 = { key: 'value2' };

    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: obj1, delay: 100 } },
    );

    rerender({ value: obj2, delay: 100 });
    act(() => { vi.advanceTimersByTime(100); });
    expect(result.current).toBe(obj2);
  });

  it('resets the timer when the value changes before the delay expires', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'start', delay: 300 } },
    );

    // Change at t=0
    rerender({ value: 'mid', delay: 300 });
    // Advance 250ms (not enough)
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('start');

    // Change again, resets timer
    rerender({ value: 'end', delay: 300 });
    // Advance another 250ms (total 500ms from start, but only 250ms since last change)
    act(() => { vi.advanceTimersByTime(250); });
    expect(result.current).toBe('start');

    // Final 50ms to complete the 300ms from last change
    act(() => { vi.advanceTimersByTime(50); });
    expect(result.current).toBe('end');
  });
});
