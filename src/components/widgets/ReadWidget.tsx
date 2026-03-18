import React, { useState } from "react";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useShiki, highlightCode } from "@/hooks/useShiki";
import { extractResultContent } from "./types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShikiCodeBlock } from "../ShikiCodeBlock";

/**
 * Widget for Read tool
 */
export const ReadWidget: React.FC<{ filePath: string; result?: any }> = ({ filePath, result }) => {
  if (result) {
    const { content: resultContent } = extractResultContent(result);
    if (resultContent) {
      return <ReadResultWidget content={resultContent} filePath={filePath} />;
    }
  }

  // Pending state — show file name with loading indicator
  const ext = filePath?.split('.').pop()?.toLowerCase();
  const isMd = ext === 'md' || ext === 'mdx' || ext === 'markdown';

  return (
    <div className="rounded-lg border border-muted-foreground/15 overflow-hidden">
      <div className="px-3 py-2 bg-muted/50 flex items-center gap-2">
        <FileText className={cn("h-3.5 w-3.5", isMd ? "text-emerald-400" : "text-blue-500")} />
        <span className="text-xs font-mono text-muted-foreground truncate">
          {filePath}
        </span>
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <div className={cn("h-2 w-2 rounded-full animate-pulse", isMd ? "bg-emerald-500" : "bg-blue-500")} />
          <span>Reading...</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Markdown file viewer with rendered content, copy button, and collapsible body
 */
const MarkdownFileCard: React.FC<{ filePath: string; content: string }> = ({ filePath, content }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileName = filePath.split('/').pop() || filePath;

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border/30 overflow-hidden bg-background w-full">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b border-border/20">
        <FileText className="h-3.5 w-3.5 text-emerald-400/60" />
        <span className="text-xs font-mono font-medium flex-1 truncate text-muted-foreground">{fileName}</span>
        <button
          onClick={handleCopy}
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>
      {!collapsed && (
        <div className="p-4 prose prose-sm dark:prose-invert max-w-none text-xs overflow-x-auto">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <ShikiCodeBlock
                    code={String(children).replace(/\n$/, '')}
                    language={match[1]}
                  />
                ) : (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      )}
      {collapsed && (
        <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-muted/30">
          Click to expand markdown content
        </div>
      )}
    </div>
  );
};

/**
 * Widget for Read tool result - shows file content with line numbers
 */
export const ReadResultWidget: React.FC<{ content: string; filePath?: string }> = ({ content, filePath }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const highlighter = useShiki();

  // For .md/.mdx/markdown files, render with the rich markdown viewer
  const ext = filePath?.split('.').pop()?.toLowerCase();
  const isMarkdownFile = ext === 'md' || ext === 'mdx' || ext === 'markdown';

  // Strip line-number prefixes (e.g. "  1→content") from tool output
  const stripLineNumbers = (rawContent: string) => {
    const lines = rawContent.split('\n');
    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    if (nonEmptyLines.length === 0) return rawContent;
    const parsableLines = nonEmptyLines.filter(line => /^\s*\d+→/.test(line)).length;
    const isLikelyNumbered = (parsableLines / nonEmptyLines.length) > 0.5;
    if (!isLikelyNumbered) return rawContent;
    const codeLines: string[] = [];
    for (const line of lines) {
      const match = line.trimStart().match(/^(\d+)→(.*)$/);
      if (match) {
        codeLines.push(match[2]);
      } else if (line.trim() === '') {
        codeLines.push('');
      } else {
        codeLines.push(line);
      }
    }
    while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
      codeLines.pop();
    }
    return codeLines.join('\n');
  };

  if (isMarkdownFile && filePath) {
    const mdContent = stripLineNumbers(content);
    return <MarkdownFileCard filePath={filePath} content={mdContent} />;
  }

  const getLanguage = (path?: string) => {
    if (!path) return "text";
    const ext = path.split('.').pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "tsx",
      js: "javascript",
      jsx: "jsx",
      py: "python",
      rs: "rust",
      go: "go",
      java: "java",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      rb: "ruby",
      swift: "swift",
      kt: "kotlin",
      scala: "scala",
      sh: "bash",
      bash: "bash",
      zsh: "bash",
      yaml: "yaml",
      yml: "yaml",
      json: "json",
      xml: "xml",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      less: "less",
      sql: "sql",
      md: "markdown",
      toml: "ini",
      ini: "ini",
      dockerfile: "dockerfile",
      makefile: "makefile"
    };
    return languageMap[ext || ""] || "text";
  };

  const parseContent = (rawContent: string) => {
    const lines = rawContent.split('\n');
    const codeLines: string[] = [];
    let minLineNumber = Infinity;

    const nonEmptyLines = lines.filter(line => line.trim() !== '');
    if (nonEmptyLines.length === 0) {
      return { codeContent: rawContent, startLineNumber: 1 };
    }
    const parsableLines = nonEmptyLines.filter(line => /^\s*\d+→/.test(line)).length;
    const isLikelyNumbered = (parsableLines / nonEmptyLines.length) > 0.5;

    if (!isLikelyNumbered) {
      return { codeContent: rawContent, startLineNumber: 1 };
    }
    
    for (const line of lines) {
      const trimmedLine = line.trimStart();
      const match = trimmedLine.match(/^(\d+)→(.*)$/);
      if (match) {
        const lineNum = parseInt(match[1], 10);
        if (minLineNumber === Infinity) {
          minLineNumber = lineNum;
        }
        codeLines.push(match[2]);
      } else if (line.trim() === '') {
        codeLines.push('');
      } else {
        codeLines.push('');
      }
    }
    
    while (codeLines.length > 0 && codeLines[codeLines.length - 1] === '') {
      codeLines.pop();
    }
    
    return {
      codeContent: codeLines.join('\n'),
      startLineNumber: minLineNumber === Infinity ? 1 : minLineNumber
    };
  };

  const language = getLanguage(filePath);
  const { codeContent } = parseContent(content);
  const lineCount = content.split('\n').filter(line => line.trim()).length;
  const isLargeFile = lineCount > 20;

  return (
    <div className="rounded-lg overflow-hidden border border-muted-foreground/15 bg-background w-full">
      <div className="px-3 py-2 border-b bg-muted/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-blue-500" />
          <span className="text-xs font-mono text-muted-foreground truncate">
            {filePath || "File content"}
          </span>
          {isLargeFile && (
            <span className="text-xs text-muted-foreground">
              ({lineCount} lines)
            </span>
          )}
        </div>
        {isLargeFile && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
            {isExpanded ? "Collapse" : "Expand"}
          </button>
        )}
      </div>
      
      {(!isLargeFile || isExpanded) && (
        <div className="relative overflow-x-auto">
          {highlighter ? (
            <div
              className="[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:leading-[1.6] [&_code]:text-xs"
              dangerouslySetInnerHTML={{ __html: highlightCode(highlighter, codeContent, language) }}
            />
          ) : (
            <pre className="m-0 bg-transparent leading-[1.6]"><code className="text-xs">{codeContent}</code></pre>
          )}
        </div>
      )}
      
      {isLargeFile && !isExpanded && (
        <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-muted/30">
          Click "Expand" to view the full file
        </div>
      )}
    </div>
  );
};
