import React, { useState } from "react";
import {
  FileText,
  FileEdit,
  Maximize2,
  X,
} from "lucide-react";
import { useShiki, highlightCode } from "@/hooks/useShiki";
import { Button } from "@/components/ui/button";
import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { getLanguage, type ToolResult } from "./types";

/**
 * Widget for Write tool
 */
export const WriteWidget: React.FC<{ filePath: string; content: string; result?: ToolResult }> = ({ filePath, content, result: _result }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const highlighter = useShiki();
  
  const language = getLanguage(filePath);
  const isLargeContent = content.length > 1000;
  const displayContent = isLargeContent ? content.substring(0, 1000) + "\n..." : content;

  const MaximizedView = () => {
    if (!isMaximized) return null;
    
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div 
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={() => setIsMaximized(false)}
        />
        
        <div className="relative w-[90vw] h-[90vh] max-w-7xl bg-background rounded-lg border shadow-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b bg-background flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-mono text-muted-foreground">{filePath}</span>
            </div>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={() => setIsMaximized(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="flex-1 overflow-auto">
            {highlighter ? (
              <div
                className="[&_pre]:m-0 [&_pre]:p-6 [&_pre]:bg-transparent [&_code]:text-xs [&_code]:leading-[1.5] h-full"
                dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, content, language) }}
              />
            ) : (
              <pre className="m-0 p-6 bg-transparent h-full"><code className="text-xs leading-[1.5]">{content}</code></pre>
            )}
          </div>
        </div>
      </div>,
      document.body
    );
  };

  const CodePreview = ({ codeContent, truncated }: { codeContent: string; truncated: boolean }) => (
    <div 
      className="rounded-lg border bg-background overflow-hidden w-full"
      style={{ 
        height: truncated ? '440px' : 'auto', 
        maxHeight: truncated ? '440px' : undefined,
        display: 'flex', 
        flexDirection: 'column' 
      }}
    >
      <div className="px-4 py-2 border-b bg-background flex items-center justify-between sticky top-0 z-10">
        <span className="text-xs font-mono text-muted-foreground">Preview</span>
        {isLargeContent && truncated && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs whitespace-nowrap">
              Truncated to 1000 chars
            </Badge>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={() => setIsMaximized(true)}
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
      <div className="overflow-auto flex-1">
        {highlighter ? (
          <div
            className="[&_pre]:m-0 [&_pre]:p-4 [&_pre]:bg-transparent [&_code]:text-xs [&_code]:leading-[1.5]"
            dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, codeContent, language) }}
          />
        ) : (
          <pre className="m-0 p-4 bg-transparent"><code className="text-xs leading-[1.5]">{codeContent}</code></pre>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm">Writing to file:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
          {filePath}
        </code>
      </div>
      <CodePreview codeContent={displayContent} truncated={true} />
      <MaximizedView />
    </div>
  );
};
