/**
 * MCP bounded context — Repository interface and in-memory implementation.
 *
 * IMCPRepository is the domain-facing port (defined in ./ports/IMCPRepository).
 */

import type { ServerId, RawMCPServer } from './types';
import { MCPServerAggregate } from './types';
import { MCPSnapshotQuantizer, QuantizedSnapshotStore } from '../shared/quantization';
import type { IMCPRepository } from './ports/IMCPRepository';

export type { IMCPRepository };

// ─── In-memory implementation ─────────────────────────────────────────────

export class InMemoryMCPRepository implements IMCPRepository {
  private readonly servers = new QuantizedSnapshotStore<RawMCPServer, string>(
    new MCPSnapshotQuantizer(),
  );

  async getServer(id: ServerId): Promise<MCPServerAggregate | null> {
    const snapshot = this.servers.get(id);
    if (!snapshot) return null;
    const result = MCPServerAggregate.tryFromSnapshot(snapshot);
    if (!result.ok) {
      console.warn(`[MCPRepository] Skipping corrupted snapshot for id="${id}": ${result.error}`);
      return null;
    }
    return result.value;
  }

  async findByName(name: string): Promise<MCPServerAggregate | null> {
    for (const snapshot of this.servers.values()) {
      if (snapshot.name !== name) continue;
      const result = MCPServerAggregate.tryFromSnapshot(snapshot);
      if (!result.ok) {
        console.warn(`[MCPRepository] Skipping corrupted snapshot for name="${name}": ${result.error}`);
        continue;
      }
      return result.value;
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
    const aggregates: MCPServerAggregate[] = [];
    for (const snapshot of this.servers.values()) {
      const result = MCPServerAggregate.tryFromSnapshot(snapshot);
      if (!result.ok) {
        console.warn(`[MCPRepository] Skipping corrupted snapshot: ${result.error}`);
        continue;
      }
      aggregates.push(result.value);
    }
    return aggregates;
  }

  async listEnabledServers(): Promise<MCPServerAggregate[]> {
    const servers = await this.listServers();
    return servers.filter((s) => s.isEnabled);
  }

  /** Test helper: seed an aggregate directly without triggering any events. */
  seed(server: MCPServerAggregate): void {
    this.servers.set(server.id, server.toSnapshot());
  }
}
