/**
 * MCP bounded context — unit tests.
 */

import { describe, it, expect } from 'vitest';
import { ServerUrl, ServerName, MCPServerAggregate } from './types';
import { MCP_EVENT_TYPES } from './events';
import { InMemoryMCPRepository } from './repository';
import { toServerId } from './types';
import { unwrap } from '../shared/result';

// ─── 1. ServerUrl Value Object ────────────────────────────────────────────

describe('ServerUrl', () => {
  it('accepts a valid stdio URL', () => {
    const url = unwrap(ServerUrl.create('/usr/local/bin/my-server', 'stdio'));
    expect(url.value).toBe('/usr/local/bin/my-server');
    expect(url.transport).toBe('stdio');
  });

  it('accepts a valid SSE URL starting with http', () => {
    const url = unwrap(ServerUrl.create('http://localhost:3000/sse', 'sse'));
    expect(url.value).toBe('http://localhost:3000/sse');
  });

  it('returns Err when SSE URL does not start with http', () => {
    const result = ServerUrl.create('localhost:3000/sse', 'sse');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('SSE URLs must start with http');
  });

  it('returns Err for an empty URL', () => {
    const result = ServerUrl.create('   ', 'stdio');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Server URL required');
  });
});

// ─── 2. ServerName Value Object ──────────────────────────────────────────

describe('ServerName', () => {
  it('returns Err when name exceeds 100 characters', () => {
    const longName = 'a'.repeat(101);
    const result = ServerName.create(longName);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('Server name must be 1-100 characters');
  });

  it('accepts a valid name and trims whitespace', () => {
    const name = unwrap(ServerName.create('  my-server  '));
    expect(name.value).toBe('my-server');
  });
});

// ─── 3. MCPServerAggregate.add() ─────────────────────────────────────────

describe('MCPServerAggregate.add()', () => {
  it('raises a ServerAddedEvent', () => {
    const server = unwrap(MCPServerAggregate.add('srv-1', 'My Server', 'stdio', '/bin/server'));
    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_ADDED);
    expect(server.events[0].aggregateId).toBe('srv-1');
  });

  it('starts with status pending', () => {
    const server = unwrap(MCPServerAggregate.add('srv-2', 'My Server', 'stdio', '/bin/server'));
    expect(server.status).toBe('pending');
  });
});

// ─── 4. MCPServerAggregate.connect() ─────────────────────────────────────

describe('MCPServerAggregate.connect()', () => {
  it('raises a ServerStatusChangedEvent', () => {
    const server = unwrap(MCPServerAggregate.add('srv-3', 'Server 3', 'stdio', '/bin/s3'));
    server.clearEvents();

    server.connect();

    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_STATUS_CHANGED);
  });

  it('sets status to connected', () => {
    const server = unwrap(MCPServerAggregate.add('srv-4', 'Server 4', 'stdio', '/bin/s4'));
    server.connect();
    expect(server.status).toBe('connected');
    expect(server.isConnected).toBe(true);
  });
});

// ─── 5. MCPServerAggregate.enable() / disable() ──────────────────────────

describe('MCPServerAggregate enable/disable', () => {
  it('enable() raises ServerEnabledEvent after disable', () => {
    const server = unwrap(MCPServerAggregate.add('srv-5', 'Server 5', 'stdio', '/bin/s5'));
    unwrap(server.disable()); // server starts enabled, so disable first
    server.clearEvents();

    unwrap(server.enable());

    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_ENABLED);
    expect(server.isEnabled).toBe(true);
  });

  it('double enable() returns Err', () => {
    const server = unwrap(MCPServerAggregate.add('srv-6', 'Server 6', 'stdio', '/bin/s6'));
    // server is already enabled from add()
    const result = server.enable();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/already enabled/i);
  });
});

// ─── 6. InMemoryMCPRepository ─────────────────────────────────────────────

describe('InMemoryMCPRepository', () => {
  it('save and getServer round-trips the aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const server = unwrap(MCPServerAggregate.add('repo-1', 'Repo Server', 'stdio', '/bin/r1'));

    await repo.saveServer(server);
    const found = await repo.getServer(unwrap(toServerId('repo-1')));

    expect(found).not.toBeNull();
    expect(found?.name).toBe('Repo Server');
  });

  it('findByName returns the correct aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const serverA = unwrap(MCPServerAggregate.add('repo-a', 'Alpha', 'stdio', '/bin/alpha'));
    const serverB = unwrap(MCPServerAggregate.add('repo-b', 'Beta', 'sse', 'http://localhost/sse'));

    await repo.saveServer(serverA);
    await repo.saveServer(serverB);

    const found = await repo.findByName('Beta');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('repo-b');
  });

  it('listEnabledServers excludes disabled servers', async () => {
    const repo = new InMemoryMCPRepository();
    const enabled = unwrap(MCPServerAggregate.add('e-1', 'Enabled', 'stdio', '/bin/enabled'));
    const disabled = unwrap(MCPServerAggregate.add('d-1', 'Disabled', 'stdio', '/bin/disabled'));
    unwrap(disabled.disable());

    await repo.saveServer(enabled);
    await repo.saveServer(disabled);

    const list = await repo.listEnabledServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Enabled');
  });

  it('removeServer deletes the aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const server = unwrap(MCPServerAggregate.add('rem-1', 'ToRemove', 'stdio', '/bin/rm'));
    await repo.saveServer(server);

    await repo.removeServer(unwrap(toServerId('rem-1')));
    const found = await repo.getServer(unwrap(toServerId('rem-1')));

    expect(found).toBeNull();
  });
});
