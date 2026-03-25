/**
 * Safe parsers for external data that may change format.
 * Never crash -- always return a usable default or null.
 */

import type { SlashCommand } from './api';

export interface SafeSlashCommand {
  name: string;
  full_command: string;
  description: string;
  scope: string;
  namespace: string;
  has_bash_commands: boolean;
  has_file_references: boolean;
  accepts_arguments: boolean;
}

export function safeParseCommand(raw: unknown): SafeSlashCommand | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const name = String(obj.name || obj.command || obj.id || '').replace(/^\//, '');
    if (!name) return null;
    return {
      name,
      full_command: String(obj.full_command || obj.fullCommand || `/${name}`),
      description: String(obj.description || obj.desc || obj.help || ''),
      scope: String(obj.scope || obj.type || 'default'),
      namespace: String(obj.namespace || obj.category || obj.plugin || 'system'),
      has_bash_commands: Boolean(obj.has_bash_commands || obj.hasBash || false),
      has_file_references: Boolean(obj.has_file_references || obj.hasFiles || false),
      accepts_arguments: Boolean(obj.accepts_arguments || obj.acceptsArgs || obj.args || false),
    };
  } catch {
    return null;
  }
}

/**
 * Convert a SafeSlashCommand into a full SlashCommand with default fields.
 */
export function toSlashCommand(safe: SafeSlashCommand, idPrefix: string = 'dynamic'): SlashCommand {
  return {
    id: `${idPrefix}-${safe.name}`,
    name: safe.name,
    full_command: safe.full_command,
    description: safe.description,
    scope: safe.scope,
    namespace: safe.namespace,
    file_path: '',
    content: '',
    allowed_tools: [],
    has_bash_commands: safe.has_bash_commands,
    has_file_references: safe.has_file_references,
    accepts_arguments: safe.accepts_arguments,
  };
}

export interface SafeSkill {
  name: string;
  description: string;
}

export function safeParseSkill(raw: unknown): SafeSkill | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const name = String(obj.name || '');
    if (!name) return null;
    return {
      name,
      description: String(obj.description || obj.desc || ''),
    };
  } catch {
    return null;
  }
}

