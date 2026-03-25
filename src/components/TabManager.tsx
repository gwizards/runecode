import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import { Plus, Bot, Cpu, LayoutGrid, Monitor, PanelRightClose, PanelRightOpen, FolderOpen, Settings } from 'lucide-react';
import { useTabState } from '@/hooks/useTabState';
import { Tab, useTabContext } from '@/contexts/TabContext';
import { cn } from '@/lib/utils';
import { TooltipProvider, TooltipSimple } from '@/components/ui/tooltip-modern';
import { useTrackEvent } from '@/hooks';
import { useAgentDomainStore } from '@/domain/agent';
import { AgentStatusBadge } from './AgentStatusBadge';
import { TabItem } from './tabs/TabBar';
import { TabOverflowMenu } from './tabs/TabContextMenu';

type AgentStatus = 'running' | 'thinking' | 'completed' | 'failed';

interface TabManagerProps {
  className?: string;
}

const GRID_NAMES_KEY = 'runecode-grid-names';

function loadGridNames(): Record<string, string> {
  try { const s = localStorage.getItem(GRID_NAMES_KEY); return s ? JSON.parse(s) : {}; } catch { return {}; }
}

function saveGridName(gridKey: string, name: string) {
  const names = loadGridNames();
  names[gridKey] = name;
  try { localStorage.setItem(GRID_NAMES_KEY, JSON.stringify(names)); } catch (e) { console.warn('[TabManager] failed to save grid names', e); }
}

