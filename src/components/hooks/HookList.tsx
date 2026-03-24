/**
 * HookList — renders the list of matchers or direct commands for a single
 * hook event tab, plus the "empty state" card and "add another" button.
 */

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, AlertTriangle, ChevronRight, ChevronDown, Clock, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HooksManager } from '@/lib/hooksManager';
import { COMMON_TOOL_MATCHERS } from '@/types/hooks';
import type { HookEvent } from '@/types/hooks';

export interface EditableHookCommand {
  id: string;
  type: 'command';
  command?: string;
  timeout?: number;
}

export interface EditableHookMatcher {
  id: string;
  matcher?: string;
  hooks: EditableHookCommand[];
  expanded?: boolean;
}

interface HookListProps {
  event: HookEvent;
  isMatcherEvent: boolean;
  items: EditableHookMatcher[] | EditableHookCommand[];
  readOnly: boolean;
  onAddMatcher: (event: HookEvent) => void;
  onAddDirectCommand: (event: HookEvent) => void;
  onUpdateMatcher: (event: HookEvent, matcherId: string, updates: Partial<EditableHookMatcher>) => void;
  onRemoveMatcher: (event: HookEvent, matcherId: string) => void;
  onUpdateDirectCommand: (event: HookEvent, commandId: string, updates: Partial<EditableHookCommand>) => void;
  onRemoveDirectCommand: (event: HookEvent, commandId: string) => void;
  onAddCommand: (event: HookEvent, matcherId: string) => void;
  onUpdateCommand: (event: HookEvent, matcherId: string, commandId: string, updates: Partial<EditableHookCommand>) => void;
  onRemoveCommand: (event: HookEvent, matcherId: string, commandId: string) => void;
}

