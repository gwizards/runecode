/**
 * MCP bounded context — Value Object and Aggregate edge-case tests.
 *
 * Focuses on gaps not covered by mcp.test.ts:
 *   - ServerId value object (valid/invalid/equality)
 *   - ServerName edge cases (empty, boundary length)
 *   - ServerUrl equality
 *   - MCPServerAggregate.tryFromSnapshot with valid/invalid data
 *   - Aggregate state transitions: disconnect, markError, remove
 *   - toSnapshot round-trip
 */

import { describe, it, expect } from 'vitest';
import {
  ServerId,
  ServerName,
  ServerUrl,
  MCPServerAggregate,
} from './types';
import type { RawMCPServer } from './types';
import { unwrap } from '../shared/result';

// ─── ServerId ────────────────────────────────────────────────────────────────

describe('ServerId', () => {
  it('creates from a valid non-empty string', () => {
    const r = ServerId.create('srv-001');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('srv-001');
  });

  it('trims whitespace', () => {
    const r = ServerId.create('  srv-002  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('srv-002');
  });

  it('returns Err for empty string', () => {
    const r = ServerId.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = ServerId.create('   ');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('generate() produces unique values', () => {
    const a = ServerId.generate();
    const b = ServerId.generate();
    expect(a.value).not.toBe(b.value);
  });

  it('equals() returns true for same value', () => {
    const a = unwrap(ServerId.create('same'));
    const b = unwrap(ServerId.create('same'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(ServerId.create('one'));
    const b = unwrap(ServerId.create('two'));
    expect(a.equals(b)).toBe(false);
  });

  it('toString() returns the inner value', () => {
    const id = unwrap(ServerId.create('my-server'));
    expect(id.toString()).toBe('my-server');
  });
});

// ─── ServerName edge cases ───────────────────────────────────────────────────

describe('ServerName (edge cases)', () => {
  it('returns Err for empty string', () => {
    const r = ServerName.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('1-100');
  });

  it('returns Err for whitespace-only string', () => {
    const r = ServerName.create('   ');
    expect(r.ok).toBe(false);
  });

  it('accepts exactly 100 characters', () => {
    const r = ServerName.create('a'.repeat(100));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('a'.repeat(100));
  });

  it('accepts a single character', () => {
    const r = ServerName.create('X');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('X');
  });

  it('handles special characters in name', () => {
    const r = ServerName.create('my-server_v2.0 (beta)');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('my-server_v2.0 (beta)');
  });
});

// ─── ServerUrl equality ──────────────────────────────────────────────────────

describe('ServerUrl.equals()', () => {
  it('returns true for same url and transport', () => {
    const a = unwrap(ServerUrl.create('/bin/server', 'stdio'));
    const b = unwrap(ServerUrl.create('/bin/server', 'stdio'));
    expect(a.equals(b)).toBe(true);
  });

  it('returns false when urls differ', () => {
    const a = unwrap(ServerUrl.create('/bin/a', 'stdio'));
    const b = unwrap(ServerUrl.create('/bin/b', 'stdio'));
    expect(a.equals(b)).toBe(false);
  });

  it('returns false when transports differ', () => {
    const a = unwrap(ServerUrl.create('http://localhost/sse', 'sse'));
    const b = unwrap(ServerUrl.create('http://localhost/sse', 'stdio'));
    expect(a.equals(b)).toBe(false);
  });
});

// ─── MCPServerAggregate.tryFromSnapshot ──────────────────────────────────────

describe('MCPServerAggregate.tryFromSnapshot()', () => {
  const validSnapshot: RawMCPServer = {
    id: 'snap-1',
    name: 'Snapshot Server',
    transport: 'stdio',
    url: '/bin/server',
    status: 'connected',
    enabled: true,
  };

  it('reconstructs from a valid snapshot', () => {
    const r = MCPServerAggregate.tryFromSnapshot(validSnapshot);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe('Snapshot Server');
    expect(r.value.status).toBe('connected');
    expect(r.value.isEnabled).toBe(true);
  });

  it('raises no events on reconstruction', () => {
    const r = MCPServerAggregate.tryFromSnapshot(validSnapshot);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.events).toHaveLength(0);
  });

  it('defaults status to disconnected when not provided', () => {
    const snap: RawMCPServer = { name: 'No Status', transport: 'stdio', url: '/bin/ns' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.status).toBe('disconnected');
  });

  it('defaults enabled to true when not provided', () => {
    const snap: RawMCPServer = { name: 'No Enabled', transport: 'stdio', url: '/bin/ne' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isEnabled).toBe(true);
  });

  it('uses name as id fallback when id is not provided', () => {
    const snap: RawMCPServer = { name: 'FallbackId', transport: 'stdio', url: '/bin/fb' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.id.toString()).toBe('FallbackId');
  });

  it('uses command as endpoint when url is absent', () => {
    const snap: RawMCPServer = { name: 'CmdServer', transport: 'stdio', command: '/usr/bin/cmd' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.url).toBe('/usr/bin/cmd');
  });

  it('returns Err when both url and command are absent', () => {
    const snap: RawMCPServer = { name: 'NoEndpoint', transport: 'stdio' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('neither url nor command');
  });

  it('returns Err when name is empty', () => {
    const snap: RawMCPServer = { name: '', transport: 'stdio', url: '/bin/x' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(false);
  });

  it('returns Err for SSE transport with non-http url', () => {
    const snap: RawMCPServer = { name: 'BadSSE', transport: 'sse', url: '/local/path' };
    const r = MCPServerAggregate.tryFromSnapshot(snap);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('SSE URLs must start with http');
  });

  it('fromSnapshot() is an alias for tryFromSnapshot()', () => {
    const r1 = MCPServerAggregate.tryFromSnapshot(validSnapshot);
    const r2 = MCPServerAggregate.fromSnapshot(validSnapshot);
    expect(r1.ok).toBe(r2.ok);
    if (r1.ok && r2.ok) {
      expect(r1.value.name).toBe(r2.value.name);
    }
  });
});

// ─── MCPServerAggregate state transitions ────────────────────────────────────

describe('MCPServerAggregate.disconnect()', () => {
  it('transitions to disconnected and raises event', () => {
    const server = unwrap(MCPServerAggregate.add('d-1', 'Disc', 'stdio', '/bin/d'));
    server.connect();
    server.clearEvents();

    server.disconnect();

    expect(server.status).toBe('disconnected');
    expect(server.isConnected).toBe(false);
    expect(server.events).toHaveLength(1);
  });

  it('is idempotent when already disconnected', () => {
    const server = unwrap(MCPServerAggregate.tryFromSnapshot({
      name: 'Already Disc', transport: 'stdio', url: '/bin/ad', status: 'disconnected',
    }));

    server.disconnect();

    expect(server.events).toHaveLength(0);
  });
});

describe('MCPServerAggregate.markError()', () => {
  it('transitions to error status', () => {
    const server = unwrap(MCPServerAggregate.add('e-1', 'ErrSrv', 'stdio', '/bin/e'));
    server.clearEvents();

    server.markError('connection refused');

    expect(server.status).toBe('error');
    expect(server.events).toHaveLength(1);
  });
});

describe('MCPServerAggregate.connect() idempotency', () => {
  it('does not raise event when already connected', () => {
    const server = unwrap(MCPServerAggregate.add('c-1', 'ConnSrv', 'stdio', '/bin/c'));
    server.connect();
    server.clearEvents();

    server.connect(); // second call

    expect(server.events).toHaveLength(0);
    expect(server.isConnected).toBe(true);
  });
});

describe('MCPServerAggregate.remove()', () => {
  it('raises ServerRemovedEvent', () => {
    const server = unwrap(MCPServerAggregate.add('r-1', 'RemSrv', 'stdio', '/bin/r'));
    server.clearEvents();

    server.remove();

    expect(server.events).toHaveLength(1);
  });
});

describe('MCPServerAggregate.disable()', () => {
  it('returns Err when already disabled', () => {
    const server = unwrap(MCPServerAggregate.add('dd-1', 'DblDisable', 'stdio', '/bin/dd'));
    unwrap(server.disable());
    const result = server.disable();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already disabled/i);
  });
});

// ─── toSnapshot round-trip ───────────────────────────────────────────────────

describe('MCPServerAggregate.toSnapshot()', () => {
  it('produces a plain object with all fields', () => {
    const server = unwrap(MCPServerAggregate.add('snap-rt', 'RoundTrip', 'sse', 'http://localhost/sse'));
    server.connect();

    const snap = server.toSnapshot();

    expect(snap.id).toBe('snap-rt');
    expect(snap.name).toBe('RoundTrip');
    expect(snap.transport).toBe('sse');
    expect(snap.url).toBe('http://localhost/sse');
    expect(snap.status).toBe('connected');
    expect(snap.enabled).toBe(true);
  });

  it('round-trips through tryFromSnapshot', () => {
    const original = unwrap(MCPServerAggregate.add('snap-rt2', 'RT2', 'stdio', '/bin/rt2'));
    original.connect();
    unwrap(original.disable());

    const snap = original.toSnapshot();
    const restored = unwrap(MCPServerAggregate.tryFromSnapshot(snap));

    expect(restored.name).toBe(original.name);
    expect(restored.status).toBe(original.status);
    expect(restored.isEnabled).toBe(original.isEnabled);
    expect(restored.url).toBe(original.url);
  });
});

// ─── MCPServerAggregate.add() validation ─────────────────────────────────────

describe('MCPServerAggregate.add() validation', () => {
  it('returns Err for empty id', () => {
    const r = MCPServerAggregate.add('', 'Name', 'stdio', '/bin/x');
    expect(r.ok).toBe(false);
  });

  it('returns Err for empty name', () => {
    const r = MCPServerAggregate.add('id-1', '', 'stdio', '/bin/x');
    expect(r.ok).toBe(false);
  });

  it('returns Err for empty url', () => {
    const r = MCPServerAggregate.add('id-1', 'Name', 'stdio', '');
    expect(r.ok).toBe(false);
  });

  it('returns Err for SSE with non-http url', () => {
    const r = MCPServerAggregate.add('id-1', 'Name', 'sse', '/local/path');
    expect(r.ok).toBe(false);
  });
});
