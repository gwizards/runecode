import React from 'react';
import { applyStartupToken } from '@/lib/startupToken';
import { ArrowLeft, Loader2, TerminalSquare, Globe, Server, Container, Monitor } from 'lucide-react';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';
import type { Project, Session, ClaudeMdFile } from '@/lib/api';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { SessionList } from '@/components/SessionList';
import { Button } from '@/components/ui/button';
import { getSystemInfo } from '@/infrastructure/tauri/system-client';
import { isWslMode } from '@/lib/platformMode';

interface ProjectSessionViewProps {
  project: Project;
  sessions: Session[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onLaunch: (session: Session | null, mode: 'terminal' | 'web', flags: string[], gridTarget: string, environmentId?: string) => void;
  onEditClaudeFile: (file: ClaudeMdFile) => void;
  existingProjectPaths: string[];
  /** Environment ID from the environment picker — read-only display */
  selectedEnvId?: string | null;
}

export function ProjectSessionView({
  project,
  sessions,
  loading,
  error,
  onBack,
  onLaunch,
  onEditClaudeFile,
  existingProjectPaths,
  selectedEnvId,
}: ProjectSessionViewProps) {
  const { permissionMode } = useSessionConfig();
  const [launchMode, setLaunchMode] = React.useState<'terminal' | 'web'>('terminal');
  // Default skipPermissions from persisted permissionMode set during onboarding
  const [skipPermissions, setSkipPermissions] = React.useState(() => permissionMode === 'bypassPermissions');
  // Default teammateMode to false until we confirm tmux is available
  const [teammateMode, setTeammateMode] = React.useState(false);
  const [worktree, setWorktree] = React.useState(false);
  const [customModel, setCustomModel] = React.useState('');
  // null = checking, true = available, false = unavailable, 'windows' = platform N/A
  const [tmuxAvailability, setTmuxAvailability] = React.useState<boolean | 'windows' | null>(null);
  // Default to joining the first existing grid (if any), not creating a new one
  const [gridTarget, setGridTarget] = React.useState<string>('own');
  const gridTargetInitialized = React.useRef(false);

  React.useEffect(() => {
    if (!gridTargetInitialized.current && existingProjectPaths.length > 0) {
      gridTargetInitialized.current = true;
      // Default to the first existing grid that isn't this project
      const other = existingProjectPaths.find(p => p !== project.path);
      if (other) setGridTarget(other);
    }
  }, [existingProjectPaths, project.path]);

  // Environment is set by the environment picker step — passed as selectedEnvId prop
  const [environments] = React.useState<RemoteEnvironment[]>(() => {
    try {
      const stored = localStorage.getItem('runecode-remote-environments');
      return stored ? JSON.parse(stored).filter((e: RemoteEnvironment) => e.enabled) : [];
    } catch { return []; }
  });

  // Use Tauri IPC to check platform/tmux — works in both desktop and web mode.
  // In WSL mode on Windows, Claude runs inside Linux where tmux is available.
  React.useEffect(() => {
    // WSL mode: tmux is available inside the Linux distro
    if (isWslMode()) {
      setTmuxAvailability(true);
      setTeammateMode(true);
      return;
    }

    const isTauri = !!(
      window.__TAURI__ ||
      window.__TAURI_INTERNALS__ ||
      window.__TAURI_METADATA__
    );
    if (isTauri) {
      getSystemInfo().then(info => {
        if (info.platform === 'windows') {
          setTmuxAvailability('windows');
        } else {
          setTmuxAvailability(info.tmux_available);
          if (info.tmux_available) setTeammateMode(true);
        }
      }).catch(() => setTmuxAvailability(false));
    } else {
      // Web mode: fall back to the HTTP endpoint
      fetch('/api/check/tmux', { headers: applyStartupToken({}) }).then(r => r.json()).then(d => {
        setTmuxAvailability(d.installed);
        if (d.installed) setTeammateMode(true);
      }).catch(() => setTmuxAvailability(false));
    }
  }, []);

  const buildFlags = (): string[] => {
    const flags: string[] = [];
    if (skipPermissions) flags.push('--dangerously-skip-permissions');
    if (teammateMode) flags.push('--teammate-mode', 'tmux');
    if (worktree) flags.push('--worktree');
    if (customModel) flags.push('--model', customModel);
    return flags;
  };

  const projectName = project.path.split('/').pop() || 'Project';

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 -ml-2">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{projectName}</h1>
              <p className="text-xs text-muted-foreground font-mono mt-0.5">{project.path}</p>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Launch Configuration */}
        <div className="rounded-lg border border-border/30 bg-muted/5 p-4 space-y-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            Launch Configuration
          </h3>

