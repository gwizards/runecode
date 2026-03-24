/**
 * HooksEditor — orchestrator for managing Claude Code hooks configuration.
 * Rendering of individual items is delegated to HookList and HookEditForm.
 */

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Code2,
  Terminal,
  FileText,
  Zap,
  Shield,
  PlayCircle,
  Save,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { HooksManager } from '@/lib/hooksManager';
import { api } from '@/lib/api';
import {
  HooksConfiguration,
  HookEvent,
  HookMatcher,
  HookCommand,
  HookTemplate,
} from '@/types/hooks';
import { HookList, type EditableHookCommand, type EditableHookMatcher } from '@/components/hooks/HookList';
import { HookEditForm } from '@/components/hooks/HookEditForm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HooksEditorProps {
  projectPath?: string;
  scope: 'project' | 'local' | 'user';
  readOnly?: boolean;
  className?: string;
  onChange?: (hasChanges: boolean, getHooks: () => HooksConfiguration) => void;
  hideActions?: boolean;
}

type EditableHooksState = {
  PreToolUse: EditableHookMatcher[];
  PostToolUse: EditableHookMatcher[];
  Notification: EditableHookCommand[];
  Stop: EditableHookCommand[];
  SubagentStop: EditableHookCommand[];
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const matcherEvents = ['PreToolUse', 'PostToolUse'] as const;
const directEvents = ['Notification', 'Stop', 'SubagentStop'] as const;

const EVENT_INFO: Record<HookEvent, { label: string; description: string; icon: React.ReactNode }> = {
  PreToolUse: {
    label: 'Pre Tool Use',
    description: 'Runs before tool calls, can block and provide feedback',
    icon: <Shield className="h-4 w-4" />
  },
  PostToolUse: {
    label: 'Post Tool Use',
    description: 'Runs after successful tool completion',
    icon: <PlayCircle className="h-4 w-4" />
  },
  Notification: {
    label: 'Notification',
    description: 'Customizes notifications when Claude needs attention',
    icon: <Zap className="h-4 w-4" />
  },
  Stop: {
    label: 'Stop',
    description: 'Runs when Claude finishes responding',
    icon: <Code2 className="h-4 w-4" />
  },
  SubagentStop: {
    label: 'Subagent Stop',
    description: 'Runs when a Claude subagent (Task) finishes',
    icon: <Terminal className="h-4 w-4" />
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildEditableHooks(hooks: HooksConfiguration): EditableHooksState {
  const result: EditableHooksState = {
    PreToolUse: [], PostToolUse: [], Notification: [], Stop: [], SubagentStop: []
  };

  matcherEvents.forEach(event => {
    const matchers = hooks?.[event] as HookMatcher[] | undefined;
    if (matchers && Array.isArray(matchers)) {
      result[event] = matchers.map(matcher => ({
        ...matcher,
        id: HooksManager.generateId(),
        expanded: false,
        hooks: (matcher.hooks || []).map(hook => ({ ...hook, id: HooksManager.generateId() }))
      }));
    }
  });

  directEvents.forEach(event => {
    const commands = hooks?.[event] as HookCommand[] | undefined;
    if (commands && Array.isArray(commands)) {
      result[event] = commands.map(hook => ({ ...hook, id: HooksManager.generateId() }));
    }
  });

  return result;
}

function serializeHooks(editableHooks: EditableHooksState): HooksConfiguration {
  const newHooks: HooksConfiguration = {};

  matcherEvents.forEach(event => {
    const matchers = editableHooks[event];
    if (matchers.length > 0) {
      newHooks[event] = matchers.map(({ id, expanded, ...matcher }) => ({
        ...matcher,
        hooks: matcher.hooks.map(({ id, ...hook }) => ({ ...hook, command: hook.command ?? '' }))
      }));
    }
  });

  directEvents.forEach(event => {
    const commands = editableHooks[event];
    if (commands.length > 0) {
      newHooks[event] = commands.map(({ id, ...hook }) => ({ ...hook, command: hook.command ?? '' }));
    }
  });

  return newHooks;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const HooksEditor: React.FC<HooksEditorProps> = ({
  projectPath,
  scope,
  readOnly = false,
  className,
  onChange,
  hideActions = false
}) => {
  const [selectedEvent, setSelectedEvent] = useState<HookEvent>('PreToolUse');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const isInitialMount = React.useRef(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hooks, setHooks] = useState<HooksConfiguration>({});
  const [editableHooks, setEditableHooks] = useState<EditableHooksState>(() => buildEditableHooks({}));

  // Load hooks when projectPath or scope changes
  useEffect(() => {
    if (scope === 'user' || projectPath) {
      setIsLoading(true);
      setLoadError(null);
      api.getHooksConfig(scope, projectPath)
        .then((config) => { setHooks(config || {}); setHasUnsavedChanges(false); })
        .catch((err) => {
          console.error("Failed to load hooks configuration:", err);
          setLoadError(err instanceof Error ? err.message : "Failed to load hooks configuration");
          setHooks({});
        })
        .finally(() => setIsLoading(false));
    } else {
      setHooks({});
    }
  }, [projectPath, scope]);

  // Re-init editable hooks when hooks change
  useEffect(() => {
    isInitialMount.current = true;
    setHasUnsavedChanges(false);
    setEditableHooks(buildEditableHooks(hooks));
  }, [hooks]);

  // Track changes
  useEffect(() => {
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    setHasUnsavedChanges(true);
  }, [editableHooks]);

  // Notify parent
  useEffect(() => {
    if (onChange) {
      onChange(hasUnsavedChanges, () => serializeHooks(editableHooks));
    }
  }, [hasUnsavedChanges, editableHooks, onChange]);

  // Validate
  useEffect(() => {
    if (!hooks) { setValidationErrors([]); setValidationWarnings([]); return; }
    HooksManager.validateConfig(hooks).then(result => {
      setValidationErrors(result.errors.map(e => e.message));
      setValidationWarnings(result.warnings.map(w => `${w.message} in command: ${(w.command || '').substring(0, 50)}...`));
    }).catch(console.warn);
  }, [hooks]);

  const handleSave = async () => {
    if (scope !== 'user' && !projectPath) return;
    setIsSaving(true);
    const newHooks = serializeHooks(editableHooks);
    try {
      await api.updateHooksConfig(scope, newHooks, projectPath);
      setHooks(newHooks);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to save hooks:', error);
      setLoadError(error instanceof Error ? error.message : 'Failed to save hooks');
    } finally {
      setIsSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Mutation helpers
  // ---------------------------------------------------------------------------

  const addMatcher = (event: HookEvent) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    const newMatcher: EditableHookMatcher = { id: HooksManager.generateId(), matcher: '', hooks: [], expanded: true };
    setEditableHooks(prev => ({ ...prev, [event]: [...(prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]), newMatcher] }));
  };

  const addDirectCommand = (event: HookEvent) => {
    if (!(directEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    const newCommand: EditableHookCommand = { id: HooksManager.generateId(), type: 'command', command: '' };
    setEditableHooks(prev => ({ ...prev, [event]: [...(prev[event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]), newCommand] }));
  };

  const updateMatcher = (event: HookEvent, matcherId: string, updates: Partial<EditableHookMatcher>) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).map(m => m.id === matcherId ? { ...m, ...updates } : m) }));
  };

  const removeMatcher = (event: HookEvent, matcherId: string) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).filter(m => m.id !== matcherId) }));
  };

  const updateDirectCommand = (event: HookEvent, commandId: string, updates: Partial<EditableHookCommand>) => {
    if (!(directEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]).map(c => c.id === commandId ? { ...c, ...updates } : c) }));
  };

  const removeDirectCommand = (event: HookEvent, commandId: string) => {
    if (!(directEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]).filter(c => c.id !== commandId) }));
  };

  const addCommand = (event: HookEvent, matcherId: string) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    const newCommand: EditableHookCommand = { id: HooksManager.generateId(), type: 'command', command: '' };
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).map(m => m.id === matcherId ? { ...m, hooks: [...m.hooks, newCommand] } : m) }));
  };

  const updateCommand = (event: HookEvent, matcherId: string, commandId: string, updates: Partial<EditableHookCommand>) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).map(m => m.id === matcherId ? { ...m, hooks: m.hooks.map(c => c.id === commandId ? { ...c, ...updates } : c) } : m) }));
  };

  const removeCommand = (event: HookEvent, matcherId: string, commandId: string) => {
    if (!(matcherEvents as ReadonlyArray<HookEvent>).includes(event)) return;
    setEditableHooks(prev => ({ ...prev, [event]: (prev[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).map(m => m.id === matcherId ? { ...m, hooks: m.hooks.filter(c => c.id !== commandId) } : m) }));
  };

  const applyTemplate = (template: HookTemplate) => {
    if ((matcherEvents as ReadonlyArray<HookEvent>).includes(template.event)) {
      const newMatcher: EditableHookMatcher = {
        id: HooksManager.generateId(),
        matcher: template.matcher,
        hooks: template.commands.map(cmd => ({ id: HooksManager.generateId(), type: 'command' as const, command: cmd })),
        expanded: true
      };
      setEditableHooks(prev => ({ ...prev, [template.event]: [...(prev[template.event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]), newMatcher] }));
    } else {
      const newCommands: EditableHookCommand[] = template.commands.map(cmd => ({ id: HooksManager.generateId(), type: 'command' as const, command: cmd }));
      setEditableHooks(prev => ({ ...prev, [template.event]: [...(prev[template.event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]), ...newCommands] }));
    }
    setSelectedEvent(template.event);
    setShowTemplateDialog(false);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={cn("space-y-6", className)}>
      {isLoading && (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span className="text-sm text-muted-foreground">Loading hooks configuration...</span>
        </div>
      )}

      {loadError && !isLoading && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {loadError}
        </div>
      )}

      {!isLoading && (
        <>
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Hooks Configuration</h3>
              <div className="flex items-center gap-2">
                <Badge variant={scope === 'project' ? 'secondary' : scope === 'local' ? 'outline' : 'default'}>
                  {scope === 'project' ? 'Project' : scope === 'local' ? 'Local' : 'User'} Scope
                </Badge>
                {!readOnly && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setShowTemplateDialog(true)}>
                      <FileText className="h-4 w-4 mr-2" />
                      Templates
                    </Button>
                    {!hideActions && (
                      <Button
                        variant={hasUnsavedChanges ? "default" : "outline"}
                        size="sm"
                        onClick={handleSave}
                        disabled={!hasUnsavedChanges || isSaving || !projectPath}
                      >
                        {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure shell commands to execute at various points in Claude Code's lifecycle.
              {scope === 'local' && ' These settings are not committed to version control.'}
            </p>
            {hasUnsavedChanges && !readOnly && (
              <p className="text-sm text-amber-600">You have unsaved changes. Click Save to persist them.</p>
            )}
          </div>

          {/* Validation */}
          {validationErrors.length > 0 && (
            <div className="p-3 bg-red-500/10 rounded-md space-y-1">
              <p className="text-sm font-medium text-red-600">Validation Errors:</p>
              {validationErrors.map((error, i) => (
                <p key={i} className="text-xs text-red-600">• {error}</p>
              ))}
            </div>
          )}
          {validationWarnings.length > 0 && (
            <div className="p-3 bg-yellow-500/10 rounded-md space-y-1">
              <p className="text-sm font-medium text-yellow-600">Security Warnings:</p>
              {validationWarnings.map((warning, i) => (
                <p key={i} className="text-xs text-yellow-600">• {warning}</p>
              ))}
            </div>
          )}

          {/* Event Tabs */}
          <Tabs value={selectedEvent} onValueChange={(v) => setSelectedEvent(v as HookEvent)}>
            <TabsList className="w-full">
              {(Object.keys(EVENT_INFO) as HookEvent[]).map(event => {
                const isMatcherEvent = (matcherEvents as ReadonlyArray<HookEvent>).includes(event);
                const count = isMatcherEvent
                  ? (editableHooks[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[]).length
                  : (editableHooks[event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]).length;
                return (
                  <TabsTrigger key={event} value={event} className="flex items-center gap-2">
                    {EVENT_INFO[event].icon}
                    <span className="hidden sm:inline">{EVENT_INFO[event].label}</span>
                    {count > 0 && (
                      <Badge variant="secondary" className="ml-1 h-5 px-1">{count}</Badge>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {(Object.keys(EVENT_INFO) as HookEvent[]).map(event => {
              const isMatcherEvent = (matcherEvents as ReadonlyArray<HookEvent>).includes(event);
              const items = isMatcherEvent
                ? (editableHooks[event as 'PreToolUse' | 'PostToolUse'] as EditableHookMatcher[])
                : (editableHooks[event as 'Notification' | 'Stop' | 'SubagentStop'] as EditableHookCommand[]);

              return (
                <TabsContent key={event} value={event} className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">{EVENT_INFO[event].description}</p>
                  </div>
                  <HookList
                    event={event}
                    isMatcherEvent={isMatcherEvent}
                    items={items}
                    readOnly={readOnly}
                    onAddMatcher={addMatcher}
                    onAddDirectCommand={addDirectCommand}
                    onUpdateMatcher={updateMatcher}
                    onRemoveMatcher={removeMatcher}
                    onUpdateDirectCommand={updateDirectCommand}
                    onRemoveDirectCommand={removeDirectCommand}
                    onAddCommand={addCommand}
                    onUpdateCommand={updateCommand}
                    onRemoveCommand={removeCommand}
                  />
                </TabsContent>
              );
            })}
          </Tabs>

          {/* Template Dialog */}
          <HookEditForm
            open={showTemplateDialog}
            onOpenChange={setShowTemplateDialog}
            matcherEvents={matcherEvents}
            eventInfo={EVENT_INFO}
            onApplyTemplate={applyTemplate}
          />
        </>
      )}
    </div>
  );
};
