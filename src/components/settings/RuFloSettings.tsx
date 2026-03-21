import { useState, useEffect, useCallback } from 'react';
import { api, type RuFloStatus } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white/5 rounded-xl p-4 space-y-3">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-white/90">{children}</div>;
}

function StatusRow({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-zinc-500'}`} />
      <span className={`text-sm ${active ? 'text-green-400' : 'text-white/40'}`}>{label}</span>
    </div>
  );
}

export function RuFloSettings() {
  const [status, setStatus] = useState<RuFloStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Swarm defaults from localStorage
  const [topology, setTopology] = useState(() => localStorage.getItem('runecode-ruflo-topology') ?? 'hierarchical');
  const [maxAgents, setMaxAgents] = useState(() => {
    const v = parseInt(localStorage.getItem('runecode-ruflo-max-agents') ?? '8', 10);
    return isNaN(v) ? 8 : v;
  });
  const [autoInit, setAutoInit] = useState(() => localStorage.getItem('runecode-ruflo-auto-init') !== 'false');

  const refresh = useCallback(async () => {
    setRefreshError(null);
    try {
      const s = await api.checkRufloInstalled();
      setStatus(s);
      window.dispatchEvent(new CustomEvent('runecode:ruflo-status-changed'));
    } catch (e) {
      setRefreshError(String(e));
      // keep stale status rather than resetting to null
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionLoading(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-white/40">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking RuFlo...
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">⚡ RuFlo</h2>
        <p className="text-sm text-white/50 mt-1">AI Swarm Manager · claude-flow v3</p>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {refreshError && (
        <div className="text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-4 py-3">
          Status check failed: {refreshError}
        </div>
      )}

      {/* Card 1: Install Status */}
      <Card>
        <CardTitle>Installation</CardTitle>
        <StatusRow active={status?.installed ?? false} label={status?.installed ? `Installed · v${status.version ?? '?'}` : 'Not installed'} />
        <p className="text-xs text-white/40">Global npm package · @claude-flow/cli</p>
        <div className="flex gap-2 pt-1">
          {status?.installed ? (
            <>
              <button
                onClick={() => runAction('update', () => api.installRuflo())}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/30 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'update' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Update'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Uninstall RuFlo? This removes the global CLI.')) {
                    runAction('uninstall', () => api.uninstallRuflo());
                  }
                }}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors disabled:opacity-50"
              >
                Uninstall
              </button>
            </>
          ) : (
            <button
              onClick={() => runAction('install', () => api.installRuflo())}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'install' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Install RuFlo'}
            </button>
          )}
        </div>
      </Card>

      {/* Card 2: MCP Server */}
      <Card>
        <CardTitle>MCP Server</CardTitle>
        <StatusRow active={status?.mcp_active ?? false} label={status?.mcp_active ? 'Active in Claude Code' : 'Inactive'} />
        <div className="font-mono text-[10px] text-white/30 bg-black/30 rounded px-3 py-2 break-all">
          claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
        </div>
        <div className="flex gap-2">
          {!status?.mcp_active ? (
            <button
              onClick={() => runAction('mcp-activate', () => api.activateRufloMcp())}
              disabled={actionLoading !== null || !status?.installed}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/30 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'mcp-activate' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Activate'}
            </button>
          ) : (
            <button
              onClick={() => runAction('mcp-deactivate', () => api.deactivateRufloMcp())}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg bg-zinc-700 text-white/60 text-xs hover:bg-zinc-600 transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          )}
        </div>
      </Card>

      {/* Card 3: /setup-ruflo slash command */}
      <Card>
        <CardTitle>/setup-ruflo Command</CardTitle>
        <StatusRow active={status?.slash_command_exists ?? false} label={status?.slash_command_exists ? 'Present' : 'Missing'} />
        <p className="text-xs text-white/40">~/.claude/commands/setup-ruflo.md</p>
        <button
          onClick={() => runAction('slash', () => api.createRufloSlashCommand())}
          disabled={actionLoading !== null || !status?.installed}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {actionLoading === 'slash' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Recreate'}
        </button>
      </Card>

      {/* Card 4: Swarm Defaults */}
      <Card>
        <CardTitle>Swarm Defaults</CardTitle>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Topology</span>
            <select
              value={topology}
              onChange={(e) => { setTopology(e.target.value); localStorage.setItem('runecode-ruflo-topology', e.target.value); }}
              className="bg-black/40 border border-white/10 rounded text-xs text-white px-2 py-1 focus:outline-none focus:border-purple-500/50"
            >
              <option value="hierarchical">hierarchical</option>
              <option value="mesh">mesh</option>
              <option value="star">star</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Max Agents</span>
            <input
              type="number"
              min={1}
              max={15}
              value={maxAgents}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && v >= 1 && v <= 15) {
                  setMaxAgents(v);
                  localStorage.setItem('runecode-ruflo-max-agents', String(v));
                }
              }}
              className="w-16 bg-black/40 border border-white/10 rounded text-xs text-white px-2 py-1 text-center focus:outline-none focus:border-purple-500/50"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Auto-init on project create</span>
            <button
              onClick={() => { const next = !autoInit; setAutoInit(next); localStorage.setItem('runecode-ruflo-auto-init', String(next)); }}
              role="switch"
              aria-checked={autoInit}
              aria-label="Auto-init on project create"
              className={`w-9 h-5 rounded-full transition-colors relative ${autoInit ? 'bg-purple-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoInit ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </Card>

      {/* Card 5: Swarm Log */}
      <Card>
        <CardTitle>Swarm Log</CardTitle>
        <p className="text-xs text-white/40">logs/swarm_log.txt in each project</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'project-explorer' } }))}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors"
        >
          Open Project Explorer
        </button>
      </Card>
    </div>
  );
}
