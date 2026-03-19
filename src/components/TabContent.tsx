import React, { Suspense, lazy, useEffect } from 'react';
import { motion } from 'motion/react';
import { useTabState } from '@/hooks/useTabState';
import { useScreenTracking } from '@/hooks/useAnalytics';
import { Tab } from '@/contexts/TabContext';
import { Loader2, Plus, ArrowLeft, X, Columns, Rows3, Maximize2, Minimize2, GripVertical, TerminalSquare, Globe } from 'lucide-react';
import { api, type Project, type Session, type ClaudeMdFile } from '@/lib/api';
import { ProjectList } from '@/components/ProjectList';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { SessionList } from '@/components/SessionList';
import { Button } from '@/components/ui/button';

// Lazy load heavy components
const ClaudeCodeSession = lazy(() => import('@/components/ClaudeCodeSession').then(m => ({ default: m.ClaudeCodeSession })));
const AgentRunOutputViewer = lazy(() => import('@/components/AgentRunOutputViewer'));
const AgentExecution = lazy(() => import('@/components/AgentExecution').then(m => ({ default: m.AgentExecution })));
const CreateAgent = lazy(() => import('@/components/CreateAgent').then(m => ({ default: m.CreateAgent })));
const Agents = lazy(() => import('@/components/Agents').then(m => ({ default: m.Agents })));
const UsageDashboard = lazy(() => import('@/components/UsageDashboard').then(m => ({ default: m.UsageDashboard })));
const ResourceDetails = lazy(() => import('@/integrations/compute/ResourceDetails').then(m => ({ default: m.ResourceDetails })));
const MCPManager = lazy(() => import('@/components/MCPManager').then(m => ({ default: m.MCPManager })));
const Settings = lazy(() => import('@/components/Settings').then(m => ({ default: m.Settings })));
const MarkdownEditor = lazy(() => import('@/components/MarkdownEditor').then(m => ({ default: m.MarkdownEditor })));
const ClaudeFileEditor = lazy(() => import('@/components/ClaudeFileEditor').then(m => ({ default: m.ClaudeFileEditor })));
const EmbeddedTerminal = lazy(() => import('@/components/EmbeddedTerminal').then(m => ({ default: m.EmbeddedTerminal })));

// Import non-lazy components for projects view

interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
  /** In grid mode, only the focused tab owns the footer input. Defaults to isActive. */
  ownsFooter?: boolean;
}

