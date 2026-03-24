/**
 * AgentsTabContent — renders the Agents tab in SlashCommandPicker.
 * McpTabContent — renders the MCP tab in SlashCommandPicker.
 * Both extracted to keep SlashCommandPicker under 500 lines.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Bot, Server } from 'lucide-react';
import type { SlashCommand } from '@/lib/api';

export interface AgentInfo {
  name: string;
  model: string;
  type: string;
}

export interface McpServerInfo {
  name: string;
  command: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Agents Tab
// ---------------------------------------------------------------------------

interface AgentsTabContentProps {
  agents: AgentInfo[];
  searchQuery: string;
  selectedIndex: number;
  onSelect: (command: SlashCommand) => void;
  onHover: (index: number) => void;
}

export const AgentsTabContent: React.FC<AgentsTabContentProps> = ({
  agents,
  searchQuery,
  selectedIndex,
  onSelect,
  onHover,
}) => {
  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Bot className="h-8 w-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">No agents discovered</span>
        <p className="text-xs text-muted-foreground mt-2 text-center px-4">
          Run <code className="px-1">claude agents</code> to verify available agents
        </p>
      </div>
    );
  }

  const filtered = agents.filter(agent => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return agent.name.toLowerCase().includes(q) ||
           agent.model.toLowerCase().includes(q) ||
           agent.type.toLowerCase().includes(q);
  });

  return (
    <div className="p-2">
      <div className="space-y-0.5">
        {filtered.map((agent, index) => (
          <button
            key={`${agent.type}-${agent.name}`}
            data-index={index}
            onClick={() => onSelect({
              id: `agent-${agent.name}`,
              name: agent.name,
              full_command: `@${agent.name}`,
              description: `${agent.type} agent`,
              scope: 'default',
              namespace: agent.type,
              file_path: '',
              content: '',
              allowed_tools: [],
              has_bash_commands: false,
              has_file_references: false,
              accepts_arguments: true,
            })}
            onMouseEnter={() => onHover(index)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-md",
              "hover:bg-accent/50 transition-colors text-left",
              index === selectedIndex && "bg-accent/50"
            )}
            style={index === selectedIndex ? {
              borderLeft: '2px solid var(--color-purple-500)',
              backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)',
            } : undefined}
          >
            <div className="flex items-center gap-3">
              <Bot className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-purple-400)' }} />
              <div>
                <div className="text-sm font-medium">{agent.name}</div>
                <div className="text-xs text-muted-foreground">{agent.type} agent</div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">{agent.model}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// MCP Tab
// ---------------------------------------------------------------------------

interface McpTabContentProps {
  mcpServers: McpServerInfo[];
  searchQuery: string;
}

export const McpTabContent: React.FC<McpTabContentProps> = ({ mcpServers, searchQuery }) => {
  if (mcpServers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <Server className="h-8 w-8 text-muted-foreground mb-2" />
        <span className="text-sm text-muted-foreground">No MCP servers discovered</span>
        <p className="text-xs text-muted-foreground mt-2 text-center px-4">
          Run <code className="px-1">claude mcp list</code> to verify configured servers
        </p>
      </div>
    );
  }

  const filtered = mcpServers.filter(server => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return server.name.toLowerCase().includes(q) ||
           server.command.toLowerCase().includes(q) ||
           server.status.toLowerCase().includes(q);
  });

  return (
    <div className="p-2">
      <div className="space-y-0.5">
        {filtered.map((server) => (
          <div
            key={server.name}
            className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Server className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--color-gold-400)' }} />
              <div>
                <div className="text-sm font-medium">{server.name}</div>
                <div className="text-xs text-muted-foreground truncate max-w-[200px]">{server.command}</div>
              </div>
            </div>
            <span className="text-xs px-1.5 py-0.5 rounded" style={
              server.status === 'connected'
                ? { backgroundColor: 'color-mix(in oklch, var(--color-success) 10%, transparent)', color: 'var(--color-success)' }
                : server.status === 'needs_auth'
                ? { backgroundColor: 'color-mix(in oklch, var(--color-warning) 10%, transparent)', color: 'var(--color-warning)' }
                : { backgroundColor: 'color-mix(in oklch, var(--color-error) 10%, transparent)', color: 'var(--color-error)' }
            }>
              {server.status === 'connected' ? 'Connected' : server.status === 'needs_auth' ? 'Auth needed' : 'Error'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
