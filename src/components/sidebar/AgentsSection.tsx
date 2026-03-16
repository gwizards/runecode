import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Bot, Sparkles } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';

interface Agent {
  name: string;
  model: string;
  type: string;
}

function ModelBadge({ model }: { model: string }) {
  const colors: Record<string, string> = {
    opus: 'bg-purple-500/10 text-purple-400',
    sonnet: 'bg-blue-500/10 text-blue-400',
    haiku: 'bg-green-500/10 text-green-400',
    inherit: 'bg-muted text-muted-foreground',
  };
  const color =
    Object.entries(colors).find(([k]) => model.includes(k))?.[1] ||
    colors.inherit;
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-medium leading-none ${color}`}
    >
      {model}
    </span>
  );
}

export function AgentsSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [copiedAgent, setCopiedAgent] = useState<string | null>(null);
  const liveAgents = useAgentStore((state) => state.liveAgents);

  const { data: agents = [] } = useQuery({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const res = await fetch('/api/commands/agents');
      if (!res.ok) return [];
      const json = await res.json();
      const data = json.data || json;
      if (!Array.isArray(data)) return [];
      return data.filter(
        (item: unknown): item is Agent =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Agent).name === 'string' &&
          typeof (item as Agent).model === 'string' &&
          typeof (item as Agent).type === 'string'
      );
    },
    refetchInterval: 60000,
  });

  const isLive = useCallback(
    (agentName: string) => {
      for (const [, agent] of liveAgents) {
        if (
          agent.name === agentName &&
          (agent.status === 'running' || agent.status === 'thinking')
        ) {
          return true;
        }
      }
      return false;
    },
    [liveAgents]
  );

  const handleCopy = useCallback(
    (agentName: string) => {
      navigator.clipboard.writeText(`@${agentName}`).then(() => {
        setCopiedAgent(agentName);
        setTimeout(() => setCopiedAgent(null), 1500);
      });
    },
    []
  );

  // Flat list sorted: live first, then alphabetical
  const sortedAgents = [...agents].sort((a, b) => {
    const aLive = isLive(a.name) ? 0 : 1;
    const bLive = isLive(b.name) ? 0 : 1;
    if (aLive !== bLive) return aLive - bLive;
    return a.name.localeCompare(b.name);
  });

  const renderAgentRow = (agent: Agent) => {
    const live = isLive(agent.name);
    const isPlugin = agent.type === 'plugin';
    const Icon = isPlugin ? Sparkles : Bot;

    return (
      <button
        key={`${agent.type}:${agent.name}`}
        onClick={() => handleCopy(agent.name)}
        className={`flex items-center gap-1.5 w-full px-1 py-1 rounded transition-colors group text-left sidebar-item${live ? ' sidebar-item-active' : ''}`}
        title={`Click to copy @${agent.name}`}
      >
        {live ? (
          <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
          </span>
        ) : (
          <Icon className="h-2.5 w-2.5 text-muted-foreground/50 flex-shrink-0" />
        )}
        <span className="text-[11px] truncate transition-colors flex-1 min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
          {copiedAgent === agent.name ? 'Copied!' : agent.name}
        </span>
        <ModelBadge model={agent.model} />
      </button>
    );
  };

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Agents
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {agents.length}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5">
              {agents.length === 0 ? (
                <p className="text-[11px] text-muted-foreground pl-1">
                  No agents available
                </p>
              ) : (
                <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
                  {sortedAgents.map(renderAgentRow)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
