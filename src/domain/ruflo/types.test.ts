import { describe, it, expect } from 'vitest';
import {
  parseVersion,
  isFullyConfigured,
  isVersionSupported,
  swarmHealthLabel,
  toRuFloAgent,
  toRuFloInstallation,
  toRuFloProjectStatus,
} from './types';

describe('parseVersion', () => {
  it('parses X.Y.Z', () => {
    expect(parseVersion('3.5.42')).toEqual({ major: 3, minor: 5, patch: 42 });
  });

  it('parses vX.Y.Z', () => {
    expect(parseVersion('v3.0.0')).toEqual({ major: 3, minor: 0, patch: 0 });
  });

  it('returns null for invalid', () => {
    expect(parseVersion('not-a-version')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isVersionSupported', () => {
  it('true for 3.x.x', () => {
    expect(isVersionSupported('3.0.0')).toBe(true);
    expect(isVersionSupported('3.5.42')).toBe(true);
  });

  it('false for 2.x.x', () => {
    expect(isVersionSupported('2.9.9')).toBe(false);
  });

  it('false for null', () => {
    expect(isVersionSupported(null)).toBe(false);
  });
});

describe('isFullyConfigured', () => {
  it('true when installed, mcpActive, and slashCommandExists are all set', () => {
    expect(isFullyConfigured({
      installed: true, version: '3.5.0', mcpActive: true,
      slashCommandExists: true, isSupported: true,
    })).toBe(true);
  });

  it('false when MCP not active', () => {
    expect(isFullyConfigured({
      installed: true, version: '3.5.0', mcpActive: false,
      slashCommandExists: true, isSupported: true,
    })).toBe(false);
  });

  it('false when slashCommandExists is false', () => {
    expect(isFullyConfigured({
      installed: true, version: '3.5.0', mcpActive: true,
      slashCommandExists: false, isSupported: true,
    })).toBe(false);
  });

  it('false when not installed', () => {
    expect(isFullyConfigured({
      installed: false, version: null, mcpActive: false,
      slashCommandExists: false, isSupported: false,
    })).toBe(false);
  });
});

describe('swarmHealthLabel', () => {
  it('inactive when swarm not active', () => {
    expect(swarmHealthLabel({ active: false, agents: [], memoryEntries: 0 })).toBe('inactive');
  });

  it('healthy when active agents present', () => {
    expect(swarmHealthLabel({
      active: true,
      agents: [{ id: 'a1' as any, name: 'coder', agentType: 'coder', status: 'running', isActive: true }],
      memoryEntries: 5,
    })).toBe('healthy');
  });

  it('idle when active but no running agents', () => {
    expect(swarmHealthLabel({
      active: true,
      agents: [{ id: 'a1' as any, name: 'coder', agentType: 'coder', status: 'idle', isActive: false }],
      memoryEntries: 0,
    })).toBe('idle');
  });

  it('idle when active with empty agent list', () => {
    expect(swarmHealthLabel({ active: true, agents: [], memoryEntries: 0 })).toBe('idle');
  });
});

describe('toRuFloInstallation', () => {
  it('maps snake_case to camelCase', () => {
    const raw = { installed: true, version: '3.5.0', mcp_active: true, slash_command_exists: false, is_supported: true };
    const inst = toRuFloInstallation(raw as any);
    expect(inst.mcpActive).toBe(true);
    expect(inst.slashCommandExists).toBe(false);
    expect(inst.isSupported).toBe(true);
  });

  it('defaults isSupported to false when missing', () => {
    const raw = { installed: false, mcp_active: false, slash_command_exists: false };
    const inst = toRuFloInstallation(raw as any);
    expect(inst.isSupported).toBe(false);
  });

  it('defaults version to null when missing', () => {
    const raw = { installed: false, mcp_active: false, slash_command_exists: false };
    const inst = toRuFloInstallation(raw as any);
    expect(inst.version).toBeNull();
  });
});

describe('toRuFloAgent', () => {
  it('maps raw agent to domain agent', () => {
    const raw = { id: 'agent-1', name: 'coder-01', agent_type: 'coder', status: 'running' };
    const agent = toRuFloAgent(raw as any);
    expect(agent.id).toBe('agent-1');
    expect(agent.name).toBe('coder-01');
    expect(agent.agentType).toBe('coder');
    expect(agent.status).toBe('running');
    expect(agent.isActive).toBe(true);
  });

  it('sets isActive false for idle status', () => {
    const raw = { id: 'agent-2', name: 'tester-01', agent_type: 'tester', status: 'idle' };
    const agent = toRuFloAgent(raw as any);
    expect(agent.isActive).toBe(false);
  });

  it('defaults status to unknown when missing', () => {
    const raw = { id: 'agent-3', name: 'planner-01', agent_type: 'planner' };
    const agent = toRuFloAgent(raw as any);
    expect(agent.status).toBe('unknown');
    expect(agent.isActive).toBe(false);
  });
});

describe('toRuFloProjectStatus', () => {
  it('computes total as sum of pending + completed + blocked', () => {
    const raw = { initialized: true, pending: 3, completed: 10, blocked: 2 };
    const status = toRuFloProjectStatus(raw as any);
    expect(status.initialized).toBe(true);
    expect(status.pending).toBe(3);
    expect(status.completed).toBe(10);
    expect(status.blocked).toBe(2);
    expect(status.total).toBe(15);
  });

  it('total is zero when all counts are zero', () => {
    const raw = { initialized: false, pending: 0, completed: 0, blocked: 0 };
    const status = toRuFloProjectStatus(raw as any);
    expect(status.total).toBe(0);
  });
});
