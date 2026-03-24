import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Trash2,
  Edit,
  Command,
  Globe,
  FolderOpen,
  Terminal,
  FileCode,
  Zap,
  AlertCircle,
  Loader2,
  Search,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { RuneSpinner } from './RuneCodeLogo';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, type SlashCommand } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useTrackEvent } from "@/hooks";
import { SlashCommandForm, type CommandFormValues } from "@/components/slash/SlashCommandForm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SlashCommandsManagerProps {
  projectPath?: string;
  className?: string;
  scopeFilter?: 'project' | 'user' | 'all';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getCommandIcon = (command: SlashCommand) => {
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

export const SlashCommandsManager: React.FC<SlashCommandsManagerProps> = ({
  projectPath,
  className,
  scopeFilter = 'all',
}) => {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedScope, setSelectedScope] = useState<'all' | 'project' | 'user'>(
    scopeFilter === 'all' ? 'all' : scopeFilter as 'project' | 'user'
  );
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set());

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<SlashCommand | null>(null);
  const [initialFormValues, setInitialFormValues] = useState<CommandFormValues>({
    name: "", namespace: "", content: "", description: "", allowedTools: [], scope: 'user'
  });

  // Delete confirmation dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [commandToDelete, setCommandToDelete] = useState<SlashCommand | null>(null);
  const [deleting, setDeleting] = useState(false);

  const trackEvent = useTrackEvent();

  const loadCommands = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedCommands = await api.slashCommandsList(projectPath);
      setCommands(loadedCommands);
    } catch (err) {
      console.error("Failed to load slash commands:", err);
      setError("Failed to load commands");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCommands(); }, [projectPath]);

  const handleCreateNew = () => {
    setEditingCommand(null);
    setInitialFormValues({
      name: "",
      namespace: "",
      content: "",
      description: "",
      allowedTools: [],
      scope: scopeFilter !== 'all' ? scopeFilter : (projectPath ? 'project' : 'user')
    });
    setEditDialogOpen(true);
  };

  const handleEdit = (command: SlashCommand) => {
    setEditingCommand(command);
    setInitialFormValues({
      name: command.name,
      namespace: command.namespace || "",
      content: command.content,
      description: command.description || "",
      allowedTools: command.allowed_tools,
      scope: command.scope as 'project' | 'user'
    });
    setEditDialogOpen(true);
  };

  const handleSave = async (values: CommandFormValues) => {
    try {
      setSaving(true);
      setError(null);

      await api.slashCommandSave(
        values.scope,
        values.name,
        values.namespace || undefined,
        values.content,
        values.description || undefined,
        values.allowedTools,
        values.scope === 'project' ? projectPath : undefined
      );

      trackEvent.slashCommandCreated({
        command_type: 'custom',
        has_parameters: values.content.includes('$ARGUMENTS')
      });

      setEditDialogOpen(false);
      await loadCommands();
    } catch (err) {
      console.error("Failed to save command:", err);
      setError(err instanceof Error ? err.message : "Failed to save command");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = (command: SlashCommand) => {
    setCommandToDelete(command);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!commandToDelete) return;
    try {
      setDeleting(true);
      setError(null);
      await api.slashCommandDelete(commandToDelete.id, projectPath);
      setDeleteDialogOpen(false);
      setCommandToDelete(null);
      await loadCommands();
    } catch (err) {
      console.error("Failed to delete command:", err);
      setError(err instanceof Error ? err.message : "Failed to delete command");
    } finally {
      setDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteDialogOpen(false);
    setCommandToDelete(null);
  };

  const toggleExpanded = (commandId: string) => {
    setExpandedCommands(prev => {
      const next = new Set(prev);
      if (next.has(commandId)) { next.delete(commandId); } else { next.add(commandId); }
      return next;
    });
  };

  // Filter commands
  const filteredCommands = commands.filter(cmd => {
    if (cmd.scope === 'default') return false;
    if (scopeFilter !== 'all' && cmd.scope !== scopeFilter) return false;
    if (selectedScope !== 'all' && cmd.scope !== selectedScope) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        cmd.name.toLowerCase().includes(query) ||
        cmd.full_command.toLowerCase().includes(query) ||
        (cmd.description && cmd.description.toLowerCase().includes(query)) ||
        (cmd.namespace && cmd.namespace.toLowerCase().includes(query))
      );
    }
    return true;
  });

  // Group commands
  const groupedCommands = filteredCommands.reduce((acc, cmd) => {
    const key = cmd.namespace
      ? `${cmd.namespace} (${cmd.scope})`
      : `${cmd.scope === 'project' ? 'Project' : 'User'} Commands`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(cmd);
    return acc;
  }, {} as Record<string, SlashCommand[]>);

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">
            {scopeFilter === 'project' ? 'Project Slash Commands' : 'Slash Commands'}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {scopeFilter === 'project'
              ? 'Create custom commands for this project'
              : 'Create custom commands to streamline your workflow'}
          </p>
        </div>
        <Button onClick={handleCreateNew} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          New Command
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search commands..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
        {scopeFilter === 'all' && (
          <Select value={selectedScope} onValueChange={(value: any) => setSelectedScope(value)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Commands</SelectItem>
              <SelectItem value="project">Project</SelectItem>
              <SelectItem value="user">User</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Commands List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <RuneSpinner size={24} label="Loading commands..." />
        </div>
      ) : filteredCommands.length === 0 ? (
        <Card className="p-8">
          <div className="text-center">
            <Command className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {searchQuery
                ? "No commands found"
                : scopeFilter === 'project'
                  ? "No project commands created yet"
                  : "No commands created yet"}
            </p>
            {!searchQuery && (
              <Button onClick={handleCreateNew} variant="outline" size="sm" className="mt-4">
                {scopeFilter === 'project'
                  ? "Create your first project command"
                  : "Create your first command"}
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedCommands).map(([groupKey, groupCommands]) => (
            <Card key={groupKey} className="overflow-hidden">
              <div className="p-4 bg-muted/50 border-b">
                <h4 className="text-sm font-medium">{groupKey}</h4>
              </div>
              <div className="divide-y">
                {groupCommands.map((command) => {
                  const Icon = getCommandIcon(command);
                  const isExpanded = expandedCommands.has(command.id);
                  return (
                    <div key={command.id}>
                      <div className="p-4">
                        <div className="flex items-start gap-4">
                          <Icon className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <code className="text-sm font-mono text-primary">{command.full_command}</code>
                              {command.accepts_arguments && (
                                <Badge variant="secondary" className="text-xs">Arguments</Badge>
                              )}
                            </div>
                            {command.description && (
                              <p className="text-sm text-muted-foreground mb-2">{command.description}</p>
                            )}
                            <div className="flex items-center gap-4 text-xs">
                              {command.allowed_tools.length > 0 && (
                                <span className="text-muted-foreground">
                                  {command.allowed_tools.length} tool{command.allowed_tools.length === 1 ? '' : 's'}
                                </span>
                              )}
                              {command.has_bash_commands && <Badge variant="outline" className="text-xs">Bash</Badge>}
                              {command.has_file_references && <Badge variant="outline" className="text-xs">Files</Badge>}
                              <button
                                onClick={() => toggleExpanded(command.id)}
                                className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {isExpanded
                                  ? <><ChevronDown className="h-3 w-3" />Hide content</>
                                  : <><ChevronRight className="h-3 w-3" />Show content</>}
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(command)} className="h-8 w-8">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteClick(command)}
                              className="h-8 w-8 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-4 p-3 bg-muted/50 rounded-md">
                                <pre className="text-xs font-mono whitespace-pre-wrap">{command.content}</pre>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <SlashCommandForm
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        editingCommand={editingCommand}
        initialValues={initialFormValues}
        scopeFilter={scopeFilter}
        projectPath={projectPath}
        saving={saving}
        error={error}
        onSave={handleSave}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Command</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p>Are you sure you want to delete this command?</p>
            {commandToDelete && (
              <div className="p-3 bg-muted rounded-md">
                <code className="text-sm font-mono">{commandToDelete.full_command}</code>
                {commandToDelete.description && (
                  <p className="text-sm text-muted-foreground mt-1">{commandToDelete.description}</p>
                )}
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. The command file will be permanently deleted.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
              {deleting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Delete</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
