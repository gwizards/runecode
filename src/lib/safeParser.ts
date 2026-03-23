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

export function safeParseCommand(raw: any): SafeSlashCommand | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || raw.command || raw.id || '').replace(/^\//, '');
    if (!name) return null;
    return {
      name,
      full_command: String(raw.full_command || raw.fullCommand || `/${name}`),
      description: String(raw.description || raw.desc || raw.help || ''),
      scope: String(raw.scope || raw.type || 'default'),
      namespace: String(raw.namespace || raw.category || raw.plugin || 'system'),
      has_bash_commands: Boolean(raw.has_bash_commands || raw.hasBash || false),
      has_file_references: Boolean(raw.has_file_references || raw.hasFiles || false),
      accepts_arguments: Boolean(raw.accepts_arguments || raw.acceptsArgs || raw.args || false),
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

export function safeParseSkill(raw: any): SafeSkill | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || '');
    if (!name) return null;
    return {
      name,
      description: String(raw.description || raw.desc || ''),
    };
  } catch {
    return null;
  }
}

