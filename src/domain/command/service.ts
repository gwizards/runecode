/**
 * Command bounded context — Application Service.
 *
 * Orchestrates domain operations: load aggregate → call domain method →
 * persist → dispatch events → clear events → return Result.
 *
 * This layer is the only caller of ICommandRepository and DomainEventBus.
 * All methods return Result<T> and never throw.
 */

import type { DomainEventBus } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import { toCommandId, SlashCommandEntry } from './types';
import type { CommandScope, RawCommand, SelectionMethod } from './types';
import type { ICommandRepository } from './repository';

// ─── Query shapes ──────────────────────────────────────────────────────────

export interface ListCommandsQuery {
  scope?: CommandScope;
  namespace?: string;
}

// ─── Application Service ───────────────────────────────────────────────────

export class CommandApplicationService {
  constructor(
    private readonly repo: ICommandRepository,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ── Private helpers ───────────────────────────────────────────────────────

  private async persist(command: SlashCommandEntry): Promise<void> {
    await this.repo.save(command);
    this.eventBus.dispatch(command.events);
    command.clearEvents();
  }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Register a new slash command.
   * Guards against duplicate fullCommand values.
   * Returns the new aggregate on success.
   */
  async registerCommand(raw: RawCommand): Promise<Result<SlashCommandEntry>> {
    try {
      const existing = await this.repo.getByFullCommand(raw.full_command);
      if (existing) {
        return Err(
          `Command with full_command "${raw.full_command}" is already registered`,
        );
      }
      const command = SlashCommandEntry.register(raw);
      await this.persist(command);
      return Ok(command);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Record a user selection event on an existing command.
   * Returns the updated aggregate on success.
   */
  async selectCommand(
    id: string,
    method: SelectionMethod,
  ): Promise<Result<SlashCommandEntry>> {
    try {
      const command = await this.repo.getById(toCommandId(id));
      if (!command) return Err(`Command '${id}' not found`);
      command.select(method);
      await this.persist(command);
      return Ok(command);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Record the result of executing a command.
   */
  async executeCommand(
    id: string,
    durationMs: number,
    success: boolean,
  ): Promise<Result<void>> {
    try {
      const command = await this.repo.getById(toCommandId(id));
      if (!command) return Err(`Command '${id}' not found`);
      command.recordExecution(durationMs, success);
      await this.persist(command);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Soft-delete a command: raises COMMAND_DELETED then removes from repository.
   */
  async deleteCommand(id: string): Promise<Result<void>> {
    try {
      const commandId = toCommandId(id);
      const command = await this.repo.getById(commandId);
      if (!command) return Err(`Command '${id}' not found`);
      command.markDeleted();
      // Dispatch delete event before removing from store
      this.eventBus.dispatch(command.events);
      command.clearEvents();
      await this.repo.delete(commandId);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * List commands, optionally filtered by scope and/or namespace.
   */
  async listCommands(query: ListCommandsQuery): Promise<Result<SlashCommandEntry[]>> {
    try {
      let results: SlashCommandEntry[];
      if (query.scope !== undefined) {
        results = await this.repo.listByScope(query.scope);
      } else {
        results = await this.repo.listAll();
      }
      if (query.namespace !== undefined) {
        results = results.filter((c) => c.namespace === query.namespace);
      }
      return Ok(results);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Return a single command by id.
   */
  async getCommand(id: string): Promise<Result<SlashCommandEntry>> {
    try {
      const command = await this.repo.getById(toCommandId(id));
      if (!command) return Err(`Command '${id}' not found`);
      return Ok(command);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }
}
