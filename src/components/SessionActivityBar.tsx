import React, { useMemo } from 'react';
import { Terminal, Bot, Cpu, GitBranch, Globe, FileText, Search, Pencil, FolderSearch, Loader2, Zap, Shield } from 'lucide-react';

interface ActivityBarProps {
  messages: any[];
  isLoading: boolean;
}

interface ActiveTool {
  name: string;
  id: string;
  startIdx: number;
}

interface ActiveTask {
  id: string;
  description: string;
  status: string;
  taskType?: string;
  lastToolName?: string;
  tokenCount?: number;
  summary?: string;
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  bash: Terminal,
  read: FileText,
  write: Pencil,
  edit: Pencil,
  glob: FolderSearch,
  grep: Search,
  agent: Bot,
  websearch: Globe,
  webfetch: Globe,
  task: Cpu,
};

function getToolIcon(name: string): React.ElementType {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(TOOL_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  if (lower.startsWith('mcp__')) return Zap;
  return Terminal;
}

export const SessionActivityBar: React.FC<ActivityBarProps> = React.memo(({ messages, isLoading }) => {
  const activity = useMemo(() => {
    if (!isLoading || messages.length === 0) return null;

    const activeTools: ActiveTool[] = [];
    const activeTasks = new Map<string, ActiveTask>();
    let isCompacting = false;
    let activeHook: string | null = null;
    let rateLimitWarning = false;

    // Track tool_use IDs that have received results
    const completedToolIds = new Set<string>();
    for (const msg of messages) {
      if (msg.type === 'user' && msg.message?.content && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_result' && block.tool_use_id) {
            completedToolIds.add(block.tool_use_id);
          }
        }
      }
    }

    // Scan messages in reverse for current state
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // Active tools — find tool_use blocks in latest assistant message without results
      if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
        for (const block of msg.message.content) {
          if (block.type === 'tool_use' && block.id && block.name && !completedToolIds.has(block.id)) {
            activeTools.push({ name: block.name, id: block.id, startIdx: i });
          }
        }
        if (activeTools.length > 0) break; // only care about the latest turn's tools
      }

      // System messages for tasks, hooks, compaction
      if (msg.type === 'system') {
        if (msg.subtype === 'task_started' && msg.task_id) {
          if (!activeTasks.has(msg.task_id)) {
            activeTasks.set(msg.task_id, {
              id: msg.task_id,
              description: msg.description || 'Task',
              status: 'running',
              taskType: msg.task_type,
            });
          }
        }
        if (msg.subtype === 'task_progress' && msg.task_id) {
          const existing = activeTasks.get(msg.task_id);
          if (existing) {
            existing.lastToolName = msg.last_tool_name;
            existing.tokenCount = msg.usage?.output_tokens;
            if (msg.summary) existing.summary = msg.summary;
          }
        }
        if (msg.subtype === 'task_notification' && msg.task_id) {
          activeTasks.delete(msg.task_id);
        }
        if (msg.subtype === 'status' && msg.status === 'compacting') {
          isCompacting = true;
        }
        if (msg.subtype === 'hook_started') {
          activeHook = msg.hook_name || 'hook';
        }
        if (msg.subtype === 'hook_response') {
          activeHook = null;
        }
      }

      if (msg.type === 'rate_limit_event') {
        const status = msg.rate_limit_info?.status;
        if (status === 'allowed_warning' || status === 'rejected') {
          rateLimitWarning = true;
        }
      }
    }

    // Remove completed tasks
    const runningTasks = Array.from(activeTasks.values());

    if (activeTools.length === 0 && runningTasks.length === 0 && !isCompacting && !activeHook && !rateLimitWarning) {
      return null; // Nothing interesting to show
    }

    return { activeTools, runningTasks, isCompacting, activeHook, rateLimitWarning };
  }, [messages, isLoading]);

  if (!activity) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-muted/20 border-t border-border/50 text-[10px] text-muted-foreground overflow-x-auto shrink-0">
      <Loader2 className="w-3 h-3 animate-spin text-primary/60 flex-shrink-0" />

      {/* Active tools */}
      {activity.activeTools.map(tool => {
        const Icon = getToolIcon(tool.name);
        return (
          <div key={tool.id} className="flex items-center gap-1 shrink-0">
            <Icon className="w-3 h-3" />
            <span className="font-mono">{tool.name}</span>
          </div>
        );
      })}

      {/* Running tasks/subagents */}
      {activity.runningTasks.map(task => (
        <div key={task.id} className="flex items-center gap-1 shrink-0 text-cyan-400/70">
          <Bot className="w-3 h-3" />
          <span className="truncate max-w-[120px]">{task.description}</span>
          {task.taskType && (
            <span className="text-[9px] text-muted-foreground/30 font-mono">[{task.taskType}]</span>
          )}
          {task.lastToolName && (
            <span className="font-mono text-muted-foreground/50">→ {task.lastToolName}</span>
          )}
          {task.summary && (
            <span className="truncate max-w-[200px] text-muted-foreground/40 italic">{task.summary}</span>
          )}
          {task.tokenCount && (
            <span className="text-muted-foreground/40">{task.tokenCount > 1000 ? `${(task.tokenCount / 1000).toFixed(1)}k` : task.tokenCount}t</span>
          )}
        </div>
      ))}

      {/* Compacting */}
      {activity.isCompacting && (
        <div className="flex items-center gap-1 shrink-0 text-yellow-400/70">
          <GitBranch className="w-3 h-3" />
          <span>Compacting context...</span>
        </div>
      )}

      {/* Hook running */}
      {activity.activeHook && (
        <div className="flex items-center gap-1 shrink-0 text-purple-400/70">
          <Zap className="w-3 h-3" />
          <span>Hook: {activity.activeHook}</span>
        </div>
      )}

      {/* Rate limit warning */}
      {activity.rateLimitWarning && (
        <div className="flex items-center gap-1 shrink-0 text-orange-400/70">
          <Shield className="w-3 h-3" />
          <span>Rate limit warning</span>
        </div>
      )}
    </div>
  );
});

SessionActivityBar.displayName = 'SessionActivityBar';
