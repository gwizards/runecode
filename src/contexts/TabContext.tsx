import React, { createContext, useState, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import { TabPersistenceService } from '@/services/tabPersistence';
import { SessionPersistenceService } from '@/services/sessionPersistence';

export type LayoutMode = 'single' | 'grid';

/** Per-tab grid span config */
export interface GridSpan {
  colSpan: number;
  rowSpan: number;
}

/** Grid layout settings */
export interface GridConfig {
  columns: number;
  rows: number; // 0 = auto (as many as needed)
  /** Ordered list of tab IDs in grid — controls position */
  order: string[];
  /** Per-tab span overrides */
  spans: Record<string, GridSpan>;
}

export interface Tab {
  id: string;
  type: 'chat' | 'agent' | 'agents' | 'projects' | 'usage' | 'mcp' | 'settings' | 'claude-md' | 'claude-file' | 'agent-execution' | 'create-agent' | 'import-agent' | 'resource-details' | 'claude-terminal';
  title: string;
  sessionId?: string;  // for chat tabs
  sessionData?: any; // for chat tabs - stores full session object
  agentRunId?: string; // for agent tabs
  agentData?: any; // for agent-execution tabs
  claudeFileId?: string; // for claude-file tabs
  initialProjectPath?: string; // for chat tabs
  projectPath?: string; // for agent-execution tabs
  status: 'active' | 'idle' | 'running' | 'complete' | 'error';
  hasUnsavedChanges: boolean;
  order: number;
  icon?: string;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
}

interface TabContextType {
  tabs: Tab[];
  activeTabId: string | null;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  gridConfig: GridConfig;
  setGridColumns: (cols: number) => void;
  setGridRows: (rows: number) => void;
  setGridOrder: (order: string[]) => void;
  setGridSpan: (tabId: string, span: Partial<GridSpan>) => void;
  addTab: (tab: Omit<Tab, 'id' | 'order' | 'createdAt' | 'updatedAt'>) => string;
  removeTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveTab: (id: string) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  getTabById: (id: string) => Tab | undefined;
  closeAllTabs: () => void;
  getTabsByType: (type: 'chat' | 'agent') => Tab[];
}

const TabContext = createContext<TabContextType | undefined>(undefined);

// const STORAGE_KEY = 'runecode_tabs'; // No longer needed - persistence disabled
const MAX_TABS = 20;
const SOFT_EVICT_THRESHOLD = 12; // Start evicting oldest idle chat tabs above this count

export const TabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(() => {
    try { return (localStorage.getItem('runecode-layout-mode') as LayoutMode) || 'single'; } catch { return 'single'; }
  });
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeState(mode);
    try { localStorage.setItem('runecode-layout-mode', mode); } catch { /* ignore */ }
  }, []);

  // Grid layout config — persisted to localStorage with validation
  const [gridConfig, setGridConfig] = useState<GridConfig>(() => {
    try {
      const stored = localStorage.getItem('runecode-grid-config');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          columns: typeof parsed.columns === 'number' && parsed.columns >= 1 && parsed.columns <= 4 ? parsed.columns : 2,
          rows: typeof parsed.rows === 'number' && parsed.rows >= 0 && parsed.rows <= 6 ? parsed.rows : 0,
          order: Array.isArray(parsed.order) ? parsed.order.filter((id: unknown) => typeof id === 'string') : [],
          spans: typeof parsed.spans === 'object' && parsed.spans !== null ? parsed.spans : {},
        };
      }
    } catch { /* ignore */ }
    return { columns: 2, rows: 0, order: [], spans: {} };
  });


  const setGridColumns = useCallback((cols: number) => {
    setGridConfig(prev => {
      const clamped = Math.max(1, Math.min(4, cols));
      // Also clamp any spans that exceed the new column count
      const nextSpans = { ...prev.spans };
      for (const [tabId, span] of Object.entries(nextSpans)) {
        if (span.colSpan > clamped) {
          nextSpans[tabId] = { ...span, colSpan: clamped };
        }
      }
      const next = { ...prev, columns: clamped, spans: nextSpans };
      try { localStorage.setItem('runecode-grid-config', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setGridRows = useCallback((rows: number) => {
    setGridConfig(prev => {
      const clamped = Math.max(0, Math.min(6, rows)); // 0 = auto
      const next = { ...prev, rows: clamped };
      try { localStorage.setItem('runecode-grid-config', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setGridOrder = useCallback((order: string[]) => {
    setGridConfig(prev => {
      const next = { ...prev, order };
      try { localStorage.setItem('runecode-grid-config', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const setGridSpan = useCallback((tabId: string, span: Partial<GridSpan>) => {
    setGridConfig(prev => {
      const existing = prev.spans[tabId] || { colSpan: 1, rowSpan: 1 };
      const next = { ...prev, spans: { ...prev.spans, [tabId]: { ...existing, ...span } } };
      try { localStorage.setItem('runecode-grid-config', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Keep a ref to current tabs so callbacks can read it without depending on it.
  // This prevents useCallback recreation on every tabs change.
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Load tabs from storage on mount
  useEffect(() => {
    const loadTabs = async () => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // Migrate from old format if needed
    TabPersistenceService.migrateFromOldFormat();

    // Try to load saved tabs
    const { tabs: savedTabs, activeTabId: savedActiveTabId } = TabPersistenceService.loadTabs();
    
    if (savedTabs.length > 0) {
      // For chat tabs, restore session data
      const restoredTabs = await Promise.all(savedTabs.map(async (tab) => {
        if (tab.type === 'chat' && tab.sessionId) {
          // Check if session can be restored
          const sessionData = SessionPersistenceService.loadSession(tab.sessionId);
          if (sessionData) {
            // Create a Session object for the tab
            const session = SessionPersistenceService.createSessionFromRestoreData(sessionData);
            return {
              ...tab,
              sessionData: session,
              initialProjectPath: sessionData.projectPath
            };
          }
        }
        return tab;
      }));
      
      setTabs(restoredTabs);
      setActiveTabId(savedActiveTabId);
    } else {
      // Create default projects tab if no saved tabs
      const defaultTab: Tab = {
        id: generateTabId(),
        type: 'projects',
        title: 'Projects',
        status: 'idle',
        hasUnsavedChanges: false,
        order: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      setTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
    }
    };
    
    loadTabs();
  }, []);

  // Save tabs to localStorage with debounce
  useEffect(() => {
    // Don't save if not initialized
    if (!isInitialized.current) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce saving to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      TabPersistenceService.saveTabs(tabs, activeTabId);
    }, 500); // Wait 500ms after last change before saving

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [tabs, activeTabId]);

  // Save tabs immediately when window is about to close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isInitialized.current && tabs.length > 0) {
        TabPersistenceService.saveTabs(tabs, activeTabId);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Save one final time when component unmounts
      if (isInitialized.current && tabs.length > 0) {
        TabPersistenceService.saveTabs(tabs, activeTabId);
      }
    };
  }, [tabs, activeTabId]);

  const generateTabId = () => {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const addTab = useCallback((tabData: Omit<Tab, 'id' | 'order' | 'createdAt' | 'updatedAt'>): string => {
    if (tabsRef.current.length >= MAX_TABS) {
      throw new Error(`Maximum number of tabs (${MAX_TABS}) reached`);
    }

    const newTab: Tab = {
      ...tabData,
      id: generateTabId(),
      order: tabsRef.current.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    setTabs(prevTabs => [...prevTabs, newTab]);
    setActiveTabId(newTab.id);
    return newTab.id;
  }, []);

  const removeTab = useCallback((id: string) => {
    setTabs(prevTabs => {
      const removedIndex = prevTabs.findIndex(tab => tab.id === id);
      if (removedIndex === -1) return prevTabs;

      const filteredTabs = prevTabs.filter(tab => tab.id !== id);

      // Only update order on tabs whose order actually changed (those after the removed one).
      // Tabs before the removed index keep the same object reference.
      const reorderedTabs = filteredTabs.map((tab, index) =>
        tab.order === index ? tab : { ...tab, order: index }
      );

      // Update active tab if necessary
      if (activeTabId === id && reorderedTabs.length > 0) {
        const newActiveIndex = Math.min(removedIndex, reorderedTabs.length - 1);
        setActiveTabId(reorderedTabs[newActiveIndex].id);
      } else if (reorderedTabs.length === 0) {
        setActiveTabId(null);
      }

      return reorderedTabs;
    });

    // Clean up grid config for the removed tab
    setGridConfig(prev => {
      const hasOrder = prev.order.includes(id);
      const hasSpan = id in prev.spans;
      if (!hasOrder && !hasSpan) return prev;
      const next = {
        ...prev,
        order: hasOrder ? prev.order.filter(tabId => tabId !== id) : prev.order,
        spans: hasSpan ? Object.fromEntries(Object.entries(prev.spans).filter(([k]) => k !== id)) : prev.spans,
      };
      try { localStorage.setItem('runecode-grid-config', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [activeTabId]);

  const updateTab = useCallback((id: string, updates: Partial<Tab>) => {
    setTabs(prevTabs => {
      const idx = prevTabs.findIndex(tab => tab.id === id);
      if (idx === -1) return prevTabs;
      // Only create a new array entry for the changed tab; others keep their reference
      const updated = { ...prevTabs[idx], ...updates, updatedAt: new Date() };
      const next = [...prevTabs];
      next[idx] = updated;
      return next;
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    if (!tabsRef.current.find(tab => tab.id === id)) return;

    setActiveTabId(id);

    // Single setTabs call: update lastAccessedAt on the target tab
    // and soft-evict oldest idle chat tabs if over threshold.
    setTabs(prev => {
      let changed = false;
      let result = prev.map(t => {
        if (t.id === id) {
          changed = true;
          return { ...t, lastAccessedAt: new Date() };
        }
        return t;
      });

      const chatTabs = result.filter(t => t.type === 'chat' && t.id !== id && t.status !== 'running');
      if (chatTabs.length > SOFT_EVICT_THRESHOLD) {
        const sorted = [...chatTabs].sort((a, b) =>
          (a.lastAccessedAt?.getTime() || a.createdAt.getTime()) - (b.lastAccessedAt?.getTime() || b.createdAt.getTime())
        );
        const toEvict = new Set(sorted.slice(0, chatTabs.length - SOFT_EVICT_THRESHOLD).map(t => t.id));
        result = result.filter(t => !toEvict.has(t.id));
        changed = true;
      }

      return changed ? result : prev;
    });
  }, []);

  const reorderTabs = useCallback((startIndex: number, endIndex: number) => {
    setTabs(prevTabs => {
      const newTabs = [...prevTabs];
      const [removed] = newTabs.splice(startIndex, 1);
      newTabs.splice(endIndex, 0, removed);
      
      // Update order property
      return newTabs.map((tab, index) => ({
        ...tab,
        order: index
      }));
    });
  }, []);

  const getTabById = useCallback((id: string): Tab | undefined => {
    return tabsRef.current.find(tab => tab.id === id);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabId(null);
    TabPersistenceService.clearTabs();
  }, []);

  const getTabsByType = useCallback((type: 'chat' | 'agent'): Tab[] => {
    return tabsRef.current.filter(tab => tab.type === type);
  }, []);

  const value = useMemo<TabContextType>(() => ({
    tabs,
    activeTabId,
    layoutMode,
    setLayoutMode,
    gridConfig,
    setGridColumns,
    setGridRows,
    setGridOrder,
    setGridSpan,
    addTab,
    removeTab,
    updateTab,
    setActiveTab,
    reorderTabs,
    getTabById,
    closeAllTabs,
    getTabsByType
  }), [tabs, activeTabId, layoutMode, setLayoutMode, gridConfig, setGridColumns, setGridRows, setGridOrder, setGridSpan, addTab, removeTab, updateTab, setActiveTab, reorderTabs, getTabById, closeAllTabs, getTabsByType]);

  return (
    <TabContext.Provider value={value}>
      {children}
    </TabContext.Provider>
  );
};

export const useTabContext = () => {
  const context = useContext(TabContext);
  if (!context) {
    throw new Error('useTabContext must be used within a TabProvider');
  }
  return context;
};
