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
import { MCPServerAggregate, ServerId } from './types';
import type { IMCPRepository } from './repository';

export class MCPApplicationService {
  constructor(
    private readonly repo: IMCPRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Private helpers ────────────────────────────────────────────────────────

  private async persist(server: MCPServerAggregate): Promise<void> {
    await this.repo.saveServer(server);
    this.eventBus.dispatch(server.events);
    server.clearEvents();
  }

  async addServer(
    id: string,
    name: string,
    transport: ServerTransport,
    url: string,
  ): Promise<Result<MCPServerAggregate>> {
    try {
      const addResult = MCPServerAggregate.add(id, name, transport, url);
      if (!addResult.ok) return addResult;
      const server = addResult.value;
      await this.persist(server);
      return Ok(server);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async removeServer(id: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.remove();
      await this.repo.removeServer(serverIdResult.value);
      this.eventBus.dispatch(server.events);
      server.clearEvents(); // events dispatched before physical removal
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async connectServer(id: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.connect();
      await this.persist(server);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async disconnectServer(id: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.disconnect();
      await this.persist(server);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async markServerError(id: string, reason: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      server.markError(reason);
      await this.persist(server);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async enableServer(id: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      const enableResult = server.enable();
      if (!enableResult.ok) return enableResult;
      await this.persist(server);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async disableServer(id: string): Promise<Result<void>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
      if (!server) {
        return Err(`Server not found: ${id}`);
      }
      const disableResult = server.disable();
      if (!disableResult.ok) return disableResult;
      await this.persist(server);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  async getServer(id: string): Promise<Result<MCPServerAggregate>> {
    const serverIdResult = ServerId.create(id);
    if (!serverIdResult.ok) return serverIdResult;
    try {
      const server = await this.repo.getServer(serverIdResult.value);
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

  async listEnabledServers(): Promise<Result<MCPServerAggregate[]>> {
    try {
      const servers = await this.repo.listEnabledServers();
      return Ok(servers);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
