/**
 * SlashCommandForm — the create/edit dialog extracted from SlashCommandsManager.
 * Handles all form state internally; calls onSave with the final form values.
 */

import React, { useState, useEffect } from 'react';
import {
  Save,
  Loader2,
  Globe,
  FolderOpen,
  Code,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import type { SlashCommand } from '@/lib/api';
import { COMMON_TOOL_MATCHERS } from '@/types/hooks';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommandFormValues {
  name: string;
  namespace: string;
  content: string;
  description: string;
  allowedTools: string[];
  scope: 'project' | 'user';
}

interface SlashCommandFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingCommand: SlashCommand | null;
  initialValues: CommandFormValues;
  scopeFilter: 'project' | 'user' | 'all';
  projectPath?: string;
  saving: boolean;
  error: string | null;
  onSave: (values: CommandFormValues) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Example commands for the template picker
// ---------------------------------------------------------------------------

const EXAMPLE_COMMANDS = [
  {
    name: "review",
    description: "Review code for best practices",
    content: "Review the following code for best practices, potential issues, and improvements:\n\n@$ARGUMENTS",
    allowedTools: ["Read", "Grep"]
  },
  {
    name: "explain",
    description: "Explain how something works",
    content: "Explain how $ARGUMENTS works in detail, including its purpose, implementation, and usage examples.",
    allowedTools: ["Read", "Grep", "WebSearch"]
  },
  {
    name: "fix-issue",
    description: "Fix a specific issue",
    content: "Fix issue #$ARGUMENTS following our coding standards and best practices.",
    allowedTools: ["Read", "Edit", "MultiEdit", "Write"]
  },
  {
    name: "test",
    description: "Write tests for code",
    content: "Write comprehensive tests for:\n\n@$ARGUMENTS\n\nInclude unit tests, edge cases, and integration tests where appropriate.",
    allowedTools: ["Read", "Write", "Edit"]
  }
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const SlashCommandForm: React.FC<SlashCommandFormProps> = ({
  open,
  onOpenChange,
  editingCommand,
  initialValues,
  scopeFilter,
  projectPath,
  saving,
  error,
  onSave,
}) => {
  const [form, setForm] = useState<CommandFormValues>(initialValues);

  // Sync when dialog opens with new values
  useEffect(() => {
    setForm(initialValues);
  }, [initialValues, open]);

  const handleToolToggle = (tool: string) => {
    setForm(prev => ({
      ...prev,
      allowedTools: prev.allowedTools.includes(tool)
        ? prev.allowedTools.filter(t => t !== tool)
        : [...prev.allowedTools, tool]
    }));
  };

  const applyExample = (example: typeof EXAMPLE_COMMANDS[0]) => {
    setForm(prev => ({
      ...prev,
      name: example.name,
      description: example.description,
      content: example.content,
      allowedTools: example.allowedTools
    }));
  };

  const handleSave = () => onSave(form);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingCommand ? "Edit Command" : "Create New Command"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Scope */}
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select
              value={form.scope}
              onValueChange={(value: 'project' | 'user') => setForm(prev => ({ ...prev, scope: value }))}
              disabled={scopeFilter !== 'all' || (!projectPath && form.scope === 'project')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(scopeFilter === 'all' || scopeFilter === 'user') && (
                  <SelectItem value="user">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      User (Global)
                    </div>
                  </SelectItem>
                )}
                {(scopeFilter === 'all' || scopeFilter === 'project') && (
                  <SelectItem value="project" disabled={!projectPath}>
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Project
                    </div>
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {form.scope === 'user' ? "Available across all projects" : "Only available in this project"}
            </p>
          </div>

          {/* Name and Namespace */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Command Name*</Label>
              <Input
                placeholder="e.g., review, fix-issue"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Namespace (Optional)</Label>
              <Input
                placeholder="e.g., frontend, backend"
                value={form.namespace}
                onChange={(e) => setForm(prev => ({ ...prev, namespace: e.target.value }))}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description (Optional)</Label>
            <Input
              placeholder="Brief description of what this command does"
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            />
          </div>

          {/* Content */}
          <div className="space-y-2">
            <Label>Command Content*</Label>
            <Textarea
              placeholder="Enter the prompt content. Use $ARGUMENTS for dynamic values."
              value={form.content}
              onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
              className="min-h-[150px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Use <code>$ARGUMENTS</code> for user input, <code>@filename</code> for files,
              and <code>!`command`</code> for bash commands
            </p>
          </div>

          {/* Allowed Tools */}
          <div className="space-y-2">
            <Label>Allowed Tools</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_TOOL_MATCHERS.map((tool) => (
                <Button
                  key={tool}
                  variant={form.allowedTools.includes(tool) ? "default" : "outline"}
                  size="sm"
                  onClick={() => handleToolToggle(tool)}
                  type="button"
                >
                  {tool}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Select which tools Claude can use with this command
            </p>
          </div>

          {/* Examples */}
          {!editingCommand && (
            <div className="space-y-2">
              <Label>Examples</Label>
              <div className="grid grid-cols-2 gap-2">
                {EXAMPLE_COMMANDS.map((example) => (
                  <Button
                    key={example.name}
                    variant="outline"
                    size="sm"
                    onClick={() => applyExample(example)}
                    className="justify-start"
                  >
                    <Code className="h-4 w-4 mr-2" />
                    {example.name}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {form.name && (
            <div className="space-y-2">
              <Label>Preview</Label>
              <div className="p-3 bg-muted rounded-md">
                <code className="text-sm">
                  /
                  {form.namespace && `${form.namespace}:`}
                  {form.name}
                  {form.content.includes('$ARGUMENTS') && ' [arguments]'}
                </code>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!form.name || !form.content || saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
