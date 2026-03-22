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
import { CommandId, SlashCommandEntry } from './types';
import type { CommandScopeValue, RawCommand, SelectionMethod } from './types';
import type { ICommandRepository } from './ports/ICommandRepository';

// ─── Query shapes ──────────────────────────────────────────────────────────

export interface ListCommandsQuery {
  scope?: CommandScopeValue;
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
      const registerResult = SlashCommandEntry.register(raw);
      if (!registerResult.ok) return Err(registerResult.error);
      const command = registerResult.value;
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
      const idResult = CommandId.create(id);
      if (!idResult.ok) return Err(idResult.error);
      const command = await this.repo.getById(idResult.value);
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
      const idResult = CommandId.create(id);
      if (!idResult.ok) return Err(idResult.error);
      const command = await this.repo.getById(idResult.value);
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
      const idResult = CommandId.create(id);
      if (!idResult.ok) return Err(idResult.error);
      const commandId = idResult.value;
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
      const idResult = CommandId.create(id);
      if (!idResult.ok) return Err(idResult.error);
      const command = await this.repo.getById(idResult.value);
      if (!command) return Err(`Command '${id}' not found`);
      return Ok(command);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  // ── Convenience API ───────────────────────────────────────────────────────
  //
  // Simpler entry-points for callers that do not have a full RawCommand.
  // Each delegates to the full-featured methods above.

  /**
   * Register a builtin slash command by name and description.
   *
   * Generates a synthetic id (name-derived) and constructs the minimal
   * RawCommand required by the aggregate.  An optional `handler` string
   * may be stored as the command's `content` field.
   *
   * @param name        - Command name (no whitespace, no '/').
   * @param description - Human-readable description.
   * @param handler     - Optional handler content / body string.
   * @returns Result<SlashCommandEntry>
   */
  async register(
    name: string,
    description: string,
    handler?: string,
  ): Promise<Result<SlashCommandEntry>> {
    const raw: RawCommand = {
      id: `builtin-${name}`,
      name,
      full_command: `/${name}`,
      scope: 'builtin',
      namespace: undefined,
      file_path: undefined,
      content: handler ?? '',
      description,
      allowed_tools: [],
      has_bash_commands: false,
      has_file_references: false,
      accepts_arguments: false,
    };
    return this.registerCommand(raw);
  }

  /**
   * Execute a command by name (looks up by full_command "/<name>").
   *
   * Records a successful execution with a zero-duration placeholder and
   * returns the updated aggregate.  Use `executeCommand(id, duration, success)`
   * for full control over execution recording.
   *
   * @param name - The bare command name (without leading '/').
   * @returns Result<SlashCommandEntry>
   */
  async execute(name: string): Promise<Result<SlashCommandEntry>> {
    try {
      const fullCommand = `/${name}`;
      const command = await this.repo.getByFullCommand(fullCommand);
      if (!command) return Err(`Command '${name}' not found`);
      command.recordExecution(0, true);
      await this.persist(command);
      return Ok(command);
    } catch (err) {
      return Err(err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * Delete a command by id.  Alias for `deleteCommand` with a cleaner name.
   *
   * @param id - The CommandId string.
   * @returns Result<void>
   */
  async delete(id: string): Promise<Result<void>> {
    return this.deleteCommand(id);
  }

  /**
   * Return all registered commands.  Alias for `listCommands({})`.
   *
   * @returns Result<SlashCommandEntry[]>
   */
  async listAll(): Promise<Result<SlashCommandEntry[]>> {
    return this.listCommands({});
  }
}
