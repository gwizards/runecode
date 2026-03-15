import React, { useState } from "react";
import {
  Code,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Package2,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useShiki, highlightCode } from "@/hooks/useShiki";

/**
 * Widget for MCP (Model Context Protocol) tools
 */
export const MCPWidget: React.FC<{ 
  toolName: string; 
  input?: any;
  result?: any;
}> = ({ toolName, input, result: _result }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const highlighter = useShiki();
  
  const parts = toolName.split('__');
  const namespace = parts[1] || '';
  const method = parts[2] || '';
  
  const formatNamespace = (ns: string) => {
    return ns
      .replace(/-/g, ' ')
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  const formatMethod = (m: string) => {
    return m
      .replace(/_/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  const hasInput = input && Object.keys(input).length > 0;
  const inputString = hasInput ? JSON.stringify(input, null, 2) : '';
  const isLargeInput = inputString.length > 200;
  
  const estimateTokens = (str: string) => {
    return Math.ceil(str.length / 4);
  };
  
  const inputTokens = hasInput ? estimateTokens(inputString) : 0;

  return (
    <div className="rounded-lg border border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-purple-500/5 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-violet-500/10 to-purple-500/10 border-b border-violet-500/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Package2 className="h-4 w-4 text-violet-500" />
              <Sparkles className="h-2.5 w-2.5 text-violet-400 absolute -top-1 -right-1" />
            </div>
            <span className="text-sm font-medium text-violet-600 dark:text-violet-400">MCP Tool</span>
          </div>
          {hasInput && (
            <div className="flex items-center gap-2">
              <Badge 
                variant="outline" 
                className="text-xs border-violet-500/30 text-violet-600 dark:text-violet-400"
              >
                ~{inputTokens} tokens
              </Badge>
              {isLargeInput && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="text-violet-500 hover:text-violet-600 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Tool Path */}
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-violet-500 font-medium">MCP</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-purple-600 dark:text-purple-400 font-medium">
            {formatNamespace(namespace)}
          </span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-violet-500" />
            <code className="text-sm font-mono font-semibold text-foreground">
              {formatMethod(method)}
              <span className="text-muted-foreground">()</span>
            </code>
          </div>
        </div>
        
        {/* Input Parameters */}
        {hasInput && (
          <div className={cn(
            "transition-all duration-200",
            !isExpanded && isLargeInput && "max-h-[200px]"
          )}>
            <div className="relative">
              <div className={cn(
                "rounded-lg border bg-background/50 overflow-hidden",
                !isExpanded && isLargeInput && "max-h-[200px]"
              )}>
                <div className="px-3 py-2 border-b bg-muted/50 flex items-center gap-2">
                  <Code className="h-3 w-3 text-violet-500" />
                  <span className="text-xs font-mono text-muted-foreground">Parameters</span>
                </div>
                <div className={cn(
                  "overflow-auto",
                  !isExpanded && isLargeInput && "max-h-[150px]"
                )}>
                  {highlighter ? (
                    <div
                      className="[&_pre]:m-0 [&_pre]:p-3 [&_pre]:bg-transparent [&_code]:text-xs [&_code]:leading-[1.5]"
                      dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, inputString, 'json') }}
                    />
                  ) : (
                    <pre className="m-0 p-3 bg-transparent"><code className="text-xs leading-[1.5]">{inputString}</code></pre>
                  )}
                </div>
              </div>
              
              {!isExpanded && isLargeInput && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
              )}
            </div>
            
            {!isExpanded && isLargeInput && (
              <div className="text-center mt-2">
                <button
                  onClick={() => setIsExpanded(true)}
                  className="text-xs text-violet-500 hover:text-violet-600 transition-colors inline-flex items-center gap-1"
                >
                  <ChevronDown className="h-3 w-3" />
                  Show full parameters
                </button>
              </div>
            )}
          </div>
        )}
        
        {!hasInput && (
          <div className="text-xs text-muted-foreground italic px-2">
            No parameters required
          </div>
        )}
      </div>
    </div>
  );
};
