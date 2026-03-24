const STORAGE_KEY = 'runecode-platform-mode';

export type PlatformMode = 'windows' | 'wsl';

export function getPlatformMode(): PlatformMode {
  if (typeof window === 'undefined') return 'windows';
  return (localStorage.getItem(STORAGE_KEY) as PlatformMode) || 'windows';
}

export function setPlatformMode(mode: PlatformMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
  window.dispatchEvent(new Event('runecode:platform-changed'));
}

export function isWslMode(): boolean {
  return getPlatformMode() === 'wsl';
}

export function getWslDistro(): string | null {
  return localStorage.getItem('runecode-wsl-distro');
}

export function setWslDistro(distro: string): void {
  localStorage.setItem('runecode-wsl-distro', distro);
  window.dispatchEvent(new Event('runecode:platform-changed'));
}

export function isWindowsPlatform(): boolean {
  return navigator.userAgent.includes('Windows') ||
    (typeof navigator.platform === 'string' && navigator.platform.startsWith('Win'));
}

/** Returns `{ wslDistro }` when WSL mode is active, or `{}` otherwise. */
export function wslParam(): { wslDistro?: string } {
  if (isWslMode()) {
    const distro = getWslDistro();
    if (distro) return { wslDistro: distro };
  }
  return {};
}

/**
 * Convert a Windows-style path (e.g. C:\Users\foo) to a WSL mount path
 * (e.g. /mnt/c/Users/foo).  Non-Windows paths are returned unchanged.
 */
export function windowsToWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, '/');
  if (normalized.length >= 2 && normalized[1] === ':') {
    const drive = normalized[0].toLowerCase();
    return `/mnt/${drive}${normalized.substring(2)}`;
  }
  return normalized;
}