const TabPanel: React.FC<TabPanelProps> = React.memo(({ tab, isActive, ownsFooter }) => {
  const { updateTab } = useTabState();
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(false);
  
  // Track screen when tab becomes active
  useScreenTracking(isActive ? tab.type : undefined, isActive ? tab.id : undefined);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);
  
  // Load projects when tab becomes active and is of type 'projects'
  // Load projects on first activation only — not on every tab switch
  const hasLoadedProjects = React.useRef(false);
  useEffect(() => {
    if (isActive && tab.type === 'projects' && !hasLoadedProjects.current) {
      hasLoadedProjects.current = true;
      loadProjects();
    }
  }, [isActive, tab.type]);
  
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects. Please ensure ~/.claude directory exists.");
    } finally {
      setLoading(false);
    }
  };
  
  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
      
      // Update tab title and project path so sidebar gets context
      const projectName = project.path.split('/').pop() || 'Project';
      updateTab(tab.id, {
        title: projectName,
        initialProjectPath: project.path
      });
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions for this project.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProject = async () => {
    try {
      const isWebMode = !!window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__;
      let selected: string | null = null;

      if (!isWebMode) {
        // Use native Tauri dialog
        const { open } = await import('@tauri-apps/plugin-dialog');
        const result = await open({
          directory: true,
          multiple: false,
          title: 'Select Project Folder',
          defaultPath: await api.getHomeDirectory(),
        });
        selected = typeof result === 'string' ? result : null;
      } else {
        // Web mode fallback — prompt for path
        selected = window.prompt('Enter project directory path:', '/home');
      }

      if (selected) {
        const project = await api.createProject(selected);
        await loadProjects();
        await handleProjectClick(project);
      }
    } catch (err) {
      console.error('Failed to open folder picker:', err);
      setError('Failed to open folder picker');
    }
  };
  
  const handleNewProjectCreated = async (projectPath: string, projectName: string) => {
    try {
      const project = await api.createProject(projectPath);
      await loadProjects();
      const dirName = projectName || projectPath.split('/').pop() || projectPath.split('\\').pop() || 'New Project';
      // Default: open in terminal mode
      updateTab(tab.id, {
        type: 'claude-terminal',
        title: dirName,
        sessionId: undefined,
        sessionData: undefined,
        projectPath: project.path,
        initialProjectPath: project.path,
        terminalFlags: ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'],
      });
    } catch (err) {
      console.error('Failed to create project:', err);
      const dirName = projectName || projectPath.split('/').pop() || projectPath.split('\\').pop() || 'New Project';
      updateTab(tab.id, {
        type: 'claude-terminal',
        title: dirName,
        sessionId: undefined,
        sessionData: undefined,
        projectPath: projectPath,
        initialProjectPath: projectPath,
        terminalFlags: ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'],
      });
    }
  };

  const handleNewSession = (mode: 'terminal' | 'web' = 'terminal') => {
    if (selectedProject) {
      const projectName = selectedProject.path.split('/').pop() || 'Session';
      if (mode === 'terminal') {
        updateTab(tab.id, {
          type: 'claude-terminal',
          title: projectName,
          sessionId: undefined,
          projectPath: selectedProject.path,
          initialProjectPath: selectedProject.path,
          terminalFlags: ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'],
        });
        return;
      }
      updateTab(tab.id, {
        type: 'chat',
        title: projectName,
        sessionId: undefined,
        sessionData: undefined,
        initialProjectPath: selectedProject.path
      });
    } else {
      updateTab(tab.id, {
        type: 'chat',
        title: 'New Session',
        sessionId: undefined,
        sessionData: undefined,
        initialProjectPath: undefined
      });
    }
  };
  
  // Panel visibility — use offscreen positioning instead of display:none so
  // the scroll container keeps its dimensions and the virtualizer measurements
  // survive tab switches.  This prevents the "jump to middle" scroll reset.
  const panelStyle: React.CSSProperties = isActive
    ? {}
    : { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', visibility: 'hidden', pointerEvents: 'none' };
  
  const renderContent = () => {
    switch (tab.type) {
      case 'projects':
        return (
          <div className="h-full">
              {/* Content based on selection */}
              {selectedProject ? (
                <div className="h-full overflow-y-auto">
                  <div className="max-w-6xl mx-auto p-6">
                    <div className="mb-6">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <motion.div
                            whileTap={{ scale: 0.97 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedProject(null);
                                setSessions([]);
                                // Restore tab title to "Projects"
                                updateTab(tab.id, {
                                  title: 'Projects'
                                });
                              }}
                              className="h-8 w-8 -ml-2"
                              title="Back to Projects"
                            >
                              <ArrowLeft className="h-4 w-4" />
                            </Button>
                          </motion.div>
                          <div>
                            <h1 className="text-3xl font-bold tracking-tight">
                              {selectedProject.path.split('/').pop()}
                            </h1>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {`${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => handleNewSession('terminal')}
                            size="default"
                          >
                            <TerminalSquare className="mr-2 h-4 w-4" />
                            New Terminal Session
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => handleNewSession('web')}
                            size="default"
                            title="Experimental web-based UI"
                          >
                            <Globe className="mr-2 h-4 w-4" />
                            Web Mode
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Error display */}
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive"
                      >
                        {error}
                      </motion.div>
                    )}

                    {/* Loading state */}
                    {loading && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}

                    {/* Session List */}
                    {!loading && (
                      <SessionList
                        sessions={sessions}
                        projectPath={selectedProject.path}
                        onSessionClick={(session) => {
                          // Default: open in terminal mode with --resume
                          updateTab(tab.id, {
                            type: 'claude-terminal',
                            title: session.project_path.split('/').pop() || 'Session',
                            sessionId: session.id,
                            sessionData: session,
                            projectPath: session.project_path,
                            initialProjectPath: session.project_path,
                            terminalFlags: ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'],
                          });
                        }}
                        onEditClaudeFile={(file: ClaudeMdFile) => {
                          // Open CLAUDE.md file in a new tab
                          window.dispatchEvent(new CustomEvent('open-claude-file', { 
                            detail: { file } 
                          }));
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                /* Projects List View */
                <>
                  <ProjectList
                    projects={projects}
                    onProjectClick={handleProjectClick}
                    onOpenProject={handleOpenProject}
                    onNewProject={() => setShowCreateDialog(true)}
                    loading={loading}
                  />
                  <CreateProjectDialog
                    open={showCreateDialog}
                    onClose={() => setShowCreateDialog(false)}
                    onProjectCreated={handleNewProjectCreated}
                  />
                </>
              )}
          </div>
        );
      
      case 'chat':
        return (
          <div className="h-full">
            <ClaudeCodeSession
              session={tab.sessionData}
              initialProjectPath={tab.initialProjectPath || tab.sessionId}
              isActive={isActive}
              ownsFooter={ownsFooter ?? isActive}
              onBack={() => {
                // Go back to projects view in the same tab
                updateTab(tab.id, {
                  type: 'projects',
                  title: 'Projects',
                });
              }}
              onProjectPathChange={(path: string) => {
                // Update tab title and project path so sidebar updates on tab switch
                const dirName = path.split('/').pop() || path.split('\\').pop() || 'Session';
                updateTab(tab.id, {
                  title: dirName,
                  projectPath: path,
                  initialProjectPath: path,
                });
              }}
            />
          </div>
        );
      
      case 'agent':
        if (!tab.agentRunId) {
          return (
            <div className="h-full">
              <div className="p-4">No agent run ID specified</div>
            </div>
          );
        }
        return (
          <div className="h-full">
            <AgentRunOutputViewer
              agentRunId={tab.agentRunId}
              tabId={tab.id}
            />
          </div>
        );
      
      case 'agents':
        return (
          <div className="h-full">
            <Agents />
          </div>
        );
      
      case 'usage':
        return (
          <div className="h-full">
            <UsageDashboard onBack={() => {}} />
          </div>
        );
      
      case 'mcp':
        return (
          <div className="h-full">
            <MCPManager onBack={() => {}} />
          </div>
        );
      
      case 'settings':
        return (
          <div className="h-full">
            <Settings onBack={() => {}} />
          </div>
        );
      
      case 'claude-md':
        return (
          <div className="h-full">
            <MarkdownEditor onBack={() => {}} />
          </div>
        );
      
      case 'claude-file':
        if (!tab.claudeFileId) {
          return <div className="p-4 text-sm text-muted-foreground">No file specified</div>;
        }
        return (
          <ClaudeFileEditor
            file={{
              absolute_path: tab.claudeFileId,
              relative_path: tab.title || tab.claudeFileId.split('/').pop() || 'file.md',
              size: 0,
              modified: Date.now(),
            }}
            onBack={() => {}}
          />
        );
      
      case 'agent-execution':
        if (!tab.agentData) {
          return <div className="p-4">No agent data specified</div>;
        }
        return (
          <AgentExecution
            agent={tab.agentData}
            projectPath={tab.projectPath}
            tabId={tab.id}
            onBack={() => {}}
          />
        );
      
      case 'create-agent':
        return (
          <CreateAgent
            onAgentCreated={() => {
              // Close this tab after agent is created
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
            onBack={() => {
              // Close this tab when back is clicked
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
          />
        );
      
      case 'import-agent':
        // TODO: Implement import agent component
        return (
          <div className="h-full">
            <div className="p-4">Import agent functionality coming soon...</div>
          </div>
        );

      case 'resource-details':
        return (
          <div className="h-full">
            <ResourceDetails
              onBack={() => {
                // Go back to previous tab type or close
                window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
              }}
            />
          </div>
        );

      case 'claude-terminal':
        return (
          <div className="h-full w-full">
            <EmbeddedTerminal
              sessionId={tab.sessionId}
              projectPath={tab.projectPath || tab.initialProjectPath}
              flags={tab.terminalFlags}
            />
          </div>
        );

      default:
        return (
          <div className="h-full">
            <div className="p-4">Unknown tab type: {tab.type}</div>
          </div>
        );
    }
  };

  return (
    <>
      <div
        className="h-full w-full"
        style={panelStyle}
      >
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      </div>

    </>
  );
}, (prevProps, nextProps) => {
  // Only re-render if the tab identity/content or active state actually changed.
  // Ignore lastAccessedAt / updatedAt — those are bookkeeping fields that don't
  // affect rendering.
  if (prevProps.isActive !== nextProps.isActive || prevProps.ownsFooter !== nextProps.ownsFooter) return false;
  const a = prevProps.tab;
  const b = nextProps.tab;
  return a.id === b.id
    && a.type === b.type
    && a.sessionId === b.sessionId
    && a.title === b.title
    && a.initialProjectPath === b.initialProjectPath
    && a.projectPath === b.projectPath
    && a.agentRunId === b.agentRunId
    && a.agentData === b.agentData
    && a.status === b.status
    && a.sessionData === b.sessionData;
});

export const TabContent: React.FC = () => {
  const { tabs, activeTabId, layoutMode, setLayoutMode, gridConfig, setGridColumns, setGridRows, setGridOrder, setGridSpan, createChatTab, createProjectsTab, createSettingsTab, findTabBySessionId, createClaudeFileTab, createAgentExecutionTab, createCreateAgentTab, createImportAgentTab, createResourceDetailsTab, createTerminalTab, closeTab, updateTab, switchToTab } = useTabState();
  
  // Listen for events to open sessions in tabs
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
        const projectName = session.project_path.split('/').pop() || 'Session';
        const newTabId = createChatTab(session.id, projectName, session.project_path);
        updateTab(newTabId, {
          sessionData: session,
          initialProjectPath: session.project_path
        });
      } else {
        // Terminal mode (default) — full Claude Code TUI
        const defaultFlags = ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'];
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
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab && currentTab.type === 'projects') {
          updateTab(currentTab.id, {
            type: 'chat',
            title: session.project_path.split('/').pop() || 'Session',
            sessionId: session.id,
            sessionData: session,
            initialProjectPath: session.project_path,
          });
        } else {
          const projectName = session.project_path.split('/').pop() || 'Session';
          const newTabId = createChatTab(session.id, projectName, session.project_path);
          updateTab(newTabId, { sessionData: session, initialProjectPath: session.project_path });
        }
      } else {
        // Terminal mode (default) — full Claude Code TUI
        const currentTab = tabs.find(t => t.id === activeTabId);
        if (currentTab && currentTab.type === 'projects') {
          updateTab(currentTab.id, {
            type: 'claude-terminal',
            title: session.project_path.split('/').pop() || 'Session',
            sessionId: session.id,
            sessionData: session,
            projectPath: session.project_path,
            initialProjectPath: session.project_path,
            terminalFlags: ['--dangerously-skip-permissions', '--teammate-mode', 'tmux'],
          });
        } else {
          createTerminalTab(session.id, session.project_path, ['--dangerously-skip-permissions', '--teammate-mode', 'tmux']);
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
  }, [createChatTab, findTabBySessionId, createClaudeFileTab, createAgentExecutionTab, createCreateAgentTab, createImportAgentTab, createResourceDetailsTab, createTerminalTab, closeTab, updateTab]);
  
  // Grid mode — only project/session tabs go into the grid.
  // Settings, agents, processes, etc. stay as single-panel windows.
  const gridTypes = React.useMemo(() => new Set(['chat', 'agent-execution', 'claude-terminal']), []);

  const gridTabs = React.useMemo(() =>
    layoutMode === 'grid' ? tabs.filter(t => gridTypes.has(t.type)) : [],
    [tabs, layoutMode, gridTypes]
  );
  const nonGridTabs = React.useMemo(() =>
    layoutMode === 'grid' ? tabs.filter(t => !gridTypes.has(t.type)) : [],
    [tabs, layoutMode, gridTypes]
  );

  // Ordered grid tabs — respects user drag order, syncs new/removed tabs
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

  // Span picker popover state — close on outside click
  const [spanPickerTabId, setSpanPickerTabId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!spanPickerTabId) return;
    const handler = () => setSpanPickerTabId(null);
    // Delay so the current click doesn't immediately close it
    const timer = setTimeout(() => window.addEventListener('click', handler), 0);
    return () => { clearTimeout(timer); window.removeEventListener('click', handler); };
  }, [spanPickerTabId]);

  // Drag state for grid cells
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dragOverId, setDragOverId] = React.useState<string | null>(null);

  const handleGridDragStart = React.useCallback((tabId: string) => setDragId(tabId), []);
  const handleGridDragOver = React.useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    setDragOverId(tabId);
  }, []);
  const handleGridDrop = React.useCallback((targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = orderedGridTabs.map(t => t.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    setGridOrder(ids);
    setDragId(null);
    setDragOverId(null);
  }, [dragId, orderedGridTabs, setGridOrder]);

  // Footer tab drag state
  const [footerDragId, setFooterDragId] = React.useState<string | null>(null);
  const [footerDragOverId, setFooterDragOverId] = React.useState<string | null>(null);
  const handleFooterDrop = React.useCallback((targetId: string) => {
    if (!footerDragId || footerDragId === targetId) { setFooterDragId(null); setFooterDragOverId(null); return; }
    const ids = orderedGridTabs.map(t => t.id);
    const fromIdx = ids.indexOf(footerDragId);
    const toIdx = ids.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, footerDragId);
    setGridOrder(ids);
    setFooterDragId(null);
    setFooterDragOverId(null);
  }, [footerDragId, orderedGridTabs, setGridOrder]);

  // Shift+Tab cycles grid focus, Ctrl+1..9 jumps to specific grid tab
  React.useEffect(() => {
    if (layoutMode !== 'grid' || orderedGridTabs.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Shift+Tab cycles focus forward, Ctrl+Shift+Tab cycles backward
      if (e.key === 'Tab' && e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        const currentIdx = orderedGridTabs.findIndex(t => t.id === activeTabId);
        const delta = e.ctrlKey ? -1 : 1;
        const nextIdx = (currentIdx + delta + orderedGridTabs.length) % orderedGridTabs.length;
        switchToTab(orderedGridTabs[nextIdx].id);
        // Focus the terminal/prompt in the new cell
        setTimeout(() => window.dispatchEvent(new CustomEvent('runecode:focus-prompt')), 50);
        return;
      }
      // Ctrl+1..9 jumps to specific grid tab
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (idx < orderedGridTabs.length) {
          e.preventDefault();
          switchToTab(orderedGridTabs[idx].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [layoutMode, orderedGridTabs, activeTabId, switchToTab]);

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

  if (layoutMode === 'grid' && orderedGridTabs.length === 0) {
    return (
      <div className="flex-1 h-full relative flex flex-col">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">No windows open</p>
            <p className="text-sm mb-4">Open a project to add it to the grid</p>
            <Button onClick={() => createProjectsTab()} size="default">
              <Plus className="w-4 h-4 mr-2" /> New Project
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (layoutMode === 'grid' && orderedGridTabs.length > 0) {
    const activeIsNonGrid = nonGridTabs.some(t => t.id === activeTabId);
    const cols = gridConfig.columns;
    const rows = gridConfig.rows; // 0 = auto

    return (
      <div className="flex-1 h-full relative flex flex-col">
        {/* Grid of tabs — drop target for adding tabs from tab bar */}
        <div
          className="flex-1 min-h-0"
          style={{
            display: activeIsNonGrid ? 'none' : 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: rows > 0 ? `repeat(${rows}, 1fr)` : undefined,
            gridAutoRows: rows > 0 ? undefined : '1fr',
            gap: '1px',
            background: 'hsl(var(--border))',
          }}
        >
          {orderedGridTabs.map((tab, gridIdx) => {
            const isFocused = tab.id === activeTabId;
            const span = gridConfig.spans[tab.id];
            const colSpan = span?.colSpan || 1;
            const rowSpan = span?.rowSpan || 1;
            const isDragTarget = dragOverId === tab.id && dragId !== tab.id;
            const cellNumber = gridIdx + 1;
            return (
              <div
                key={tab.id}
                className="relative bg-background overflow-hidden cursor-pointer transition-[filter,opacity] duration-300"
                style={{
                  gridColumn: colSpan > 1 ? `span ${Math.min(colSpan, cols)}` : undefined,
                  gridRow: rowSpan > 1 ? `span ${rowSpan}` : undefined,
                  outline: isDragTarget ? '2px dashed hsl(var(--primary))' : isFocused ? '2px solid hsl(var(--primary))' : '2px solid transparent',
                  outlineOffset: '-2px',
                  filter: isFocused ? 'none' : 'grayscale(0.75) brightness(0.6)',
                  contain: 'layout style',
                  opacity: dragId === tab.id ? 0.5 : 1,
                }}
                onClick={() => switchToTab(tab.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setLayoutMode('single');
                  switchToTab(tab.id);
                }}
              >
                {/* Grid cell header — drag handle */}
                <div
                  className={`flex items-center justify-between px-2 py-1 border-b border-border text-xs transition-colors cursor-grab active:cursor-grabbing ${
                    isFocused ? 'bg-primary/10 text-foreground' : 'bg-muted/20 text-muted-foreground'
                  }`}
                  draggable
                  onDragStart={() => handleGridDragStart(tab.id)}
                  onDragOver={(e) => handleGridDragOver(e, tab.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  onDrop={() => handleGridDrop(tab.id)}
                >
                  <div className="flex items-center gap-1 min-w-0">
                    <GripVertical className="w-3 h-3 text-muted-foreground/30 flex-shrink-0" />
                    <kbd className={`text-[9px] px-1 py-0.5 rounded font-mono leading-none flex-shrink-0 ${
                      isFocused ? 'bg-primary/20 text-primary' : 'bg-muted/40 text-muted-foreground/50'
                    }`}>{cellNumber}</kbd>
                    {tab.status === 'running' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                    )}
                    <span className="font-medium truncate">{tab.title}</span>
                    {(colSpan > 1 || rowSpan > 1) && (
                      <span className="text-[9px] text-primary/60 font-mono flex-shrink-0">{colSpan}×{rowSpan}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    {/* Size picker */}
                    <div className="relative">
                      <button
                        className="text-muted-foreground/50 hover:text-foreground p-0.5"
                        title={`Size: ${colSpan}×${rowSpan} — click to change`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSpanPickerTabId(prev => prev === tab.id ? null : tab.id);
                        }}
                      >
                        {colSpan > 1 || rowSpan > 1
                          ? <Minimize2 className="w-3 h-3" />
                          : <Maximize2 className="w-3 h-3" />
                        }
                      </button>
                      {/* Size picker popover */}
                      {spanPickerTabId === tab.id && (
                        <div
                          className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-xl p-2 min-w-[140px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-1.5 px-1">Cell size</div>
                          {/* Column span */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-muted-foreground px-1">Columns</span>
                            <div className="flex gap-0.5">
                              {Array.from({ length: cols }, (_, i) => i + 1).map(n => (
                                <button
                                  key={n}
                                  onClick={() => setGridSpan(tab.id, { colSpan: n })}
                                  className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                                    colSpan === n ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground'
                                  }`}
                                >{n}</button>
                              ))}
                            </div>
                          </div>
                          {/* Row span */}
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] text-muted-foreground px-1">Rows</span>
                            <div className="flex gap-0.5">
                              {[1, 2, 3].map(n => (
                                <button
                                  key={n}
                                  onClick={() => setGridSpan(tab.id, { rowSpan: n })}
                                  className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                                    rowSpan === n ? 'bg-primary/20 text-primary' : 'text-muted-foreground/50 hover:bg-muted/60 hover:text-foreground'
                                  }`}
                                >{n}</button>
                              ))}
                            </div>
                          </div>
                          {/* Reset */}
                          {(colSpan > 1 || rowSpan > 1) && (
                            <button
                              onClick={() => { setGridSpan(tab.id, { colSpan: 1, rowSpan: 1 }); setSpanPickerTabId(null); }}
                              className="w-full text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded py-1 transition-colors"
                            >
                              Reset to 1×1
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className="text-muted-foreground hover:text-foreground p-0.5 relative z-20"
                      onClick={(e) => { e.stopPropagation(); setLayoutMode('single'); switchToTab(tab.id); }}
                      title="Pop out to single view"
                    >
                      <Minimize2 className="w-3 h-3" />
                    </button>
                    <button
                      className="text-muted-foreground hover:text-foreground p-0.5 relative z-20"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Grid cell content */}
                <div className="h-[calc(100%-28px)] overflow-hidden">
                  <TabPanel tab={tab} isActive={!activeIsNonGrid} ownsFooter={isFocused} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid footer — draggable project tabs + column control + shortcuts */}
        {!activeIsNonGrid && orderedGridTabs.length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 bg-muted/20 border-t border-border shrink-0">
            {/* Draggable tab list */}
            <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
              {orderedGridTabs.map((tab, idx) => {
                const isFocused = tab.id === activeTabId;
                const isFooterDragTarget = footerDragOverId === tab.id && footerDragId !== tab.id;
                return (
                  <button
                    key={tab.id}
                    draggable
                    onDragStart={() => setFooterDragId(tab.id)}
                    onDragOver={(e) => { e.preventDefault(); setFooterDragOverId(tab.id); }}
                    onDragEnd={() => { setFooterDragId(null); setFooterDragOverId(null); }}
                    onDrop={() => handleFooterDrop(tab.id)}
                    onClick={() => switchToTab(tab.id)}
                    className={`px-2 py-1 rounded text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                      isFocused
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                    } ${isFooterDragTarget ? 'ring-1 ring-primary' : ''}`}
                    style={{ opacity: footerDragId === tab.id ? 0.4 : 1 }}
                  >
                    <GripVertical className="w-2.5 h-2.5 text-muted-foreground/30 cursor-grab flex-shrink-0" />
                    {tab.status === 'running' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse flex-shrink-0" />
                    )}
                    <span className="truncate max-w-[80px]">{tab.title}</span>
                    <kbd className={`text-[9px] px-1 py-0.5 rounded font-mono leading-none ${
                      isFocused ? 'bg-primary/20 text-primary' : 'bg-muted/60 text-muted-foreground'
                    }`}>{idx + 1}</kbd>
                  </button>
                );
              })}
            </div>

            {/* Shortcut hints — right of project names */}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 flex-shrink-0 px-2 border-l border-border/50">
              <kbd className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[9px] leading-none">Shift+Tab</kbd>
              <span className="text-muted-foreground/30">cycle</span>
              <kbd className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[9px] leading-none">Ctrl+1-9</kbd>
              <span className="text-muted-foreground/30">jump</span>
            </div>

            {/* Grid controls */}
            <div className="flex items-center gap-1.5 flex-shrink-0 pl-2 border-l border-border">
              {/* Column count */}
              <div className="flex items-center gap-0.5">
                <Columns className="w-3 h-3 text-muted-foreground/40" />
                {[1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setGridColumns(n)}
                    className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                      cols === n
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40'
                    }`}
                  >{n}</button>
                ))}
              </div>
              {/* Row count */}
              <div className="flex items-center gap-0.5">
                <Rows3 className="w-3 h-3 text-muted-foreground/40" />
                {[0, 1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    onClick={() => setGridRows(n)}
                    className={`w-5 h-5 rounded text-[10px] font-medium transition-colors ${
                      rows === n
                        ? 'bg-primary/15 text-primary'
                        : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/40'
                    }`}
                    title={n === 0 ? 'Auto rows' : `${n} rows`}
                  >{n === 0 ? 'A' : n}</button>
                ))}
              </div>
            </div>
          </div>
        )}


        {/* Non-grid tabs (settings, agents, etc.) — shown as single panels */}
        {nonGridTabs.map((tab) => (
          <TabPanel
            key={tab.id}
            tab={tab}
            isActive={activeIsNonGrid && tab.id === activeTabId}
          />
        ))}

        {tabs.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <p className="text-lg mb-2">No projects open</p>
              <Button onClick={() => createProjectsTab()} size="default">
                <Plus className="w-4 h-4 mr-2" /> New Project
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Single mode (default)
  return (
    <div className="flex-1 h-full relative">
      {tabs.map((tab) => (
        <TabPanel
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
        />
      ))}

      {tabs.length === 0 && (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <p className="text-lg mb-2">No projects open</p>
            <p className="text-sm mb-4">Click to start a new project</p>
            <Button onClick={() => createProjectsTab()} size="default">
              <Plus className="w-4 h-4 mr-2" /> New Project
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabContent;
