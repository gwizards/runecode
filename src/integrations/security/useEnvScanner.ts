import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/sessionStore';

interface EnvScanResult {
  hasEnvFiles: boolean;
  envFiles: string[];
  hasHardcodedSecrets: boolean;
}

const ENV_FILE_NAMES = ['.env', '.env.local', '.env.production', '.env.development', '.env.staging', '.env.test'];

/**
 * Regex to detect .env file paths in session output text.
 * Matches paths like /foo/bar/.env, ./.env.local, or bare .env filenames
 * when referenced in tool calls or file listings.
 */
const ENV_PATH_REGEX = /(?:^|[\s"'`/\\])((\.\/|\/)?(?:[\w./-]*\/)?\.env(?:\.\w+)?)\b/gm;

/**
 * Extract .env file paths from a block of session output text (JSONL).
 */
function extractEnvFilesFromText(text: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;

  // Reset regex state
  ENV_PATH_REGEX.lastIndex = 0;

  while ((match = ENV_PATH_REGEX.exec(text)) !== null) {
    const filePath = match[1].trim();
    // Validate: the basename must be one of our known env file patterns
    const basename = filePath.split('/').pop() || '';
    if (ENV_FILE_NAMES.some((name) => basename === name || basename.startsWith('.env.'))) {
      found.add(filePath);
    }
  }

  return Array.from(found);
}

/**
 * Scans for .env files using multiple strategies:
 * 1. Scans session output text (JSONL) for references to .env files from tool calls
 * 2. Falls back to the project-info API endpoint if available
 *
 * This removes the hard dependency on the Rust backend API.
 */
export function useEnvScanner(projectPath: string): EnvScanResult {
  const [result, setResult] = useState<EnvScanResult>({
    hasEnvFiles: false,
    envFiles: [],
    hasHardcodedSecrets: false,
  });

  // Track already-found files across renders so we accumulate without duplicates
  const foundFilesRef = useRef<Set<string>>(new Set());

  // Strategy 1: Scan session outputs for .env file references
  const sessionOutputs = useSessionStore((state) => state.sessionOutputs);

  useEffect(() => {
    if (!projectPath) {
      foundFilesRef.current.clear();
      setResult({ hasEnvFiles: false, envFiles: [], hasHardcodedSecrets: false });
      return;
    }

    let changed = false;

    for (const output of Object.values(sessionOutputs)) {
      if (!output) continue;
      const envFiles = extractEnvFilesFromText(output);
      for (const file of envFiles) {
        if (!foundFilesRef.current.has(file)) {
          foundFilesRef.current.add(file);
          changed = true;
        }
      }
    }

    if (changed || foundFilesRef.current.size > 0) {
      const files = Array.from(foundFilesRef.current);
      setResult({
        hasEnvFiles: files.length > 0,
        envFiles: files,
        hasHardcodedSecrets: false,
      });
    }
  }, [projectPath, sessionOutputs]);

  // Strategy 2: Try the project-info API (best-effort, may not be available)
  useEffect(() => {
    if (!projectPath) return;

    let cancelled = false;

    async function scanApi() {
      try {
        const res = await fetch(
          `/api/project-info?path=${encodeURIComponent(projectPath)}`
        );
        if (!res.ok) return;
        const data = await res.json();

        const files: string[] = data.envFiles ?? data.env_files ?? [];

        // If files list is provided but envFiles isn't, scan the files list
        if (files.length === 0 && Array.isArray(data.files)) {
          for (const file of data.files as string[]) {
            const name = file.split('/').pop() || '';
            if (ENV_FILE_NAMES.includes(name)) {
              files.push(file);
            }
          }
        }

        if (!cancelled && files.length > 0) {
          let changed = false;
          for (const file of files) {
            if (!foundFilesRef.current.has(file)) {
              foundFilesRef.current.add(file);
              changed = true;
            }
          }
          if (changed) {
            const allFiles = Array.from(foundFilesRef.current);
            setResult({
              hasEnvFiles: true,
              envFiles: allFiles,
              hasHardcodedSecrets: false,
            });
          }
        }
      } catch {
        // Silently fail — API may not be available
      }
    }

    scanApi();
    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  return result;
}
