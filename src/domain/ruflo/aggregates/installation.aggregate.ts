/**
 * RuFloInstallationAggregate — Aggregate root for RuFlo CLI installation state.
 *
 * Enforces installation state machine:
 *   not_installed → installed → mcp_active
 *
 * Events raised from within aggregate methods.
 */

import type { DomainEvent } from '../../shared/event-bus';
import type { RuFloInstallation } from '../types';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import {
  makeInstallationCompleted,
  makeInstallationFailed,
  makeMcpActivated,
  makeMemoryBackendChanged,
} from '../domain-events';

export type InstallationState = 'unknown' | 'not_installed' | 'installed' | 'mcp_active';

export class RuFloInstallationAggregate {
  private _state: InstallationState;
  private _version: string | undefined;
  private _isSupported: boolean;
  private _memoryBackend: 'agentdb' | 'hnsw' | 'hybrid';
  private _events: DomainEvent[] = [];

  private constructor(
    private readonly _id: string,
    state: InstallationState,
    version: string | undefined,
    isSupported: boolean,
    memoryBackend: 'agentdb' | 'hnsw' | 'hybrid',
  ) {
    this._state = state;
    this._version = version;
    this._isSupported = isSupported;
    this._memoryBackend = memoryBackend;
  }

  // ── Factory ───────────────────────────────────────────────────────────────

  /** Create a blank (unknown) installation state. */
  static unknown(id = 'ruflo-installation'): RuFloInstallationAggregate {
    return new RuFloInstallationAggregate(id, 'unknown', undefined, false, 'agentdb');
  }

  /** Reconstitute from existing RuFloInstallation snapshot. */
  static fromSnapshot(
    snapshot: RuFloInstallation,
    id = 'ruflo-installation',
  ): RuFloInstallationAggregate {
    let state: InstallationState = 'not_installed';
    if (snapshot.installed && snapshot.mcpActive) state = 'mcp_active';
    else if (snapshot.installed) state = 'installed';

    return new RuFloInstallationAggregate(
      id,
      state,
      snapshot.version ?? undefined,
      snapshot.isSupported,
      'agentdb',
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  get id(): string { return this._id; }
  get state(): InstallationState { return this._state; }
  get version(): string | undefined { return this._version; }
  get isInstalled(): boolean { return this._state !== 'not_installed' && this._state !== 'unknown'; }
  get isMcpActive(): boolean { return this._state === 'mcp_active'; }
  get isSupported(): boolean { return this._isSupported; }
  get memoryBackend(): 'agentdb' | 'hnsw' | 'hybrid' { return this._memoryBackend; }

  // ── Commands ──────────────────────────────────────────────────────────────

  /**
   * Mark installation as complete.
   * Returns Err if already installed or version is blank.
   */
  markInstalled(version: string, isSupported: boolean): Result<void> {
    if (this.isInstalled) return Err('Already installed');
    if (!version.trim()) return Err('Version string required');
    this._state = 'installed';
    this._version = version;
    this._isSupported = isSupported;
    this._events.push(makeInstallationCompleted(this._id, version, isSupported));
    return Ok(undefined);
  }

  /**
   * Mark installation as failed.
   */
  markFailed(reason: string): void {
    this._state = 'not_installed';
    this._events.push(makeInstallationFailed(this._id, reason));
  }

  /**
   * Activate MCP.
   * Returns Err if not installed first.
   */
  activateMcp(namespace: string): Result<void> {
    if (!this.isInstalled) return Err('Must be installed before activating MCP');
    this._state = 'mcp_active';
    this._events.push(makeMcpActivated(this._id, namespace));
    return Ok(undefined);
  }

  /**
   * Change the memory backend.
   * Returns Err if not installed.
   */
  setMemoryBackend(backend: 'agentdb' | 'hnsw' | 'hybrid'): Result<void> {
    if (!this.isInstalled) return Err('Must be installed before changing backend');
    const prev = this._memoryBackend;
    if (prev === backend) return Ok(undefined); // idempotent
    this._memoryBackend = backend;
    this._events.push(makeMemoryBackendChanged(this._id, backend, prev));
    return Ok(undefined);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  get events(): ReadonlyArray<DomainEvent> { return this._events; }
  clearEvents(): void { this._events = []; }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  toInstallation(): RuFloInstallation {
    return {
      installed: this.isInstalled,
      version: this._version ?? null,
      mcpActive: this.isMcpActive,
      slashCommandExists: this._state === 'mcp_active',
      isSupported: this._isSupported,
    };
  }
}
