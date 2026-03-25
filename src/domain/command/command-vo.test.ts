/**
 * Command bounded context — Value Object unit tests for secondary VOs.
 *
 * Groups:
 *  1. CommandDescription      (5 tests)
 *  2. CommandCategory         (5 tests)
 *  3. makeCommandCapabilities (4 tests)
 *  4. CommandId.equals/valueOf (3 tests)
 *  5. CommandName.equals/valueOf (3 tests)
 *  6. CommandScope.equals/valueOf (3 tests)
 */

import { describe, it, expect } from 'vitest';

import { CommandDescription, CommandCategory } from './value-objects/command-description';
import { CommandId, CommandName, CommandScope, makeCommandCapabilities } from './types';
import { unwrap } from '../shared/result';

// ─── 1. CommandDescription ───────────────────────────────────────────────────

describe('CommandDescription', () => {
  it('creates from a valid string', () => {
    const r = CommandDescription.create('Run optimization pass');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('Run optimization pass');
  });

  it('accepts empty string (description is optional)', () => {
    const r = CommandDescription.create('');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('');
  });

  it('returns Err when exceeding 500 characters', () => {
    const r = CommandDescription.create('a'.repeat(501));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('500');
  });

  it('accepts exactly 500 characters', () => {
    const r = CommandDescription.create('a'.repeat(500));
    expect(r.ok).toBe(true);
  });

  it('empty() returns a description with empty string value', () => {
    const desc = CommandDescription.empty();
    expect(desc.value).toBe('');
    expect(desc.toString()).toBe('');
  });
});

// ─── 2. CommandCategory ──────────────────────────────────────────────────────

describe('CommandCategory', () => {
  it('creates from a valid string and lowercases it', () => {
    const r = CommandCategory.create('Optimization');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('optimization');
  });

  it('returns Err for empty string', () => {
    const r = CommandCategory.create('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('empty');
  });

  it('returns Err for whitespace-only string', () => {
    const r = CommandCategory.create('   ');
    expect(r.ok).toBe(false);
  });

  it('trims whitespace', () => {
    const r = CommandCategory.create('  build  ');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.value).toBe('build');
  });

  it('general() returns "general"', () => {
    const cat = CommandCategory.general();
    expect(cat.value).toBe('general');
    expect(cat.toString()).toBe('general');
  });
});

// ─── 3. makeCommandCapabilities ──────────────────────────────────────────────

describe('makeCommandCapabilities', () => {
  it('creates valid capabilities without bash commands', () => {
    const r = makeCommandCapabilities({
      hasBashCommands: false,
      hasFileReferences: true,
      acceptsArguments: true,
      allowedTools: [],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hasFileReferences).toBe(true);
    expect(r.value.acceptsArguments).toBe(true);
  });

  it('creates valid capabilities with bash commands and allowedTools', () => {
    const r = makeCommandCapabilities({
      hasBashCommands: true,
      hasFileReferences: false,
      acceptsArguments: false,
      allowedTools: ['Bash', 'Read'],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.hasBashCommands).toBe(true);
    expect(r.value.allowedTools).toEqual(['Bash', 'Read']);
  });

  it('returns Err when hasBashCommands=true but allowedTools is empty', () => {
    const r = makeCommandCapabilities({
      hasBashCommands: true,
      hasFileReferences: false,
      acceptsArguments: false,
      allowedTools: [],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('hasBashCommands=true');
  });

  it('returns a defensive copy of allowedTools (mutation-safe)', () => {
    const tools = ['Bash'];
    const r = makeCommandCapabilities({
      hasBashCommands: true,
      hasFileReferences: false,
      acceptsArguments: false,
      allowedTools: tools,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    tools.push('Injected');
    expect(r.value.allowedTools).toEqual(['Bash']);
  });
});

// ─── 4. CommandId.equals / valueOf ───────────────────────────────────────────

describe('CommandId equality and valueOf', () => {
  it('equals() returns true for same value', () => {
    const a = unwrap(CommandId.create('cmd-eq'));
    const b = unwrap(CommandId.create('cmd-eq'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(CommandId.create('cmd-a'));
    const b = unwrap(CommandId.create('cmd-b'));
    expect(a.equals(b)).toBe(false);
  });

  it('valueOf() returns the string value for comparisons', () => {
    const id = unwrap(CommandId.create('cmd-val'));
    expect(id.valueOf()).toBe('cmd-val');
  });

  it('unsafeFrom creates without validation', () => {
    const id = CommandId.unsafeFrom('any-raw-string');
    expect(id.value).toBe('any-raw-string');
  });
});

// ─── 5. CommandName.equals / valueOf ─────────────────────────────────────────

describe('CommandName equality and valueOf', () => {
  it('equals() returns true for same value', () => {
    const a = unwrap(CommandName.create('optimize'));
    const b = unwrap(CommandName.create('optimize'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different values', () => {
    const a = unwrap(CommandName.create('optimize'));
    const b = unwrap(CommandName.create('build'));
    expect(a.equals(b)).toBe(false);
  });

  it('valueOf() returns the string value', () => {
    const name = unwrap(CommandName.create('deploy'));
    expect(name.valueOf()).toBe('deploy');
  });

  it('accepts exactly 64 characters', () => {
    const r = CommandName.create('a'.repeat(64));
    expect(r.ok).toBe(true);
  });

  it('unsafeFrom creates without validation', () => {
    const name = CommandName.unsafeFrom('spaces allowed here');
    expect(name.value).toBe('spaces allowed here');
  });
});

// ─── 6. CommandScope.equals / valueOf ────────────────────────────────────────

describe('CommandScope equality and valueOf', () => {
  it('equals() returns true for same scope', () => {
    const a = unwrap(CommandScope.create('builtin'));
    const b = unwrap(CommandScope.create('builtin'));
    expect(a.equals(b)).toBe(true);
  });

  it('equals() returns false for different scopes', () => {
    const a = unwrap(CommandScope.create('builtin'));
    const b = unwrap(CommandScope.create('user'));
    expect(a.equals(b)).toBe(false);
  });

  it('valueOf() returns the string value', () => {
    const scope = unwrap(CommandScope.create('project'));
    expect(scope.valueOf()).toBe('project');
  });

  it('unsafeFrom creates without validation', () => {
    const scope = CommandScope.unsafeFrom('skill');
    expect(scope.value).toBe('skill');
  });
});
