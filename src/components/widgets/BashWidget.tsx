import React from "react";
import {
  Terminal,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractResultContent, type ToolResult } from "./types";

/**
 * Widget for Bash tool
 */
export const BashWidget: React.FC<{
  command: string;
  description?: string;
  result?: ToolResult;
}> = ({ command, description, result }) => {
  const { content: resultContent, isError } = extractResultContent(result);
  
  return (
    <div className="rounded-lg border border-muted-foreground/15 bg-background overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 flex items-center gap-2 border-b">
        <Terminal className="h-3.5 w-3.5 text-green-500" />
        <span className="text-xs font-mono text-muted-foreground">Terminal</span>
        {description && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground truncate">{description}</span>
          </>
        )}
        {!result && (
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span>Running...</span>
          </div>
        )}
        {result && isError && (
          <div className="ml-auto">
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">
              exit 1
            </span>
          </div>
        )}
      </div>
      <div className="px-3 py-2.5 bg-background/60">
        <code className="text-sm font-mono text-green-400 block">
          <span className="text-muted-foreground/60 select-none">$ </span>{command}
        </code>
      </div>

      {result && resultContent && (
        <div className={cn(
          "px-3 py-2.5 border-t font-mono text-sm whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto",
          isError
            ? "text-red-400 bg-red-500/[0.03]"
            : "text-muted-foreground bg-muted/20"
        )}>
          {resultContent}
        </div>
      )}
      {result && !resultContent && (
        <div className="px-3 py-2 border-t text-xs text-muted-foreground/60 italic bg-muted/20">
          {isError ? "Command failed with no output" : "Command completed successfully"}
        </div>
      )}
    </div>
  );
};
