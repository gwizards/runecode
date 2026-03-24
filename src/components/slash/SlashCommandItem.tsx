/**
 * SlashCommandItem — renders a single slash command suggestion button in the
 * SlashCommandPicker list. Handles both default and custom command variants.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import type { SlashCommand } from '@/lib/api';
import {
  Terminal,
  Globe,
  FolderOpen,
  Zap,
  FileCode,
  Command,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers shared with SlashCommandPicker
// ---------------------------------------------------------------------------

export const getCommandIcon = (command: SlashCommand) => {
  if (command.has_bash_commands) return Terminal;
  if (command.has_file_references) return FileCode;
  if (command.accepts_arguments) return Zap;
  if (command.scope === "project") return FolderOpen;
  if (command.scope === "user") return Globe;
  return Command;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SlashCommandItemProps {
  command: SlashCommand;
  index: number;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

export const SlashCommandItem: React.FC<SlashCommandItemProps> = ({
  command,
  index,
  selectedIndex,
  onSelect,
  onHover,
}) => {
  const Icon = getCommandIcon(command);
  const isSelected = index === selectedIndex;

  return (
    <button
      data-index={index}
      onClick={() => onSelect(command)}
      onMouseEnter={() => onHover(index)}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2 rounded-md",
        "hover:bg-accent/50 transition-colors",
        "text-left",
        isSelected && "bg-accent/50"
      )}
      style={isSelected ? {
        borderLeft: '2px solid var(--color-purple-500)',
        backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)',
      } : undefined}
    >
      <Icon className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-medium">{command.full_command}</span>
          <span
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)',
              color: 'var(--color-purple-400)',
            }}
          >
            {command.scope}
          </span>
        </div>
        {command.description && (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {command.description}
          </p>
        )}
      </div>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Custom variant — used in the Custom tab (shows more metadata)
// ---------------------------------------------------------------------------

interface SlashCommandItemCustomProps {
  command: SlashCommand;
  globalIndex: number;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

export const SlashCommandItemCustom: React.FC<SlashCommandItemCustomProps> = ({
  command,
  globalIndex,
  selectedIndex,
  onSelect,
  onHover,
}) => {
  const Icon = getCommandIcon(command);
  const isSelected = globalIndex === selectedIndex;

  return (
    <button
      data-index={globalIndex}
      onClick={() => onSelect(command)}
      onMouseEnter={() => onHover(globalIndex)}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2 rounded-md",
        "hover:bg-accent/50 transition-colors",
        "text-left",
        isSelected && "bg-accent/50"
      )}
      style={isSelected ? {
        borderLeft: '2px solid var(--color-purple-500)',
        backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)',
      } : undefined}
    >
      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm text-primary">{command.full_command}</span>
          {command.accepts_arguments && (
            <span className="text-xs text-muted-foreground">[args]</span>
          )}
        </div>
        {command.description && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{command.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1">
          {command.allowed_tools.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {command.allowed_tools.length} tool{command.allowed_tools.length === 1 ? '' : 's'}
            </span>
          )}
          {command.has_bash_commands && (
            <span className="text-xs text-blue-600 dark:text-blue-400">Bash</span>
          )}
          {command.has_file_references && (
            <span className="text-xs text-green-600 dark:text-green-400">Files</span>
          )}
        </div>
      </div>
    </button>
  );
};
