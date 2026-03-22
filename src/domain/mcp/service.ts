/**
 * MCP bounded context — Application Service.
 *
 * Orchestrates domain operations: load → mutate → save → dispatch events.
 * All methods return Result<T> so callers never need to catch.
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import type { ServerTransport } from './types';
import { MCPServerAggregate, toServerId } from './types';
import type { IMCPRepository } from './repository';

export class MCPApplicationService {
  constructor(
    private readonly repo: IMCPRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  async addServer(
    id: string,
    name: string,
    transport: ServerTransport,
    url: string,
  ): Promise<Result<MCPServerAggregate>> {
    try {
      const server = MCPServerAggregate.add(id, name, transport, url);
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(server);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async removeServer(id: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.remove();
      await this.repo.removeServer(serverId);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async connectServer(id: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.connect();
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async disconnectServer(id: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.disconnect();
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async markServerError(id: string, reason: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.markError(reason);
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async enableServer(id: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.enable();
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async disableServer(id: string): Promise<Result<void>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.disable();
      await this.repo.saveServer(server);
      this.eventBus.dispatch(server.events);
      server.clearEvents();
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async getServer(id: string): Promise<Result<MCPServerAggregate>> {
    try {
      const serverId = toServerId(id);
      const server = await this.repo.getServer(serverId);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      return Ok(server);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async listServers(): Promise<Result<MCPServerAggregate[]>> {
    try {
      const servers = await this.repo.listServers();
      return Ok(servers);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
