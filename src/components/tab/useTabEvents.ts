import { useEffect } from 'react';
import { defaultClaudeFlags } from './TabPanelContent';
import type { Agent } from '@/lib/clients/types';
import type { Tab } from '@/contexts/TabContext';

interface UseTabEventsParams {
  tabs: Tab[];
  activeTabId: string | null;
  findTabBySessionId: (sessionId: string) => { id: string } | undefined;
  createChatTab: (sessionId: string, title: string, projectPath: string) => string;
  createClaudeFileTab: (fileId: string, fileName: string) => void;
  createAgentExecutionTab: (agent: Agent, tabId: string, projectPath: string) => void;
  createCreateAgentTab: () => void;
  createImportAgentTab: () => void;
  createResourceDetailsTab: () => void;
  createTerminalTab: (sessionId?: string, projectPath?: string, flags?: string[]) => string;
  closeTab: (tabId: string) => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;
  createSettingsTab: () => void;
}

export function useTabEvents({
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
}: UseTabEventsParams) {
  useEffect(() => {
    const handleOpenSessionInTab = (event: CustomEvent) => {
      const { session, mode } = event.detail;

      // Check if tab already exists for this session
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split('/').pop() || 'Session'
        });
        window.dispatchEvent(new CustomEvent('switch-to-tab', { detail: { tabId: existingTab.id } }));
      } else if (mode === 'web') {
        // Web mode (experimental) — uses SDK-based streaming UI
        const projectName = `🔮 ${session.project_path.split('/').pop() || 'Session'}`;
        const newTabId = createChatTab(session.id, projectName, session.project_path);
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path
        });
      } else {
        // Terminal mode (default) — full Claude Code TUI
        const defaultFlags = defaultClaudeFlags();
        createTerminalTab(session.id, session.project_path, defaultFlags);
      }
    };

    const handleOpenClaudeFile = (event: CustomEvent) => {
      const { file } = event.detail;
      const fileId = file.absolute_path || file.id || file.relative_path;
      const fileName = file.relative_path?.split('/').pop() || file.name || 'CLAUDE.md';
      createClaudeFileTab(fileId, fileName);
    };

    const handleOpenAgentExecution = (event: CustomEvent) => {
      const { agent, tabId, projectPath } = event.detail;
      createAgentExecutionTab(agent, tabId, projectPath);
    };

    const handleOpenCreateAgentTab = () => {
      createCreateAgentTab();
    };

    const handleOpenImportAgentTab = () => {
      createImportAgentTab();
    };

    const handleOpenResourceDetails = () => {
      createResourceDetailsTab();
    };

    const handleCloseTab = (event: CustomEvent) => {
      const { tabId } = event.detail;
      closeTab(tabId);
    };

    const handleOpenSettings = () => {
      createSettingsTab();
    };

    const handleClaudeSessionSelected = (event: CustomEvent) => {
      const { session, mode } = event.detail;
      // Check if there's an existing tab for this session
      const existingTab = findTabBySessionId(session.id);
      if (existingTab) {
        // If tab exists, just switch to it
        updateTab(existingTab.id, {
          sessionData: session,
          title: session.project_path.split('/').pop() || 'Session',
        });
        window.dispatchEvent(new CustomEvent('switch-to-tab', { detail: { tabId: existingTab.id } }));
      } else if (mode === 'web') {
        // Web mode (experimental) — SDK-based streaming UI
        const baseName = session.project_path.split('/').pop() || 'Session';
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab && currentTab.type === 'projects') {
          updateTab(currentTab.id, {
            type: 'chat',
            title: `🔮 ${baseName}`,
            sessionId: session.id,
            sessionData: session,
            initialProjectPath: session.project_path,
          });
        } else {
          const newTabId = createChatTab(session.id, `🔮 ${baseName}`, session.project_path);
          updateTab(newTabId, { sessionData: session, initialProjectPath: session.project_path });
        }
      } else {
        // Terminal mode (default) — full Claude Code TUI
        const baseName = session.project_path.split('/').pop() || 'Session';
        const defaultFlags = defaultClaudeFlags();
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab && currentTab.type === 'projects') {
          updateTab(currentTab.id, {
            type: 'claude-terminal',
            title: `🔮 ${baseName}`,
            sessionId: session.id,
            sessionData: session,
            projectPath: session.project_path,
            initialProjectPath: session.project_path,
            terminalFlags: defaultFlags,
          });
        } else {
          createTerminalTab(session.id, session.project_path, defaultFlags);
        }
      }
    };

    const handleOpenTerminal = (event: CustomEvent) => {
      const { sessionId, projectPath } = event.detail || {};
      createTerminalTab(sessionId, projectPath);
    };

    window.addEventListener('open-session-in-tab', handleOpenSessionInTab as EventListener);
    window.addEventListener('open-claude-file', handleOpenClaudeFile as EventListener);
    window.addEventListener('open-agent-execution', handleOpenAgentExecution as EventListener);
    window.addEventListener('open-create-agent-tab', handleOpenCreateAgentTab);
    window.addEventListener('open-import-agent-tab', handleOpenImportAgentTab);
    window.addEventListener('open-resource-details', handleOpenResourceDetails);
    window.addEventListener('open-claude-terminal', handleOpenTerminal as EventListener);
    window.addEventListener('close-tab', handleCloseTab as EventListener);
    window.addEventListener('claude-session-selected', handleClaudeSessionSelected as EventListener);
    window.addEventListener('runecode:open-settings', handleOpenSettings);

    return () => {
      window.removeEventListener('open-session-in-tab', handleOpenSessionInTab as EventListener);
      window.removeEventListener('open-claude-file', handleOpenClaudeFile as EventListener);
      window.removeEventListener('open-agent-execution', handleOpenAgentExecution as EventListener);
      window.removeEventListener('open-create-agent-tab', handleOpenCreateAgentTab);
      window.removeEventListener('open-import-agent-tab', handleOpenImportAgentTab);
      window.removeEventListener('open-resource-details', handleOpenResourceDetails);
      window.removeEventListener('open-claude-terminal', handleOpenTerminal as EventListener);
      window.removeEventListener('close-tab', handleCloseTab as EventListener);
      window.removeEventListener('runecode:open-settings', handleOpenSettings);
      window.removeEventListener('claude-session-selected', handleClaudeSessionSelected as EventListener);
    };
  }, [createChatTab, findTabBySessionId, createClaudeFileTab, createAgentExecutionTab, createCreateAgentTab, createImportAgentTab, createResourceDetailsTab, createTerminalTab, closeTab, updateTab, createSettingsTab]);
}
