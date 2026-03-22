// @deprecated — use src/domain/workspace instead
//
// Thin adapter: re-exports the TabContext surface under the legacy
// useTabState name so all existing call sites compile without changes.
//
// Migration note: the workspace domain store (useWorkspaceStore) tracks a
// single workspace's tab records. Until it fully replaces TabContext — i.e.
// until RawTab carries status, type, sessionId, agentRunId, etc. — this hook
// bridges the gap by delegating to TabContext.

import { useMemo, useCallback } from 'react';
import {
  useTabContext,
  type Tab,
  type LayoutMode,
  type GridConfig,
  type GridSpan,
} from '@/contexts/TabContext';

export type { Tab, LayoutMode, GridConfig, GridSpan };

export const useTabState = () => {
  const ctx = useTabContext();
  const {
    tabs, activeTabId, layoutMode, setLayoutMode, gridConfig,
    setGridColumns, setGridRows, setGridOrder, setGridSpan,
    activeProjectPath, setActiveProjectPath,
    addTab, removeTab, updateTab, setActiveTab, getTabById,
  } = ctx;

  const activeTab = useMemo(
    () => (activeTabId ? tabs.find(t => t.id === activeTabId) : undefined),
    [activeTabId, tabs],
  );

  // ── singleton helpers ────────────────────────────────────────────────────────
  const singletonOrAdd = useCallback(
    (type: Tab['type'], data: Omit<Tab, 'id' | 'order' | 'createdAt' | 'updatedAt'>): string => {
      const existing = tabs.find(t => t.type === type);
      if (existing) { setActiveTab(existing.id); return existing.id; }
      return addTab(data);
    },
    [tabs, addTab, setActiveTab],
  );

  // ── tab factories ────────────────────────────────────────────────────────────
  const createChatTab = useCallback(
    (projectId?: string, title?: string, projectPath?: string) =>
      addTab({ type: 'chat', title: title || `Chat ${tabs.filter(t => t.type === 'chat').length + 1}`, sessionId: projectId, initialProjectPath: projectPath, status: 'idle', hasUnsavedChanges: false, icon: 'message-square' }),
    [addTab, tabs],
  );

  const createAgentTab = useCallback(
    (agentRunId: string, agentName: string) => {
      const existing = tabs.find(t => t.agentRunId === agentRunId);
      if (existing) { setActiveTab(existing.id); return existing.id; }
      return addTab({ type: 'agent', title: agentName, agentRunId, status: 'running', hasUnsavedChanges: false, icon: 'bot' });
    },
    [addTab, tabs, setActiveTab],
  );

  const createAgentExecutionTab = useCallback(
    (agent: any, _tabId: string, projectPath?: string) =>
      addTab({ type: 'agent-execution', title: `Run: ${agent.name}`, agentData: agent, projectPath, status: 'idle', hasUnsavedChanges: false, icon: 'bot' }),
    [addTab],
  );

  const createProjectsTab      = useCallback(() => addTab({ type: 'projects',         title: 'Projects',      status: 'idle', hasUnsavedChanges: false, icon: 'folder'      }), [addTab]);
  const createAgentsTab        = useCallback(() => singletonOrAdd('agents',         { type: 'agents',          title: 'Agents',       status: 'idle', hasUnsavedChanges: false, icon: 'bot'         }), [singletonOrAdd]);
  const createUsageTab         = useCallback(() => singletonOrAdd('usage',          { type: 'usage',           title: 'Usage',        status: 'idle', hasUnsavedChanges: false, icon: 'bar-chart'   }), [singletonOrAdd]);
  const createMCPTab           = useCallback(() => singletonOrAdd('mcp',            { type: 'mcp',             title: 'MCP Servers',  status: 'idle', hasUnsavedChanges: false, icon: 'server'      }), [singletonOrAdd]);
  const createSettingsTab      = useCallback(() => singletonOrAdd('settings',       { type: 'settings',        title: 'Settings',     status: 'idle', hasUnsavedChanges: false, icon: 'settings'    }), [singletonOrAdd]);
  const createClaudeMdTab      = useCallback(() => singletonOrAdd('claude-md',      { type: 'claude-md',       title: 'CLAUDE.md',    status: 'idle', hasUnsavedChanges: false, icon: 'file-text'   }), [singletonOrAdd]);
  const createCreateAgentTab   = useCallback(() => singletonOrAdd('create-agent',   { type: 'create-agent',    title: 'Create Agent', status: 'idle', hasUnsavedChanges: false, icon: 'plus'        }), [singletonOrAdd]);
  const createImportAgentTab   = useCallback(() => singletonOrAdd('import-agent',   { type: 'import-agent',    title: 'Import Agent', status: 'idle', hasUnsavedChanges: false, icon: 'import'      }), [singletonOrAdd]);
  const createResourceDetailsTab = useCallback(() => singletonOrAdd('resource-details', { type: 'resource-details', title: 'Processes', status: 'idle', hasUnsavedChanges: false, icon: 'cpu'      }), [singletonOrAdd]);

  const createClaudeFileTab = useCallback(
    (fileId: string, fileName: string) => {
      const existing = tabs.find(t => t.type === 'claude-file' && t.claudeFileId === fileId);
      if (existing) { setActiveTab(existing.id); return existing.id; }
      return addTab({ type: 'claude-file', title: fileName, claudeFileId: fileId, status: 'idle', hasUnsavedChanges: false, icon: 'file-text' });
    },
    [addTab, tabs, setActiveTab],
  );

  const createTerminalTab = useCallback(
    (sessionId?: string, projectPath?: string, flags?: string[]) => {
      const base = projectPath?.split('/').pop() || (sessionId ? sessionId.slice(0, 8) : 'Terminal');
      const name = flags?.includes('--shell') ? `\u2B1B ${base}` : `\uD83D\uDD2E ${base}`;
      return addTab({ type: 'claude-terminal', title: name, sessionId, projectPath, terminalFlags: flags, status: 'active', hasUnsavedChanges: false, icon: 'terminal' });
    },
    [addTab],
  );

  const createBrowserTab = useCallback(
    (url?: string, projectPath?: string) => {
      const resolved = projectPath || activeProjectPath || (activeTab ? (activeTab.projectPath || activeTab.initialProjectPath) : null) || undefined;
      return addTab({ type: 'browser', title: 'Browser', browserUrl: url, projectPath: resolved, status: 'active', hasUnsavedChanges: false, icon: 'globe' });
    },
    [addTab, activeProjectPath, activeTab],
  );

  // ── tab lifecycle ────────────────────────────────────────────────────────────
  const closeTab = useCallback(
    async (id: string, force = false): Promise<boolean> => {
      const tab = getTabById(id);
      if (!tab) return true;
      if (!force && tab.hasUnsavedChanges) {
        if (!window.confirm(`Tab "${tab.title}" has unsaved changes. Close anyway?`)) return false;
      }
      removeTab(id);
      return true;
    },
    [getTabById, removeTab],
  );

  const closeCurrentTab = useCallback(
    async () => (activeTabId ? closeTab(activeTabId) : true),
    [activeTabId, closeTab],
  );

  const switchToNextTab = useCallback(() => {
    if (!tabs.length) return;
    const idx = tabs.findIndex(t => t.id === activeTabId);
    setActiveTab(tabs[(idx + 1) % tabs.length].id);
  }, [tabs, activeTabId, setActiveTab]);

  const switchToPreviousTab = useCallback(() => {
    if (!tabs.length) return;
    const idx = tabs.findIndex(t => t.id === activeTabId);
    setActiveTab(tabs[idx === 0 ? tabs.length - 1 : idx - 1].id);
  }, [tabs, activeTabId, setActiveTab]);

  const switchToTabByIndex = useCallback(
    (index: number) => { if (tabs[index]) setActiveTab(tabs[index].id); },
    [tabs, setActiveTab],
  );

  // ── update helpers ───────────────────────────────────────────────────────────
  const updateTabTitle  = useCallback((id: string, title: string)             => updateTab(id, { title }),               [updateTab]);
  const updateTabStatus = useCallback((id: string, status: Tab['status'])     => updateTab(id, { status }),              [updateTab]);
  const markTabAsChanged = useCallback((id: string, hasChanges: boolean)      => updateTab(id, { hasUnsavedChanges: hasChanges }), [updateTab]);

  // ── finders ──────────────────────────────────────────────────────────────────
  const findTabBySessionId  = useCallback((sid: string)   => tabs.find(t => t.type === 'chat'  && t.sessionId  === sid),  [tabs]);
  const findTabByAgentRunId = useCallback((rid: string)   => tabs.find(t => t.type === 'agent' && t.agentRunId === rid),  [tabs]);
  const findTabByType       = useCallback((type: Tab['type']) => tabs.find(t => t.type === type),                          [tabs]);
  const canAddTab           = useCallback(() => tabs.length < 20,                                                          [tabs]);

  return {
    // state
    tabs,
    activeTab,
    activeTabId,
    tabCount:      tabs.length,
    chatTabCount:  tabs.filter(t => t.type === 'chat').length,
    agentTabCount: tabs.filter(t => t.type === 'agent').length,
    // factories
    createChatTab, createAgentTab, createAgentExecutionTab,
    createProjectsTab, createAgentsTab, createUsageTab, createMCPTab,
    createSettingsTab, createClaudeMdTab, createClaudeFileTab,
    createCreateAgentTab, createImportAgentTab, createResourceDetailsTab,
    createTerminalTab, createBrowserTab,
    // lifecycle
    closeTab, closeCurrentTab,
    switchToTab: setActiveTab, switchToNextTab, switchToPreviousTab, switchToTabByIndex,
    // updates
    updateTab, updateTabTitle, updateTabStatus, markTabAsChanged,
    // finders
    findTabBySessionId, findTabByAgentRunId, findTabByType, canAddTab,
    // layout
    layoutMode, setLayoutMode, gridConfig,
    setGridColumns, setGridRows, setGridOrder, setGridSpan,
    activeProjectPath, setActiveProjectPath,
  };
};
