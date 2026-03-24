import React from 'react';
import { ChevronDown, Bot } from 'lucide-react';
import { Tab } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';
import { agentStatusDotClass } from './TabBar';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '../ui/dropdown-menu';

type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed';

interface TabOverflowMenuProps {
  overflowAgentTabs: Tab[];
  getAgentStatusForTab: (tab: Tab) => AgentStatus | undefined;
  onSwitchToTab: (tabId: string) => void;
}

/**
 * Dropdown menu for agent tabs that overflow the visible tab bar.
 */
export const TabOverflowMenu: React.FC<TabOverflowMenuProps> = ({
  overflowAgentTabs,
  getAgentStatusForTab,
  onSwitchToTab,
}) => {
  if (overflowAgentTabs.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1 px-2 h-8 text-xs font-medium flex-shrink-0',
            'text-muted-foreground hover:text-foreground transition-colors',
            'hover:bg-muted/40'
          )}
        >
          <span>+{overflowAgentTabs.length}</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {overflowAgentTabs.map((tab) => {
          const status = getAgentStatusForTab(tab);
          return (
            <DropdownMenuItem
              key={tab.id}
              onClick={() => onSwitchToTab(tab.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              {status && (
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', agentStatusDotClass(status))} />
              )}
              <Bot className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{tab.title}</span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
