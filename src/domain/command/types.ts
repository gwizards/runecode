/**
 * Command bounded context — Core types and SlashCommandEntry aggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factory,
 * domain methods that raise DomainEvents, snapshot for persistence.
 *
 * All validation is expressed through Result<T>; no factory or method throws.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  makeCommandRegistered,
  makeCommandSelected,
  makeCommandExecuted,
  makeCommandDeleted,
} from './events';

// ─── Value Object: CommandId ────────────────────────────────────────────────

export class CommandId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<CommandId> {
    if (!raw || !raw.trim()) return Err('CommandId cannot be empty');
    return Ok(new CommandId(raw.trim()));
  }

  /** Unsafe cast used only when the caller already validated the string. */
  static unsafeFrom(raw: string): CommandId {
    return new CommandId(raw);
  }

  equals(other: CommandId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /** Allow direct string comparison via valueOf so branded-string comparisons still work. */
  valueOf(): string {
    return this.value;
  }
}

// ─── Value Object: CommandName ─────────────────────────────────────────────

export class CommandName {
  private constructor(readonly value: string) {}

  /**
   * Validate and construct a CommandName.
   * Rules: 1-64 chars, no whitespace, no '/'.
   */
  static create(raw: string): Result<CommandName> {
    if (!raw || raw.length === 0) {
      return Err('CommandName cannot be empty');
    }
    if (raw.length > 64) {
      return Err('CommandName must be 64 characters or fewer');
    }
    if (/\s/.test(raw)) {
      return Err('CommandName must not contain whitespace');
    }
    if (raw.includes('/')) {
      return Err('CommandName must not contain "/"');
    }
    return Ok(new CommandName(raw));
  }

  /** Unsafe cast used only when the caller already validated the string. */
  static unsafeFrom(raw: string): CommandName {
    return new CommandName(raw);
  }

  equals(other: CommandName): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }
}

// ─── Value Object: CommandScope ────────────────────────────────────────────

export type CommandScopeValue = 'builtin' | 'user' | 'project' | 'skill';

const VALID_SCOPES: ReadonlySet<string> = new Set(['builtin', 'user', 'project', 'skill']);

export class CommandScope {
  private constructor(readonly value: CommandScopeValue) {}

  static create(raw: string): Result<CommandScope> {
    if (!VALID_SCOPES.has(raw)) {
      return Err(
        `Invalid CommandScope: "${raw}". Must be one of: builtin, user, project, skill`,
      );
    }
    return Ok(new CommandScope(raw as CommandScopeValue));
  }

  /** Unsafe cast — only for snapshots that are already validated on write. */
  static unsafeFrom(raw: CommandScopeValue): CommandScope {
    return new CommandScope(raw);
  }

  equals(other: CommandScope): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }
}

// ─── Value Object: SelectionMethod ────────────────────────────────────────

export type SelectionMethod = 'click' | 'keyboard' | 'autocomplete';

// ─── Value Object: CommandCapabilities ────────────────────────────────────

export interface CommandCapabilities {
  readonly hasBashCommands: boolean;
  readonly hasFileReferences: boolean;
  readonly acceptsArguments: boolean;
  readonly allowedTools: ReadonlyArray<string>;
}

export interface RawCommandCapabilities {
  hasBashCommands: boolean;
  hasFileReferences: boolean;
  acceptsArguments: boolean;
  allowedTools: string[];
}

/**
 * Validate and construct a CommandCapabilities value object.
 * Invariant: hasBashCommands=true requires at least one allowedTool.
 * Returns Result<CommandCapabilities> — never throws.
 */
export function makeCommandCapabilities(
  raw: RawCommandCapabilities,
): Result<CommandCapabilities> {
  if (raw.hasBashCommands && raw.allowedTools.length === 0) {
    return Err(
      'CommandCapabilities invariant violation: hasBashCommands=true requires allowedTools.length > 0',
    );
  }
  return Ok({
    hasBashCommands: raw.hasBashCommands,
    hasFileReferences: raw.hasFileReferences,
    acceptsArguments: raw.acceptsArguments,
    allowedTools: [...raw.allowedTools],
  });
}

// ─── Raw shapes ────────────────────────────────────────────────────────────

/**
 * Wire shape from the API (mirrors src/lib/api.ts SlashCommand).
 * Used as the input to SlashCommandEntry.register().
 */
export interface RawCommand {
  id: string;
  name: string;
  full_command: string;
  scope: string;
  namespace?: string;
  file_path?: string;
  content: string;
  description?: string;
  allowed_tools: string[];
  has_bash_commands: boolean;
  has_file_references: boolean;
  accepts_arguments: boolean;
}

/**
 * Full snapshot shape for persistence (round-trips losslessly through toSnapshot / fromSnapshot).
 */
export interface RawCommandSnapshot {
  id: string;
  name: string;
  fullCommand: string;
  scope: CommandScopeValue;
  namespace: string | undefined;
  filePath: string | undefined;
  content: string;
  description: string | undefined;
  capabilities: {
    hasBashCommands: boolean;
    hasFileReferences: boolean;
    acceptsArguments: boolean;
    allowedTools: string[];
  };
  registeredAt: number;
}

// ─── SlashCommandEntry aggregate ───────────────────────────────────────────

