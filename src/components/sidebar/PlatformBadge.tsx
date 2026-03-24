import { useState, useEffect } from 'react';
import { Terminal, Monitor } from 'lucide-react';
import { isWindowsPlatform, getPlatformMode, getWslDistro } from '@/lib/platformMode';

/**
 * Shows the current platform mode (WSL / Windows) in the sidebar header.
 * Only renders on Windows — Linux/macOS users don't need this.
 */
export function PlatformBadge() {
  const [mode, setMode] = useState(getPlatformMode());
  const [distro, setDistro] = useState(getWslDistro());

  // Re-read from localStorage on storage events (settings page changes)
  useEffect(() => {
    const handler = () => {
      setMode(getPlatformMode());
      setDistro(getWslDistro());
    };
    window.addEventListener('storage', handler);
    // Also poll briefly since same-tab localStorage changes don't fire 'storage'
    const interval = setInterval(handler, 2000);
    return () => {
      window.removeEventListener('storage', handler);
      clearInterval(interval);
    };
  }, []);

  if (!isWindowsPlatform()) return null;

  const isWsl = mode === 'wsl';

  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      {isWsl ? (
        <Terminal className="w-3 h-3 text-purple-400" />
      ) : (
        <Monitor className="w-3 h-3 text-blue-400" />
      )}
      <span className={`text-[10px] font-medium ${isWsl ? 'text-purple-400' : 'text-blue-400'}`}>
        {isWsl ? `WSL · ${distro || 'Ubuntu'}` : 'Windows'}
      </span>
      <span className={`text-[9px] px-1 py-0.5 rounded ${
        isWsl ? 'bg-purple-500/15 text-purple-300' : 'bg-blue-500/15 text-blue-300'
      }`}>
        {isWsl ? 'Linux' : 'Native'}
      </span>
    </div>
  );
}
