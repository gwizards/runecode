import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Server, Plus, Trash2, ChevronDown, ChevronRight,
  Terminal, Globe, Monitor, Loader2, CheckCircle2, AlertCircle,
  Key, FolderOpen, RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// Persisted to localStorage
const STORAGE_KEY = 'runecode-remote-environments';

export interface RemoteEnvironment {
  id: string;
  name: string;
  type: 'ssh' | 'wsl' | 'docker';
  // SSH
  sshHost?: string;
  sshPort?: number;
  sshIdentityFile?: string;
  startDirectory?: string;
  // WSL
  wslDistro?: string;
  // Docker
  dockerContainer?: string;
  dockerImage?: string;
  // State
  enabled: boolean;
}

function loadEnvironments(): RemoteEnvironment[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveEnvironments(envs: RemoteEnvironment[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envs));
}

export function EnvironmentsSettings() {
  const [environments, setEnvironments] = useState<RemoteEnvironment[]>(loadEnvironments);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedEnv, setExpandedEnv] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<{ email: string; displayName?: string } | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // Load current account info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          const active = data.accounts?.find((a: any) => a.id === data.activeId);
          if (active) setActiveAccount({ email: active.email, displayName: active.displayName });
        }
      } catch {}
      setAccountLoading(false);
    })();
  }, []);

  const updateEnvironments = (envs: RemoteEnvironment[]) => {
    setEnvironments(envs);
    saveEnvironments(envs);
    // Broadcast for other components to pick up
    window.dispatchEvent(new CustomEvent('runecode:environments-changed', { detail: envs }));
  };

  const handleAdd = (env: RemoteEnvironment) => {
    updateEnvironments([...environments, env]);
    setShowAdd(false);
  };

  const handleRemove = (id: string) => {
    if (!confirm('Remove this environment?')) return;
    updateEnvironments(environments.filter(e => e.id !== id));
  };

  const handleToggle = (id: string) => {
    updateEnvironments(environments.map(e =>
      e.id === id ? { ...e, enabled: !e.enabled } : e
    ));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Server className="w-5 h-5 text-blue-400" />
          Environments
        </h2>
        <p className="text-sm text-muted-foreground">
          Your Claude account and remote environments where Claude Code can run.
        </p>
      </div>

      {/* Current Account — read-only */}
      <div className="p-4 rounded-lg border border-border/30 bg-muted/5">
        <div className="flex items-start gap-3">
          <User className="w-4.5 h-4.5 text-emerald-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium">Claude Account</h3>
            {accountLoading ? (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground/50">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading...
              </div>
            ) : activeAccount ? (
              <div className="mt-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{activeAccount.displayName || activeAccount.email.split('@')[0]}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono">active</span>
                </div>
                <span className="text-[11px] text-muted-foreground/50">{activeAccount.email}</span>
              </div>
            ) : (
              <div className="mt-1.5 text-xs text-muted-foreground/50">
                No account detected. Run <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">claude auth login</code> in your terminal to sign in.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Remote Environments */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Globe className="w-4 h-4 text-purple-400" />
            Remote Environments
          </h3>
          <Button variant="outline" size="sm" onClick={() => setShowAdd(!showAdd)} className="text-xs h-7">
            <Plus className="h-3 w-3 mr-1" />
            Add
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground/60">
          Connect to remote machines, WSL2 distros, or Docker containers where Claude Code is installed.
          Sessions on remote environments execute commands and edit files on that machine.
        </p>

        {/* Environment list */}
        {environments.length === 0 && !showAdd && (
          <div className="py-8 text-center space-y-2">
            <Monitor className="w-6 h-6 mx-auto text-muted-foreground/20" />
            <p className="text-xs text-muted-foreground/40">No remote environments configured</p>
            <p className="text-[10px] text-muted-foreground/30">Currently running on local machine only</p>
          </div>
        )}

        {environments.map(env => (
          <EnvironmentCard
            key={env.id}
            env={env}
            isExpanded={expandedEnv === env.id}
            onToggleExpand={() => setExpandedEnv(expandedEnv === env.id ? null : env.id)}
            onToggleEnabled={() => handleToggle(env.id)}
            onRemove={() => handleRemove(env.id)}
          />
        ))}

        {/* Add form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <AddEnvironmentForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info */}
      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/70">
        <div className="flex items-start gap-2">
          <Terminal className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-300/90 mb-1">How Remote Environments Work</p>
            <ul className="space-y-0.5 text-blue-300/60">
              <li>• <strong>SSH</strong> — Connects via SSH to a remote machine. Claude Code must be installed there.</li>
              <li>• <strong>WSL2</strong> — Runs in a Windows Subsystem for Linux distro on the same machine.</li>
              <li>• <strong>Docker</strong> — Executes inside a running Docker container.</li>
              <li>• The SDK's <code className="font-mono text-[10px] bg-blue-500/10 px-1 rounded">sshConfigs</code> option handles SSH natively.</li>
              <li>• WSL2 and Docker use a custom process spawner to bridge execution.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Environment Card ─── */
function EnvironmentCard({ env, isExpanded, onToggleExpand, onToggleEnabled, onRemove }: {
  env: RemoteEnvironment;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/environments/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env),
      });
      const data = await res.json();
      setTestResult(data.success ? 'success' : 'error');
    } catch {
      setTestResult('error');
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const typeIcons = { ssh: Terminal, wsl: Monitor, docker: Server };
  const typeColors = { ssh: 'text-amber-400/60', wsl: 'text-blue-400/60', docker: 'text-cyan-400/60' };
  const Icon = typeIcons[env.type];

  return (
    <div className={cn('rounded-lg border overflow-hidden transition-colors', env.enabled ? 'border-border/30 bg-muted/5' : 'border-border/15 bg-muted/3 opacity-60')}>
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/10 transition-colors"
      >
        <Icon className={cn('h-4 w-4 flex-shrink-0', typeColors[env.type])} />
        <span className="text-xs font-medium flex-1 truncate">{env.name}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-muted-foreground/10 text-muted-foreground/50 uppercase">{env.type}</span>
        {env.enabled && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">enabled</span>
        )}
        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
            <div className="px-3 pb-3 pt-1 border-t border-border/10 space-y-2">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                {env.type === 'ssh' && (
                  <>
                    <span className="text-muted-foreground/40">Host</span>
                    <span className="font-mono">{env.sshHost}</span>
                    {env.sshPort && env.sshPort !== 22 && (
                      <><span className="text-muted-foreground/40">Port</span><span className="font-mono">{env.sshPort}</span></>
                    )}
                    {env.sshIdentityFile && (
                      <><span className="text-muted-foreground/40">Key</span><span className="font-mono truncate">{env.sshIdentityFile}</span></>
                    )}
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
                {env.type === 'wsl' && (
                  <>
                    <span className="text-muted-foreground/40">Distro</span>
                    <span className="font-mono">{env.wslDistro || 'default'}</span>
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
                {env.type === 'docker' && (
                  <>
                    <span className="text-muted-foreground/40">Container</span>
                    <span className="font-mono">{env.dockerContainer}</span>
                    {env.dockerImage && (
                      <><span className="text-muted-foreground/40">Image</span><span className="font-mono truncate">{env.dockerImage}</span></>
                    )}
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <Button variant="ghost" size="sm" onClick={handleTest} disabled={testing} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  {testing ? <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" /> : testResult === 'success' ? <CheckCircle2 className="h-2.5 w-2.5 mr-1 text-emerald-400" /> : testResult === 'error' ? <AlertCircle className="h-2.5 w-2.5 mr-1 text-red-400" /> : <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                  {testing ? 'Testing...' : testResult === 'success' ? 'Connected' : testResult === 'error' ? 'Failed' : 'Test'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onToggleEnabled} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  {env.enabled ? 'Disable' : 'Enable'}
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={onRemove} className="text-[10px] h-6 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 className="h-2.5 w-2.5 mr-1" /> Remove
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Add Environment Form ─── */
function AddEnvironmentForm({ onAdd, onCancel }: { onAdd: (env: RemoteEnvironment) => void; onCancel: () => void }) {
  const [type, setType] = useState<'ssh' | 'wsl' | 'docker'>('ssh');
  const [name, setName] = useState('');
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [sshIdentityFile, setSshIdentityFile] = useState('');
  const [startDirectory, setStartDirectory] = useState('');
  const [wslDistro, setWslDistro] = useState('');
  const [dockerContainer, setDockerContainer] = useState('');
  const [dockerImage, setDockerImage] = useState('');

  const canSave = name.trim() && (
    (type === 'ssh' && sshHost.trim()) ||
    (type === 'wsl') ||
    (type === 'docker' && dockerContainer.trim())
  );

  const handleSave = () => {
    if (!canSave) return;
    onAdd({
      id: `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      type,
      sshHost: type === 'ssh' ? sshHost.trim() : undefined,
      sshPort: type === 'ssh' && sshPort !== '22' ? parseInt(sshPort) : undefined,
      sshIdentityFile: type === 'ssh' && sshIdentityFile.trim() ? sshIdentityFile.trim() : undefined,
      startDirectory: startDirectory.trim() || undefined,
      wslDistro: type === 'wsl' ? (wslDistro.trim() || undefined) : undefined,
      dockerContainer: type === 'docker' ? dockerContainer.trim() : undefined,
      dockerImage: type === 'docker' && dockerImage.trim() ? dockerImage.trim() : undefined,
      enabled: true,
    });
  };

  return (
    <div className="p-4 rounded-lg border border-primary/20 bg-primary/[0.03] space-y-4">
      <h4 className="text-sm font-medium">Add Remote Environment</h4>

      {/* Type selector */}
      <div className="flex gap-1.5">
        {([
          { id: 'ssh', label: 'SSH', icon: Terminal, color: 'amber' },
          { id: 'wsl', label: 'WSL2', icon: Monitor, color: 'blue' },
          { id: 'docker', label: 'Docker', icon: Server, color: 'cyan' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-all',
              type === t.id
                ? `border-${t.color}-500/30 bg-${t.color}-500/10 text-${t.color}-400`
                : 'border-border/30 text-muted-foreground/50 hover:border-border/50'
            )}
          >
            <t.icon className="h-3 w-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Prerequisites info */}
      <div className="p-2.5 rounded-md bg-muted/30 border border-border/20 text-[10px] text-muted-foreground/60 space-y-1">
        {type === 'ssh' && (
          <>
            <p className="font-medium text-muted-foreground/80">SSH Prerequisites:</p>
            <ul className="space-y-0.5 ml-2">
              <li>1. SSH access to the remote machine (key-based auth recommended)</li>
              <li>2. Claude Code installed on the remote: <code className="font-mono bg-muted px-1 rounded">npm install -g @anthropic-ai/claude-code</code></li>
              <li>3. A valid Anthropic API key or Claude login on the remote</li>
              <li>4. Test with: <code className="font-mono bg-muted px-1 rounded">ssh user@host "claude --version"</code></li>
            </ul>
          </>
        )}
        {type === 'wsl' && (
          <>
            <p className="font-medium text-muted-foreground/80">WSL2 Prerequisites:</p>
            <ul className="space-y-0.5 ml-2">
              <li>1. WSL2 enabled on Windows: <code className="font-mono bg-muted px-1 rounded">wsl --install</code></li>
              <li>2. A Linux distro installed (Ubuntu recommended)</li>
              <li>3. Claude Code installed inside WSL: <code className="font-mono bg-muted px-1 rounded">wsl -d Ubuntu -- npm install -g @anthropic-ai/claude-code</code></li>
              <li>4. Test with: <code className="font-mono bg-muted px-1 rounded">wsl -d Ubuntu -- claude --version</code></li>
            </ul>
          </>
        )}
        {type === 'docker' && (
          <>
            <p className="font-medium text-muted-foreground/80">Docker Prerequisites:</p>
            <ul className="space-y-0.5 ml-2">
              <li>1. Docker running with the target container active</li>
              <li>2. Claude Code installed in the container: <code className="font-mono bg-muted px-1 rounded">docker exec my-container npm install -g @anthropic-ai/claude-code</code></li>
              <li>3. API key accessible inside the container (via env var or mounted credentials)</li>
              <li>4. Test with: <code className="font-mono bg-muted px-1 rounded">docker exec my-container claude --version</code></li>
            </ul>
          </>
        )}
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground/60">Environment Name</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Dev Server, WSL Ubuntu, Build Container" className="h-8 text-xs" />
      </div>

      {/* SSH fields */}
      {type === 'ssh' && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2 space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">Host (user@hostname)</Label>
              <Input value={sshHost} onChange={e => setSshHost(e.target.value)} placeholder="user@192.168.1.100" className="h-8 text-xs font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">Port</Label>
              <Input value={sshPort} onChange={e => setSshPort(e.target.value)} placeholder="22" className="h-8 text-xs font-mono" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">Identity File (optional)</Label>
            <Input value={sshIdentityFile} onChange={e => setSshIdentityFile(e.target.value)} placeholder="~/.ssh/id_rsa" className="h-8 text-xs font-mono" />
            <p className="text-[9px] text-muted-foreground/40 mt-1">
              Tip: If you have hosts configured in <code className="font-mono bg-muted px-0.5 rounded">~/.ssh/config</code>,
              you can use the host alias directly (e.g., <code className="font-mono bg-muted px-0.5 rounded">myserver</code> instead of <code className="font-mono bg-muted px-0.5 rounded">user@ip</code>).
            </p>
          </div>
        </div>
      )}

      {/* WSL fields */}
      {type === 'wsl' && (
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">WSL Distro (leave empty for default)</Label>
          <Input value={wslDistro} onChange={e => setWslDistro(e.target.value)} placeholder="Ubuntu" className="h-8 text-xs font-mono" />
        </div>
      )}

      {/* Docker fields */}
      {type === 'docker' && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">Container Name or ID</Label>
            <Input value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} placeholder="my-dev-container" className="h-8 text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">Image (optional, for reference only)</Label>
            <Input value={dockerImage} onChange={e => setDockerImage(e.target.value)} placeholder="ubuntu:22.04" className="h-8 text-xs font-mono" />
          </div>
        </div>
      )}

      {/* Start directory — shared */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground/60">Start Directory (optional)</Label>
        <Input value={startDirectory} onChange={e => setStartDirectory(e.target.value)} placeholder="/home/user/projects" className="h-8 text-xs font-mono" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={!canSave} size="sm" className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> Add Environment
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm" className="text-xs text-muted-foreground">Cancel</Button>
      </div>
    </div>
  );
}
