import React from 'react';
import { useTabState } from '@/hooks/useTabState';
import { getTabProjectPath } from '@/contexts/TabContext';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';
import { TabPanel } from './tab/TabPanelContent';
import { GridView, SingleView } from './tab/SplitPaneTab';
import { useTabEvents } from './tab/useTabEvents';

export const TabContent: React.FC = () => {
  const {
    tabs,
    activeTabId,
    layoutMode,
    setLayoutMode,
    gridConfig,
    setGridColumns,
    setGridRows,
    setGridOrder,
    setGridSpan,
    createChatTab,
    createProjectsTab,
    createSettingsTab,
    findTabBySessionId,
    createClaudeFileTab,
    createAgentExecutionTab,
    createCreateAgentTab,
    createImportAgentTab,
    createResourceDetailsTab,
    createTerminalTab,
    createBrowserTab,
    closeTab,
    updateTab,
    switchToTab,
    activeProjectPath,
    setActiveProjectPath,
    canAddTab,
  } = useTabState();

  // Register all window event listeners
  useTabEvents({
    tabs,
    activeTabId,
    findTabBySessionId,
    createChatTab,
    createClaudeFileTab,
    createAgentExecutionTab,
    createCreateAgentTab,
    createImportAgentTab,
    createResourceDetailsTab,
    createTerminalTab,
    closeTab,
    updateTab,
    createSettingsTab,
  });

  // Grid mode — only project/session tabs go into the grid.
  // Settings, agents, processes, etc. stay as single-panel windows.
  const gridTypes = React.useMemo(() => new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']), []);

  // Environment lookup for grid cell badges
  const envMap = React.useMemo(() => {
    try {
      const stored = localStorage.getItem('runecode-remote-environments');
      if (!stored) return new Map<string, RemoteEnvironment>();
      const envs: RemoteEnvironment[] = JSON.parse(stored);
      return new Map(envs.map(e => [e.id, e]));
    } catch { return new Map<string, RemoteEnvironment>(); }
  }, []);

  // Auto-set activeProjectPath from the active tab if not set
  React.useEffect(() => {
    if (layoutMode !== 'grid' || activeProjectPath) return;
    const active = activeTabId ? tabs.find(t => t.id === activeTabId) : null;
    const pp = active ? getTabProjectPath(active) : null;
    if (pp) setActiveProjectPath(pp);
  }, [layoutMode, activeProjectPath, activeTabId, tabs, setActiveProjectPath]);

  // All grid-capable tabs (all projects)
  const allGridTabs = React.useMemo(() =>
    layoutMode === 'grid' ? tabs.filter(t => gridTypes.has(t.type)) : [],
    [tabs, layoutMode, gridTypes]
  );

  // Active project's grid tabs only (for ordering, footer, empty state)
  const gridTabs = React.useMemo(() =>
    allGridTabs.filter(t => getTabProjectPath(t) === activeProjectPath),
    [allGridTabs, activeProjectPath]
  );

  const nonGridTabs = React.useMemo(() =>
    layoutMode === 'grid' ? tabs.filter(t => !gridTypes.has(t.type)) : [],
    [tabs, layoutMode, gridTypes]
  );

  // Ordered grid tabs for active project — respects user drag order, syncs new/removed tabs
  const orderedGridTabs = React.useMemo(() => {
    if (gridTabs.length === 0) return [];
    const tabMap = new Map(gridTabs.map(t => [t.id, t]));
    const ordered = gridConfig.order.filter(id => tabMap.has(id)).map(id => tabMap.get(id)!);
    const inOrder = new Set(gridConfig.order);
    for (const t of gridTabs) {
      if (!inOrder.has(t.id)) ordered.push(t);
    }
    return ordered;
  }, [gridTabs, gridConfig.order]);

  // Sync grid order when tabs change
  React.useEffect(() => {
    if (layoutMode !== 'grid' || gridTabs.length === 0) return;
    const currentIds = orderedGridTabs.map(t => t.id);
    if (JSON.stringify(currentIds) !== JSON.stringify(gridConfig.order)) {
      setGridOrder(currentIds);
    }
  }, [orderedGridTabs, gridConfig.order, layoutMode, gridTabs.length, setGridOrder]);

  // Stable refs for keyboard handler to avoid stale closures
  const activeTabIdRef = React.useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const orderedGridTabsRef = React.useRef(orderedGridTabs);
  orderedGridTabsRef.current = orderedGridTabs;

  // Tab cycles grid focus, Shift+Tab goes backward, Ctrl+1..9 jumps to specific grid tab
  React.useEffect(() => {
    if (layoutMode !== 'grid') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const gTabs = orderedGridTabsRef.current;
      if (gTabs.length === 0) return;

      // Tab cycles focus forward through grid cells, Shift+Tab cycles backward
      if (e.key === 'Tab' && !e.altKey && !e.metaKey && !e.ctrlKey) {
        // Skip if focus is in a regular text input (not terminal)
        const target = e.target as HTMLElement;
        const isTextInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.closest('.xterm');
        if (isTextInput) return;

        e.preventDefault();
        e.stopImmediatePropagation();
        const currentIdx = gTabs.findIndex(t => t.id === activeTabIdRef.current);
        const delta = e.shiftKey ? -1 : 1;
        const nextIdx = (currentIdx + delta + gTabs.length) % gTabs.length;
        const nextTabId = gTabs[nextIdx].id;
        switchToTab(nextTabId);
        setTimeout(() => window.dispatchEvent(new CustomEvent('runecode:focus-prompt', { detail: { tabId: nextTabId } })), 50);
        return;
      }
      // Ctrl+1..9 jumps to specific grid tab — always consume in grid mode
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        e.stopImmediatePropagation();
        const idx = parseInt(e.key) - 1;
        if (idx < gTabs.length) {
          switchToTab(gTabs[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [layoutMode, switchToTab]);

  // Ctrl+1..9 in single mode — jump to tab by index
  React.useEffect(() => {
    if (layoutMode === 'grid') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) {
          e.preventDefault();
          switchToTab(tabs[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [layoutMode, tabs, switchToTab]);

  // Tabs from other projects — kept alive but hidden so terminals/browsers don't reload
  const inactiveProjectTabs = React.useMemo(() =>
    allGridTabs.filter(t => getTabProjectPath(t) !== activeProjectPath),
    [allGridTabs, activeProjectPath]
  );

  // These must be before any early returns to keep hook count stable
  const gridTypesSet = React.useMemo(() => new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']), []);
  const activeTabSingle = activeTabId ? tabs.find(t => t.id === activeTabId) : null;
  const showGridActions = !!(activeTabSingle && gridTypesSet.has(activeTabSingle.type));

  // Distinct real project paths in the active grid (for "Separate" button logic)
  const gridProjectPaths = React.useMemo(() => {
    const paths = new Set<string>();
    for (const t of gridTabs) {
      const ip = t.initialProjectPath;
      if (ip) paths.add(ip);
    }
    return paths;
  }, [gridTabs]);

  // All distinct grid group keys (for "Join grid" menu)
  const allGridGroupKeys = React.useMemo(() => {
    const keys = new Set<string>();
    for (const t of allGridTabs) {
      const pp = t.projectPath || t.initialProjectPath;
      if (pp) keys.add(pp);
    }
    return Array.from(keys);
  }, [allGridTabs]);

  if (layoutMode === 'grid') {
    return (
      <GridView
        tabs={tabs}
        activeTabId={activeTabId}
        layoutMode={layoutMode}
        gridConfig={gridConfig}
        orderedGridTabs={orderedGridTabs}
        nonGridTabs={nonGridTabs}
        inactiveProjectTabs={inactiveProjectTabs}
        allGridTabs={allGridTabs}
        allGridGroupKeys={allGridGroupKeys}
        gridProjectPaths={gridProjectPaths}
        activeProjectPath={activeProjectPath}
        envMap={envMap}
        canAddTab={canAddTab}
        setLayoutMode={setLayoutMode}
        switchToTab={switchToTab}
        closeTab={closeTab}
        updateTab={updateTab}
        setActiveProjectPath={setActiveProjectPath}
        setGridColumns={setGridColumns}
        setGridRows={setGridRows}
        setGridOrder={setGridOrder}
        setGridSpan={setGridSpan}
        createProjectsTab={createProjectsTab}
        createTerminalTab={createTerminalTab}
        createBrowserTab={createBrowserTab}
      />
    );
  }

  // Single mode (default)
  return (
    <SingleView
      tabs={tabs}
      activeTabId={activeTabId}
      showGridActions={showGridActions}
      activeTabSingle={activeTabSingle ?? null}
      allGridGroupKeys={allGridGroupKeys}
      setLayoutMode={setLayoutMode}
      switchToTab={switchToTab}
      updateTab={updateTab}
      setActiveProjectPath={setActiveProjectPath}
      createProjectsTab={createProjectsTab}
    />
  );
};

// Re-export TabPanel for backward compatibility
export { TabPanel };
