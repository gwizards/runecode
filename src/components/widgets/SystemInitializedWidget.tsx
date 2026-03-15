import React, { useState } from "react";
import {
  FolderOpen,
  FileText,
  Search,
  Terminal,
  ChevronDown,
  Settings,
  Fingerprint,
  Cpu,
  FolderSearch,
  List,
  LogOut,
  Edit3,
  FilePlus,
  Book,
  BookOpen,
  Globe,
  ListChecks,
  ListPlus,
  Globe2,
  Package,
  Package2,
  Wrench,
  CheckSquare,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Widget for displaying system initialization information in a visually appealing way
 * Separates regular tools from MCP tools and provides icons for each tool type
 */
export const SystemInitializedWidget: React.FC<{
  sessionId?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
}> = ({ sessionId, model, cwd, tools = [] }) => {
  const [mcpExpanded, setMcpExpanded] = useState(false);
  
  const regularTools = tools.filter(tool => !tool.startsWith('mcp__'));
  const mcpTools = tools.filter(tool => tool.startsWith('mcp__'));
  
  const toolIcons: Record<string, LucideIcon> = {
    'task': CheckSquare,
    'bash': Terminal,
    'glob': FolderSearch,
    'grep': Search,
    'ls': List,
    'exit_plan_mode': LogOut,
    'read': FileText,
    'edit': Edit3,
    'multiedit': Edit3,
    'write': FilePlus,
    'notebookread': Book,
    'notebookedit': BookOpen,
    'webfetch': Globe,
    'todoread': ListChecks,
    'todowrite': ListPlus,
    'websearch': Globe2,
  };
  
  const getToolIcon = (toolName: string) => {
    const normalizedName = toolName.toLowerCase();
    return toolIcons[normalizedName] || Wrench;
  };
  
  const formatMcpToolName = (toolName: string) => {
    const withoutPrefix = toolName.replace(/^mcp__/, '');
    const parts = withoutPrefix.split('__');
    if (parts.length >= 2) {
      const provider = parts[0].replace(/_/g, ' ').replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      const method = parts.slice(1).join('__').replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { provider, method };
    }
    return {
      provider: 'MCP',
      method: withoutPrefix.replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
    };
  };
  
  const mcpToolsByProvider = mcpTools.reduce((acc, tool) => {
    const { provider } = formatMcpToolName(tool);
    if (!acc[provider]) {
      acc[provider] = [];
    }
    acc[provider].push(tool);
    return acc;
  }, {} as Record<string, string[]>);
  
  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Settings className="h-5 w-5 text-blue-500 mt-0.5" />
          <div className="flex-1 space-y-4">
            <h4 className="font-semibold text-sm">System Initialized</h4>
            
            {/* Session Info */}
            <div className="space-y-2">
              {sessionId && (
                <div className="flex items-center gap-2 text-xs">
                  <Fingerprint className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Session ID:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {sessionId}
                  </code>
                </div>
              )}
              
              {model && (
                <div className="flex items-center gap-2 text-xs">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Model:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                    {model}
                  </code>
                </div>
              )}
              
              {cwd && (
                <div className="flex items-center gap-2 text-xs">
                  <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Working Directory:</span>
                  <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                    {cwd}
                  </code>
                </div>
              )}
            </div>
            
            {/* Regular Tools */}
            {regularTools.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Available Tools ({regularTools.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {regularTools.map((tool, idx) => {
                    const Icon = getToolIcon(tool);
                    return (
                      <Badge 
                        key={idx} 
                        variant="secondary" 
                        className="text-xs py-0.5 px-2 flex items-center gap-1"
                      >
                        <Icon className="h-3 w-3" />
                        {tool}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}
            
            {/* MCP Tools */}
            {mcpTools.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setMcpExpanded(!mcpExpanded)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Package className="h-3.5 w-3.5" />
                  <span>MCP Services ({mcpTools.length})</span>
                  <ChevronDown className={cn(
                    "h-3 w-3 transition-transform",
                    mcpExpanded && "rotate-180"
                  )} />
                </button>
                
                {mcpExpanded && (
                  <div className="ml-5 space-y-3">
                    {Object.entries(mcpToolsByProvider).map(([provider, providerTools]) => (
                      <div key={provider} className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Package2 className="h-3 w-3" />
                          <span className="font-medium">{provider}</span>
                          <span className="text-muted-foreground/60">({providerTools.length})</span>
                        </div>
                        <div className="ml-4 flex flex-wrap gap-1">
                          {providerTools.map((tool, idx) => {
                            const { method } = formatMcpToolName(tool);
                            return (
                              <Badge 
                                key={idx} 
                                variant="outline" 
                                className="text-xs py-0 px-1.5 font-normal"
                              >
                                {method}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            {tools.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                No tools available
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
