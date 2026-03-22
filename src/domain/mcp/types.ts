/**
 * MCP bounded context — Types, Value Objects, and Aggregate.
 *
 * All value objects and the aggregate use private constructors.
 * Static factory methods are the only construction paths.
 */

import type { DomainEvent } from '../shared/event-bus';
import {
  makeServerAdded,
  makeServerEnabled,
  makeServerDisabled,
  makeServerRemoved,
  makeServerStatusChanged,
} from './events';

// ─── Branded ID ────────────────────────────────────────────────────────────

export type ServerId = string & { readonly _brand: 'ServerId' };

export function toServerId(id: string): ServerId {
  return id as ServerId;
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

  static create(url: string, transport: ServerTransport): ServerUrl {
    const trimmed = url.trim();
    if (!trimmed) {
      throw new Error('Server URL required');
    }
    if (transport === 'sse' && !trimmed.startsWith('http')) {
      throw new Error('SSE URLs must start with http');
    }
    return new ServerUrl(trimmed, transport);
  }

  equals(other: ServerUrl): boolean {
    return this.value === other.value && this.transport === other.transport;
  }
}

// ─── ServerName Value Object ──────────────────────────────────────────────

export class ServerName {
  private constructor(readonly value: string) {}

  static create(raw: string): ServerName {
    const v = raw.trim();
    if (!v || v.length > 100) {
      throw new Error('Server name must be 1-100 characters');
    }
    return new ServerName(v);
  }
}

// ─── Raw snapshot shape ───────────────────────────────────────────────────

export interface RawMCPServer {
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
  ): MCPServerAggregate {
    const serverId = toServerId(id);
    const serverName = ServerName.create(name);
    const serverUrl = ServerUrl.create(url, transport);

    const event = makeServerAdded(serverId, serverName.value, transport, serverUrl.value);

    return new MCPServerAggregate(
      serverId,
      serverName,
      transport,
      serverUrl,
      'pending',
      true,
      [event],
    );
  }

  /**
   * Reconstruct from a persisted snapshot. id = raw.name. No events raised.
   */
  static fromSnapshot(raw: RawMCPServer): MCPServerAggregate {
    const serverId = toServerId(raw.name);
    const serverName = ServerName.create(raw.name);
    const urlStr = raw.url ?? raw.command ?? '';
    const serverUrl = ServerUrl.create(urlStr || '_placeholder', raw.transport);

    return new MCPServerAggregate(
      serverId,
      serverName,
      raw.transport,
      serverUrl,
      raw.status ?? 'disconnected',
      raw.enabled ?? true,
      [],
    );
  }

  // ── State transitions ─────────────────────────────────────────────────

  /** Transition pending/disconnected → connected. */
  connect(): void {
    const old = this._status;
    this._status = 'connected';
    this._events.push(makeServerStatusChanged(this.id, old, 'connected'));
  }

  /** Transition → disconnected. */
  disconnect(): void {
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

  /** Enable the server. Throws if already enabled. */
  enable(): void {
    if (this._enabled) {
      throw new Error(`Server ${this._name.value} is already enabled`);
    }
    this._enabled = true;
    this._events.push(makeServerEnabled(this.id));
  }

  /** Disable the server. Throws if already disabled. */
  disable(): void {
    if (!this._enabled) {
      throw new Error(`Server ${this._name.value} is already disabled`);
    }
    this._enabled = false;
    this._events.push(makeServerDisabled(this.id));
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
      name: this._name.value,
      transport: this.transport,
      url: this._url.value,
      status: this._status,
      enabled: this._enabled,
    };
  }
}
