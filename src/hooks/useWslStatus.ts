import { useState, useEffect, useCallback } from 'react';
import type { WslStatus } from '@/infrastructure/tauri/wsl-client';

export function useWslStatus() {
  const [status, setStatus] = useState<WslStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { detectWsl } = await import('@/infrastructure/tauri/wsl-client');
      const result = await detectWsl();
      setStatus(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus({ available: false, distros: [], recommended_distro: null, claude_in_wsl: false, node_in_wsl: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Only detect on Windows
    const isWindows = navigator.userAgent.includes('Windows') ||
      (typeof navigator.platform === 'string' && navigator.platform.startsWith('Win'));
    if (isWindows) {
      refresh();
    } else {
      setStatus({ available: false, distros: [], recommended_distro: null, claude_in_wsl: false, node_in_wsl: false });
      setLoading(false);
    }
  }, [refresh]);

  return { status, loading, error, refresh };
}
