/**
 * MCP bounded context — Repository interface and in-memory implementation.
 */

import type { ServerId, RawMCPServer } from './types';
import { MCPServerAggregate } from './types';
import { MCPSnapshotQuantizer, QuantizedSnapshotStore } from '../shared/quantization';

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
  private readonly servers = new QuantizedSnapshotStore<RawMCPServer, string>(
    new MCPSnapshotQuantizer(),
  );

  async getServer(id: ServerId): Promise<MCPServerAggregate | null> {
    const snapshot = this.servers.get(id);
    if (!snapshot) return null;
    return MCPServerAggregate.fromSnapshot(snapshot);
  }

  async findByName(name: string): Promise<MCPServerAggregate | null> {
    for (const snapshot of this.servers.values()) {
      if (snapshot.name === name) return MCPServerAggregate.fromSnapshot(snapshot);
    }
    return null;
  }

  async saveServer(server: MCPServerAggregate): Promise<void> {
    this.servers.set(server.id, server.toSnapshot());
  }

  async removeServer(id: ServerId): Promise<void> {
    this.servers.delete(id);
  }

  async listServers(): Promise<MCPServerAggregate[]> {
    return this.servers.values().map(MCPServerAggregate.fromSnapshot);
  }

  async listEnabledServers(): Promise<MCPServerAggregate[]> {
    return this.servers.values()
      .map(MCPServerAggregate.fromSnapshot)
      .filter((s) => s.isEnabled);
  }

  /** Test helper: seed an aggregate directly without triggering any events. */
  seed(server: MCPServerAggregate): void {
    this.servers.set(server.id, server.toSnapshot());
  }
}
