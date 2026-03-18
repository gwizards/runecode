import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { X, Plus, MessageSquare, Bot, AlertCircle, Folder, BarChart, Server, Settings, FileText, ChevronDown, Cpu, LayoutGrid, Monitor, PanelRightClose, PanelRightOpen, FolderOpen } from 'lucide-react';
import { RuneSpinner } from './RuneCodeLogo';
import { useTabState } from '@/hooks/useTabState';
import { Tab, useTabContext } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';
import { useTrackEvent } from '@/hooks';
import { useAgentStore } from '@/stores/agentStore';
import { AgentStatusBadge } from './AgentStatusBadge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './ui/dropdown-menu';

type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed';

const agentStatusDotClass = (status: AgentStatus) => {
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
  isDragging?: boolean;
  setDraggedTabId?: (id: string | null) => void;
  agentStatus?: AgentStatus;
}

const TabItem: React.FC<TabItemProps> = ({ tab, isActive, onClose, onClick, isDragging = false, setDraggedTabId, agentStatus }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  const getIcon = () => {
    if (tab.id === '__grid__') return LayoutGrid;
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
      transition={{ duration: 0.1 }} // Snappy reorder animation
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
          tab.id === '__grid__' ? "hidden" : (isHovered || isActive) ? "opacity-100" : "opacity-0"
        )}
        title={`Close ${tab.title}`}
        tabIndex={-1}
      >
        <X className="w-3 h-3" />
      </button>

    </Reorder.Item>
  );
};

interface TabManagerProps {
  className?: string;
}

