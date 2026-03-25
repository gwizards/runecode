import { describe, it, expect } from 'vitest';
import { isRealTauri } from './tauri-env';

describe('isRealTauri', () => {
  it('returns false in test environment (no window.__TAURI__)', () => {
    expect(isRealTauri()).toBe(false);
  });
});