function MatcherCard({
  matcher,
  readOnly,
  onUpdate,
  onRemove,
  onAddCommand,
  onUpdateCommand,
  onRemoveCommand,
}: {
  matcher: EditableHookMatcher;
  readOnly: boolean;
  onUpdate: (updates: Partial<EditableHookMatcher>) => void;
  onRemove: () => void;
  onAddCommand: () => void;
  onUpdateCommand: (commandId: string, updates: Partial<EditableHookCommand>) => void;
  onRemoveCommand: (commandId: string) => void;
}) {
  return (
    <Card key={matcher.id} className="p-4 space-y-4">
      <div className="flex items-start gap-4">
        <Button
          variant="ghost"
          size="sm"
          className="p-0 h-6 w-6"
          onClick={() => onUpdate({ expanded: !matcher.expanded })}
        >
          {matcher.expanded
            ? <ChevronDown className="h-4 w-4" />
            : <ChevronRight className="h-4 w-4" />}
        </Button>

        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Label htmlFor={`matcher-${matcher.id}`}>Pattern</Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Tool name pattern (regex supported). Leave empty to match all tools.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="flex items-center gap-2">
            <Input
              id={`matcher-${matcher.id}`}
              placeholder="e.g., Bash, Edit|Write, mcp__.*"
              value={matcher.matcher || ''}
              onChange={(e) => onUpdate({ matcher: e.target.value })}
              disabled={readOnly}
              className="flex-1"
            />

            <Select
              value={matcher.matcher || 'custom'}
              onValueChange={(value) => {
                if (value !== 'custom') {
                  onUpdate({ matcher: value });
                }
              }}
              disabled={readOnly}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Common patterns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                {COMMON_TOOL_MATCHERS.map(pattern => (
                  <SelectItem key={pattern} value={pattern}>{pattern}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {matcher.expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 pl-10"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Commands</Label>
                {!readOnly && (
                  <Button variant="outline" size="sm" onClick={onAddCommand}>
                    <Plus className="h-3 w-3 mr-1" />
                    Add Command
                  </Button>
                )}
              </div>

              {matcher.hooks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No commands added yet</p>
              ) : (
                <div className="space-y-2">
                  {matcher.hooks.map((hook) => (
                    <div key={hook.id} className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 space-y-2">
                          <Textarea
                            placeholder="Enter shell command..."
                            value={hook.command || ''}
                            onChange={(e) => onUpdateCommand(hook.id, { command: e.target.value })}
                            disabled={readOnly}
                            className="font-mono text-sm min-h-[80px]"
                          />

                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <Input
                                type="number"
                                placeholder="60"
                                value={hook.timeout || ''}
                                onChange={(e) => onUpdateCommand(hook.id, {
                                  timeout: e.target.value ? parseInt(e.target.value) : undefined
                                })}
                                disabled={readOnly}
                                className="w-20 h-8"
                              />
                              <span className="text-sm text-muted-foreground">seconds</span>
                            </div>

                            {!readOnly && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveCommand(hook.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>

                      {(() => {
                        const warnings = HooksManager.checkDangerousPatterns(hook.command || '');
                        return warnings.length > 0 && (
                          <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded-md">
                            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
                            <div className="space-y-1">
                              {warnings.map((warning, i) => (
                                <p key={i} className="text-xs text-yellow-600">{warning}</p>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function DirectCommandCard({
  command,
  readOnly,
  onUpdate,
  onRemove,
}: {
  command: EditableHookCommand;
  readOnly: boolean;
  onUpdate: (updates: Partial<EditableHookCommand>) => void;
  onRemove: () => void;
}) {
  return (
    <Card key={command.id} className="p-4 space-y-2">
      <div className="flex items-start gap-2">
        <div className="flex-1 space-y-2">
          <Textarea
            placeholder="Enter shell command..."
            value={command.command || ''}
            onChange={(e) => onUpdate({ command: e.target.value })}
            disabled={readOnly}
            className="font-mono text-sm min-h-[80px]"
          />

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <Input
                type="number"
                placeholder="60"
                value={command.timeout || ''}
                onChange={(e) => onUpdate({
                  timeout: e.target.value ? parseInt(e.target.value) : undefined
                })}
                disabled={readOnly}
                className="w-20 h-8"
              />
              <span className="text-sm text-muted-foreground">seconds</span>
            </div>

            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={onRemove}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {(() => {
        const warnings = HooksManager.checkDangerousPatterns(command.command || '');
        return warnings.length > 0 && (
          <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded-md">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" />
            <div className="space-y-1">
              {warnings.map((warning, i) => (
                <p key={i} className="text-xs text-yellow-600">{warning}</p>
              ))}
            </div>
          </div>
        );
      })()}
    </Card>
  );
}

export const HookList: React.FC<HookListProps> = ({
  event,
  isMatcherEvent,
  items,
  readOnly,
  onAddMatcher,
  onAddDirectCommand,
  onUpdateMatcher,
  onRemoveMatcher,
  onUpdateDirectCommand,
  onRemoveDirectCommand,
  onAddCommand,
  onUpdateCommand,
  onRemoveCommand,
}) => {
  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-muted-foreground mb-4">No hooks configured for this event</p>
        {!readOnly && (
          <Button onClick={() => isMatcherEvent ? onAddMatcher(event) : onAddDirectCommand(event)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Hook
          </Button>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {isMatcherEvent
        ? (items as EditableHookMatcher[]).map(matcher => (
          <MatcherCard
            key={matcher.id}
            matcher={matcher}
            readOnly={readOnly}
            onUpdate={(updates) => onUpdateMatcher(event, matcher.id, updates)}
            onRemove={() => onRemoveMatcher(event, matcher.id)}
            onAddCommand={() => onAddCommand(event, matcher.id)}
            onUpdateCommand={(cmdId, updates) => onUpdateCommand(event, matcher.id, cmdId, updates)}
            onRemoveCommand={(cmdId) => onRemoveCommand(event, matcher.id, cmdId)}
          />
        ))
        : (items as EditableHookCommand[]).map(command => (
          <DirectCommandCard
            key={command.id}
            command={command}
            readOnly={readOnly}
            onUpdate={(updates) => onUpdateDirectCommand(event, command.id, updates)}
            onRemove={() => onRemoveDirectCommand(event, command.id)}
          />
        ))
      }

      {!readOnly && (
        <Button
          variant="outline"
          onClick={() => isMatcherEvent ? onAddMatcher(event) : onAddDirectCommand(event)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Another {isMatcherEvent ? 'Matcher' : 'Command'}
        </Button>
      )}
    </div>
  );
};
