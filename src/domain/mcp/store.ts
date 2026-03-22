/**
 * MCP bounded context — Zustand UI store.
 *
 * Thin adapter: translates UI actions into MCPApplicationService calls
 * and surfaces state for React components.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { ServerTransport } from './types';
import { MCPServerAggregate } from './types';
import { InMemoryMCPRepository } from './repository';
import { MCPApplicationService } from './service';

// ─── Singleton service ────────────────────────────────────────────────────

const _repo = new InMemoryMCPRepository();
const _service = new MCPApplicationService(_repo, globalEventBus);

// ─── Store shape ──────────────────────────────────────────────────────────

export interface MCPStoreState {
  servers: MCPServerAggregate[];
  loading: boolean;
  error: string | null;

  loadServers(): Promise<void>;
  addServer(name: string, transport: ServerTransport, url: string): Promise<void>;
  removeServer(id: string): Promise<void>;
  connectServer(id: string): Promise<void>;
  disconnectServer(id: string): Promise<void>;
  markServerError(id: string, reason: string): Promise<void>;
  enableServer(id: string): Promise<void>;
  disableServer(id: string): Promise<void>;
}

// ─── Store implementation ─────────────────────────────────────────────────

export const useMCPStore = create<MCPStoreState>((set) => ({
  servers: [],
  loading: false,
  error: null,

  async loadServers() {
    set({ loading: true, error: null });
    const result = await _service.listServers();
    if (result.ok) {
      set({ servers: result.value, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },

  async addServer(name: string, transport: ServerTransport, url: string) {
    set({ loading: true, error: null });
    const result = await _service.addServer(crypto.randomUUID(), name, transport, url);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value, loading: false });
      } else {
        set({ loading: false });
      }
    } else {
      set({ error: result.error, loading: false });
    }
  },

  async removeServer(id: string) {
    set({ loading: true, error: null });
    const result = await _service.removeServer(id);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value, loading: false });
      } else {
        set({ loading: false });
      }
    } else {
      set({ error: result.error, loading: false });
    }
  },

  async connectServer(id: string) {
    set({ error: null });
    const result = await _service.connectServer(id);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value });
      }
    } else {
      set({ error: result.error });
    }
  },

  async disconnectServer(id: string) {
    set({ error: null });
    const result = await _service.disconnectServer(id);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value });
      }
    } else {
      set({ error: result.error });
    }
  },

  async markServerError(id: string, reason: string) {
    set({ error: null });
    const result = await _service.markServerError(id, reason);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value });
      }
    } else {
      set({ error: result.error });
    }
  },

  async enableServer(id: string) {
    set({ error: null });
    const result = await _service.enableServer(id);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value });
      }
    } else {
      set({ error: result.error });
    }
  },

  async disableServer(id: string) {
    set({ error: null });
    const result = await _service.disableServer(id);
    if (result.ok) {
      const listResult = await _service.listServers();
      if (listResult.ok) {
        set({ servers: listResult.value });
      }
    } else {
      set({ error: result.error });
    }
  },
}));
