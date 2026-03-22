/**
 * MCP bounded context — Repository interface and in-memory implementation.
 */

import type { ServerId } from './types';
import { MCPServerAggregate } from './types';

// ─── Repository interface ─────────────────────────────────────────────────

export interface IMCPRepository {
  getServer(id: ServerId): Promise<MCPServerAggregate | null>;
  findByName(name: string): Promise<MCPServerAggregate | null>;
  saveServer(server: MCPServerAggregate): Promise<void>;
  removeServer(id: ServerId): Promise<void>;
  listServers(): Promise<MCPServerAggregate[]>;
  listEnabledServers(): Promise<MCPServerAggregate[]>;
}

// ─── In-memory implementation ─────────────────────────────────────────────

export class InMemoryMCPRepository implements IMCPRepository {
  private readonly servers = new Map<string, MCPServerAggregate>();

  async getServer(id: ServerId): Promise<MCPServerAggregate | null> {
    return this.servers.get(id) ?? null;
  }

  async findByName(name: string): Promise<MCPServerAggregate | null> {
    for (const server of this.servers.values()) {
      if (server.name === name) {
        return server;
      }
    }
    return null;
  }

  async saveServer(server: MCPServerAggregate): Promise<void> {
    this.servers.set(server.id, server);
  }

  async removeServer(id: ServerId): Promise<void> {
    this.servers.delete(id);
  }

  async listServers(): Promise<MCPServerAggregate[]> {
    return Array.from(this.servers.values());
  }

  async listEnabledServers(): Promise<MCPServerAggregate[]> {
    return Array.from(this.servers.values()).filter(s => s.isEnabled);
  }

  /** Test helper: seed an aggregate directly without triggering any events. */
  seed(server: MCPServerAggregate): void {
    this.servers.set(server.id, server);
  }
}
