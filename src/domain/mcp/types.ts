/**
 * MCP bounded context — Types, Value Objects, and Aggregate.
 *
 * All value objects and the aggregate use private constructors.
 * Static factory methods are the only construction paths.
 */

import type { DomainEvent } from '../shared/event-bus';
import type { Result } from '../shared/result';
import { Ok, Err } from '../shared/result';
import {
  makeServerAdded,
  makeServerEnabled,
  makeServerDisabled,
  makeServerRemoved,
  makeServerStatusChanged,
} from './events';

// ─── Branded ID ────────────────────────────────────────────────────────────

export type ServerId = string & { readonly _brand: 'ServerId' };

export function toServerId(id: string): Result<ServerId> {
  if (!id || !id.trim()) return Err('ServerId cannot be empty');
  return Ok(id as ServerId);
}

// ─── Scalar types ──────────────────────────────────────────────────────────

export type ServerTransport = 'stdio' | 'sse';
export type ServerStatusValue = 'connected' | 'disconnected' | 'error' | 'pending';

// ─── ServerUrl Value Object ───────────────────────────────────────────────

export class ServerUrl {
  private constructor(
    readonly value: string,
    readonly transport: ServerTransport,
  ) {}

  static create(url: string, transport: ServerTransport): Result<ServerUrl> {
    const trimmed = url.trim();
    if (!trimmed) {
      return Err('Server URL required');
    }
    if (transport === 'sse' && !trimmed.startsWith('http')) {
      return Err('SSE URLs must start with http');
    }
    return Ok(new ServerUrl(trimmed, transport));
  }

  equals(other: ServerUrl): boolean {
    return this.value === other.value && this.transport === other.transport;
  }
}

// ─── ServerName Value Object ──────────────────────────────────────────────

export class ServerName {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<ServerName> {
    const v = raw.trim();
    if (!v || v.length > 100) {
      return Err('Server name must be 1-100 characters');
    }
    return Ok(new ServerName(v));
  }
}

// ─── Raw snapshot shape ───────────────────────────────────────────────────

export interface RawMCPServer {
  id?: string;
  name: string;
  transport: ServerTransport;
  url?: string;
  command?: string;
  args?: string[];
  status?: ServerStatusValue;
  enabled?: boolean;
}

// ─── MCPServerAggregate ───────────────────────────────────────────────────

export class MCPServerAggregate {
  private constructor(
    readonly id: ServerId,
    private _name: ServerName,
    readonly transport: ServerTransport,
    private _url: ServerUrl,
    private _status: ServerStatusValue,
    private _enabled: boolean,
    private _events: DomainEvent[],
  ) {}

  // ── Static factories ──────────────────────────────────────────────────

  /**
   * Create a new server and raise a ServerAddedEvent.
   * Status starts as 'pending'.
   */
  static add(
    id: string,
    name: string,
    transport: ServerTransport,
    url: string,
  ): Result<MCPServerAggregate> {
    const serverIdResult = toServerId(id);
    if (!serverIdResult.ok) return serverIdResult;
    const serverId = serverIdResult.value;

    const nameResult = ServerName.create(name);
    if (!nameResult.ok) return nameResult;

    const urlResult = ServerUrl.create(url, transport);
    if (!urlResult.ok) return urlResult;

    const serverName = nameResult.value;
    const serverUrl = urlResult.value;

    const event = makeServerAdded(serverId, serverName.value, transport, serverUrl.value);

    return Ok(new MCPServerAggregate(
      serverId,
      serverName,
      transport,
      serverUrl,
      'pending',
      true,
      [event],
    ));
  }

  /**
   * Reconstruct from a persisted snapshot. Returns a Result — callers must
   * handle the Err case rather than catching a thrown exception.
   * No events are raised.
   */
  static tryFromSnapshot(raw: RawMCPServer): Result<MCPServerAggregate> {
    if (!raw.url && !raw.command) {
      return Err(`MCPServerAggregate: snapshot ${raw.id ?? raw.name} has neither url nor command`);
    }

    const serverIdResult = toServerId(raw.id ?? raw.name);
    if (!serverIdResult.ok) return serverIdResult;
    const serverId = serverIdResult.value;

    const nameResult = ServerName.create(raw.name);
    if (!nameResult.ok) return nameResult;

    const endpoint = (raw.url ?? raw.command) as string;
    const urlResult = ServerUrl.create(endpoint, raw.transport);
    if (!urlResult.ok) return urlResult;

    return Ok(new MCPServerAggregate(
      serverId,
      nameResult.value,
      raw.transport,
      urlResult.value,
      raw.status ?? 'disconnected',
      raw.enabled ?? true,
      [],
    ));
  }

  /**
   * Reconstruct from a persisted snapshot. Returns a Result — callers must
   * handle the Err case.
   * @deprecated Use tryFromSnapshot instead. Both now return Result<T>.
   */
  static fromSnapshot(raw: RawMCPServer): Result<MCPServerAggregate> {
    return MCPServerAggregate.tryFromSnapshot(raw);
  }

  // ── State transitions ─────────────────────────────────────────────────

  /** Transition pending/disconnected → connected. Idempotent if already connected. */
  connect(): void {
    if (this._status === 'connected') return; // idempotent
    const old = this._status;
    this._status = 'connected';
    this._events.push(makeServerStatusChanged(this.id, old, 'connected'));
  }

  /** Transition → disconnected. Idempotent if already disconnected. */
  disconnect(): void {
    if (this._status === 'disconnected') return; // idempotent
    const old = this._status;
    this._status = 'disconnected';
    this._events.push(makeServerStatusChanged(this.id, old, 'disconnected'));
  }

  /** Transition → error with a reason. */
  markError(reason: string): void {
    const old = this._status;
    this._status = 'error';
    this._events.push(makeServerStatusChanged(this.id, old, 'error', reason));
  }

  /** Enable the server. Returns Err if already enabled. */
  enable(): Result<void> {
    if (this._enabled) {
      return Err(`Server ${this._name.value} is already enabled`);
    }
    this._enabled = true;
    this._events.push(makeServerEnabled(this.id));
    return Ok(undefined);
  }

  /** Disable the server. Returns Err if already disabled. */
  disable(): Result<void> {
    if (!this._enabled) {
      return Err(`Server ${this._name.value} is already disabled`);
    }
    this._enabled = false;
    this._events.push(makeServerDisabled(this.id));
    return Ok(undefined);
  }

  /** Mark the server as removed. Raises ServerRemovedEvent. */
  remove(): void {
    this._events.push(makeServerRemoved(this.id, this._name.value));
  }

  // ── Getters ───────────────────────────────────────────────────────────

  get name(): string {
    return this._name.value;
  }

  get url(): string {
    return this._url.value;
  }

  get status(): ServerStatusValue {
    return this._status;
  }

  get isEnabled(): boolean {
    return this._enabled;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  get events(): ReadonlyArray<DomainEvent> {
    return this._events;
  }

  clearEvents(): void {
    this._events = [];
  }

  toSnapshot(): RawMCPServer {
    return {
      id: this.id,
      name: this._name.value,
      transport: this.transport,
      url: this._url.value,
      status: this._status,
      enabled: this._enabled,
    };
  }
}
