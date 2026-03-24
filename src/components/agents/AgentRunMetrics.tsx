import {
  Clock,
  Hash,
  DollarSign,
  Bot,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CardTitle } from '@/components/ui/card';
import { AGENT_ICONS } from '../CCAgents';
import { formatISOTimestamp } from '@/lib/date-utils';
import type { AgentRunWithMetrics } from '@/lib/api';

interface AgentRunMetricsProps {
  run: AgentRunWithMetrics;
}

function renderIcon(iconName: string) {
  const Icon = AGENT_ICONS[iconName as keyof typeof AGENT_ICONS] || Bot;
  return <Icon className="h-5 w-5" />;
}

function formatDuration(ms?: number) {
  if (!ms) return "N/A";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTokens(tokens?: number) {
  if (!tokens) return "0";
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

/**
 * Displays the header/metrics section for an agent run,
 * including name, task, model, timestamps, tokens, and cost.
 */
export function AgentRunMetricsHeader({ run }: AgentRunMetricsProps) {
  return (
    <div className="flex items-start gap-3 flex-1 min-w-0">
      <div className="mt-0.5">
        {renderIcon('bot')}
      </div>
      <div className="flex-1 min-w-0">
        <CardTitle className="text-lg flex items-center gap-2">
          {run.agent_name}
          {run.status === 'running' && (
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-green-600 font-medium">Running</span>
            </div>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1 truncate">
          {run.task}
        </p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
          <Badge variant="outline" className="text-xs">
            {run.model === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}
          </Badge>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatISOTimestamp(run.created_at)}</span>
          </div>
          {run.metrics?.duration_ms && (
            <span>{formatDuration(run.metrics.duration_ms)}</span>
          )}
          {run.metrics?.total_tokens && (
            <div className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              <span>{formatTokens(run.metrics.total_tokens)}</span>
            </div>
          )}
          {run.metrics?.cost_usd && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              <span>${run.metrics.cost_usd.toFixed(4)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Simplified fullscreen header info for the agent run.
 */
export function AgentRunFullscreenHeader({ run }: AgentRunMetricsProps) {
  return (
    <div className="flex items-center gap-3">
      {renderIcon('bot')}
      <div>
        <h3 className="font-semibold text-lg">{run.agent_name}</h3>
        <p className="text-sm text-muted-foreground">{run.task}</p>
      </div>
    </div>
  );
}
