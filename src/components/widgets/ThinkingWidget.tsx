import React, { useState } from "react";
import {
  ChevronRight,
  Bot,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Widget for displaying AI thinking/reasoning content
 * Collapsible and closed by default
 */
export const ThinkingWidget: React.FC<{ 
  thinking: string;
  signature?: string;
}> = ({ thinking }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const trimmedThinking = thinking.trim();
  
  return (
    <div className="rounded-lg border border-border bg-muted/30 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <Sparkles className="h-2.5 w-2.5 text-muted-foreground/70 absolute -top-1 -right-1 animate-pulse" />
          </div>
          <span className="text-sm font-medium text-muted-foreground italic">
            {isExpanded ? "Thinking..." : "Thinking... (click to expand)"}
          </span>
        </div>
        <ChevronRight className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          isExpanded && "rotate-90"
        )} />
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 pt-2 border-t border-border">
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap bg-muted/30 p-3 rounded-lg italic">
            {trimmedThinking}
          </pre>
        </div>
      )}
    </div>
  );
};
