const STORAGE_KEY = 'runecode-platform-mode';

export type PlatformMode = 'windows' | 'wsl';

export function getPlatformMode(): PlatformMode {
  if (typeof window === 'undefined') return 'windows';
  return (localStorage.getItem(STORAGE_KEY) as PlatformMode) || 'windows';
}

export function setPlatformMode(mode: PlatformMode): void {
  localStorage.setItem(STORAGE_KEY, mode);
}

export function isWslMode(): boolean {
  return getPlatformMode() === 'wsl';
}

export function getWslDistro(): string | null {
  return localStorage.getItem('runecode-wsl-distro');
}

export function setWslDistro(distro: string): void {
  localStorage.setItem('runecode-wsl-distro', distro);
}

export function isWindowsPlatform(): boolean {
  return navigator.userAgent.includes('Windows') ||
    (typeof navigator.platform === 'string' && navigator.platform.startsWith('Win'));
}
