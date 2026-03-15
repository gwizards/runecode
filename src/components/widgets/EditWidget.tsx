import React from "react";
import {
  FileEdit,
  GitBranch,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShiki, highlightCode } from "@/hooks/useShiki";
import * as Diff from 'diff';
import { getLanguage } from "./types";

/**
 * Widget for Edit tool - shows the edit operation
 */
export const EditWidget: React.FC<{ 
  file_path: string; 
  old_string: string; 
  new_string: string;
  result?: any;
}> = ({ file_path, old_string, new_string, result: _result }) => {
  const highlighter = useShiki();

  const diffResult = Diff.diffLines(old_string || '', new_string || '', { 
    newlineIsToken: true,
    ignoreWhitespace: false 
  });
  const language = getLanguage(file_path);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-2">
        <FileEdit className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Applying Edit to:</span>
        <code className="text-sm font-mono bg-background px-2 py-0.5 rounded flex-1 truncate">
          {file_path}
        </code>
      </div>

      <div className="rounded-lg border border-muted-foreground/15 bg-background overflow-hidden text-xs font-mono">
        <div className="max-h-[440px] overflow-y-auto overflow-x-auto">
          {diffResult.map((part, index) => {
            const partClass = part.added
              ? 'bg-green-500/10 border-l-2 border-l-green-500'
              : part.removed
              ? 'bg-red-500/10 border-l-2 border-l-red-500'
              : '';
            
            if (!part.added && !part.removed && part.count && part.count > 8) {
              return (
                <div key={index} className="px-4 py-1 bg-muted border-y border-border text-center text-muted-foreground text-xs">
                  ... {part.count} unchanged lines ...
                </div>
              );
            }
            
            const value = part.value.endsWith('\n') ? part.value.slice(0, -1) : part.value;

            return (
              <div key={index} className={cn(partClass, "flex")}>
                <div className="w-8 select-none text-center flex-shrink-0">
                  {part.added ? <span className="text-green-400">+</span> : part.removed ? <span className="text-red-400">-</span> : null}
                </div>
                <div className="flex-1">
                  {highlighter ? (
                    <div
                      className="[&_pre]:m-0 [&_pre]:p-0 [&_pre]:bg-transparent [&_code]:text-xs [&_code]:leading-[1.6]"
                      dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, value, language) }}
                    />
                  ) : (
                    <pre className="m-0 p-0 bg-transparent"><code className="text-xs leading-[1.6]">{value}</code></pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Widget for Edit tool result - shows a diff view
 */
export const EditResultWidget: React.FC<{ content: string }> = ({ content }) => {
  const highlighter = useShiki();
  
  const lines = content.split('\n');
  let filePath = '';
  const codeLines: { lineNumber: string; code: string }[] = [];
  let inCodeBlock = false;
  
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.includes('The file') && line.includes('has been updated')) {
      const match = line.match(/The file (.+) has been updated/);
      if (match) {
        filePath = match[1];
      }
    } else if (/^\s*\d+/.test(line)) {
      inCodeBlock = true;
      const lineMatch = line.match(/^\s*(\d+)\t?(.*)$/);
      if (lineMatch) {
        const [, lineNum, codePart] = lineMatch;
        codeLines.push({
          lineNumber: lineNum,
          code: codePart,
        });
      }
    } else if (inCodeBlock) {
      codeLines.push({ lineNumber: '', code: line });
    }
  }

  const codeContent = codeLines.map(l => l.code).join('\n');
  const language = getLanguage(filePath);

  return (
    <div className="rounded-lg border bg-background overflow-hidden">
      <div className="px-4 py-2 border-b bg-emerald-950/30 flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-emerald-500" />
        <span className="text-xs font-mono text-emerald-400">Edit Result</span>
        {filePath && (
          <>
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-mono text-muted-foreground">{filePath}</span>
          </>
        )}
      </div>
      <div className="overflow-x-auto max-h-[440px]">
        {highlighter ? (
          <div
            className="[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:leading-[1.6] [&_code]:text-xs"
            dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, codeContent, language) }}
          />
        ) : (
          <pre className="m-0 bg-transparent leading-[1.6]"><code className="text-xs">{codeContent}</code></pre>
        )}
      </div>
    </div>
  );
};
