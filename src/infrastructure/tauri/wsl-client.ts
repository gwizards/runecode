import { invoke } from '@tauri-apps/api/core';

export interface WslDistro {
  name: string;
  is_default: boolean;
  version: number;
  state: string;
}

export interface WslStatus {
  available: boolean;
  distros: WslDistro[];
  recommended_distro: string | null;
  claude_in_wsl: boolean;
  node_in_wsl: boolean;
}

export async function detectWsl(): Promise<WslStatus> {
  return invoke<WslStatus>('detect_wsl');
}

export async function wslExecute(distro: string, command: string): Promise<string> {
  return invoke<string>('wsl_execute', { distro, command });
}

export async function installClaudeInWsl(distro: string): Promise<string> {
  return invoke<string>('install_claude_in_wsl', { distro });
}
