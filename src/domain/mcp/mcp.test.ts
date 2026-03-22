/**
 * MCP bounded context — unit tests.
 */

import { describe, it, expect } from 'vitest';
import { ServerUrl, ServerName, MCPServerAggregate } from './types';
import { MCP_EVENT_TYPES } from './events';
import { InMemoryMCPRepository } from './repository';
import { toServerId } from './types';

// ─── 1. ServerUrl Value Object ────────────────────────────────────────────

describe('ServerUrl', () => {
  it('accepts a valid stdio URL', () => {
    const url = ServerUrl.create('/usr/local/bin/my-server', 'stdio');
    expect(url.value).toBe('/usr/local/bin/my-server');
    expect(url.transport).toBe('stdio');
  });

  it('accepts a valid SSE URL starting with http', () => {
    const url = ServerUrl.create('http://localhost:3000/sse', 'sse');
    expect(url.value).toBe('http://localhost:3000/sse');
  });

  it('throws when SSE URL does not start with http', () => {
    expect(() => ServerUrl.create('localhost:3000/sse', 'sse')).toThrow(
      'SSE URLs must start with http',
    );
  });

  it('throws for an empty URL', () => {
    expect(() => ServerUrl.create('   ', 'stdio')).toThrow('Server URL required');
  });
});

// ─── 2. ServerName Value Object ──────────────────────────────────────────

describe('ServerName', () => {
  it('throws when name exceeds 100 characters', () => {
    const longName = 'a'.repeat(101);
    expect(() => ServerName.create(longName)).toThrow(
      'Server name must be 1-100 characters',
    );
  });

  it('accepts a valid name and trims whitespace', () => {
    const name = ServerName.create('  my-server  ');
    expect(name.value).toBe('my-server');
  });
});

// ─── 3. MCPServerAggregate.add() ─────────────────────────────────────────

describe('MCPServerAggregate.add()', () => {
  it('raises a ServerAddedEvent', () => {
    const server = MCPServerAggregate.add('srv-1', 'My Server', 'stdio', '/bin/server');
    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_ADDED);
    expect(server.events[0].aggregateId).toBe('srv-1');
  });

  it('starts with status pending', () => {
    const server = MCPServerAggregate.add('srv-2', 'My Server', 'stdio', '/bin/server');
    expect(server.status).toBe('pending');
  });
});

// ─── 4. MCPServerAggregate.connect() ─────────────────────────────────────

describe('MCPServerAggregate.connect()', () => {
  it('raises a ServerStatusChangedEvent', () => {
    const server = MCPServerAggregate.add('srv-3', 'Server 3', 'stdio', '/bin/s3');
    server.clearEvents();

    server.connect();

    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_STATUS_CHANGED);
  });

  it('sets status to connected', () => {
    const server = MCPServerAggregate.add('srv-4', 'Server 4', 'stdio', '/bin/s4');
    server.connect();
    expect(server.status).toBe('connected');
    expect(server.isConnected).toBe(true);
  });
});

// ─── 5. MCPServerAggregate.enable() / disable() ──────────────────────────

describe('MCPServerAggregate enable/disable', () => {
  it('enable() raises ServerEnabledEvent after disable', () => {
    const server = MCPServerAggregate.add('srv-5', 'Server 5', 'stdio', '/bin/s5');
    server.disable(); // server starts enabled, so disable first
    server.clearEvents();

    server.enable();

    expect(server.events).toHaveLength(1);
    expect(server.events[0].type).toBe(MCP_EVENT_TYPES.SERVER_ENABLED);
    expect(server.isEnabled).toBe(true);
  });

  it('double enable() throws', () => {
    const server = MCPServerAggregate.add('srv-6', 'Server 6', 'stdio', '/bin/s6');
    // server is already enabled from add()
    expect(() => server.enable()).toThrow('already enabled');
  });
});

// ─── 6. InMemoryMCPRepository ─────────────────────────────────────────────

describe('InMemoryMCPRepository', () => {
  it('save and getServer round-trips the aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const server = MCPServerAggregate.add('repo-1', 'Repo Server', 'stdio', '/bin/r1');

    await repo.saveServer(server);
    const found = await repo.getServer(toServerId('repo-1'));

    expect(found).not.toBeNull();
    expect(found?.name).toBe('Repo Server');
  });

  it('findByName returns the correct aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const serverA = MCPServerAggregate.add('repo-a', 'Alpha', 'stdio', '/bin/alpha');
    const serverB = MCPServerAggregate.add('repo-b', 'Beta', 'sse', 'http://localhost/sse');

    await repo.saveServer(serverA);
    await repo.saveServer(serverB);

    const found = await repo.findByName('Beta');
    expect(found).not.toBeNull();
    expect(found?.id).toBe('repo-b');
  });

  it('listEnabledServers excludes disabled servers', async () => {
    const repo = new InMemoryMCPRepository();
    const enabled = MCPServerAggregate.add('e-1', 'Enabled', 'stdio', '/bin/enabled');
    const disabled = MCPServerAggregate.add('d-1', 'Disabled', 'stdio', '/bin/disabled');
    disabled.disable();

    await repo.saveServer(enabled);
    await repo.saveServer(disabled);

    const list = await repo.listEnabledServers();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Enabled');
  });

  it('removeServer deletes the aggregate', async () => {
    const repo = new InMemoryMCPRepository();
    const server = MCPServerAggregate.add('rem-1', 'ToRemove', 'stdio', '/bin/rm');
    await repo.saveServer(server);

    await repo.removeServer(toServerId('rem-1'));
    const found = await repo.getServer(toServerId('rem-1'));

    expect(found).toBeNull();
  });
});
