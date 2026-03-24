import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { applyStartupToken } from "@/lib/startupToken";
import {
  X,
  Command,
  Search,
  AlertCircle,
  User,
  Building2,
  RefreshCw,
} from "lucide-react";
import type { SlashCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { safeParseCommand, safeParseSkill, toSlashCommand } from "@/lib/safeParser";
import { useTrackEvent, useFeatureAdoptionTracking } from "@/hooks";
import { SlashCommandItem, SlashCommandItemCustom } from "@/components/slash/SlashCommandItem";
import { AgentsTabContent, McpTabContent } from "@/components/slash/AgentsTabContent";

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

interface CommandCache {
  commands: SlashCommand[];
  agents: AgentInfo[];
  mcpServers: McpServerInfo[];
  projectPath: string | undefined;
}
let commandCache: CommandCache | null = null;
let loadingPromise: Promise<CommandCache> | null = null;

async function fetchAllCommandData(projectPath: string | undefined): Promise<CommandCache> {
  const allCommands: SlashCommand[] = [...BUILTIN_COMMANDS_FALLBACK];

  const [builtinResult, customResult, agentsResult, mcpResult, skillsResult] =
    await Promise.allSettled([
      fetch('/api/commands/builtin', { headers: applyStartupToken({}) }).then(r => r.ok ? r.json() : null),
      api.slashCommandsList(projectPath),
      fetch('/api/commands/agents', { headers: applyStartupToken({}) }).then(r => r.ok ? r.json() : null),
      fetch('/api/commands/mcp', { headers: applyStartupToken({}) }).then(r => r.ok ? r.json() : null),
      fetch('/api/skills', { headers: applyStartupToken({}) }).then(r => r.ok ? r.json() : null),
    ]);

  if (builtinResult.status === 'fulfilled' && builtinResult.value) {
    const items = Array.isArray(builtinResult.value?.data) ? builtinResult.value.data : [];
    for (const raw of items) {
      const parsed = safeParseCommand(raw);
      if (parsed && !allCommands.find(c => c.name === parsed.name)) {
        allCommands.push(toSlashCommand(parsed, 'discovered'));
      }
    }
  }

  if (customResult.status === 'fulfilled' && Array.isArray(customResult.value)) {
    for (const cmd of customResult.value) {
      const parsed = safeParseCommand(cmd);
      if (parsed && !allCommands.find(c => c.name === parsed.name)) {
        allCommands.push(toSlashCommand(parsed, 'api'));
      }
    }
  }

  const agents: AgentInfo[] = agentsResult.status === 'fulfilled' && agentsResult.value
    ? (Array.isArray(agentsResult.value?.data) ? agentsResult.value.data : [])
    : [];

  const mcpServers: McpServerInfo[] = mcpResult.status === 'fulfilled' && mcpResult.value
    ? (Array.isArray(mcpResult.value?.data) ? mcpResult.value.data : [])
    : [];

  if (skillsResult.status === 'fulfilled' && Array.isArray(skillsResult.value)) {
    for (const group of skillsResult.value) {
      const pluginName = String(group?.plugin || 'Plugin');
      const groupSkills = Array.isArray(group?.skills) ? group.skills : [];
      for (const skill of groupSkills) {
        const parsed = safeParseSkill(skill);
        if (parsed && !allCommands.find(c => c.name === parsed.name)) {
          const cmdParsed = safeParseCommand({
            name: parsed.name,
            description: parsed.description,
            namespace: pluginName,
            accepts_arguments: true,
          });
          if (cmdParsed) {
            allCommands.push(toSlashCommand(cmdParsed, `skill-${pluginName}`));
          }
        }
      }
    }
  }

  return { commands: allCommands, agents, mcpServers, projectPath };
}

// ---------------------------------------------------------------------------
// Built-in commands fallback
// ---------------------------------------------------------------------------

const BUILTIN_COMMANDS_FALLBACK: SlashCommand[] = [
  { id: 'builtin-help', name: 'help', full_command: '/help', description: 'Show help and available commands', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-clear', name: 'clear', full_command: '/clear', description: 'Clear conversation history', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-compact', name: 'compact', full_command: '/compact', description: 'Compact conversation to save context', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-review', name: 'review', full_command: '/review', description: 'Review code changes in the current session', scope: 'default', namespace: 'code', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-init', name: 'init', full_command: '/init', description: 'Initialize CLAUDE.md in the current project', scope: 'default', namespace: 'project', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-bug', name: 'bug', full_command: '/bug', description: 'Report a bug with Claude Code', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-config', name: 'config', full_command: '/config', description: 'View or modify Claude Code configuration', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-cost', name: 'cost', full_command: '/cost', description: 'Show token usage and cost for this session', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-doctor', name: 'doctor', full_command: '/doctor', description: 'Run diagnostic checks on your environment', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-login', name: 'login', full_command: '/login', description: 'Switch Anthropic accounts', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-logout', name: 'logout', full_command: '/logout', description: 'Sign out from your Anthropic account', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-memory', name: 'memory', full_command: '/memory', description: 'Edit CLAUDE.md memory files', scope: 'default', namespace: 'project', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: true, accepts_arguments: false },
  { id: 'builtin-model', name: 'model', full_command: '/model', description: 'Switch the active Claude model', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-permissions', name: 'permissions', full_command: '/permissions', description: 'View or modify tool permissions', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-status', name: 'status', full_command: '/status', description: 'Show current session status', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-terminal-setup', name: 'terminal-setup', full_command: '/terminal-setup', description: 'Install Shift+Enter key binding for terminal', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-vim', name: 'vim', full_command: '/vim', description: 'Toggle vim mode for input', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-undo', name: 'undo', full_command: '/undo', description: 'Undo the last file changes', scope: 'default', namespace: 'code', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-pr-comments', name: 'pr-comments', full_command: '/pr-comments', description: 'View and address PR review comments', scope: 'default', namespace: 'code', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-listen', name: 'listen', full_command: '/listen', description: 'Listen for changes and run commands', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: true },
  { id: 'builtin-fast', name: 'fast', full_command: '/fast', description: 'Toggle fast mode (faster output, same model)', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
  { id: 'builtin-think', name: 'think', full_command: '/think', description: 'Toggle extended thinking mode', scope: 'default', namespace: 'system', file_path: '', content: '', allowed_tools: [], has_bash_commands: false, has_file_references: false, accepts_arguments: false },
];

// ---------------------------------------------------------------------------
// Types (AgentInfo and McpServerInfo re-exported from AgentsTabContent)
// ---------------------------------------------------------------------------

import type { AgentInfo, McpServerInfo } from "@/components/slash/AgentsTabContent";

interface SlashCommandPickerProps {
  projectPath?: string;
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  initialQuery?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SlashCommandPicker: React.FC<SlashCommandPickerProps> = ({
  projectPath,
  onSelect,
  onClose,
  initialQuery = "",
  className,
}) => {
  const [commands, setCommands] = useState<SlashCommand[]>(BUILTIN_COMMANDS_FALLBACK);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<string>("default");
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);

  const commandListRef = useRef<HTMLDivElement>(null);

  const trackEvent = useTrackEvent();
  const slashCommandFeatureTracking = useFeatureAdoptionTracking('slash_commands');

  // Filter
  useEffect(() => {
    if (!commands.length) { setFilteredCommands([]); return; }

    const query = searchQuery.toLowerCase();
    let filteredByTab: SlashCommand[];
    if (activeTab === "default") {
      filteredByTab = commands.filter(cmd => cmd.scope === "default");
    } else {
      filteredByTab = commands.filter(cmd => cmd.scope !== "default");
    }

    let filtered: SlashCommand[];
    if (!query) {
      filtered = filteredByTab;
    } else {
      filtered = filteredByTab.filter(cmd =>
        cmd.name.toLowerCase().includes(query) ||
        cmd.full_command.toLowerCase().includes(query) ||
        (cmd.namespace && cmd.namespace.toLowerCase().includes(query)) ||
        (cmd.description && cmd.description.toLowerCase().includes(query))
      );
      filtered.sort((a, b) => {
        const aExact = a.name.toLowerCase() === query;
        const bExact = b.name.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    setFilteredCommands(filtered);
    setSelectedIndex(0);
  }, [searchQuery, commands, activeTab]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands.length > 0 && selectedIndex < filteredCommands.length) {
            const command = filteredCommands[selectedIndex];
            trackEvent.slashCommandSelected({ command_name: command.name, selection_method: 'keyboard' });
            slashCommandFeatureTracking.trackUsage();
            onSelect(command);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(filteredCommands.length - 1, prev + 1));
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filteredCommands, selectedIndex, onSelect, onClose]);

  // Scroll selected into view
  useEffect(() => {
    if (commandListRef.current) {
      const el = commandListRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [selectedIndex]);

  const loadCommands = useCallback(async () => {
    if (commandCache && commandCache.projectPath === projectPath) {
      setCommands(commandCache.commands);
      setAgents(commandCache.agents);
      setMcpServers(commandCache.mcpServers);
      setIsLoading(false);
      return;
    }

    setCommands(BUILTIN_COMMANDS_FALLBACK);
    setIsLoading(true);
    setError(null);

    if (!loadingPromise) {
      loadingPromise = fetchAllCommandData(projectPath).finally(() => { loadingPromise = null; });
    }

    try {
      const result = await loadingPromise;
      commandCache = result;
      setCommands(result.commands);
      setAgents(result.agents);
      setMcpServers(result.mcpServers);
    } catch (err) {
      console.error("Failed to load slash commands:", err);
      setError(err instanceof Error ? err.message : 'Failed to load commands');
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  useEffect(() => { loadCommands(); }, [loadCommands]);
  useEffect(() => { setSearchQuery(initialQuery); }, [initialQuery]);

  const handleCommandClick = (command: SlashCommand) => {
    trackEvent.slashCommandSelected({ command_name: command.name, selection_method: 'click' });
    slashCommandFeatureTracking.trackUsage();
    onSelect(command);
  };

  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    let key: string;
    if (cmd.scope === "user") {
      key = cmd.namespace ? `User Commands: ${cmd.namespace}` : "User Commands";
    } else if (cmd.scope === "project") {
      key = cmd.namespace ? `Project Commands: ${cmd.namespace}` : "Project Commands";
    } else {
      key = cmd.namespace || "Commands";
    }
    if (!acc[key]) acc[key] = [];
    acc[key].push(cmd);
    return acc;
  }, {} as Record<string, SlashCommand[]>);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "absolute bottom-full mb-2 left-0 z-50",
        "w-[600px] h-[400px]",
        "glass-elevated rounded-xl",
        "flex flex-col overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="border-b p-3" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command className="h-4 w-4 text-muted-foreground" />
            <span className="text-heading-4" style={{ fontFamily: 'var(--font-heading)' }}>Slash Commands</span>
            {searchQuery && (
              <span className="text-xs text-muted-foreground">Searching: "{searchQuery}"</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={loadCommands}
              className="text-muted-foreground hover:text-foreground p-1.5 rounded-md hover:bg-accent transition-colors"
              title="Refresh commands"
            >
              <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="default">Commands</TabsTrigger>
              <TabsTrigger value="agents">Agents{agents.length > 0 ? ` (${agents.length})` : ''}</TabsTrigger>
              <TabsTrigger value="mcp">MCP{mcpServers.length > 0 ? ` (${mcpServers.length})` : ''}</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Command List */}
      <div className="flex-1 overflow-y-auto relative">
        {error && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <span className="text-sm text-destructive text-center">{error}</span>
          </div>
        )}

        {!error && (
          <>
            {/* Default Tab */}
            {activeTab === "default" && (
              <>
                {filteredCommands.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Command className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      {searchQuery ? 'No commands found' : 'No default commands available'}
                    </span>
                  </div>
                )}
                {filteredCommands.length > 0 && (
                  <div className="p-2" ref={commandListRef}>
                    <div className="space-y-0.5">
                      {filteredCommands.map((command, index) => (
                        <SlashCommandItem
                          key={command.id}
                          command={command}
                          index={index}
                          selectedIndex={selectedIndex}
                          onSelect={handleCommandClick}
                          onHover={setSelectedIndex}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Agents Tab */}
            {activeTab === "agents" && (
              <AgentsTabContent
                agents={agents}
                searchQuery={searchQuery}
                selectedIndex={selectedIndex}
                onSelect={handleCommandClick}
                onHover={setSelectedIndex}
              />
            )}

            {/* MCP Tab */}
            {activeTab === "mcp" && (
              <McpTabContent
                mcpServers={mcpServers}
                searchQuery={searchQuery}
              />
            )}

            {/* Custom Tab */}
            {activeTab === "custom" && (
              <>
                {filteredCommands.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Search className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      {searchQuery ? 'No commands found' : 'No custom commands available'}
                    </span>
                    {!searchQuery && (
                      <p className="text-xs text-muted-foreground mt-2 text-center px-4">
                        Create commands in <code className="px-1">.claude/commands/</code> or <code className="px-1">~/.claude/commands/</code>
                      </p>
                    )}
                  </div>
                )}
                {filteredCommands.length > 0 && (
                  <div className="p-2" ref={commandListRef}>
                    {Object.keys(groupedCommands).length === 1 ? (
                      <div className="space-y-0.5">
                        {filteredCommands.map((command, index) => (
                          <SlashCommandItemCustom
                            key={command.id}
                            command={command}
                            globalIndex={index}
                            selectedIndex={selectedIndex}
                            onSelect={handleCommandClick}
                            onHover={setSelectedIndex}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Object.entries(groupedCommands).map(([groupKey, groupCommands]) => (
                          <div key={groupKey}>
                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 flex items-center gap-2">
                              {groupKey.startsWith("User Commands") && <User className="h-3 w-3" />}
                              {groupKey.startsWith("Project Commands") && <Building2 className="h-3 w-3" />}
                              {groupKey}
                            </h3>
                            <div className="space-y-0.5">
                              {groupCommands.map((command) => (
                                <SlashCommandItemCustom
                                  key={command.id}
                                  command={command}
                                  globalIndex={filteredCommands.indexOf(command)}
                                  selectedIndex={selectedIndex}
                                  onSelect={handleCommandClick}
                                  onHover={setSelectedIndex}
                                />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t p-2" style={{ borderColor: 'var(--color-border-subtle)' }}>
        <p className="text-xs text-muted-foreground text-center">
          <span style={{ fontFamily: 'var(--font-mono)' }}>↑↓</span> Navigate •{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>Enter</span> Select •{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>Esc</span> Close
        </p>
      </div>
    </motion.div>
  );
};
