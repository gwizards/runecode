import { useMemo } from 'react';

interface EnvScanResult {
  hasEnvFiles: boolean;
  envFiles: string[];
  hasHardcodedSecrets: boolean;
}

export function useEnvScanner(messages: any[], projectFiles?: string[]): EnvScanResult {
  return useMemo(() => {
    const envFiles: string[] = [];
    const envPatterns = ['.env', '.env.local', '.env.production', '.env.development'];

    // Check project files for .env files
    if (projectFiles) {
      for (const file of projectFiles) {
        const name = file.split('/').pop() || '';
        if (envPatterns.includes(name)) {
          envFiles.push(file);
        }
      }
    }

    // Also check messages for .env references in tool calls
    for (const msg of messages) {
      if (msg?.tool_name === 'Read' || msg?.tool_name === 'Write') {
        const filePath = msg.tool_input?.file_path || msg.tool_input?.path || '';
        const name = filePath.split('/').pop() || '';
        if (envPatterns.includes(name) && !envFiles.includes(filePath)) {
          envFiles.push(filePath);
        }
      }
    }

    return {
      hasEnvFiles: envFiles.length > 0,
      envFiles,
      hasHardcodedSecrets: false, // simplified for v1
    };
  }, [messages, projectFiles]);
}
