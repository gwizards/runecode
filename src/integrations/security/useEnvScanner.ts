import { useState, useEffect } from 'react';

interface EnvScanResult {
  hasEnvFiles: boolean;
  envFiles: string[];
  hasHardcodedSecrets: boolean;
}

const ENV_PATTERNS = ['.env', '.env.local', '.env.production', '.env.development'];

/**
 * Scans a project directory for .env files by querying the project-info endpoint.
 * Falls back to an empty result on error.
 */
export function useEnvScanner(projectPath: string): EnvScanResult {
  const [result, setResult] = useState<EnvScanResult>({
    hasEnvFiles: false,
    envFiles: [],
    hasHardcodedSecrets: false,
  });

  useEffect(() => {
    if (!projectPath) {
      setResult({ hasEnvFiles: false, envFiles: [], hasHardcodedSecrets: false });
      return;
    }

    let cancelled = false;

    async function scan() {
      try {
        const res = await fetch(
          `/api/project-info?path=${encodeURIComponent(projectPath)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        // The project-info endpoint may return a files list or envFiles directly
        const files: string[] = data.envFiles ?? data.env_files ?? [];

        // If files list is provided but envFiles isn't, scan the files list
        if (files.length === 0 && Array.isArray(data.files)) {
          for (const file of data.files as string[]) {
            const name = file.split('/').pop() || '';
            if (ENV_PATTERNS.includes(name)) {
              files.push(file);
            }
          }
        }

        if (!cancelled) {
          setResult({
            hasEnvFiles: files.length > 0,
            envFiles: files,
            hasHardcodedSecrets: false,
          });
        }
      } catch {
        // Silently fail — env scanning is best-effort
      }
    }

    scan();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return result;
}
