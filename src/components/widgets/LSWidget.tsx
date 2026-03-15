import React, { useState } from "react";
import {
  FolderOpen,
  Folder,
  FileText,
  FileCode,
  Terminal,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { extractResultContent } from "./types";

/**
 * Widget for LS (List Directory) tool
 */
export const LSWidget: React.FC<{ path: string; result?: any }> = ({ path, result }) => {
  if (result) {
    const { content: resultContent } = extractResultContent(result);
    
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
          <FolderOpen className="h-4 w-4 text-primary" />
          <span className="text-sm">Directory contents for:</span>
          <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
            {path}
          </code>
        </div>
        {resultContent && <LSResultWidget content={resultContent} />}
      </div>
    );
  }
  
  return (
    <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
      <FolderOpen className="h-4 w-4 text-primary" />
      <span className="text-sm">Listing directory:</span>
      <code className="text-sm font-mono bg-background px-2 py-0.5 rounded">
        {path}
      </code>
      {!result && (
        <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
          <span>Loading...</span>
        </div>
      )}
    </div>
  );
};

/**
 * Widget for LS tool result - displays directory tree structure
 */
export const LSResultWidget: React.FC<{ content: string }> = ({ content }) => {
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  
  const parseDirectoryTree = (rawContent: string) => {
    const lines = rawContent.split('\n');
    const entries: Array<{
      path: string;
      name: string;
      type: 'file' | 'directory';
      level: number;
    }> = [];
    
    let currentPath: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('NOTE:')) {
        break;
      }
      
      if (!line.trim()) continue;
      
      const indent = line.match(/^(\s*)/)?.[1] || '';
      const level = Math.floor(indent.length / 2);
      
      const entryMatch = line.match(/^\s*-\s+(.+?)(\/$)?$/);
      if (!entryMatch) continue;
      
      const fullName = entryMatch[1];
      const isDirectory = line.trim().endsWith('/');
      const name = isDirectory ? fullName : fullName;
      
      currentPath = currentPath.slice(0, level);
      currentPath.push(name);
      
      entries.push({
        path: currentPath.join('/'),
        name,
        type: isDirectory ? 'directory' : 'file',
        level,
      });
    }
    
    return entries;
  };
  
  const entries = parseDirectoryTree(content);
  
  const toggleDirectory = (path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };
  
  const getChildren = (parentPath: string, parentLevel: number) => {
    return entries.filter(e => {
      if (e.level !== parentLevel + 1) return false;
      const parentParts = parentPath.split('/').filter(Boolean);
      const entryParts = e.path.split('/').filter(Boolean);
      
      if (entryParts.length !== parentParts.length + 1) return false;
      
      for (let i = 0; i < parentParts.length; i++) {
        if (parentParts[i] !== entryParts[i]) return false;
      }
      
      return true;
    });
  };
  
  const renderEntry = (entry: typeof entries[0], isRoot = false) => {
    const hasChildren = entry.type === 'directory' && 
      entries.some(e => e.path.startsWith(entry.path + '/') && e.level === entry.level + 1);
    const isExpanded = expandedDirs.has(entry.path) || isRoot;
    
    const getIcon = () => {
      if (entry.type === 'directory') {
        return isExpanded ? 
          <FolderOpen className="h-3.5 w-3.5 text-blue-500" /> : 
          <Folder className="h-3.5 w-3.5 text-blue-500" />;
      }
      
      const ext = entry.name.split('.').pop()?.toLowerCase();
      switch (ext) {
        case 'rs':
          return <FileCode className="h-3.5 w-3.5 text-orange-500" />;
        case 'toml':
        case 'yaml':
        case 'yml':
        case 'json':
          return <FileText className="h-3.5 w-3.5 text-yellow-500" />;
        case 'md':
          return <FileText className="h-3.5 w-3.5 text-blue-400" />;
        case 'js':
        case 'jsx':
        case 'ts':
        case 'tsx':
          return <FileCode className="h-3.5 w-3.5 text-yellow-400" />;
        case 'py':
          return <FileCode className="h-3.5 w-3.5 text-blue-500" />;
        case 'go':
          return <FileCode className="h-3.5 w-3.5 text-cyan-500" />;
        case 'sh':
        case 'bash':
          return <Terminal className="h-3.5 w-3.5 text-green-500" />;
        default:
          return <FileText className="h-3.5 w-3.5 text-muted-foreground" />;
      }
    };
    
    return (
      <div key={entry.path}>
        <div 
          className={cn(
            "flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 transition-colors cursor-pointer",
            !isRoot && "ml-4"
          )}
          onClick={() => entry.type === 'directory' && hasChildren && toggleDirectory(entry.path)}
        >
          {entry.type === 'directory' && hasChildren && (
            <ChevronRight className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              isExpanded && "rotate-90"
            )} />
          )}
          {(!hasChildren || entry.type !== 'directory') && (
            <div className="w-3" />
          )}
          {getIcon()}
          <span className="text-sm font-mono">{entry.name}</span>
        </div>
        
        {entry.type === 'directory' && hasChildren && isExpanded && (
          <div className="ml-2">
            {getChildren(entry.path, entry.level).map(child => renderEntry(child))}
          </div>
        )}
      </div>
    );
  };
  
  const rootEntries = entries.filter(e => e.level === 0);
  
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="space-y-1">
        {rootEntries.map(entry => renderEntry(entry, true))}
      </div>
    </div>
  );
};
