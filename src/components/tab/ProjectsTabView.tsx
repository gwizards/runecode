/**
 * ProjectsTabView — the three-step wizard rendered inside the 'projects' tab type.
 *
 * Steps:
 *   1. pick-env   — choose local or remote environment
 *   2. check-claude — verify Claude Code is installed on the remote
 *   3. projects   — browse projects / sessions
 */
import React, { lazy } from 'react';
import { ArrowLeft, Loader2, TerminalSquare, Monitor, Server, Container, RefreshCw } from 'lucide-react';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';
import { api, type Project, type Session, type ClaudeMdFile } from '@/lib/api';
import { getTabProjectPath, type Tab } from '@/contexts/TabContext';
import { ProjectList } from '@/components/ProjectList';
import { CreateProjectDialog } from '@/components/CreateProjectDialog';
import { Button } from '@/components/ui/button';
import { RemoteProjectEntry } from './RemoteProjectEntry';
import { ProjectSessionView } from './ProjectSessionView';
import { defaultClaudeFlags } from './TabPanelContent';

// Lazy-loaded only when the fix terminal panel is shown
const EmbeddedTerminal = lazy(() => import('@/components/EmbeddedTerminal').then(m => ({ default: m.EmbeddedTerminal })));

// Module-level dedup set: prevents re-running ruflo init for the same project path
// within a single app session.
const _rufloInitStarted = new Set<string>();

// Stable reference for EmbeddedTerminal flags
const SHELL_FLAGS = ['--shell'];

interface ProjectsTabViewProps {
  tabId: string;
  allTabs: Tab[];
  updateTab: (id: string, updates: Partial<Tab>) => void;
  setActiveProjectPath: (path: string) => void;
}

