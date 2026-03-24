import React, { useState } from 'react';
import { Reorder } from 'motion/react';
import { X, MessageSquare, Bot, AlertCircle, Folder, BarChart, Server, Settings, FileText, Cpu, LayoutGrid, TerminalSquare, Globe } from 'lucide-react';
import { RuneSpinner } from '../RuneCodeLogo';
import { Tab } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';

type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed';

export const agentStatusDotClass = (status: AgentStatus) => {
  switch (status) {
    case 'running':
      return 'bg-success animate-pulse';
    case 'thinking':
      return 'bg-info';
    case 'completed':
      return 'bg-muted-foreground';
    case 'failed':
      return 'bg-error';
  }
};

interface TabItemProps {
  tab: Tab;
  isActive: boolean;
  onClose: (id: string) => void;
  onClick: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  isDragging?: boolean;
  setDraggedTabId?: (id: string | null) => void;
  agentStatus?: AgentStatus;
}

export const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onClose, onClick, onDoubleClick, isDragging = false, setDraggedTabId, agentStatus }) => {
  const [isHovered, setIsHovered] = useState(false);

  const getIcon = () => {
    if (tab.id.startsWith('__project__')) return LayoutGrid;
    switch (tab.type) {
      case 'chat':
        return MessageSquare;
      case 'agent':
      case 'agents':
        return Bot;
      case 'projects':
        return Folder;
      case 'usage':
        return BarChart;
      case 'mcp':
        return Server;
      case 'settings':
        return Settings;
      case 'claude-md':
      case 'claude-file':
        return FileText;
      case 'agent-execution':
      case 'create-agent':
      case 'import-agent':
        return Bot;
      case 'resource-details':
        return Cpu;
      case 'claude-terminal':
        return TerminalSquare;
      case 'browser':
        return Globe;
      default:
        return MessageSquare;
    }
  };

  const getStatusIcon = () => {
    switch (tab.status) {
      case 'running':
        return <RuneSpinner size={12} />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-red-500" />;
      default:
        return null;
    }
  };

  const Icon = getIcon();
  const statusIcon = getStatusIcon();

  return (
    <Reorder.Item
      value={tab}
      id={tab.id}
      dragListener={true}
      transition={{ duration: 0.1 }}
      className={cn(
        "relative flex items-center gap-2 text-sm cursor-pointer select-none group",
        "transition-colors duration-100 overflow-hidden border-r border-border/20",
        "before:absolute before:bottom-0 before:left-0 before:right-0 before:h-0.5 before:transition-colors before:duration-100",
        isActive
          ? "bg-card text-card-foreground before:bg-primary"
          : "bg-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground before:bg-transparent",
        isDragging && "bg-card border-primary/50 shadow-sm z-50",
        agentStatus === 'completed' && "opacity-60",
        "min-w-[120px] max-w-[220px] h-8 px-3"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onClick(tab.id)}
      onDoubleClick={() => onDoubleClick?.(tab.id)}
      onDragStart={() => setDraggedTabId?.(tab.id)}
      onDragEnd={() => setDraggedTabId?.(null)}
    >
      {/* Agent Status Dot */}
      {agentStatus && (
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', agentStatusDotClass(agentStatus))} />
      )}

      {/* Tab Icon */}
      <div className="flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>

      {/* Tab Title */}
      <span className="flex-1 truncate text-xs font-medium min-w-0">
        {tab.title}
      </span>

      {/* Status Indicators - always takes up space */}
      <div className="flex items-center gap-1.5 flex-shrink-0 w-6 justify-end">
        {statusIcon && (
          <span className="flex items-center justify-center">
            {statusIcon}
          </span>
        )}

        {tab.hasUnsavedChanges && !statusIcon && (
          <span
            className="w-1.5 h-1.5 bg-primary rounded-full"
            title="Unsaved changes"
          />
        )}
      </div>

      {/* Close Button - Always reserves space (hidden for grid pseudo-tab) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose(tab.id);
        }}
        className={cn(
          "flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-sm",
          "transition-all duration-100 hover:bg-destructive/20 hover:text-destructive",
          "focus:outline-none focus:ring-1 focus:ring-destructive/50",
          tab.id.startsWith('__project__') ? "hidden" : (isHovered || isActive) ? "opacity-100" : "opacity-0"
        )}
        title={`Close ${tab.title}`}
        tabIndex={-1}
      >
        <X className="w-3 h-3" />
      </button>

    </Reorder.Item>
  );
};
