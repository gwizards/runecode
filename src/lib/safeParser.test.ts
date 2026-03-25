/**
 * Unit tests for the safeParser utility module.
 *
 * Covers safeParseCommand, toSlashCommand, and safeParseSkill.
 */

import { describe, it, expect } from 'vitest';
import { safeParseCommand, toSlashCommand, safeParseSkill } from './safeParser';

// ─── safeParseCommand ────────────────────────────────────────────────────────

describe('safeParseCommand', () => {
  it('returns null for null input', () => {
    expect(safeParseCommand(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(safeParseCommand(undefined)).toBeNull();
  });

  it('returns null for a primitive string', () => {
    expect(safeParseCommand('hello')).toBeNull();
  });

  it('returns null for a number', () => {
    expect(safeParseCommand(42)).toBeNull();
  });

  it('returns null for an empty object (no name)', () => {
    expect(safeParseCommand({})).toBeNull();
  });

  it('parses a minimal command object with name', () => {
    const result = safeParseCommand({ name: 'test' });
    expect(result).not.toBeNull();
    expect(result!.name).toBe('test');
    expect(result!.full_command).toBe('/test');
    expect(result!.description).toBe('');
  });

  it('strips leading slash from name', () => {
    const result = safeParseCommand({ name: '/commit' });
    expect(result!.name).toBe('commit');
  });

  it('falls back to command field when name is absent', () => {
    const result = safeParseCommand({ command: 'deploy' });
    expect(result!.name).toBe('deploy');
  });

  it('falls back to id field when name and command are absent', () => {
    const result = safeParseCommand({ id: 'build' });
    expect(result!.name).toBe('build');
  });

  it('uses full_command when provided', () => {
    const result = safeParseCommand({ name: 'x', full_command: '/x --verbose' });
    expect(result!.full_command).toBe('/x --verbose');
  });

  it('uses fullCommand (camelCase) as fallback for full_command', () => {
    const result = safeParseCommand({ name: 'x', fullCommand: '/x --dry' });
    expect(result!.full_command).toBe('/x --dry');
  });

  it('reads description from desc fallback', () => {
    const result = safeParseCommand({ name: 'x', desc: 'A description' });
    expect(result!.description).toBe('A description');
  });

  it('reads description from help fallback', () => {
    const result = safeParseCommand({ name: 'x', help: 'Help text' });
    expect(result!.description).toBe('Help text');
  });

  it('reads scope from type fallback', () => {
    const result = safeParseCommand({ name: 'x', type: 'global' });
    expect(result!.scope).toBe('global');
  });

  it('reads namespace from category fallback', () => {
    const result = safeParseCommand({ name: 'x', category: 'tools' });
    expect(result!.namespace).toBe('tools');
  });

  it('reads namespace from plugin fallback', () => {
    const result = safeParseCommand({ name: 'x', plugin: 'my-plugin' });
    expect(result!.namespace).toBe('my-plugin');
  });

  it('parses boolean flags correctly', () => {
    const result = safeParseCommand({
      name: 'x',
      has_bash_commands: true,
      has_file_references: true,
      accepts_arguments: true,
    });
    expect(result!.has_bash_commands).toBe(true);
    expect(result!.has_file_references).toBe(true);
    expect(result!.accepts_arguments).toBe(true);
  });

  it('defaults boolean flags to false', () => {
    const result = safeParseCommand({ name: 'x' });
    expect(result!.has_bash_commands).toBe(false);
    expect(result!.has_file_references).toBe(false);
    expect(result!.accepts_arguments).toBe(false);
  });

  it('reads camelCase boolean fallbacks', () => {
    const result = safeParseCommand({
      name: 'x',
      hasBash: true,
      hasFiles: true,
      acceptsArgs: true,
    });
    expect(result!.has_bash_commands).toBe(true);
    expect(result!.has_file_references).toBe(true);
    expect(result!.accepts_arguments).toBe(true);
  });

  it('returns a complete SafeSlashCommand for a fully populated input', () => {
    const result = safeParseCommand({
      name: 'deploy',
      full_command: '/deploy --prod',
      description: 'Deploy to production',
      scope: 'admin',
      namespace: 'infra',
      has_bash_commands: true,
      has_file_references: false,
      accepts_arguments: true,
    });
    expect(result).toEqual({
      name: 'deploy',
      full_command: '/deploy --prod',
      description: 'Deploy to production',
      scope: 'admin',
      namespace: 'infra',
      has_bash_commands: true,
      has_file_references: false,
      accepts_arguments: true,
    });
  });
});

// ─── toSlashCommand ──────────────────────────────────────────────────────────

describe('toSlashCommand', () => {
  it('converts a SafeSlashCommand to a full SlashCommand with defaults', () => {
    const safe = {
      name: 'test',
      full_command: '/test',
      description: 'Test command',
      scope: 'default',
      namespace: 'system',
      has_bash_commands: false,
      has_file_references: false,
      accepts_arguments: false,
    };
    const result = toSlashCommand(safe);
    expect(result.id).toBe('dynamic-test');
    expect(result.file_path).toBe('');
    expect(result.content).toBe('');
    expect(result.allowed_tools).toEqual([]);
    expect(result.name).toBe('test');
  });

  it('uses the provided idPrefix', () => {
    const safe = {
      name: 'build',
      full_command: '/build',
      description: '',
      scope: 'default',
      namespace: 'system',
      has_bash_commands: false,
      has_file_references: false,
      accepts_arguments: false,
    };
    const result = toSlashCommand(safe, 'custom');
    expect(result.id).toBe('custom-build');
  });
});

// ─── safeParseSkill ──────────────────────────────────────────────────────────

describe('safeParseSkill', () => {
  it('returns null for null input', () => {
    expect(safeParseSkill(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(safeParseSkill(undefined)).toBeNull();
  });

  it('returns null for a non-object', () => {
    expect(safeParseSkill('text')).toBeNull();
  });

  it('returns null for an object without name', () => {
    expect(safeParseSkill({ description: 'something' })).toBeNull();
  });

  it('returns null for an object with empty name', () => {
    expect(safeParseSkill({ name: '' })).toBeNull();
  });

  it('parses a valid skill', () => {
    const result = safeParseSkill({ name: 'commit', description: 'Auto-commit' });
    expect(result).toEqual({ name: 'commit', description: 'Auto-commit' });
  });

  it('uses desc as fallback for description', () => {
    const result = safeParseSkill({ name: 'review', desc: 'Code review' });
    expect(result!.description).toBe('Code review');
  });

  it('defaults description to empty string', () => {
    const result = safeParseSkill({ name: 'lint' });
    expect(result!.description).toBe('');
  });
});
