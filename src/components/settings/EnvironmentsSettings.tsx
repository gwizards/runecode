import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User, Server, Plus, Trash2, ChevronDown, ChevronRight,
  Terminal, Globe, Monitor, Loader2, CheckCircle2, AlertCircle,
  RefreshCw
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
  sshPassword?: string;
  sshAuthMethod?: 'key' | 'password';
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
  const [editingEnv, setEditingEnv] = useState<RemoteEnvironment | null>(null);
  const [expandedEnv, setExpandedEnv] = useState<string | null>(null);
  const [activeAccount, setActiveAccount] = useState<{ email: string; displayName?: string } | null>(null);
  const [accountLoading, setAccountLoading] = useState(true);

  // Load current account info from auth status endpoint
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/status');
        if (res.ok) {
          const data = await res.json();
          if (data.email) {
            setActiveAccount({
              email: data.email,
              displayName: data.organization || data.email.split('@')[0],
            });
          }
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

  const handleEdit = (env: RemoteEnvironment) => {
    setEditingEnv(env);
    setShowAdd(false);
  };

  const handleSaveEdit = (updated: RemoteEnvironment) => {
    updateEnvironments(environments.map(e => e.id === updated.id ? updated : e));
    setEditingEnv(null);
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
            onEdit={() => handleEdit(env)}
          />
        ))}

        {/* Add form */}
        <AnimatePresence>
          {showAdd && !editingEnv && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <AddEnvironmentForm onAdd={handleAdd} onCancel={() => setShowAdd(false)} />
            </motion.div>
          )}
          {editingEnv && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <AddEnvironmentForm
                editEnv={editingEnv}
                onAdd={handleSaveEdit}
                onCancel={() => setEditingEnv(null)}
              />
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
function EnvironmentCard({ env, isExpanded, onToggleExpand, onToggleEnabled, onRemove, onEdit }: {
  env: RemoteEnvironment;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onEdit: () => void;
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
      if (res.ok) {
        const data = await res.json();
        setTestResult(data.success ? 'success' : 'error');
      } else {
        setTestResult('error');
      }
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
                    <span className="text-muted-foreground/40">Auth</span>
                    <span>{env.sshAuthMethod === 'password' ? 'Password' : 'SSH Key'}</span>
                    {env.sshAuthMethod !== 'password' && env.sshIdentityFile && (
                      <><span className="text-muted-foreground/40">Key</span><span className="font-mono truncate">{env.sshIdentityFile}</span></>
                    )}
                    {env.sshAuthMethod === 'password' && (
                      <><span className="text-muted-foreground/40">Password</span><span>••••••••</span></>
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
                <Button variant="ghost" size="sm" onClick={onEdit} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  Edit
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
function AddEnvironmentForm({ onAdd, onCancel, editEnv }: { onAdd: (env: RemoteEnvironment) => void; onCancel: () => void; editEnv?: RemoteEnvironment }) {
  const [type, setType] = useState<'ssh' | 'wsl' | 'docker'>(editEnv?.type || 'ssh');
  const [name, setName] = useState(editEnv?.name || '');
  const [sshHost, setSshHost] = useState(editEnv?.sshHost || '');
  const [sshPort, setSshPort] = useState(String(editEnv?.sshPort || 22));
  const [sshAuthMethod, setSshAuthMethod] = useState<'key' | 'password'>(editEnv?.sshAuthMethod || 'key');
  const [sshIdentityFile, setSshIdentityFile] = useState(editEnv?.sshIdentityFile || '');
  const [sshPassword, setSshPassword] = useState(editEnv?.sshPassword || '');
  const [startDirectory, setStartDirectory] = useState(editEnv?.startDirectory || '');
  const [wslDistro, setWslDistro] = useState(editEnv?.wslDistro || '');
  const [dockerContainer, setDockerContainer] = useState(editEnv?.dockerContainer || '');
  const [dockerImage, setDockerImage] = useState(editEnv?.dockerImage || '');

  const canSave = name.trim() && (
    (type === 'ssh' && sshHost.trim()) ||
    (type === 'wsl') ||
    (type === 'docker' && dockerContainer.trim())
  );

  const handleSave = () => {
    if (!canSave) return;
    onAdd({
      id: editEnv?.id || `env_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim(),
      type,
      sshHost: type === 'ssh' ? sshHost.trim() : undefined,
      sshPort: type === 'ssh' && sshPort !== '22' ? parseInt(sshPort) : undefined,
      sshAuthMethod: type === 'ssh' ? sshAuthMethod : undefined,
      sshIdentityFile: type === 'ssh' && sshAuthMethod === 'key' && sshIdentityFile.trim() ? sshIdentityFile.trim() : undefined,
      sshPassword: type === 'ssh' && sshAuthMethod === 'password' && sshPassword ? sshPassword : undefined,
      startDirectory: startDirectory.trim() || undefined,
      wslDistro: type === 'wsl' ? (wslDistro.trim() || undefined) : undefined,
      dockerContainer: type === 'docker' ? dockerContainer.trim() : undefined,
      dockerImage: type === 'docker' && dockerImage.trim() ? dockerImage.trim() : undefined,
      enabled: editEnv?.enabled ?? true,
    });
  };

  return (
    <div className="p-4 rounded-lg border border-primary/20 bg-primary/[0.03] space-y-4">
      <h4 className="text-sm font-medium">{editEnv ? 'Edit Environment' : 'Add Remote Environment'}</h4>

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
              <li>1. SSH access (key-based or password authentication)</li>
              <li>2. Claude Code installed on the remote: <code className="font-mono bg-muted px-1 rounded">npm install -g @anthropic-ai/claude-code</code></li>
              <li>3. A valid Anthropic API key or Claude login on the remote</li>
              <li>4. Test with: <code className="font-mono bg-muted px-1 rounded">ssh user@host "claude --version"</code></li>
              {sshAuthMethod === 'password' && (
                <li>5. You'll be prompted to enter your password in the terminal when connecting</li>
              )}
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
          {/* Auth method */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">Authentication</Label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setSshAuthMethod('key')}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                  sshAuthMethod === 'key'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/30 text-muted-foreground hover:border-border/50'
                }`}
              >
                SSH Key
              </button>
              <button
                onClick={() => setSshAuthMethod('password')}
                className={`px-3 py-1.5 rounded-md border text-xs font-medium transition-all ${
                  sshAuthMethod === 'password'
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border/30 text-muted-foreground hover:border-border/50'
                }`}
              >
                Password
              </button>
            </div>
          </div>
          {sshAuthMethod === 'key' && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">Identity File (optional)</Label>
              <Input value={sshIdentityFile} onChange={e => setSshIdentityFile(e.target.value)} placeholder="~/.ssh/id_rsa" className="h-8 text-xs font-mono" />
              <p className="text-[9px] text-muted-foreground/40 mt-1">
                Tip: If you have hosts in <code className="font-mono bg-muted px-0.5 rounded">~/.ssh/config</code>,
                use the alias directly (e.g., <code className="font-mono bg-muted px-0.5 rounded">myserver</code>).
              </p>
            </div>
          )}
          {sshAuthMethod === 'password' && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">Password</Label>
              <Input type="password" value={sshPassword} onChange={e => setSshPassword(e.target.value)} placeholder="Enter SSH password" className="h-8 text-xs font-mono" />
              <p className="text-[9px] text-amber-400/60 mt-1">
                Password is stored locally. For better security, consider using SSH keys or <code className="font-mono bg-muted px-0.5 rounded">ssh-agent</code>.
              </p>
            </div>
          )}
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
        <DockerSection
          dockerContainer={dockerContainer}
          setDockerContainer={setDockerContainer}
          dockerImage={dockerImage}
          setDockerImage={setDockerImage}
        />
      )}

      {/* Start directory — shared */}
      <div className="space-y-1.5">
        <Label className="text-[11px] text-muted-foreground/60">Start Directory (optional)</Label>
        <Input value={startDirectory} onChange={e => setStartDirectory(e.target.value)} placeholder="/home/user/projects" className="h-8 text-xs font-mono" />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSave} disabled={!canSave} size="sm" className="text-xs">
          <Plus className="h-3 w-3 mr-1" /> {editEnv ? 'Save Changes' : 'Add Environment'}
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm" className="text-xs text-muted-foreground">Cancel</Button>
      </div>
    </div>
  );
}

/* ─── Docker Section with container detection ─── */
function DockerSection({ dockerContainer, setDockerContainer, setDockerImage }: {
  dockerContainer: string;
  setDockerContainer: (v: string) => void;
  dockerImage?: string;
  setDockerImage: (v: string) => void;
}) {
  const [dockerStatus, setDockerStatus] = useState<{ running: boolean; version?: string; containers: any[] } | null>(null);
  const [loadingDocker, setLoadingDocker] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImage, setNewImage] = useState('ubuntu:22.04');
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/docker/status');
        if (res.ok) setDockerStatus(await res.json());
      } catch {}
      setLoadingDocker(false);
    })();
  }, []);

  const [createStatus, setCreateStatus] = useState('');
  const [installingClaude, setInstallingClaude] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim() || !newImage.trim()) return;
    setCreating(true);
    setCreateStatus('Creating container...');
    try {
      const res = await fetch('/api/docker/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), image: newImage.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setDockerContainer(data.name);
        setDockerImage(newImage.trim());
        setCreateStatus(data.claudeInstalled ? 'Created with Claude Code!' : 'Created (Claude Code install failed — you can install manually)');
        setShowCreate(false);
        const statusRes = await fetch('/api/docker/status');
        if (statusRes.ok) setDockerStatus(await statusRes.json());
      } else {
        setCreateStatus(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setCreateStatus(`Error: ${err.message}`);
    }
    setCreating(false);
  };

  const handleInstallClaude = async (containerName: string) => {
    setInstallingClaude(containerName);
    try {
      const res = await fetch('/api/docker/install-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ container: containerName }),
      });
      const data = await res.json();
      if (data.alreadyInstalled) {
        setInstallingClaude(null);
        return;
      }
      if (!data.success) {
        console.error('Claude install failed:', data.error);
      }
    } catch {}
    setInstallingClaude(null);
  };

  if (loadingDocker) {
    return <div className="text-xs text-muted-foreground/40 py-2">Checking Docker...</div>;
  }

  if (!dockerStatus?.running) {
    return (
      <div className="space-y-3">
        <div className="p-2.5 rounded-md bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-400/70">
          Docker is not running. Start Docker to connect to containers.
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Container Name or ID (manual)</Label>
          <Input value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} placeholder="my-dev-container" className="h-8 text-xs font-mono" />
        </div>
      </div>
    );
  }

  const runningContainers = dockerStatus.containers.filter((c: any) => c.state === 'running');
  const stoppedContainers = dockerStatus.containers.filter((c: any) => c.state !== 'running');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] text-emerald-400/60">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Docker {dockerStatus.version} — {runningContainers.length} running
      </div>

      {runningContainers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground/60">Running containers</Label>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {runningContainers.map((c: any) => (
              <div key={c.id} className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-[10px] transition-colors",
                dockerContainer === c.name
                  ? "bg-primary/10 border border-primary/30 text-primary"
                  : "hover:bg-muted/30 border border-transparent"
              )}>
                <button
                  onClick={() => { setDockerContainer(c.name); setDockerImage(c.image); }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="font-mono font-medium truncate">{c.name}</span>
                  <span className="text-muted-foreground/40 truncate flex-1">{c.image}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleInstallClaude(c.name); }}
                  disabled={installingClaude === c.name}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                  title="Install Claude Code in this container"
                >
                  {installingClaude === c.name ? '...' : 'Install Claude'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stoppedContainers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground/40">Stopped</Label>
          <div className="space-y-0.5 max-h-20 overflow-y-auto">
            {stoppedContainers.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { setDockerContainer(c.name); setDockerImage(c.image); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[10px] opacity-50 transition-colors",
                  dockerContainer === c.name ? "bg-primary/10 border border-primary/30 opacity-100" : "hover:bg-muted/30 border border-transparent"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                <span className="font-mono font-medium truncate">{c.name}</span>
                <span className="text-muted-foreground/30 truncate flex-1">{c.image}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-1.5 rounded-md border border-dashed border-border/30 text-[10px] text-muted-foreground/50 hover:text-foreground hover:border-border/50 transition-colors"
        >
          + Create new container
        </button>
      ) : (
        <div className="p-3 rounded-md border border-primary/20 bg-primary/[0.02] space-y-2">
          <Label className="text-[11px] font-medium">Create Container</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/50">Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="claude-dev" className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/50">Image</Label>
              <Input value={newImage} onChange={e => setNewImage(e.target.value)} placeholder="ubuntu:22.04" className="h-7 text-xs font-mono" />
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/40">
            Creates a container and auto-installs Node.js + Claude Code. This may take a minute.
          </p>
          <div className="flex gap-1.5 items-center">
            <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()} className="text-[10px] h-7">
              {creating ? 'Creating & Installing...' : 'Create'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="text-[10px] h-7 text-muted-foreground">
              Cancel
            </Button>
            {createStatus && <span className="text-[9px] text-muted-foreground/50">{createStatus}</span>}
          </div>
        </div>
      )}

      <div className="space-y-1.5 pt-1 border-t border-border/10">
        <Label className="text-[11px] text-muted-foreground/40">Or enter manually</Label>
        <Input value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} placeholder="container-name" className="h-7 text-xs font-mono" />
      </div>
    </div>
  );
}
