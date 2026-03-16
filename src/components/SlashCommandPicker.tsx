import React, { useState, useEffect, useRef } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { 
  X, 
  Command,
  Search,
  Globe,
  FolderOpen,
  Zap,
  FileCode,
  Terminal,
  AlertCircle,
  User,
  Building2
} from "lucide-react";
import type { SlashCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTrackEvent, useFeatureAdoptionTracking } from "@/hooks";

const BUILTIN_COMMANDS: SlashCommand[] = [
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

interface SlashCommandPickerProps {
  /**
   * The project path for loading project-specific commands
   */
  projectPath?: string;
  /**
   * Callback when a command is selected
   */
  onSelect: (command: SlashCommand) => void;
  /**
   * Callback to close the picker
   */
  onClose: () => void;
  /**
   * Initial search query (text after /)
   */
  initialQuery?: string;
  /**
   * Optional className for styling
   */
  className?: string;
}

// Get icon for command based on its properties
const getCommandIcon = (command: SlashCommand) => {
  // If it has bash commands, show terminal icon
  if (command.has_bash_commands) return Terminal;
  
  // If it has file references, show file icon
  if (command.has_file_references) return FileCode;
  
  // If it accepts arguments, show zap icon
  if (command.accepts_arguments) return Zap;
  
  // Based on scope
  if (command.scope === "project") return FolderOpen;
  if (command.scope === "user") return Globe;
  
  // Default
  return Command;
};

/**
 * SlashCommandPicker component - Autocomplete UI for slash commands
 * 
 * @example
 * <SlashCommandPicker
 *   projectPath="/Users/example/project"
 *   onSelect={(command) => console.log('Selected:', command)}
 *   onClose={() => setShowPicker(false)}
 * />
 */
export const SlashCommandPicker: React.FC<SlashCommandPickerProps> = ({
  projectPath,
  onSelect,
  onClose,
  initialQuery = "",
  className,
}) => {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [filteredCommands, setFilteredCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [activeTab, setActiveTab] = useState<string>("default");
  
  const commandListRef = useRef<HTMLDivElement>(null);
  
  // Analytics tracking
  const trackEvent = useTrackEvent();
  const slashCommandFeatureTracking = useFeatureAdoptionTracking('slash_commands');
  
  // Load commands on mount or when project path changes
  useEffect(() => {
    loadCommands();
  }, [projectPath]);
  
  // Filter commands based on search query and active tab
  useEffect(() => {
    if (!commands.length) {
      setFilteredCommands([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    let filteredByTab: SlashCommand[];
    
    // Filter by active tab
    if (activeTab === "default") {
      // Show default/built-in commands
      filteredByTab = commands.filter(cmd => cmd.scope === "default");
    } else {
      // Show all custom commands (both user and project)
      filteredByTab = commands.filter(cmd => cmd.scope !== "default");
    }
    
    // Then filter by search query
    let filtered: SlashCommand[];
    if (!query) {
      filtered = filteredByTab;
    } else {
      filtered = filteredByTab.filter(cmd => {
        // Match against command name
        if (cmd.name.toLowerCase().includes(query)) return true;
        
        // Match against full command
        if (cmd.full_command.toLowerCase().includes(query)) return true;
        
        // Match against namespace
        if (cmd.namespace && cmd.namespace.toLowerCase().includes(query)) return true;
        
        // Match against description
        if (cmd.description && cmd.description.toLowerCase().includes(query)) return true;
        
        return false;
      });
      
      // Sort by relevance
      filtered.sort((a, b) => {
        // Exact name match first
        const aExact = a.name.toLowerCase() === query;
        const bExact = b.name.toLowerCase() === query;
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        
        // Then by name starts with
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        
        // Then alphabetically
        return a.name.localeCompare(b.name);
      });
    }
    
    setFilteredCommands(filtered);
    
    // Reset selected index when filtered list changes
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
            trackEvent.slashCommandSelected({
              command_name: command.name,
              selection_method: 'keyboard'
            });
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
  
  // Scroll selected item into view
  useEffect(() => {
    if (commandListRef.current) {
      const selectedElement = commandListRef.current.querySelector(`[data-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }, [selectedIndex]);
  
  const loadCommands = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Start with built-in commands
      const allCommands = [...BUILTIN_COMMANDS];

      // Load custom commands from API
      try {
        const apiCommands = await api.slashCommandsList(projectPath);
        for (const cmd of apiCommands) {
          if (!allCommands.find(c => c.name === cmd.name)) {
            allCommands.push(cmd);
          }
        }
      } catch {
        // API may be unavailable in web mode, continue with built-ins
      }

      // Also load plugin skills as slash commands
      try {
        const res = await fetch('/api/skills');
        const skills = await res.json();
        for (const group of skills) {
          for (const skill of group.skills) {
            if (!allCommands.find(c => c.name === skill.name)) {
              allCommands.push({
                id: `skill-${group.plugin}-${skill.name}`,
                name: skill.name,
                full_command: `/${skill.name}`,
                description: skill.description,
                scope: 'default',
                namespace: group.plugin,
                file_path: '',
                content: '',
                allowed_tools: [],
                has_bash_commands: false,
                has_file_references: false,
                accepts_arguments: true,
              });
            }
          }
        }
      } catch { /* skills API unavailable */ }

      setCommands(allCommands);
    } catch (err) {
      console.error("Failed to load slash commands:", err);
      setError(err instanceof Error ? err.message : 'Failed to load commands');
      setCommands(BUILTIN_COMMANDS);
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleCommandClick = (command: SlashCommand) => {
    trackEvent.slashCommandSelected({
      command_name: command.name,
      selection_method: 'click'
    });
    slashCommandFeatureTracking.trackUsage();
    onSelect(command);
  };
  
  // Group commands by scope and namespace for the Custom tab
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    let key: string;
    if (cmd.scope === "user") {
      key = cmd.namespace ? `User Commands: ${cmd.namespace}` : "User Commands";
    } else if (cmd.scope === "project") {
      key = cmd.namespace ? `Project Commands: ${cmd.namespace}` : "Project Commands";
    } else {
      key = cmd.namespace || "Commands";
    }
    
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(cmd);
    return acc;
  }, {} as Record<string, SlashCommand[]>);
  
  // Update search query from parent
  useEffect(() => {
    setSearchQuery(initialQuery);
  }, [initialQuery]);
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "absolute bottom-full mb-2 left-0 z-50",
        "w-[600px] h-[400px]",
        "bg-background border border-border rounded-lg shadow-lg",
        "flex flex-col overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="border-b border-border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Command className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Slash Commands</span>
            {searchQuery && (
              <span className="text-xs text-muted-foreground">
                Searching: "{searchQuery}"
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        
        {/* Tabs */}
        <div className="mt-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="default">Default</TabsTrigger>
              <TabsTrigger value="custom">Custom</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Command List */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <span className="text-sm text-muted-foreground">Loading commands...</span>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <AlertCircle className="h-8 w-8 text-destructive mb-2" />
            <span className="text-sm text-destructive text-center">{error}</span>
          </div>
        )}

        {!isLoading && !error && (
          <>
            {/* Default Tab Content */}
            {activeTab === "default" && (
              <>
                {filteredCommands.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Command className="h-8 w-8 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">
                      {searchQuery ? 'No commands found' : 'No default commands available'}
                    </span>
                    {!searchQuery && (
                      <p className="text-xs text-muted-foreground mt-2 text-center px-4">
                        Default commands are built-in system commands
                      </p>
                    )}
                  </div>
                )}

                {filteredCommands.length > 0 && (
                  <div className="p-2" ref={commandListRef}>
                    <div className="space-y-0.5">
                      {filteredCommands.map((command, index) => {
                        const Icon = getCommandIcon(command);
                        const isSelected = index === selectedIndex;
                        
                        return (
                          <button
                            key={command.id}
                            data-index={index}
                            onClick={() => handleCommandClick(command)}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={cn(
                              "w-full flex items-start gap-3 px-3 py-2 rounded-md",
                              "hover:bg-accent transition-colors",
                              "text-left",
                              isSelected && "bg-accent"
                            )}
                          >
                            <Icon className="h-4 w-4 text-muted-foreground mt-1 flex-shrink-0" />
                            <div className="flex-1 overflow-hidden">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">
                                  {command.full_command}
                                </span>
                                <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
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
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
            
            {/* Custom Tab Content */}
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
                    {/* If no grouping needed, show flat list */}
                    {Object.keys(groupedCommands).length === 1 ? (
                      <div className="space-y-0.5">
                        {filteredCommands.map((command, index) => {
                          const Icon = getCommandIcon(command);
                          const isSelected = index === selectedIndex;
                          
                          return (
                            <button
                              key={command.id}
                              data-index={index}
                              onClick={() => handleCommandClick(command)}
                              onMouseEnter={() => setSelectedIndex(index)}
                              className={cn(
                                "w-full flex items-start gap-3 px-3 py-2 rounded-md",
                                "hover:bg-accent transition-colors",
                                "text-left",
                                isSelected && "bg-accent"
                              )}
                            >
                              <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-mono text-sm text-primary">
                                    {command.full_command}
                                  </span>
                                  {command.accepts_arguments && (
                                    <span className="text-xs text-muted-foreground">
                                      [args]
                                    </span>
                                  )}
                                </div>
                                
                                {command.description && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                    {command.description}
                                  </p>
                                )}
                                
                                <div className="flex items-center gap-3 mt-1">
                                  {command.allowed_tools.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      {command.allowed_tools.length} tool{command.allowed_tools.length === 1 ? '' : 's'}
                                    </span>
                                  )}
                                  
                                  {command.has_bash_commands && (
                                    <span className="text-xs text-blue-600 dark:text-blue-400">
                                      Bash
                                    </span>
                                  )}
                                  
                                  {command.has_file_references && (
                                    <span className="text-xs text-green-600 dark:text-green-400">
                                      Files
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      // Show grouped by scope/namespace
                      <div className="space-y-4">
                        {Object.entries(groupedCommands).map(([groupKey, groupCommands]) => (
                          <div key={groupKey}>
                            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1 flex items-center gap-2">
                              {groupKey.startsWith("User Commands") && <User className="h-3 w-3" />}
                              {groupKey.startsWith("Project Commands") && <Building2 className="h-3 w-3" />}
                              {groupKey}
                            </h3>
                            
                            <div className="space-y-0.5">
                              {groupCommands.map((command) => {
                                const Icon = getCommandIcon(command);
                                const globalIndex = filteredCommands.indexOf(command);
                                const isSelected = globalIndex === selectedIndex;
                                
                                return (
                                  <button
                                    key={command.id}
                                    data-index={globalIndex}
                                    onClick={() => handleCommandClick(command)}
                                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                                    className={cn(
                                      "w-full flex items-start gap-3 px-3 py-2 rounded-md",
                                      "hover:bg-accent transition-colors",
                                      "text-left",
                                      isSelected && "bg-accent"
                                    )}
                                  >
                                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                                    
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-baseline gap-2">
                                        <span className="font-mono text-sm text-primary">
                                          {command.full_command}
                                        </span>
                                        {command.accepts_arguments && (
                                          <span className="text-xs text-muted-foreground">
                                            [args]
                                          </span>
                                        )}
                                      </div>
                                      
                                      {command.description && (
                                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                          {command.description}
                                        </p>
                                      )}
                                      
                                      <div className="flex items-center gap-3 mt-1">
                                        {command.allowed_tools.length > 0 && (
                                          <span className="text-xs text-muted-foreground">
                                            {command.allowed_tools.length} tool{command.allowed_tools.length === 1 ? '' : 's'}
                                          </span>
                                        )}
                                        
                                        {command.has_bash_commands && (
                                          <span className="text-xs text-blue-600 dark:text-blue-400">
                                            Bash
                                          </span>
                                        )}
                                        
                                        {command.has_file_references && (
                                          <span className="text-xs text-green-600 dark:text-green-400">
                                            Files
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </button>
                                );
                              })}
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
      <div className="border-t border-border p-2">
        <p className="text-xs text-muted-foreground text-center">
          ↑↓ Navigate • Enter Select • Esc Close
        </p>
      </div>
    </motion.div>
  );
}; 
