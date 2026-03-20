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

/** Get the project path from a tab (normalizes the two fields) */
export function getTabProjectPath(tab: { projectPath?: string; initialProjectPath?: string }): string | null {
  return tab.projectPath || tab.initialProjectPath || null;
}

export interface Tab {
  id: string;
  type: 'chat' | 'agent' | 'agents' | 'projects' | 'usage' | 'mcp' | 'settings' | 'claude-md' | 'claude-file' | 'agent-execution' | 'create-agent' | 'import-agent' | 'resource-details' | 'claude-terminal' | 'browser';
  title: string;
  sessionId?: string;  // for chat tabs
  sessionData?: any; // for chat tabs - stores full session object
  agentRunId?: string; // for agent tabs
  agentData?: any; // for agent-execution tabs
  claudeFileId?: string; // for claude-file tabs
  initialProjectPath?: string; // for chat tabs
  projectPath?: string; // for agent-execution tabs
  /** CLI flags for terminal tabs */
  terminalFlags?: string[];
  /** URL for browser tabs */
  browserUrl?: string;
  /** Environment ID for terminal tabs (null = local) */
  environmentId?: string;
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
  /** Active project path for grid view — filters which tabs are shown in the grid */
  activeProjectPath: string | null;
  setActiveProjectPath: (path: string | null) => void;
  /** Grid config for the currently active project */
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

const MAX_TABS = 20;
const SOFT_EVICT_THRESHOLD = 12;

const DEFAULT_GRID_CONFIG: GridConfig = { columns: 2, rows: 0, order: [], spans: {} };
const GRID_CONFIGS_KEY = 'runecode-grid-configs';

function loadGridConfigs(): Record<string, GridConfig> {
  try {
    // Try new per-project format first
    const stored = localStorage.getItem(GRID_CONFIGS_KEY);
    if (stored) return JSON.parse(stored);

    // Migrate from old single-config format
    const old = localStorage.getItem('runecode-grid-config');
    if (old) {
      const parsed = JSON.parse(old);
      const config: GridConfig = {
        columns: typeof parsed.columns === 'number' && parsed.columns >= 1 && parsed.columns <= 4 ? parsed.columns : 2,
        rows: typeof parsed.rows === 'number' && parsed.rows >= 0 && parsed.rows <= 6 ? parsed.rows : 0,
        order: Array.isArray(parsed.order) ? parsed.order.filter((id: unknown) => typeof id === 'string') : [],
        spans: typeof parsed.spans === 'object' && parsed.spans !== null ? parsed.spans : {},
      };
      // Store under "__default__" key — will be reassigned to actual project on first use
      const configs = { __default__: config };
      localStorage.setItem(GRID_CONFIGS_KEY, JSON.stringify(configs));
      localStorage.removeItem('runecode-grid-config');
      return configs;
    }
  } catch { /* ignore */ }
  return {};
}

function saveGridConfigs(configs: Record<string, GridConfig>) {
  try { localStorage.setItem(GRID_CONFIGS_KEY, JSON.stringify(configs)); } catch { /* ignore */ }
}

export const TabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [layoutMode, setLayoutModeState] = useState<LayoutMode>(() => {
    try { return (localStorage.getItem('runecode-layout-mode') as LayoutMode) || 'single'; } catch { return 'single'; }
  });
  const [activeProjectPath, setActiveProjectPathState] = useState<string | null>(() => {
    try { return localStorage.getItem('runecode-active-project') || null; } catch { return null; }
  });
  const isInitialized = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout>(undefined);

