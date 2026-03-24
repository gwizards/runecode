/**
 * HookEditForm — the template-picker dialog shown when the user clicks
 * "Templates" in HooksEditor.
 */

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  HookTemplate,
  HOOK_TEMPLATES,
} from '@/types/hooks';
import type { HookEvent } from '@/types/hooks';

interface EventInfo {
  label: string;
  description: string;
  icon: React.ReactNode;
}

interface HookEditFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matcherEvents: readonly HookEvent[];
  eventInfo: Record<HookEvent, EventInfo>;
  onApplyTemplate: (template: HookTemplate) => void;
}

export const HookEditForm: React.FC<HookEditFormProps> = ({
  open,
  onOpenChange,
  matcherEvents,
  eventInfo,
  onApplyTemplate,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Hook Templates</DialogTitle>
          <DialogDescription>
            Choose a pre-configured hook template to get started quickly
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {HOOK_TEMPLATES.map(template => (
            <Card
              key={template.id}
              className="p-4 cursor-pointer hover:bg-accent"
              onClick={() => onApplyTemplate(template)}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{template.name}</h4>
                  <Badge>{eventInfo[template.event].label}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{template.description}</p>
                {(matcherEvents as ReadonlyArray<HookEvent>).includes(template.event) && template.matcher && (
                  <p className="text-xs font-mono bg-muted px-2 py-1 rounded inline-block">
                    Matcher: {template.matcher}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