export function ProjectsTabView({ tabId, allTabs, updateTab, setActiveProjectPath }: ProjectsTabViewProps) {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = React.useState<Project | null>(null);
  const [sessions, setSessions] = React.useState<Session[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = React.useState(false);

  // Environment selection step
  const [envStep, setEnvStep] = React.useState<'pick-env' | 'check-claude' | 'projects'>('projects');
  const [pickedEnvId, setPickedEnvId] = React.useState<string | null>(null);
  const [envs, setEnvs] = React.useState<RemoteEnvironment[]>([]);
  const [claudeCheck, setClaudeCheck] = React.useState<{ checking: boolean; found: boolean; error?: string }>({ checking: false, found: false });
  const [showFixTerminal, setShowFixTerminal] = React.useState(false);

  // Load environments from localStorage
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem('runecode-remote-environments');
      if (stored) setEnvs(JSON.parse(stored).filter((e: RemoteEnvironment) => e.enabled));
    } catch {}
  }, []);

  const hasLoadedProjects = React.useRef(false);

  const loadProjects = React.useCallback(async () => {
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
  }, []);

  React.useEffect(() => {
    if (envStep === 'projects' && !hasLoadedProjects.current) {
      hasLoadedProjects.current = true;
      loadProjects();
    }
  }, [envStep, loadProjects]);

  const handlePickEnvironment = async (envId: string | null) => {
    setPickedEnvId(envId);
    if (!envId) {
      setEnvStep('projects');
      hasLoadedProjects.current = false;
      loadProjects();
      return;
    }
    setEnvStep('check-claude');
    setClaudeCheck({ checking: true, found: false });
    try {
      const env = envs.find(e => e.id === envId);
      if (!env) { setClaudeCheck({ checking: false, found: false, error: 'Environment not found' }); return; }
      const res = await fetch('/api/environments/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env),
      });
      const data = await res.json();
      if (data.success) {
        setClaudeCheck({ checking: false, found: true });
        setEnvStep('projects');
        hasLoadedProjects.current = false;
        loadProjects();
      } else {
        const detail = data.error || '';
        setClaudeCheck({ checking: false, found: false, error: `Connection failed${detail ? ': ' + detail : ''}. Check host, credentials, and that the environment is reachable.` });
      }
    } catch (err: any) {
      setClaudeCheck({ checking: false, found: false, error: `Connection error: ${err.message}. The host may be unreachable or the request timed out.` });
    }
  };

  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
      const projectName = project.path.split('/').pop() || 'Project';
      updateTab(tabId, { title: projectName, initialProjectPath: project.path });
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
        const { open } = await import('@tauri-apps/plugin-dialog');
        const result = await open({
          directory: true, multiple: false,
          title: 'Select Project Folder',
          defaultPath: await api.getHomeDirectory(),
        });
        selected = typeof result === 'string' ? result : null;
      } else {
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
      updateTab(tabId, {
        type: 'claude-terminal', title: dirName,
        sessionId: undefined, sessionData: undefined,
        projectPath: project.path, initialProjectPath: project.path,
        terminalFlags: defaultClaudeFlags(),
      });
    } catch (err) {
      console.error('Failed to create project:', err);
      const dirName = projectName || projectPath.split('/').pop() || projectPath.split('\\').pop() || 'New Project';
      updateTab(tabId, {
        type: 'claude-terminal', title: dirName,
        sessionId: undefined, sessionData: undefined,
        projectPath, initialProjectPath: projectPath,
        terminalFlags: defaultClaudeFlags(),
      });
    }
  };

  const handleLaunch = (session: Session | null, mode: 'terminal' | 'web', flags: string[], gridTarget: string, _environmentId?: string) => {
    if (!selectedProject) return;
    const baseName = selectedProject.path.split('/').pop() || 'Session';
    const effectiveProjectPath = gridTarget !== 'own' ? gridTarget : selectedProject.path;
    const environmentId = pickedEnvId || _environmentId;

    if (mode === 'terminal') {
      const isShell = flags.includes('--shell');
      updateTab(tabId, {
        type: 'claude-terminal',
        title: isShell ? `⬛ ${baseName}` : `🔮 ${baseName}`,
        sessionId: session?.id, sessionData: session,
        projectPath: effectiveProjectPath,
        initialProjectPath: selectedProject.path,
        terminalFlags: flags, environmentId,
      });
      if (!isShell && !_rufloInitStarted.has(effectiveProjectPath)) {
        _rufloInitStarted.add(effectiveProjectPath);
        void (async () => {
          try {
            const rufloStatus = await api.checkRufloInstalled();
            if (!rufloStatus.installed) return;
            if (localStorage.getItem('runecode-ruflo-auto-init') === 'false') return;
            await api.initRufloProject(effectiveProjectPath);
            if (!rufloStatus.mcp_active) {
              try {
                await api.activateRufloMcp();
              } catch (mcpErr) {
                console.warn('[RuFlo] MCP activation failed:', mcpErr);
                window.dispatchEvent(new CustomEvent('runecode:ruflo-mcp-error', { detail: { error: String(mcpErr) } }));
              }
            }
          } catch (err) {
            console.warn('[RuFlo] Background init skipped:', err);
            _rufloInitStarted.delete(effectiveProjectPath);
          }
        })();
      }
    } else {
      updateTab(tabId, {
        type: 'chat',
        title: `🔮 ${baseName}`,
        sessionId: session?.id, sessionData: session,
        projectPath: effectiveProjectPath,
        initialProjectPath: selectedProject.path,
        environmentId,
      });
    }
    setActiveProjectPath(effectiveProjectPath);
  };

  const existingProjectPaths = React.useMemo(() => {
    const gTypes = new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']);
    const paths = new Set<string>();
    for (const t of allTabs) {
      if (gTypes.has(t.type)) {
        const pp = getTabProjectPath(t);
        if (pp) paths.add(pp);
      }
    }
    return Array.from(paths);
  }, [allTabs]);

  return (
    <div className="h-full">
      {/* Step 1: Environment selection */}
      {envStep === 'pick-env' && (
        <div className="h-full overflow-y-auto">
          <div className="max-w-2xl mx-auto p-6 space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Choose Environment</h1>
              <p className="text-sm text-muted-foreground mt-1">Where do you want to run Claude Code?</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => handlePickEnvironment(null)}
                className="w-full flex items-center gap-3 p-4 rounded-lg border border-border/30 bg-muted/5 hover:bg-muted/15 hover:border-primary/30 transition-all text-left"
              >
                <Monitor className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium">Local Machine</div>
                  <p className="text-[11px] text-muted-foreground/60">Run Claude Code on this computer</p>
                </div>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">Ready</span>
              </button>
              {envs.map(env => {
                const EnvIcon = env.type === 'ssh' ? Server : env.type === 'docker' ? Container : Monitor;
                const colors = env.type === 'ssh' ? 'text-blue-400' : env.type === 'docker' ? 'text-cyan-400' : 'text-purple-400';
                return (
                  <button key={env.id} onClick={() => handlePickEnvironment(env.id)}
                    className="w-full flex items-center gap-3 p-4 rounded-lg border border-border/30 bg-muted/5 hover:bg-muted/15 hover:border-primary/30 transition-all text-left"
                  >
                    <EnvIcon className={`w-6 h-6 ${colors} flex-shrink-0`} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{env.name}</div>
                      <p className="text-[11px] text-muted-foreground/60 font-mono">
                        {env.type === 'ssh' && env.sshHost}
                        {env.type === 'docker' && env.dockerContainer}
                        {env.type === 'wsl' && (env.wslDistro || 'default')}
                      </p>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/50 uppercase">{env.type}</span>
                  </button>
                );
              })}
              {envs.length === 0 && (
                <p className="text-center text-xs text-muted-foreground/40 py-4">
                  No remote environments configured.{' '}
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'environments' } }))}
                    className="text-primary/60 hover:text-primary underline"
                  >
                    Add one in Settings
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Claude Code detection on remote environment */}
      {envStep === 'check-claude' && (
        <div className="h-full flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 flex-shrink-0">
            <Button variant="ghost" size="icon" onClick={() => { setEnvStep('pick-env'); setShowFixTerminal(false); }} className="h-8 w-8 -ml-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-bold tracking-tight">
                {claudeCheck.checking ? 'Connecting...' : claudeCheck.found ? 'Connected!' : 'Setup Required'}
              </h1>
              <p className="text-xs text-muted-foreground">
                {envs.find(e => e.id === pickedEnvId)?.name || 'Remote environment'}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => handlePickEnvironment(pickedEnvId)} disabled={claudeCheck.checking} className="text-xs h-7">
                <RefreshCw className={`h-3 w-3 mr-1 ${claudeCheck.checking ? 'animate-spin' : ''}`} /> Retry
              </Button>
              <Button variant="ghost" size="sm" onClick={() => {
                setEnvStep('projects');
                hasLoadedProjects.current = false;
                loadProjects();
              }} className="text-xs h-7 text-muted-foreground">
                Skip
              </Button>
            </div>
          </div>
          {claudeCheck.checking && (
            <div className="flex-1 flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Checking connection and Claude Code availability...</span>
            </div>
          )}
          {!claudeCheck.checking && claudeCheck.found && (
            <div className="flex-1 flex items-center justify-center gap-3 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400" /> Connected! Loading projects...
            </div>
          )}
          {!claudeCheck.checking && !claudeCheck.found && claudeCheck.error && (
            <div className="flex-1 flex min-h-0">
              <div className="w-80 flex-shrink-0 border-r border-border/30 overflow-y-auto p-4 space-y-4">
                <div className="p-3 rounded-lg border border-red-500/20 bg-red-500/5 text-xs text-red-400">
                  {claudeCheck.error}
                </div>
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Install Claude Code</h3>
                  <div className="space-y-2 text-[11px] text-muted-foreground/70">
                    {[['1. Install', 'npm install -g @anthropic-ai/claude-code'], ['2. Login', 'claude auth login'], ['3. Verify', 'claude --version']].map(([label, cmd]) => (
                      <div key={label}>
                        <p className="font-medium text-muted-foreground/90 mb-1">{label}</p>
                        <code className="block bg-muted px-2.5 py-1.5 rounded font-mono text-[10px] select-all cursor-pointer">{cmd}</code>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground/40">
                  Run these commands in the terminal on the right. Once installed, click Retry above.
                </p>
                {!showFixTerminal && (
                  <Button variant="outline" size="sm" onClick={() => setShowFixTerminal(true)} className="w-full text-xs">
                    <TerminalSquare className="h-3 w-3 mr-1" /> Open Terminal
                  </Button>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {showFixTerminal ? (
                  <EmbeddedTerminal flags={SHELL_FLAGS} environmentId={pickedEnvId || undefined} tabId={`fix-${tabId}`} />
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground/30">
                    <div className="text-center space-y-2">
                      <TerminalSquare className="w-8 h-8 mx-auto opacity-30" />
                      <p className="text-xs">Click "Open Terminal" to connect</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Project selection */}
      {envStep === 'projects' && selectedProject ? (
        <ProjectSessionView
          project={selectedProject}
          sessions={sessions}
          loading={loading}
          error={error}
          selectedEnvId={pickedEnvId}
          onBack={() => {
            setSelectedProject(null);
            setSessions([]);
            updateTab(tabId, { title: 'Projects' });
          }}
          existingProjectPaths={existingProjectPaths}
          onLaunch={handleLaunch}
          onEditClaudeFile={(file: ClaudeMdFile) => {
            window.dispatchEvent(new CustomEvent('open-claude-file', { detail: { file } }));
          }}
        />
      ) : envStep === 'projects' ? (
        <>
          {pickedEnvId && (
            <RemoteProjectEntry
              envName={envs.find(e => e.id === pickedEnvId)?.name || 'Remote'}
              onSelectPath={(remotePath) => {
                const project: Project = {
                  id: remotePath.replace(/\//g, '-'),
                  path: remotePath,
                  sessions: [],
                  created_at: Date.now(),
                };
                handleProjectClick(project);
              }}
            />
          )}
          {!pickedEnvId && (
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
        </>
      ) : null}
    </div>
  );
}