export class SlashCommandEntry {
  private constructor(
    private readonly _id: CommandId,
    private readonly _name: CommandName,
    private readonly _fullCommand: string,
    private readonly _scope: CommandScope,
    private readonly _namespace: string | undefined,
    private readonly _filePath: string | undefined,
    private readonly _content: string,
    private readonly _description: string | undefined,
    private _capabilities: CommandCapabilities,
    private readonly _registeredAt: number,
    private _events: DomainEvent[],
  ) {}

  // ── Static factories ──────────────────────────────────────────────────────

  /**
   * Register a new slash command from raw API data and raise COMMAND_REGISTERED.
   *
   * Invariants enforced:
   *   - fullCommand must start with '/'
   *   - builtin scope commands must have no filePath
   *   - CommandCapabilities invariants (see makeCommandCapabilities)
   *
   * Returns Result<SlashCommandEntry> — never throws.
   */
  static register(raw: RawCommand): Result<SlashCommandEntry> {
    if (!raw.full_command.startsWith('/')) {
      return Err(
        `SlashCommandEntry invariant: full_command must start with "/", got "${raw.full_command}"`,
      );
    }

    const scopeResult = CommandScope.create(raw.scope);
    if (!scopeResult.ok) return Err(scopeResult.error);
    const scope = scopeResult.value;

    if (scope.value === 'builtin' && raw.file_path) {
      return Err('SlashCommandEntry invariant: builtin commands must not have a filePath');
    }

    const capsResult = makeCommandCapabilities({
      hasBashCommands: raw.has_bash_commands,
      hasFileReferences: raw.has_file_references,
      acceptsArguments: raw.accepts_arguments,
      allowedTools: raw.allowed_tools,
    });
    if (!capsResult.ok) return Err(capsResult.error);

    const idResult = CommandId.create(raw.id);
    if (!idResult.ok) return Err(idResult.error);

    const nameResult = CommandName.create(raw.name);
    if (!nameResult.ok) return Err(nameResult.error);

    const now = Date.now();
    const entry = new SlashCommandEntry(
      idResult.value,
      nameResult.value,
      raw.full_command,
      scope,
      raw.namespace,
      raw.file_path,
      raw.content,
      raw.description,
      capsResult.value,
      now,
      [],
    );

    entry._events.push(
      makeCommandRegistered(idResult.value.value, nameResult.value.value, scope.value),
    );
    return Ok(entry);
  }

  /**
   * Reconstitute a SlashCommandEntry from a persisted snapshot.
   * Does not raise any events.
   * Returns Result<SlashCommandEntry> — never throws.
   */
  static fromSnapshot(raw: RawCommandSnapshot): Result<SlashCommandEntry> {
    const capsResult = makeCommandCapabilities({
      hasBashCommands: raw.capabilities.hasBashCommands,
      hasFileReferences: raw.capabilities.hasFileReferences,
      acceptsArguments: raw.capabilities.acceptsArguments,
      allowedTools: [...raw.capabilities.allowedTools],
    });
    if (!capsResult.ok) return Err(capsResult.error);

    const idResult = CommandId.create(raw.id);
    if (!idResult.ok) return Err(idResult.error);

    const nameResult = CommandName.create(raw.name);
    if (!nameResult.ok) return Err(nameResult.error);

    return Ok(
      new SlashCommandEntry(
        idResult.value,
        nameResult.value,
        raw.fullCommand,
        CommandScope.unsafeFrom(raw.scope),
        raw.namespace,
        raw.filePath,
        raw.content,
        raw.description,
        capsResult.value,
        raw.registeredAt,
        [],
      ),
    );
  }

  // ── Domain commands ───────────────────────────────────────────────────────

  /**
   * Record that the user selected this command and raise COMMAND_SELECTED.
   */
  select(method: SelectionMethod): void {
    this._events.push(makeCommandSelected(this._id.value, method));
  }

  /**
   * Record the outcome of a command execution and raise COMMAND_EXECUTED.
   */
  recordExecution(durationMs: number, success: boolean): void {
    this._events.push(makeCommandExecuted(this._id.value, durationMs, success));
  }

  /**
   * Mark this command as deleted and raise COMMAND_DELETED.
   */
  markDeleted(): void {
    this._events.push(makeCommandDeleted(this._id.value));
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get id(): CommandId {
    return this._id;
  }

  get name(): string {
    return this._name.value;
  }

  get fullCommand(): string {
    return this._fullCommand;
  }

  get scope(): CommandScopeValue {
    return this._scope.value;
  }

  get namespace(): string | undefined {
    return this._namespace;
  }

  get filePath(): string | undefined {
    return this._filePath;
  }

  get content(): string {
    return this._content;
  }

  get description(): string | undefined {
    return this._description;
  }

  get capabilities(): CommandCapabilities {
    return this._capabilities;
  }

  get registeredAt(): number {
    return this._registeredAt;
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  clearEvents(): void {
    this._events = [];
  }

  toSnapshot(): RawCommandSnapshot {
    return {
      id: this._id.value,
      name: this._name.value,
      fullCommand: this._fullCommand,
      scope: this._scope.value,
      namespace: this._namespace,
      filePath: this._filePath,
      content: this._content,
      description: this._description,
      capabilities: {
        hasBashCommands: this._capabilities.hasBashCommands,
        hasFileReferences: this._capabilities.hasFileReferences,
        acceptsArguments: this._capabilities.acceptsArguments,
        allowedTools: [...this._capabilities.allowedTools],
      },
      registeredAt: this._registeredAt,
    };
  }
}