export const TabManager: React.FC<TabManagerProps> = ({ className }) => {
  const {
    tabs, activeTabId, createChatTab, createProjectsTab, createSettingsTab,
    createAgentsTab, createBrowserTab, closeTab, switchToTab, canAddTab,
    layoutMode, setLayoutMode, activeProjectPath, setActiveProjectPath,
  } = useTabState();

  const { reorderTabs } = useTabContext();

  const [gridNames, setGridNames] = useState(loadGridNames);
  const [renamingGrid, setRenamingGrid] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const browserHandlerRef = useRef<(e: CustomEvent) => void>(undefined);
  browserHandlerRef.current = (e: CustomEvent) => {
    const url = e.detail?.url;
    if (!url) return;
    createBrowserTab(url);
  };
  useEffect(() => {
    const handler = (e: Event) => browserHandlerRef.current?.(e as CustomEvent);
    window.addEventListener('runecode:open-url-in-browser', handler);
    return () => window.removeEventListener('runecode:open-url-in-browser', handler);
  }, []);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    try { return localStorage.getItem('runecode-sidebar-open') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    const handler = (e: CustomEvent) => setSidebarOpen(!!e.detail?.isOpen);
    window.addEventListener('runecode:sidebar-state', handler as EventListener);
    return () => window.removeEventListener('runecode:sidebar-state', handler as EventListener);
  }, []);

  const liveAgents = useAgentDomainStore((state) => state.liveAgents);
  const removeLiveAgent = useAgentDomainStore((state) => state.removeLiveAgent);
  const trackEvent = useTrackEvent();

  const getAgentStatusForTab = (tab: Tab): AgentStatus | undefined => {
    if (tab.type !== 'agent-execution') return undefined;
    for (const agent of Object.values(liveAgents)) {
      if (agent.tabId === tab.id) return agent.status as AgentStatus;
    }
    return undefined;
  };

  const MAX_AGENT_TABS = 6;
  const { visibleTabs, overflowAgentTabs } = useMemo(() => {
    if (layoutMode === 'grid') {
      const gridTypes = new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']);
      const nonGridInBar = tabs.filter(t => !gridTypes.has(t.type));
      const projectMap = new Map<string, Tab[]>();
      for (const t of tabs) {
        if (!gridTypes.has(t.type)) continue;
        const pp = t.projectPath || t.initialProjectPath || '__ungrouped__';
        if (!projectMap.has(pp)) projectMap.set(pp, []);
        projectMap.get(pp)!.push(t);
      }
      const pseudoTabs: Tab[] = [];
      for (const [pp, projectTabs] of projectMap) {
        const projectNames = new Set<string>();
        for (const t of projectTabs) {
          const realPath = t.initialProjectPath || t.projectPath;
          if (realPath) projectNames.add(realPath.split('/').pop() || realPath);
        }
        const autoName = pp === '__ungrouped__' ? 'Ungrouped' : projectNames.size > 0 ? Array.from(projectNames).join(' + ') : pp.split('/').pop() || pp;
        const name = gridNames[pp] || autoName;
        pseudoTabs.push({
          id: `__project__${pp}`, type: 'chat', title: `${name} (${projectTabs.length})`,
          projectPath: pp === '__ungrouped__' ? undefined : pp,
          status: projectTabs.some(t => t.status === 'running') ? 'running' : 'idle',
          hasUnsavedChanges: false, order: -1, createdAt: new Date(), updatedAt: new Date(),
        });
      }
      return { visibleTabs: [...pseudoTabs, ...nonGridInBar], overflowAgentTabs: [] };
    }
    const nonAgentTabs: Tab[] = [];
    const agentTabs: Tab[] = [];
    for (const tab of tabs) {
      if (tab.type === 'agent-execution') agentTabs.push(tab);
      else nonAgentTabs.push(tab);
    }
    return { visibleTabs: [...nonAgentTabs, ...agentTabs.slice(0, MAX_AGENT_TABS)], overflowAgentTabs: agentTabs.slice(MAX_AGENT_TABS) };
  }, [tabs, layoutMode, gridNames]);

  useEffect(() => {
    const handleSwitchToTab = (event: CustomEvent) => switchToTab(event.detail.tabId);
    window.addEventListener('switch-to-tab', handleSwitchToTab as EventListener);
    return () => window.removeEventListener('switch-to-tab', handleSwitchToTab as EventListener);
  }, [switchToTab]);

  useEffect(() => {
    const handleCreateTab = () => { createProjectsTab(); trackEvent.tabCreated('projects'); };
    const handleCloseTab = async () => {
      if (activeTabId) { const tab = tabs.find(t => t.id === activeTabId); if (tab) trackEvent.tabClosed(tab.type); await closeTab(activeTabId); }
    };
    const handleNextTab = () => {
      const ci = tabs.findIndex(tab => tab.id === activeTabId);
      const ni = (ci + 1) % tabs.length;
      if (tabs[ni]) { switchToTab(tabs[ni].id); setTimeout(() => window.dispatchEvent(new CustomEvent('runecode:focus-prompt', { detail: { tabId: tabs[ni].id } })), 50); }
    };
    const handlePreviousTab = () => {
      const ci = tabs.findIndex(tab => tab.id === activeTabId);
      const pi = ci === 0 ? tabs.length - 1 : ci - 1;
      if (tabs[pi]) { switchToTab(tabs[pi].id); setTimeout(() => window.dispatchEvent(new CustomEvent('runecode:focus-prompt', { detail: { tabId: tabs[pi].id } })), 50); }
    };
    const handleTabByIndex = (event: CustomEvent) => { const { index } = event.detail; if (tabs[index]) switchToTab(tabs[index].id); };
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
    scrollRafRef.current = requestAnimationFrame(() => { scrollRafRef.current = 0; checkScrollButtons(); });
  };

  useEffect(() => {
    checkScrollButtons();
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', throttledCheckScroll);
    window.addEventListener('resize', throttledCheckScroll);
    return () => { container.removeEventListener('scroll', throttledCheckScroll); window.removeEventListener('resize', throttledCheckScroll); if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current); };
  }, [tabs]);

  const handleReorder = (newOrder: Tab[]) => {
    const oldOrder = visibleTabs.map(tab => tab.id);
    const newOrderIds = newOrder.map(tab => tab.id);
    const movedTabId = newOrderIds.find((id, index) => oldOrder[index] !== id);
    if (!movedTabId) return;
    const oldIndex = oldOrder.indexOf(movedTabId);
    const newIndex = newOrderIds.indexOf(movedTabId);
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      reorderTabs(oldIndex, newIndex);
      trackEvent.featureUsed?.('tab_reorder', 'drag_drop', { from_index: oldIndex, to_index: newIndex });
    }
  };

  const handleCloseTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab && tab.type === 'agent-execution') {
      for (const agent of Object.values(liveAgents)) {
        if (agent.tabId === id && (agent.status === 'running' || agent.status === 'thinking')) {
          const confirmed = window.confirm('Agent is still running. Stop it?');
          if (!confirmed) return;
          removeLiveAgent(agent.id);
          break;
        }
      }
    }
    if (tab) trackEvent.tabClosed(tab.type);
    await closeTab(id);
  };

  const handleNewTab = () => { if (canAddTab()) { createProjectsTab(); trackEvent.tabCreated('projects'); } };

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollAmount = 200;
    container.scrollTo({ left: direction === 'left' ? container.scrollLeft - scrollAmount : container.scrollLeft + scrollAmount, behavior: 'smooth' });
  };

  const gridTypes = new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']);

  return (
    <div className={cn("flex items-stretch bg-muted/15 relative border-b border-border/50", className)}>
      {showLeftScroll && <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-muted/15 to-transparent pointer-events-none z-10" />}
      <AnimatePresence>
        {showLeftScroll && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => scrollTabs('left')} className={cn("p-1.5 hover:bg-muted/80 rounded-sm z-20 ml-1", "transition-colors duration-200 flex items-center justify-center", "bg-background/80 backdrop-blur-sm shadow-sm border border-border/50")} title="Scroll tabs left">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.button>
        )}
      </AnimatePresence>

      <div ref={scrollContainerRef} className="flex-1 flex overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <div className="flex items-stretch h-8">
          <Reorder.Group axis="x" values={visibleTabs} onReorder={handleReorder} className="flex items-stretch" layoutScroll={false}>
            {visibleTabs.map((tab) => {
              const isProjectPseudo = tab.id.startsWith('__project__');
              const pseudoProjectPath = isProjectPseudo ? tab.id.replace('__project__', '') : null;
              const isActive = isProjectPseudo
                ? activeProjectPath === (pseudoProjectPath === '__ungrouped__' ? null : pseudoProjectPath) && !!activeTabId && gridTypes.has(tabs.find(t => t.id === activeTabId)?.type || '')
                : tab.id === activeTabId;

              if (isProjectPseudo && renamingGrid === pseudoProjectPath) {
                return (
                  <div key={tab.id} className="flex items-center px-1 h-8">
                    <input ref={renameInputRef} value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { if (renameValue.trim()) { saveGridName(pseudoProjectPath!, renameValue.trim()); setGridNames(loadGridNames()); } setRenamingGrid(null); } if (e.key === 'Escape') setRenamingGrid(null); }}
                      onBlur={() => { if (renameValue.trim()) { saveGridName(pseudoProjectPath!, renameValue.trim()); setGridNames(loadGridNames()); } setRenamingGrid(null); }}
                      className="h-6 px-2 text-xs font-medium bg-background border border-primary/40 rounded outline-none w-32" autoFocus />
                  </div>
                );
              }

              return (
                <TabItem key={tab.id} tab={tab} isActive={isActive}
                  onClose={isProjectPseudo ? (_id: string) => {} : handleCloseTab}
                  onClick={isProjectPseudo ? (_id: string) => { const pp = pseudoProjectPath === '__ungrouped__' ? null : pseudoProjectPath; setActiveProjectPath(pp); const firstTab = tabs.find(t => gridTypes.has(t.type) && (t.projectPath || t.initialProjectPath || null) === pp); if (firstTab) switchToTab(firstTab.id); } : switchToTab}
                  onDoubleClick={isProjectPseudo ? (_id: string) => { setRenamingGrid(pseudoProjectPath); setRenameValue(tab.title.replace(/\s*\(\d+\)$/, '')); setTimeout(() => renameInputRef.current?.select(), 0); } : undefined}
                  isDragging={draggedTabId === tab.id} setDraggedTabId={setDraggedTabId} agentStatus={getAgentStatusForTab(tab)} />
              );
            })}
          </Reorder.Group>

          <TabOverflowMenu overflowAgentTabs={overflowAgentTabs} getAgentStatusForTab={getAgentStatusForTab} onSwitchToTab={switchToTab} />

          <motion.button onClick={handleNewTab} disabled={!canAddTab()} whileTap={canAddTab() ? { scale: 0.97 } : {}} transition={{ duration: 0.15 }}
            className={cn("px-2 mx-1 rounded-md flex items-center justify-center flex-shrink-0", "bg-background/50 backdrop-blur-sm h-8", canAddTab() ? "hover:bg-muted/60 text-muted-foreground hover:text-foreground" : "opacity-50 cursor-not-allowed text-muted-foreground")}
            title={canAddTab() ? "New project (Ctrl+T)" : "Maximum tabs reached"}>
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      {showRightScroll && <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-muted/15 to-transparent pointer-events-none z-10" />}
      <AnimatePresence>
        {showRightScroll && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => scrollTabs('right')} className={cn("p-1.5 hover:bg-muted/80 rounded-sm z-20 mr-1", "transition-colors duration-200 flex items-center justify-center", "bg-background/80 backdrop-blur-sm shadow-sm border border-border/50")} title="Scroll tabs right">
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 18l6-6-6-6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button whileTap={{ scale: 0.95 }} onClick={() => setLayoutMode(layoutMode === 'single' ? 'grid' : 'single')}
        className={cn("flex-shrink-0 px-2 h-8 rounded-md flex items-center gap-1.5 text-xs transition-colors mr-1", layoutMode === 'grid' ? "bg-primary/15 text-primary border border-primary/30" : "text-muted-foreground hover:text-foreground hover:bg-muted/60")}
        title={layoutMode === 'single' ? 'Switch to grid view' : 'Switch to single view'}>
        {layoutMode === 'single' ? <LayoutGrid className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{layoutMode === 'single' ? 'Grid' : 'Single'}</span>
      </motion.button>

      <div className="w-px h-5 bg-border/30 mx-0.5" />
      <TooltipProvider>
        <div className="flex items-center gap-0.5">
          <TooltipSimple content="Project Explorer" side="bottom">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => { createSettingsTab(); setTimeout(() => { window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'project-explorer' } })); }, 100); }} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"><FolderOpen className="w-3.5 h-3.5" /></motion.button>
          </TooltipSimple>
          <TooltipSimple content="Agents" side="bottom">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => createAgentsTab()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"><Bot className="w-3.5 h-3.5" /></motion.button>
          </TooltipSimple>
          <TooltipSimple content="System Processes" side="bottom">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => window.dispatchEvent(new CustomEvent('open-resource-details'))} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"><Cpu className="w-3.5 h-3.5" /></motion.button>
          </TooltipSimple>
          <TooltipSimple content="Settings" side="bottom">
            <motion.button whileTap={{ scale: 0.95 }} onClick={() => createSettingsTab()} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"><Settings className="w-3.5 h-3.5" /></motion.button>
          </TooltipSimple>
        </div>
      </TooltipProvider>

      <motion.button whileTap={{ scale: 0.95 }} onClick={() => window.dispatchEvent(new Event('runecode:toggle-sidebar'))}
        className={cn("flex-shrink-0 px-2 h-8 rounded-md flex items-center gap-1.5 text-xs transition-colors mr-1", "text-muted-foreground hover:text-foreground hover:bg-muted/60")}
        title={sidebarOpen ? "Close sidebar (Ctrl+B)" : "Open sidebar (Ctrl+B)"}>
        {sidebarOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
      </motion.button>

      <AgentStatusBadge onAgentClick={(agentId) => { const agent = liveAgents[agentId]; if (agent?.tabId) switchToTab(agent.tabId); }} />
    </div>
  );
};

export default TabManager;
