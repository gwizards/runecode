/**
 * Unit tests for the startupToken utility module.
 *
 * Since the module uses a module-level singleton (_token), we re-import
 * the module fresh for each test via vi.resetModules().
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need fresh module state per test because _token is a singleton.
let initStartupToken: typeof import('./startupToken').initStartupToken;
let getStartupToken: typeof import('./startupToken').getStartupToken;
let applyStartupToken: typeof import('./startupToken').applyStartupToken;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('./startupToken');
  initStartupToken = mod.initStartupToken;
  getStartupToken = mod.getStartupToken;
  applyStartupToken = mod.applyStartupToken;
});

describe('getStartupToken', () => {
  it('returns null before initStartupToken is called', () => {
    expect(getStartupToken()).toBeNull();
  });
});

describe('initStartupToken', () => {
  it('is a no-op when window is undefined (non-browser)', async () => {
    // In the node test environment, window is undefined by default
    await initStartupToken();
    expect(getStartupToken()).toBeNull();
  });

  it('is a no-op when window.__TAURI__ is not set', async () => {
    // Simulate browser without Tauri
    const original = globalThis.window;
    // @ts-expect-error -- partial window mock for test
    globalThis.window = {};
    try {
      await initStartupToken();
      expect(getStartupToken()).toBeNull();
    } finally {
      (globalThis as Record<string, unknown>).window = original;
    }
  });
});

describe('applyStartupToken', () => {
  it('returns the same headers when token is null', () => {
    const headers = { 'Content-Type': 'application/json' };
    const result = applyStartupToken(headers);
    expect(result).toEqual({ 'Content-Type': 'application/json' });
    // Should not have the token header
    expect(result).not.toHaveProperty('X-Startup-Token');
  });

  it('returns the original headers reference when no token is set', () => {
    const headers = { Accept: 'text/html' };
    const result = applyStartupToken(headers);
    // When there is no token, the function returns the same object
    expect(result).toBe(headers);
    expect(headers).toEqual({ Accept: 'text/html' });
  });

  it('returns an empty object when given an empty object and no token', () => {
    const result = applyStartupToken({});
    expect(result).toEqual({});
  });
});
