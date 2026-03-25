// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getPlatformMode,
  setPlatformMode,
  isWslMode,
  getWslDistro,
  setWslDistro,
  wslParam,
  windowsToWslPath,
} from './platformMode';

describe('platformMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to windows mode', () => {
    expect(getPlatformMode()).toBe('windows');
  });

  it('setPlatformMode persists to localStorage', () => {
    setPlatformMode('wsl');
    expect(getPlatformMode()).toBe('wsl');
  });

  it('isWslMode returns true when wsl', () => {
    setPlatformMode('wsl');
    expect(isWslMode()).toBe(true);
  });

  it('isWslMode returns false when windows', () => {
    setPlatformMode('windows');
    expect(isWslMode()).toBe(false);
  });

  it('getWslDistro returns null by default', () => {
    expect(getWslDistro()).toBeNull();
  });

  it('setWslDistro persists', () => {
    setWslDistro('Ubuntu-24.04');
    expect(getWslDistro()).toBe('Ubuntu-24.04');
  });

  it('wslParam returns empty when not wsl', () => {
    setPlatformMode('windows');
    expect(wslParam()).toEqual({});
  });

  it('wslParam returns distro when wsl', () => {
    setPlatformMode('wsl');
    setWslDistro('Ubuntu');
    expect(wslParam()).toEqual({ wslDistro: 'Ubuntu' });
  });

  it('wslParam returns empty when wsl but no distro set', () => {
    setPlatformMode('wsl');
    expect(wslParam()).toEqual({});
  });
});

describe('windowsToWslPath', () => {
  it('converts drive letter path', () => {
    expect(windowsToWslPath('C:\\Users\\foo\\project')).toBe(
      '/mnt/c/Users/foo/project',
    );
  });

  it('handles lowercase drive', () => {
    expect(windowsToWslPath('d:\\data')).toBe('/mnt/d/data');
  });

  it('passes through Linux paths', () => {
    expect(windowsToWslPath('/home/user/project')).toBe(
      '/home/user/project',
    );
  });

  it('handles forward slashes', () => {
    expect(windowsToWslPath('C:/Users/foo')).toBe('/mnt/c/Users/foo');
  });
});
