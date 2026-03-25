// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLoadingState } from './useLoadingState';

describe('useLoadingState', () => {
  it('starts not loading with no data and no error', () => {
    const fn = vi.fn(async () => 'ok');
    const { result } = renderHook(() => useLoadingState(fn));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('sets isLoading during execution and stores data on success', async () => {
    let resolve!: (v: string) => void;
    const fn = vi.fn(
      () => new Promise<string>((r) => { resolve = r; }),
    );
    const { result } = renderHook(() => useLoadingState(fn));

    let executePromise: Promise<string>;
    act(() => {
      executePromise = result.current.execute();
    });

    // While pending, isLoading should be true
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolve('hello');
      await executePromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBe('hello');
    expect(result.current.error).toBeNull();
  });

  it('sets error on failure and re-throws', async () => {
    const err = new Error('boom');
    const fn = vi.fn(async () => { throw err; });
    const { result } = renderHook(() => useLoadingState(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('boom');
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeNull();
    expect(result.current.error).toBe(err);
  });

  it('wraps non-Error throws into Error instances', async () => {
    const fn = vi.fn(async () => { throw 'string-error'; });
    const { result } = renderHook(() => useLoadingState(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('An error occurred');
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error!.message).toBe('An error occurred');
  });

  it('reset clears data, error, and isLoading', async () => {
    const fn = vi.fn(async () => 42);
    const { result } = renderHook(() => useLoadingState(fn));

    await act(async () => {
      await result.current.execute();
    });
    expect(result.current.data).toBe(42);

    act(() => {
      result.current.reset();
    });

    expect(result.current.data).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('passes arguments through to the async function', async () => {
    const fn = vi.fn(async (a: unknown, b: unknown) => `${a}-${b}`);
    const { result } = renderHook(() => useLoadingState(fn));

    await act(async () => {
      await result.current.execute('x', 'y');
    });

    expect(fn).toHaveBeenCalledWith('x', 'y');
    expect(result.current.data).toBe('x-y');
  });

  it('clears previous error on new successful execute', async () => {
    let shouldFail = true;
    const fn = vi.fn(async () => {
      if (shouldFail) throw new Error('fail');
      return 'ok';
    });
    const { result } = renderHook(() => useLoadingState(fn));

    await act(async () => {
      await expect(result.current.execute()).rejects.toThrow('fail');
    });
    expect(result.current.error).not.toBeNull();

    shouldFail = false;
    await act(async () => {
      await result.current.execute();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('ok');
  });
});
