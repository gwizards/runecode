import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bot, ChevronDown, ChevronRight, Clock, Cpu, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SubAgent {
  taskId: string;
  description: string;
  taskType?: string;
  status: 'running' | 'completed' | 'failed';
  summary?: string;
  lastToolName?: string;
  tokenCount?: number;
  startTime: number;
  endTime?: number;
  prompt?: string;
  outputFile?: string;
}

interface SubAgentTrackerProps {
  className?: string;
}

const SubAgentTrackerComponent: React.FC<SubAgentTrackerProps> = ({ className }) => {
  const [agents, setAgents] = useState<Map<string, SubAgent>>(new Map());
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());

  const handleSubAgentEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;

    setAgents(prev => {
      const next = new Map(prev);
      const taskId = detail.task_id;
      if (!taskId) return prev;

      if (detail.event === 'task_started') {
        next.set(taskId, {
          taskId,
          description: detail.description || 'Sub-agent',
          taskType: detail.task_type,
          status: 'running',
          startTime: Date.now(),
          prompt: detail.prompt,
        });
      } else if (detail.event === 'task_progress') {
        const existing = next.get(taskId);
        if (existing) {
          next.set(taskId, {
            ...existing,
            summary: detail.summary || existing.summary,
            lastToolName: detail.last_tool_name || existing.lastToolName,
            tokenCount: detail.usage?.output_tokens || existing.tokenCount,
          });
        }
      } else if (detail.event === 'task_notification') {
        const existing = next.get(taskId);
        if (existing) {
          next.set(taskId, {
            ...existing,
            status: detail.status === 'completed' ? 'completed' : 'failed',
            summary: detail.summary || existing.summary,
            endTime: Date.now(),
            outputFile: detail.output_file,
          });
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    window.addEventListener('runecode:subagent-event', handleSubAgentEvent);
    return () => window.removeEventListener('runecode:subagent-event', handleSubAgentEvent);
  }, [handleSubAgentEvent]);

  // Prune completed agents after 30s to prevent unbounded Map growth
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.hidden) return; // Skip when tab not visible
      setAgents(prev => {
        const now = Date.now();
        let changed = false;
        const next = new Map(prev);
        for (const [id, agent] of next) {
          if ((agent.status === 'completed' || agent.status === 'failed') && agent.endTime && now - agent.endTime > 30_000) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const agentList = Array.from(agents.values());
  const runningCount = agentList.filter(a => a.status === 'running').length;

  if (agentList.length === 0) return null;

  const toggleAgentExpanded = (taskId: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'border-t border-border/30 bg-muted/10 backdrop-blur-sm',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/20 transition-colors"
      >
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Bot className="w-3 h-3 text-cyan-400/70" />
        <span className="font-medium text-muted-foreground">
          Sub-Agents
        </span>
        {runningCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-cyan-500/15 text-cyan-400">
            {runningCount} active
          </span>
        )}
        <span className="text-muted-foreground/40 text-[9px]">
          {agentList.length} total
        </span>
      </button>

      {/* Agent list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1">
              {agentList.map(agent => (
                <SubAgentCard
                  key={agent.taskId}
                  agent={agent}
                  isExpanded={expandedAgents.has(agent.taskId)}
                  onToggle={() => toggleAgentExpanded(agent.taskId)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const StatusIcon: React.FC<{ status: SubAgent['status'] }> = ({ status }) => {
  switch (status) {
    case 'running':
      return <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />;
    case 'completed':
      return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
    case 'failed':
      return <XCircle className="w-3 h-3 text-red-400" />;
  }
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

const SubAgentCard: React.FC<{
  agent: SubAgent;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ agent, isExpanded, onToggle }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (agent.status !== 'running') return;
    const interval = setInterval(() => {
      setElapsed(Date.now() - agent.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [agent.status, agent.startTime]);

  const duration = agent.endTime
    ? agent.endTime - agent.startTime
    : elapsed;

  return (
    <div className="rounded-md border border-border/20 bg-background/50 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] hover:bg-muted/20 transition-colors"
      >
        <StatusIcon status={agent.status} />
        <span className="truncate flex-1 text-left font-medium">
          {agent.description}
        </span>
        {agent.taskType && (
          <span className="text-muted-foreground/40 font-mono">{agent.taskType}</span>
        )}
        {agent.lastToolName && agent.status === 'running' && (
          <span className="text-muted-foreground/50 font-mono">→ {agent.lastToolName}</span>
        )}
        {agent.tokenCount && (
          <span className="text-muted-foreground/40 flex items-center gap-0.5">
            <Cpu className="w-2.5 h-2.5" />
            {agent.tokenCount > 1000 ? `${(agent.tokenCount / 1000).toFixed(1)}k` : agent.tokenCount}
          </span>
        )}
        <span className="text-muted-foreground/40 flex items-center gap-0.5">
          <Clock className="w-2.5 h-2.5" />
          {formatDuration(duration)}
        </span>
      </button>

      <AnimatePresence>
        {isExpanded && agent.summary && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 text-[10px] text-muted-foreground/70 border-t border-border/10 pt-1.5">
              {agent.summary}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Memoized export — SubAgentTracker only receives a className prop and manages
// all state internally via DOM event listeners. React.memo prevents it from
// re-rendering on every ClaudeCodeSession streaming update.
export const SubAgentTracker = React.memo(SubAgentTrackerComponent);
SubAgentTracker.displayName = 'SubAgentTracker';
