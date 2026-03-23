import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Users, ChevronDown, ChevronRight, Crown, Bot, MessageSquare, Loader2, CheckCircle2, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Teammate {
  name: string;
  teamName: string;
  description?: string;
  status: 'running' | 'idle' | 'completed';
  taskId?: string;
  summary?: string;
  tokenCount?: number;
  startTime: number;
}

export interface TeamMessage {
  from: string;
  to: string;
  content: string;
  timestamp: number;
}

interface TeamDashboardProps {
  className?: string;
}

const TeamDashboardComponent: React.FC<TeamDashboardProps> = ({ className }) => {
  const [teammates, setTeammates] = useState<Map<string, Teammate>>(new Map());
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTeamName, setActiveTeamName] = useState<string | null>(null);

  const handleTeamEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;

    if (detail.event === 'teammate_spawned') {
      setActiveTeamName(detail.team_name);
      setTeammates(prev => {
        const next = new Map(prev);
        next.set(detail.teammate_name, {
          name: detail.teammate_name,
          teamName: detail.team_name,
          description: detail.description,
          status: 'running',
          startTime: Date.now(),
        });
        return next;
      });
    }
  }, []);

  // Listen for subagent events to update teammate status
  const handleSubAgentEvent = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail?.task_id) return;

    setTeammates(prev => {
      const next = new Map(prev);
      // First try exact task_id match
      let matched = false;
      for (const [name, teammate] of next) {
        if (teammate.taskId === detail.task_id) {
          if (detail.event === 'task_progress') {
            next.set(name, { ...teammate, summary: detail.summary || teammate.summary, tokenCount: detail.usage?.output_tokens || teammate.tokenCount });
          } else if (detail.event === 'task_notification') {
            next.set(name, { ...teammate, status: detail.status === 'completed' ? 'completed' : 'idle', summary: detail.summary || teammate.summary });
          }
          matched = true;
          break;
        }
      }
      // Fallback: for task_started, assign task_id to first unmatched teammate with same description
      if (!matched && detail.event === 'task_started' && detail.description) {
        for (const [name, teammate] of next) {
          if (!teammate.taskId && teammate.description === detail.description) {
            next.set(name, { ...teammate, taskId: detail.task_id });
            break;
          }
        }
      }
      return next;
    });
  }, []);

  // Listen for SendMessage tool calls rendered as inter-agent messages
  const handleAgentMessage = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    setMessages(prev => [...prev.slice(-49), {
      from: detail.from,
      to: detail.to,
      content: detail.content,
      timestamp: Date.now(),
    }]);
  }, []);

  useEffect(() => {
    window.addEventListener('runecode:team-event', handleTeamEvent);
    window.addEventListener('runecode:subagent-event', handleSubAgentEvent);
    window.addEventListener('runecode:agent-message', handleAgentMessage);
    return () => {
      window.removeEventListener('runecode:team-event', handleTeamEvent);
      window.removeEventListener('runecode:subagent-event', handleSubAgentEvent);
      window.removeEventListener('runecode:agent-message', handleAgentMessage);
    };
  }, [handleTeamEvent, handleSubAgentEvent, handleAgentMessage]);

  const teammateList = Array.from(teammates.values());
  const runningCount = teammateList.filter(t => t.status === 'running').length;

  if (teammateList.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        'border-t border-border/30 bg-purple-500/[0.03] backdrop-blur-sm',
        className
      )}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/20 transition-colors"
      >
        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <Users className="w-3 h-3 text-purple-400/70" />
        <span className="font-medium text-muted-foreground">
          Team{activeTeamName ? `: ${activeTeamName}` : ''}
        </span>
        <Crown className="w-3 h-3 text-amber-400/50" />
        {runningCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-purple-500/15 text-purple-400">
            {runningCount} working
          </span>
        )}
      </button>

      {/* Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 space-y-1.5">
              {/* Teammate cards */}
              {teammateList.map(teammate => (
                <TeammateCard key={teammate.name} teammate={teammate} />
              ))}

              {/* Recent messages */}
              {messages.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-border/15">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MessageSquare className="w-2.5 h-2.5 text-muted-foreground/40" />
                    <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold">Messages</span>
                  </div>
                  <div className="space-y-0.5 max-h-24 overflow-y-auto">
                    {messages.slice(-5).map((msg, i) => (
                      <div key={i} className="text-[9px] text-muted-foreground/60 flex gap-1">
                        <span className="font-mono text-cyan-400/50">{msg.from}</span>
                        <span className="text-muted-foreground/30">&rarr;</span>
                        <span className="font-mono text-purple-400/50">{msg.to}</span>
                        <span className="truncate">{msg.content.slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const TeammateCard: React.FC<{ teammate: Teammate }> = ({ teammate }) => {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/20 bg-background/50 text-[10px]">
      {teammate.status === 'running' ? (
        <Loader2 className="w-3 h-3 animate-spin text-purple-400 flex-shrink-0" />
      ) : teammate.status === 'completed' ? (
        <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
      ) : (
        <Bot className="w-3 h-3 text-muted-foreground/40 flex-shrink-0" />
      )}
      <span className="font-medium truncate">{teammate.name}</span>
      {teammate.summary && (
        <span className="text-muted-foreground/50 truncate flex-1">{teammate.summary}</span>
      )}
      {teammate.tokenCount && (
        <span className="text-muted-foreground/40 flex items-center gap-0.5 flex-shrink-0">
          <Cpu className="w-2.5 h-2.5" />
          {teammate.tokenCount > 1000 ? `${(teammate.tokenCount / 1000).toFixed(1)}k` : teammate.tokenCount}
        </span>
      )}
    </div>
  );
};

// Memoized export — TeamDashboard only receives a className prop and manages
// all state internally via DOM event listeners. React.memo prevents it from
// re-rendering on every ClaudeCodeSession streaming update.
export const TeamDashboard = React.memo(TeamDashboardComponent);
TeamDashboard.displayName = 'TeamDashboard';