          {/* Environment (read-only — hidden when environments feature is disabled) */}
          {selectedEnvId && (() => {
            const env = environments.find(e => e.id === selectedEnvId);
            if (!env) return null;
            const EnvIcon = env.type === 'ssh' ? Server : env.type === 'docker' ? Container : Monitor;
            const colors = env.type === 'ssh' ? 'bg-blue-500/5 border-blue-500/15 text-blue-400/70' : env.type === 'docker' ? 'bg-cyan-500/5 border-cyan-500/15 text-cyan-400/70' : 'bg-purple-500/5 border-purple-500/15 text-purple-400/70';
            return (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-md border text-xs ${colors}`}>
                <EnvIcon className="h-3.5 w-3.5" />
                <span className="font-medium">{env.name}</span>
                <span className="text-[9px] opacity-50 uppercase">{env.type}</span>
                {env.type === 'ssh' && env.sshHost && <span className="font-mono text-[9px] opacity-50">{env.sshHost}</span>}
              </div>
            );
          })()}

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              onClick={() => setLaunchMode('terminal')}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                launchMode === 'terminal'
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-muted/30'
              }`}
            >
              <TerminalSquare className="h-4 w-4" />
              <div className="text-left">
                <div>Terminal Mode</div>
                <div className="text-[10px] opacity-60 font-normal">Full Claude Code TUI</div>
              </div>
            </button>
            <button
              onClick={() => setLaunchMode('web')}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all ${
                launchMode === 'web'
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-400'
                  : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-muted/30'
              }`}
            >
              <Globe className="h-4 w-4" />
              <div className="text-left">
                <div>Web Mode</div>
                <div className="text-[10px] opacity-60 font-normal">Experimental rich UI</div>
              </div>
            </button>
          </div>

          {/* Terminal options — only when terminal mode selected */}
          {launchMode === 'terminal' && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={skipPermissions} onChange={(e) => setSkipPermissions(e.target.checked)} className="rounded border-border" />
                <div>
                  <span className="font-medium">Bypass Permissions</span>
                  <p className="text-[10px] text-muted-foreground/50">Auto-approve all tools</p>
                </div>
              </label>
              {/* Team Mode — hidden on Windows (tmux not available) */}
              {tmuxAvailability !== 'windows' && (
                <div className="flex items-center gap-2 text-xs select-none">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={teammateMode}
                      onChange={(e) => setTeammateMode(e.target.checked)}
                      disabled={tmuxAvailability === false}
                      className="rounded border-border"
                    />
                    <div>
                      <span className={`font-medium ${tmuxAvailability === false ? 'text-muted-foreground/40' : ''}`}>
                        Team Mode (tmux)
                      </span>
                      {tmuxAvailability === false ? (
                        <p className="text-[10px] text-red-400/80">
                          tmux not installed —{' '}
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              window.dispatchEvent(new CustomEvent('open-claude-terminal', {
                                detail: { flags: ['--shell'] }
                              }));
                            }}
                            className="underline hover:text-red-300 transition-colors"
                          >
                            open terminal to install
                          </button>
                        </p>
                      ) : tmuxAvailability === null ? (
                        <p className="text-[10px] text-muted-foreground/30">checking…</p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/50">Teammate interface via tmux</p>
                      )}
                    </div>
                  </label>
                </div>
              )}
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={worktree} onChange={(e) => setWorktree(e.target.checked)} className="rounded border-border" />
                <div>
                  <span className="font-medium">Git Worktree</span>
                  <p className="text-[10px] text-muted-foreground/50">Isolated git worktree</p>
                </div>
              </label>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex-1">
                  <span className="font-medium">Model Override</span>
                  <select
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    className="mt-1 w-full px-2 py-1 rounded border border-border/30 bg-background text-xs"
                    aria-label="Select model override"
                  >
                    <option value="">Default</option>
                    <option value="sonnet">Sonnet</option>
                    <option value="opus">Opus</option>
                    <option value="haiku">Haiku</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Grid destination — choose which grid to add this project to */}
          {existingProjectPaths.length > 0 && (
            <div className="pt-1 space-y-2">
              <h4 className="text-xs font-medium text-muted-foreground">Grid Destination</h4>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setGridTarget('own')}
                  className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                    gridTarget === 'own'
                      ? 'border-primary/40 bg-primary/10 text-primary'
                      : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-muted/30'
                  }`}
                >
                  Own Grid
                </button>
                {existingProjectPaths
                  .filter(pp => pp !== project.path)
                  .map(pp => (
                    <button
                      key={pp}
                      onClick={() => setGridTarget(pp)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                        gridTarget === pp
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                          : 'border-border/30 text-muted-foreground hover:border-border/50 hover:bg-muted/30'
                      }`}
                    >
                      + {pp.split('/').pop()}
                    </button>
                  ))
                }
              </div>
              <p className="text-[10px] text-muted-foreground/40">
                {gridTarget === 'own'
                  ? 'Opens in its own grid — switch between projects in the tab bar'
                  : `Adds to ${gridTarget.split('/').pop()}'s grid as a multi-project workspace`
                }
              </p>
            </div>
          )}

          {/* Launch new session button */}
          <Button
            onClick={() => onLaunch(null, launchMode, buildFlags(), gridTarget, selectedEnvId || undefined)}
            size="default"
            className="w-full"
          >
            {launchMode === 'terminal' ? <TerminalSquare className="mr-2 h-4 w-4" /> : <Globe className="mr-2 h-4 w-4" />}
            New {launchMode === 'terminal' ? 'Terminal' : 'Web'} Session
          </Button>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Sessions */}
        {!loading && sessions.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
              Resume a session
            </h3>
            <SessionList
              sessions={sessions}
              projectPath={project.path}
              onSessionClick={(session) => onLaunch(session, launchMode, buildFlags(), gridTarget, selectedEnvId || undefined)}
              onEditClaudeFile={onEditClaudeFile}
            />
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground/50">
            No previous sessions. Click above to start a new one.
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export for convenience
export type { RemoteEnvironment };
