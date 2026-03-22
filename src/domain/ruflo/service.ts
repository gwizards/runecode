// RuFlo domain service — wraps raw API calls with domain type mapping.
//
// Accepts an IRuFloApiPort for dependency injection (used in tests).
// The default singleton `ruFloService` is lazy-initialised with the real
// Tauri adapter so existing call-sites remain unchanged.

import type { IRuFloApiPort } from './ports/IRuFloApiPort';
import {
  toRuFloInstallation,
  toRuFloSwarm,
  toRuFloProjectStatus,
  type RuFloInstallation,
  type RuFloSwarm,
  type RuFloProjectStatus,
} from './types';

export class RuFloService {
  constructor(private readonly apiPort: IRuFloApiPort) {}

  async getInstallation(): Promise<RuFloInstallation> {
    const raw = await this.apiPort.checkRufloInstalled();
    return toRuFloInstallation(raw);
  }

  async getSwarmStatus(): Promise<RuFloSwarm> {
    const raw = await this.apiPort.getRufloSwarmStatus();
    return toRuFloSwarm(raw);
  }

  async getProjectStatus(path: string): Promise<RuFloProjectStatus> {
    const raw = await this.apiPort.getRufloProjectStatus(path);
    return toRuFloProjectStatus(raw);
  }

  async install(): Promise<string> {
    return this.apiPort.installRuflo();
  }

  async uninstall(): Promise<string> {
    return this.apiPort.uninstallRuflo();
  }

  async activateMcp(): Promise<string> {
    return this.apiPort.activateRufloMcp();
  }

  async deactivateMcp(): Promise<string> {
    return this.apiPort.deactivateRufloMcp();
  }

  async createSlashCommand(): Promise<string> {
    return this.apiPort.createRufloSlashCommand();
  }

  async initProject(path: string): Promise<string> {
    return this.apiPort.initRufloProject(path);
  }

  async getMemoryStats(): Promise<{ total: number; backend: string }> {
    const raw = await this.apiPort.getRufloMemoryStats();
    return {
      total: Number(raw.total ?? raw.total_entries ?? 0),
      backend: String(raw.backend ?? 'hybrid'),
    };
  }

  async syncMemoryLocal(destPath: string): Promise<string> {
    return this.apiPort.syncRufloMemoryLocal(destPath);
  }

  async consolidateMemory(): Promise<string> {
    return this.apiPort.consolidateRufloMemory();
  }

  async setMemoryBackend(backend: 'agentdb' | 'hnsw' | 'hybrid'): Promise<string> {
    return this.apiPort.setRufloMemoryBackend(backend);
  }
}

// ── Lazy singleton ─────────────────────────────────────────────────────────────
// Wires the real Tauri api adapter on first access.
// Pass a custom IRuFloApiPort to RuFloService constructor in tests instead.

let _singleton: RuFloService | null = null;

export function getRuFloService(): RuFloService {
  if (!_singleton) {
    // Dynamic import keeps the infrastructure adapter out of the domain module
    // graph at parse time. The adapter is created synchronously here because
    // getRuFloService() is only called from store action handlers (async context).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { api } = require('@/lib/api') as { api: IRuFloApiPort };
    _singleton = new RuFloService(api);
  }
  return _singleton;
}

/**
 * Legacy singleton export — kept so existing call-sites in store.ts compile
 * without changes. Resolves on first use via the lazy getter above.
 */
export const ruFloService: RuFloService = new Proxy({} as RuFloService, {
  get(_target, prop) {
    return (getRuFloService() as unknown as Record<string, unknown>)[prop as string];
  },
});
