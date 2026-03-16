import React from 'react';
import { useAgentStore } from '@/stores/agentStore';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from './ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface AgentStatusBadgeProps {
  onAgentClick: (agentId: string) => void;
}

const statusDotClass = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-green-500 animate-pulse';
    case 'thinking':
      return 'bg-blue-500';
    case 'completed':
      return 'bg-muted-foreground';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-muted-foreground';
  }
};

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

export const AgentStatusBadge: React.FC<AgentStatusBadgeProps> = ({ onAgentClick }) => {
  const liveAgents = useAgentStore((state) => state.liveAgents);

  const agents = Array.from(liveAgents.values());
  const runningCount = agents.filter(
    (a) => a.status === 'running' || a.status === 'thinking'
  ).length;

  if (runningCount === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 px-2 h-8 text-xs font-medium',
            'text-muted-foreground hover:text-foreground transition-colors',
            'border-l border-border/20'
          )}
        >
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>{runningCount} running</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Active Agents</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {agents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => onAgentClick(agent.id)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span
              className={cn('w-2 h-2 rounded-full flex-shrink-0', statusDotClass(agent.status))}
            />
            <span className="flex-1 truncate">{agent.name}</span>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {formatElapsed(agent.elapsedMs)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default AgentStatusBadge;
