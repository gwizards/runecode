import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Mirrors the Rust `SystemResources` return type from `get_system_resources`. */
export interface SystemResources {
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
  diskPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
}

/** Mirrors the Rust `SystemInfo` return type from `get_system_info`. */
export interface SystemInfo {
  platform: string;
  tmux_available: boolean;
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Retrieve current CPU / RAM / disk usage from the Tauri backend.
 */
export async function getSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>('get_system_resources');
}

/**
 * Retrieve the port number on which the embedded terminal WebSocket server
 * is listening.  Returns `0` if the server failed to start.
 */
export async function getTerminalPort(): Promise<number> {
  return invoke<number>('get_terminal_port');
}

/**
 * Retrieve platform metadata (OS name, tmux availability, etc.) from the
 * Tauri backend.
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>('get_system_info');
}