  // Per-project grid configs
  const [gridConfigs, setGridConfigs] = useState<Record<string, GridConfig>>(loadGridConfigs);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeState(mode);
    try { localStorage.setItem('runecode-layout-mode', mode); } catch { /* ignore */ }
  }, []);

  const setActiveProjectPath = useCallback((path: string | null) => {
    setActiveProjectPathState(path);
    try {
      if (path) localStorage.setItem('runecode-active-project', path);
      else localStorage.removeItem('runecode-active-project');
    } catch { /* ignore */ }
  }, []);

  // Resolve the grid config for the active project
  const configKey = activeProjectPath || '__default__';
  const gridConfig = gridConfigs[configKey] || DEFAULT_GRID_CONFIG;

  const updateActiveGridConfig = useCallback((updater: (prev: GridConfig) => GridConfig) => {
    setGridConfigs(prev => {
      const key = activeProjectPath || '__default__';
      const current = prev[key] || DEFAULT_GRID_CONFIG;
      const next = { ...prev, [key]: updater(current) };
      saveGridConfigs(next);
      return next;
    });
  }, [activeProjectPath]);

  const setGridColumns = useCallback((cols: number) => {
    updateActiveGridConfig(prev => {
      const clamped = Math.max(1, Math.min(4, cols));
      const nextSpans = { ...prev.spans };
      for (const [tabId, span] of Object.entries(nextSpans)) {
        if (span.colSpan > clamped) {
          nextSpans[tabId] = { ...span, colSpan: clamped };
        }
      }
      return { ...prev, columns: clamped, spans: nextSpans };
    });
  }, [updateActiveGridConfig]);

  const setGridRows = useCallback((rows: number) => {
    updateActiveGridConfig(prev => ({ ...prev, rows: Math.max(0, Math.min(6, rows)) }));
  }, [updateActiveGridConfig]);

  const setGridOrder = useCallback((order: string[]) => {
    updateActiveGridConfig(prev => ({ ...prev, order }));
  }, [updateActiveGridConfig]);

  const setGridSpan = useCallback((tabId: string, span: Partial<GridSpan>) => {
    updateActiveGridConfig(prev => {
      const existing = prev.spans[tabId] || { colSpan: 1, rowSpan: 1 };
      return { ...prev, spans: { ...prev.spans, [tabId]: { ...existing, ...span } } };
    });
  }, [updateActiveGridConfig]);

  // Keep a ref to current tabs so callbacks can read it without depending on it.
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
          const sessionData = SessionPersistenceService.loadSession(tab.sessionId);
          if (sessionData) {
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
    if (!isInitialized.current) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      TabPersistenceService.saveTabs(tabs, activeTabId);
    }, 500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [tabs, activeTabId]);

  // Save tabs immediately when window is about to close — use refs to avoid re-registering
  const tabsForSaveRef = useRef(tabs);
  tabsForSaveRef.current = tabs;
  const activeTabIdForSaveRef = useRef(activeTabId);
  activeTabIdForSaveRef.current = activeTabId;

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isInitialized.current && tabsForSaveRef.current.length > 0) {
        TabPersistenceService.saveTabs(tabsForSaveRef.current, activeTabIdForSaveRef.current);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const generateTabId = () => {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
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
      const removedTab = prevTabs.find(tab => tab.id === id);
      const removedIndex = prevTabs.findIndex(tab => tab.id === id);
      if (removedIndex === -1) return prevTabs;
      const filteredTabs = prevTabs.filter(tab => tab.id !== id);
      const reorderedTabs = filteredTabs.map((tab, index) =>
        tab.order === index ? tab : { ...tab, order: index }
      );
      if (activeTabId === id && reorderedTabs.length > 0) {
        // Prefer a grid-type tab from the same project
        const gridTypes = new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']);
        const removedProject = removedTab ? getTabProjectPath(removedTab) : null;
        const sameProjectGridTab = removedProject
          ? reorderedTabs.find(t => gridTypes.has(t.type) && getTabProjectPath(t) === removedProject)
          : null;
        // Fall back to any grid tab, then any tab by index
        const anyGridTab = !sameProjectGridTab
          ? reorderedTabs.find(t => gridTypes.has(t.type))
          : null;
        const fallback = reorderedTabs[Math.min(removedIndex, reorderedTabs.length - 1)];
        setActiveTabId((sameProjectGridTab || anyGridTab || fallback).id);
      } else if (reorderedTabs.length === 0) {
        setActiveTabId(null);
      }
      return reorderedTabs;
    });

    // Clean up grid config for the removed tab across all project configs
    setGridConfigs(prev => {
      let changed = false;
      const next = { ...prev };
      for (const [key, config] of Object.entries(next)) {
        const hasOrder = config.order.includes(id);
        const hasSpan = id in config.spans;
        if (hasOrder || hasSpan) {
          changed = true;
          next[key] = {
            ...config,
            order: hasOrder ? config.order.filter(tabId => tabId !== id) : config.order,
            spans: hasSpan ? Object.fromEntries(Object.entries(config.spans).filter(([k]) => k !== id)) : config.spans,
          };
        }
      }
      if (changed) saveGridConfigs(next);
      return changed ? next : prev;
    });
  }, [activeTabId]);

  const updateTab = useCallback((id: string, updates: Partial<Tab>) => {
    setTabs(prevTabs => {
      const idx = prevTabs.findIndex(tab => tab.id === id);
      if (idx === -1) return prevTabs;
      const updated = { ...prevTabs[idx], ...updates, updatedAt: new Date() };
      const next = [...prevTabs];
      next[idx] = updated;
      return next;
    });
  }, []);

  const setActiveTab = useCallback((id: string) => {
    if (!tabsRef.current.find(tab => tab.id === id)) return;
    setActiveTabId(id);
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
      return newTabs.map((tab, index) => ({ ...tab, order: index }));
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
    activeProjectPath,
    setActiveProjectPath,
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
  }), [tabs, activeTabId, layoutMode, setLayoutMode, activeProjectPath, setActiveProjectPath, gridConfig, setGridColumns, setGridRows, setGridOrder, setGridSpan, addTab, removeTab, updateTab, setActiveTab, reorderTabs, getTabById, closeAllTabs, getTabsByType]);

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
