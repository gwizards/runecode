/**
 * MCP bounded context — Repository port (domain-facing interface).
 *
 * Application services depend on this interface; concrete implementations
 * (InMemoryMCPRepository, Tauri backend, etc.) are injected at runtime.
 */

import type { ServerId } from '../types';
import type { MCPServerAggregate } from '../types';

export interface IMCPRepository {
  getServer(id: ServerId): Promise<MCPServerAggregate | null>;
  findByName(name: string): Promise<MCPServerAggregate | null>;
  saveServer(server: MCPServerAggregate): Promise<void>;
  removeServer(id: ServerId): Promise<void>;
  listServers(): Promise<MCPServerAggregate[]>;
  listEnabledServers(): Promise<MCPServerAggregate[]>;
}
