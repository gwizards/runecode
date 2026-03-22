/**
 * Port: abstracts all Tauri IPC calls needed by the ruflo domain service.
 * The adapter (TauriRuFloApiAdapter) lives in src/infrastructure/ruflo/.
 *
 * Every method listed here corresponds to a call that ruFloService makes
 * on the raw `api` object from @/lib/api.
 */

import type {
  RuFloStatus,
  RuFloSwarmStatus,
  RuFloProjectStatus,
} from '@/lib/api';

export type { RuFloStatus, RuFloSwarmStatus, RuFloProjectStatus };

export interface IRuFloApiPort {
  checkRufloInstalled(): Promise<RuFloStatus>;
  getRufloSwarmStatus(): Promise<RuFloSwarmStatus>;
  getRufloProjectStatus(path: string): Promise<RuFloProjectStatus>;
  installRuflo(): Promise<string>;
  uninstallRuflo(): Promise<string>;
  activateRufloMcp(): Promise<string>;
  deactivateRufloMcp(): Promise<string>;
  createRufloSlashCommand(): Promise<string>;
  initRufloProject(path: string): Promise<string>;
  getRufloMemoryStats(): Promise<Record<string, unknown>>;
  syncRufloMemoryLocal(destPath: string): Promise<string>;
  consolidateRufloMemory(): Promise<string>;
  setRufloMemoryBackend(backend: 'agentdb' | 'hnsw' | 'hybrid'): Promise<string>;
}
