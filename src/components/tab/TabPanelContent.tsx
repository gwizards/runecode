import React, { Suspense, lazy } from 'react';
import { useTabState } from '@/hooks/useTabState';
import { useScreenTracking } from '@/hooks/useAnalytics';
import { Tab } from '@/contexts/TabContext';
import { Loader2 } from 'lucide-react';
import { ProjectsTabView } from './ProjectsTabView';

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
const BrowserPanel = lazy(() => import('@/components/BrowserPanel').then(m => ({ default: m.BrowserPanel })));

// Returns true when running on Windows (WebView2 UA always contains "Windows NT").
// Used to suppress tmux-based features that are not available on Windows.
function isWindowsPlatform(): boolean {
  return (
    navigator.userAgent.includes('Windows') ||
    (typeof navigator.platform === 'string' && navigator.platform.startsWith('Win'))
  );
}

// Default flags for a normal Claude launch — teammate mode on Unix, none on Windows.
export function defaultClaudeFlags(): string[] {
  return isWindowsPlatform() ? [] : ['--teammate-mode', 'tmux'];
}

export interface TabPanelProps {
  tab: Tab;
  isActive: boolean;
  /** In grid mode, only the focused tab owns the footer input. Defaults to isActive. */
  ownsFooter?: boolean;
}

export const TabPanel: React.FC<TabPanelProps> = React.memo(({ tab, isActive, ownsFooter }) => {
  const { updateTab, tabs: allTabs, setActiveProjectPath, switchToTab } = useTabState();

  // Track screen when tab becomes active
  useScreenTracking(isActive ? tab.type : undefined, isActive ? tab.id : undefined);

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
          <ProjectsTabView
            tabId={tab.id}
            allTabs={allTabs}
            updateTab={updateTab}
            setActiveProjectPath={setActiveProjectPath}
          />
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
                updateTab(tab.id, { type: 'projects', title: 'Projects' });
              }}
              onProjectPathChange={(path: string) => {
                const dirName = path.split('/').pop() || path.split('\\').pop() || 'Session';
                updateTab(tab.id, { title: dirName, projectPath: path, initialProjectPath: path });
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
            <AgentRunOutputViewer agentRunId={tab.agentRunId} tabId={tab.id} />
          </div>
        );

      case 'agents':
        return <div className="h-full"><Agents /></div>;

      case 'usage':
        return <div className="h-full"><UsageDashboard onBack={() => {}} /></div>;

      case 'mcp':
        return <div className="h-full"><MCPManager onBack={() => {}} /></div>;

      case 'settings':
        return <div className="h-full"><Settings onBack={() => {}} /></div>;

      case 'claude-md':
        return <div className="h-full"><MarkdownEditor onBack={() => {}} /></div>;

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
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
            onBack={() => {
              window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
            }}
          />
        );

      case 'import-agent':
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
                window.dispatchEvent(new CustomEvent('close-tab', { detail: { tabId: tab.id } }));
              }}
            />
          </div>
        );

      case 'claude-terminal':
        return (
          <div className="h-full w-full min-w-0 min-h-0">
            <EmbeddedTerminal
              sessionId={tab.sessionId}
              projectPath={tab.initialProjectPath || tab.projectPath}
              flags={tab.terminalFlags}
              tabId={tab.id}
              environmentId={tab.environmentId}
            />
          </div>
        );

      case 'browser':
        return (
          <div className="h-full w-full min-w-0 min-h-0">
            <BrowserPanel
              tabId={tab.id}
              initialUrl={tab.browserUrl}
              projectName={(tab.initialProjectPath || tab.projectPath)?.split('/').pop()}
              onActivate={() => switchToTab(tab.id)}
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
      <div className="h-full w-full" style={panelStyle}>
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
    && a.sessionData === b.sessionData
    && a.terminalFlags === b.terminalFlags
    && a.claudeFileId === b.claudeFileId;
});
