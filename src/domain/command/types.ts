/**
 * Command bounded context — Core types and SlashCommandEntry aggregate.
 *
 * Follows DDD aggregate pattern: private constructor, static factory,
 * domain methods that raise DomainEvents, snapshot for persistence.
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeCommandRegistered,
  makeCommandSelected,
  makeCommandExecuted,
  makeCommandDeleted,
} from './events';

// ─── Branded ID ────────────────────────────────────────────────────────────

export type CommandId = string & { readonly _brand: 'CommandId' };

export function toCommandId(id: string): CommandId {
  if (!id || !id.trim()) throw new Error('CommandId cannot be empty');
  return id as CommandId;
}

// ─── Value Object: CommandName ─────────────────────────────────────────────

export type CommandName = string & { readonly _brand: 'CommandName' };

/**
 * Validate and brand a raw string as a CommandName.
 * Rules: 1-64 chars, no whitespace, no '/'.
 */
export function toCommandName(name: string): CommandName {
  if (!name || name.length === 0) {
    throw new Error('CommandName cannot be empty');
  }
  if (name.length > 64) {
    throw new Error('CommandName must be 64 characters or fewer');
  }
  if (/\s/.test(name)) {
    throw new Error('CommandName must not contain whitespace');
  }
  if (name.includes('/')) {
    throw new Error('CommandName must not contain "/"');
  }
  return name as CommandName;
}

// ─── Value Object: CommandScope ────────────────────────────────────────────

export type CommandScope = 'builtin' | 'user' | 'project' | 'skill';

const VALID_SCOPES: ReadonlySet<string> = new Set(['builtin', 'user', 'project', 'skill']);

export function toCommandScope(s: string): CommandScope {
  if (!VALID_SCOPES.has(s)) {
    throw new Error(`Invalid CommandScope: "${s}". Must be one of: builtin, user, project, skill`);
  }
  return s as CommandScope;
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
 */
export function makeCommandCapabilities(raw: RawCommandCapabilities): CommandCapabilities {
  if (raw.hasBashCommands && raw.allowedTools.length === 0) {
    throw new Error(
      'CommandCapabilities invariant violation: hasBashCommands=true requires allowedTools.length > 0',
    );
  }
  return {
    hasBashCommands: raw.hasBashCommands,
    hasFileReferences: raw.hasFileReferences,
    acceptsArguments: raw.acceptsArguments,
    allowedTools: [...raw.allowedTools],
  };
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
  scope: CommandScope;
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
   */
  static register(raw: RawCommand): SlashCommandEntry {
    if (!raw.full_command.startsWith('/')) {
      throw new Error(
        `SlashCommandEntry invariant: full_command must start with "/", got "${raw.full_command}"`,
      );
    }
    const scope = toCommandScope(raw.scope);
    if (scope === 'builtin' && raw.file_path) {
      throw new Error(
        'SlashCommandEntry invariant: builtin commands must not have a filePath',
      );
    }
    const capabilities = makeCommandCapabilities({
      hasBashCommands: raw.has_bash_commands,
      hasFileReferences: raw.has_file_references,
      acceptsArguments: raw.accepts_arguments,
      allowedTools: raw.allowed_tools,
    });

    const id = toCommandId(raw.id);
    const name = toCommandName(raw.name);
    const now = Date.now();

    const entry = new SlashCommandEntry(
      id,
      name,
      raw.full_command,
      scope,
      raw.namespace,
      raw.file_path,
      raw.content,
      raw.description,
      capabilities,
      now,
      [],
    );

    entry._events.push(makeCommandRegistered(id, name, scope));
    return entry;
  }

  /**
   * Reconstitute a SlashCommandEntry from a persisted snapshot.
   * Does not raise any events.
   */
  static fromSnapshot(raw: RawCommandSnapshot): SlashCommandEntry {
    const capabilities = makeCommandCapabilities({
      hasBashCommands: raw.capabilities.hasBashCommands,
      hasFileReferences: raw.capabilities.hasFileReferences,
      acceptsArguments: raw.capabilities.acceptsArguments,
      allowedTools: [...raw.capabilities.allowedTools],
    });
    return new SlashCommandEntry(
      toCommandId(raw.id),
      toCommandName(raw.name),
      raw.fullCommand,
      raw.scope,
      raw.namespace,
      raw.filePath,
      raw.content,
      raw.description,
      capabilities,
      raw.registeredAt,
      [],
    );
  }

  // ── Domain commands ───────────────────────────────────────────────────────

  /**
   * Record that the user selected this command and raise COMMAND_SELECTED.
   */
  select(method: SelectionMethod): void {
    this._events.push(makeCommandSelected(this._id, method));
  }

  /**
   * Record the outcome of a command execution and raise COMMAND_EXECUTED.
   */
  recordExecution(durationMs: number, success: boolean): void {
    this._events.push(makeCommandExecuted(this._id, durationMs, success));
  }

  /**
   * Mark this command as deleted and raise COMMAND_DELETED.
   */
  markDeleted(): void {
    this._events.push(makeCommandDeleted(this._id));
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  get id(): CommandId {
    return this._id;
  }

  get name(): string {
    return this._name;
  }

  get fullCommand(): string {
    return this._fullCommand;
  }

  get scope(): CommandScope {
    return this._scope;
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
      id: this._id,
      name: this._name,
      fullCommand: this._fullCommand,
      scope: this._scope,
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
