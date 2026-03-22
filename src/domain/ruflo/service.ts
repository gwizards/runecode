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
import { type Result, Ok, Err } from '../shared/result';

export class RuFloService {
  constructor(private readonly apiPort: IRuFloApiPort) {}

  async getInstallation(): Promise<Result<RuFloInstallation>> {
    try {
      const raw = await this.apiPort.checkRufloInstalled();
      return Ok(toRuFloInstallation(raw));
    } catch (e) {
      return Err(String(e));
    }
  }

  async getSwarmStatus(): Promise<Result<RuFloSwarm>> {
    try {
      const raw = await this.apiPort.getRufloSwarmStatus();
      return Ok(toRuFloSwarm(raw));
    } catch (e) {
      return Err(String(e));
    }
  }

  async getProjectStatus(path: string): Promise<Result<RuFloProjectStatus>> {
    try {
      const raw = await this.apiPort.getRufloProjectStatus(path);
      return Ok(toRuFloProjectStatus(raw));
    } catch (e) {
      return Err(String(e));
    }
  }

  async install(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.installRuflo());
    } catch (e) {
      return Err(String(e));
    }
  }

  async uninstall(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.uninstallRuflo());
    } catch (e) {
      return Err(String(e));
    }
  }

  async activateMcp(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.activateRufloMcp());
    } catch (e) {
      return Err(String(e));
    }
  }

  async deactivateMcp(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.deactivateRufloMcp());
    } catch (e) {
      return Err(String(e));
    }
  }

  async createSlashCommand(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.createRufloSlashCommand());
    } catch (e) {
      return Err(String(e));
    }
  }

  async initProject(path: string): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.initRufloProject(path));
    } catch (e) {
      return Err(String(e));
    }
  }

  async getMemoryStats(): Promise<Result<{ total: number; backend: string }>> {
    try {
      const raw = await this.apiPort.getRufloMemoryStats();
      return Ok({
        total: Number(raw.total ?? raw.total_entries ?? 0),
        backend: String(raw.backend ?? 'hybrid'),
      });
    } catch (e) {
      return Err(String(e));
    }
  }

  async syncMemoryLocal(destPath: string): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.syncRufloMemoryLocal(destPath));
    } catch (e) {
      return Err(String(e));
    }
  }

  async consolidateMemory(): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.consolidateRufloMemory());
    } catch (e) {
      return Err(String(e));
    }
  }

  async setMemoryBackend(backend: 'agentdb' | 'hnsw' | 'hybrid'): Promise<Result<string>> {
    try {
      return Ok(await this.apiPort.setRufloMemoryBackend(backend));
    } catch (e) {
      return Err(String(e));
    }
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