export const TabManager: React.FC<TabManagerProps> = ({ className }) => {
  const {
    tabs,
    activeTabId,
    createChatTab,
    createProjectsTab,
    createSettingsTab,
    createAgentsTab,
    closeTab,
    switchToTab,
    canAddTab,
    layoutMode,
    setLayoutMode,
  } = useTabState();

  // Access reorderTabs from context
  const { reorderTabs } = useTabContext();

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  // Track sidebar open state (broadcast by ProjectSidebar)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('runecode-sidebar-open') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    const handler = (e: CustomEvent) => setSidebarOpen(!!e.detail?.isOpen);
    window.addEventListener('runecode:sidebar-state', handler as EventListener);
    return () => window.removeEventListener('runecode:sidebar-state', handler as EventListener);
  }, []);

  // Live agent tracking
  const liveAgents = useAgentStore((state) => state.liveAgents);
  const removeLiveAgent = useAgentStore((state) => state.removeLiveAgent);

  // Analytics tracking
  const trackEvent = useTrackEvent();

  // Compute agent status for each tab
  const getAgentStatusForTab = (tab: Tab): AgentStatus | undefined => {
    if (tab.type !== 'agent-execution') return undefined;
    // Find live agent associated with this tab
    for (const agent of liveAgents.values()) {
      if (agent.tabId === tab.id) return agent.status;
    }
    return undefined;
  };

  // Split agent-execution tabs: show first 6, overflow the rest
  const MAX_AGENT_TABS = 6;
  const { visibleTabs, overflowAgentTabs } = useMemo(() => {
    if (layoutMode === 'grid') {
      // In grid mode, collapse all chat/agent-execution tabs into a single "Grid" pseudo-tab.
      // Non-grid tabs (settings, agents, usage, etc.) stay as individual tabs.
      const gridTypes = new Set(['chat', 'agent-execution']);
      const gridTabCount = tabs.filter(t => gridTypes.has(t.type)).length;
      const nonGridTabs = tabs.filter(t => !gridTypes.has(t.type));

      const pseudoTabs: Tab[] = [];
      if (gridTabCount > 0) {
        // Create a synthetic "Grid" tab entry
        pseudoTabs.push({
          id: '__grid__',
          type: 'chat',
          title: `Grid (${gridTabCount})`,
          status: tabs.some(t => gridTypes.has(t.type) && t.status === 'running') ? 'running' : 'idle',
          hasUnsavedChanges: false,
          order: -1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      return { visibleTabs: [...pseudoTabs, ...nonGridTabs], overflowAgentTabs: [] };
    }

    const nonAgentTabs: Tab[] = [];
    const agentTabs: Tab[] = [];
    for (const tab of tabs) {
      if (tab.type === 'agent-execution') {
        agentTabs.push(tab);
      } else {
        nonAgentTabs.push(tab);
      }
    }
    const visible = [...nonAgentTabs, ...agentTabs.slice(0, MAX_AGENT_TABS)];
    const overflow = agentTabs.slice(MAX_AGENT_TABS);
    return { visibleTabs: visible, overflowAgentTabs: overflow };
  }, [tabs, layoutMode]);

  // Listen for tab switch events
  useEffect(() => {
    const handleSwitchToTab = (event: CustomEvent) => {
      const { tabId } = event.detail;
      switchToTab(tabId);
    };

    window.addEventListener('switch-to-tab', handleSwitchToTab as EventListener);
    return () => {
      window.removeEventListener('switch-to-tab', handleSwitchToTab as EventListener);
    };
  }, [switchToTab]);

  // Listen for keyboard shortcut events
  useEffect(() => {
    const handleCreateTab = () => {
      createProjectsTab();
      trackEvent.tabCreated('projects');
    };

    const handleCloseTab = async () => {
      if (activeTabId) {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
          trackEvent.tabClosed(tab.type);
        }
        await closeTab(activeTabId);
      }
    };

    const handleNextTab = () => {
      const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
      const nextIndex = (currentIndex + 1) % tabs.length;
      if (tabs[nextIndex]) {
        switchToTab(tabs[nextIndex].id);
      }
    };

    const handlePreviousTab = () => {
      const currentIndex = tabs.findIndex(tab => tab.id === activeTabId);
      const previousIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
      if (tabs[previousIndex]) {
        switchToTab(tabs[previousIndex].id);
      }
    };

    const handleTabByIndex = (event: CustomEvent) => {
      const { index } = event.detail;
      if (tabs[index]) {
        switchToTab(tabs[index].id);
      }
    };

    window.addEventListener('create-chat-tab', handleCreateTab);
    window.addEventListener('close-current-tab', handleCloseTab);
    window.addEventListener('switch-to-next-tab', handleNextTab);
    window.addEventListener('switch-to-previous-tab', handlePreviousTab);
    window.addEventListener('switch-to-tab-by-index', handleTabByIndex as EventListener);

    return () => {
      window.removeEventListener('create-chat-tab', handleCreateTab);
      window.removeEventListener('close-current-tab', handleCloseTab);
      window.removeEventListener('switch-to-next-tab', handleNextTab);
      window.removeEventListener('switch-to-previous-tab', handlePreviousTab);
      window.removeEventListener('switch-to-tab-by-index', handleTabByIndex as EventListener);
    };
  }, [tabs, activeTabId, createChatTab, closeTab, switchToTab]);

  // Check scroll buttons visibility (rAF-throttled to avoid layout thrashing)
  const scrollRafRef = useRef(0);
  const checkScrollButtons = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftScroll(scrollLeft > 0);
    setShowRightScroll(scrollLeft + clientWidth < scrollWidth - 1);
  };
  const throttledCheckScroll = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      checkScrollButtons();
    });
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', throttledCheckScroll);
    window.addEventListener('resize', throttledCheckScroll);

    return () => {
      container.removeEventListener('scroll', throttledCheckScroll);
      window.removeEventListener('resize', throttledCheckScroll);
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
    };
  }, [tabs]);

  const handleReorder = (newOrder: Tab[]) => {
    // Find the positions that changed
    const oldOrder = tabs.map(tab => tab.id);
    const newOrderIds = newOrder.map(tab => tab.id);
    
    // Find what moved
    const movedTabId = newOrderIds.find((id, index) => oldOrder[index] !== id);
    if (!movedTabId) return;
    
    const oldIndex = oldOrder.indexOf(movedTabId);
    const newIndex = newOrderIds.indexOf(movedTabId);
    
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      // Use the context's reorderTabs function
      reorderTabs(oldIndex, newIndex);
      // Track the reorder event
      trackEvent.featureUsed?.('tab_reorder', 'drag_drop', { 
        from_index: oldIndex, 
        to_index: newIndex 
      });
    }
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab && tab.type === 'agent-execution') {
      // Check if agent is running
      for (const agent of liveAgents.values()) {
        if (agent.tabId === id && (agent.status === 'running' || agent.status === 'thinking')) {
          const confirmed = window.confirm('Agent is still running. Stop it?');
          if (!confirmed) return;
          removeLiveAgent(agent.id);
          break;
        }
      }
    }
    if (tab) {
      trackEvent.tabClosed(tab.type);
    }
    await closeTab(id);
  };

  const handleNewTab = () => {
    if (canAddTab()) {
      createProjectsTab();
      trackEvent.tabCreated('projects');
    }
  };

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const scrollAmount = 200;
    const newScrollLeft = direction === 'left'
      ? container.scrollLeft - scrollAmount
      : container.scrollLeft + scrollAmount;

    container.scrollTo({
      left: newScrollLeft,
      behavior: 'smooth'
    });
  };

  return (
    <div className={cn("flex items-stretch bg-muted/15 relative border-b border-border/50", className)}>
      {/* Left fade gradient */}
      {showLeftScroll && (
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-muted/15 to-transparent pointer-events-none z-10" />
      )}
      
      {/* Left scroll button */}
      <AnimatePresence>
        {showLeftScroll && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scrollTabs('left')}
            className={cn(
              "p-1.5 hover:bg-muted/80 rounded-sm z-20 ml-1",
              "transition-colors duration-200 flex items-center justify-center",
              "bg-background/80 backdrop-blur-sm shadow-sm border border-border/50"
            )}
            title="Scroll tabs left"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 18l-6-6 6-6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tabs container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex overflow-x-auto scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex items-stretch h-8">
          <Reorder.Group
            axis="x"
            values={tabs}
            onReorder={handleReorder}
            className="flex items-stretch"
            layoutScroll={false}
          >
            {visibleTabs.map((tab) => {
              const gridTypes = new Set(['chat', 'agent-execution']);
              const isGridPseudo = tab.id === '__grid__';
              const isActive = isGridPseudo
                ? !!activeTabId && gridTypes.has(tabs.find(t => t.id === activeTabId)?.type || '')
                : tab.id === activeTabId;

              return (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  isActive={isActive}
                  onClose={isGridPseudo ? (_id: string) => {} : handleCloseTab}
                  onClick={isGridPseudo
                    ? (_id: string) => {
                        const firstGrid = tabs.find(t => gridTypes.has(t.type));
                        if (firstGrid) switchToTab(firstGrid.id);
                      }
                    : switchToTab
                  }
                  isDragging={draggedTabId === tab.id}
                  setDraggedTabId={setDraggedTabId}
                  agentStatus={getAgentStatusForTab(tab)}
                />
              );
            })}
          </Reorder.Group>

          {/* Overflow dropdown for agent tabs beyond limit */}
          {overflowAgentTabs.length > 0 && (
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
                      onClick={() => switchToTab(tab.id)}
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
          )}
          
          {/* New tab button - positioned right after tabs */}
          <motion.button
            onClick={handleNewTab}
            disabled={!canAddTab()}
            whileTap={canAddTab() ? { scale: 0.97 } : {}}
            transition={{ duration: 0.15 }}
            className={cn(
              "px-2 mx-1 rounded-md flex items-center justify-center flex-shrink-0",
              "bg-background/50 backdrop-blur-sm h-8",
              canAddTab()
                ? "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                : "opacity-50 cursor-not-allowed text-muted-foreground"
            )}
            title={canAddTab() ? "New project (Ctrl+T)" : "Maximum tabs reached"}
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {/* Right fade gradient */}
      {showRightScroll && (
        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/15 to-transparent pointer-events-none z-10" />
      )}

      {/* Right scroll button */}
      <AnimatePresence>
        {showRightScroll && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scrollTabs('right')}
            className={cn(
              "p-1.5 hover:bg-muted/80 rounded-sm z-20 mr-1",
              "transition-colors duration-200 flex items-center justify-center",
              "bg-background/80 backdrop-blur-sm shadow-sm border border-border/50"
            )}
            title="Scroll tabs right"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 18l6-6-6-6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Layout mode toggle */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => setLayoutMode(layoutMode === 'single' ? 'grid' : 'single')}
        className={cn(
          "flex-shrink-0 px-2 h-8 rounded-md flex items-center gap-1.5 text-xs transition-colors mr-1",
          layoutMode === 'grid'
            ? "bg-primary/15 text-primary border border-primary/30"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        )}
        title={layoutMode === 'single' ? 'Switch to grid view' : 'Switch to single view'}
      >
        {layoutMode === 'single' ? <LayoutGrid className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{layoutMode === 'single' ? 'Grid' : 'Single'}</span>
      </motion.button>

      {/* Separator + action icons (Agents, Processes, Settings) */}
      <div className="w-px h-5 bg-border/30 mx-0.5" />
      <TooltipProvider>
        <div className="flex items-center gap-0.5">
          <TooltipSimple content="Project Explorer" side="bottom">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                createSettingsTab();
                // Small delay to let the settings tab mount, then navigate to section
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'project-explorer' } }));
                }, 100);
              }}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </motion.button>
          </TooltipSimple>
          <TooltipSimple content="Agents" side="bottom">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => createAgentsTab()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Bot className="w-3.5 h-3.5" />
            </motion.button>
          </TooltipSimple>
          <TooltipSimple content="System Processes" side="bottom">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => window.dispatchEvent(new CustomEvent('open-resource-details'))}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" />
            </motion.button>
          </TooltipSimple>
          <TooltipSimple content="Settings" side="bottom">
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => createSettingsTab()}
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
            </motion.button>
          </TooltipSimple>
        </div>
      </TooltipProvider>

      {/* Sidebar toggle */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => window.dispatchEvent(new Event('runecode:toggle-sidebar'))}
        className={cn(
          "flex-shrink-0 px-2 h-8 rounded-md flex items-center gap-1.5 text-xs transition-colors mr-1",
          sidebarOpen
            ? "text-muted-foreground hover:text-foreground hover:bg-muted/60"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        )}
        title={sidebarOpen ? "Close sidebar (Ctrl+B)" : "Open sidebar (Ctrl+B)"}
      >
        {sidebarOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
      </motion.button>

      {/* Agent status badge */}
      <AgentStatusBadge
        onAgentClick={(agentId) => {
          const agent = liveAgents.get(agentId);
          if (agent?.tabId) {
            switchToTab(agent.tabId);
          }
        }}
      />

    </div>
  );
};

export default TabManager;