import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plug, Plus, Trash2, RefreshCw, AlertCircle,
  Terminal, Globe, ChevronDown, ChevronRight, Copy,
  Download, ExternalLink, Search, Loader2
} from 'lucide-react';
import { api, type MCPServer } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ViewMode = 'list' | 'add' | 'browse';

export function MCPSettings() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const loadServers = async () => {
    try {
      setLoading(true);
      const result = await api.mcpList();
      setServers(result);
      setError(null);
    } catch (err) {
      setError('Failed to load MCP servers');
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  const [liveStatus, setLiveStatus] = useState<Map<string, any>>(new Map());

  const loadLiveStatus = async () => {
    try {
      const res = await fetch('/api/mcp/status');
      if (res.ok) {
        const data = await res.json();
        const statusMap = new Map<string, any>();
        if (Array.isArray(data)) {
          data.forEach((s: any) => statusMap.set(s.name, s));
        }
        setLiveStatus(statusMap);
      }
    } catch {}
  };

  useEffect(() => { loadServers(); loadLiveStatus(); }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleRemove = async (name: string) => {
    if (!confirm(`Remove MCP server "${name}"?`)) return;
    try {
      await api.mcpRemove(name);
      setToast({ message: `Removed "${name}"`, type: 'success' });
      loadServers();
    } catch {
      setToast({ message: `Failed to remove "${name}"`, type: 'error' });
    }
  };

  const handleTest = async (name: string) => {
    try {
      await api.mcpTestConnection(name);
      setToast({ message: `"${name}" is reachable`, type: 'success' });
    } catch {
      setToast({ message: `"${name}" connection failed`, type: 'error' });
    }
  };

  const handleImportClaudeDesktop = async () => {
    try {
      const result = await api.mcpAddFromClaudeDesktop('user');
      setToast({ message: `Imported ${result.imported_count} servers`, type: 'success' });
      loadServers();
    } catch {
      setToast({ message: 'Failed to import from Claude Desktop', type: 'error' });
    }
  };

  const connectedCount = Array.from(liveStatus.values()).filter((s: any) => s.status === 'connected').length || servers.filter(s => s.status?.running).length;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Plug className="w-5 h-5 text-blue-400" />
          MCP Servers
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage Model Context Protocol servers that extend Claude's capabilities with custom tools, data sources, and integrations.
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/60">
          <span>{servers.length} configured</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="text-emerald-400/70">{connectedCount} connected</span>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Button
          variant={viewMode === 'list' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('list')}
          className="text-xs"
        >
          My Servers
        </Button>
        <Button
          variant={viewMode === 'add' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('add')}
          className="text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Server
        </Button>
        <Button
          variant={viewMode === 'browse' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setViewMode('browse')}
          className="text-xs"
        >
          <Search className="h-3 w-3 mr-1" />
          Browse Directory
        </Button>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => { loadServers(); loadLiveStatus(); }} className="text-xs text-muted-foreground">
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Content area */}
      {viewMode === 'list' && (
        <>
          <RecommendedServers
            installedNames={new Set(servers.map(s => s.name))}
            onInstalled={() => { loadServers(); loadLiveStatus(); }}
            setToast={setToast}
          />
          <ServerList
            servers={servers}
            loading={loading}
            expandedServer={expandedServer}
            onToggleExpand={(name) => setExpandedServer(expandedServer === name ? null : name)}
            onRemove={handleRemove}
            onTest={handleTest}
            onImportClaudeDesktop={handleImportClaudeDesktop}
            liveStatus={liveStatus}
          />
        </>
      )}

      {viewMode === 'add' && (
        <AddServerForm
          onAdded={() => { loadServers(); setViewMode('list'); }}
          onCancel={() => setViewMode('list')}
          setToast={setToast}
        />
      )}

      {viewMode === 'browse' && (
        <MCPDirectory
          installedNames={new Set(servers.map(s => s.name))}
          onInstall={(name) => {
            loadServers();
            setViewMode('list');
            setToast({ message: `Added "${name}" from directory`, type: 'success' });
          }}
          setToast={setToast}
        />
      )}

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              'fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-xs font-medium shadow-lg',
              toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white'
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Recommended Servers (shown at top of My Servers) ─── */
function RecommendedServers({ installedNames, onInstalled, setToast }: {
  installedNames: Set<string>;
  onInstalled: () => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const recommended = POPULAR_MCP_SERVERS.filter(s => (s as any).recommended && !installedNames.has(s.name));

  if (recommended.length === 0) return null;

  const handleInstall = async (server: typeof POPULAR_MCP_SERVERS[0]) => {
    try {
      setInstalling(server.name);
      const envObj = server.env || {};
      await api.mcpAdd(server.name, 'stdio', server.command, server.args, envObj, undefined, 'user');
      onInstalled();
      setToast({ message: `Added "${server.name}"`, type: 'success' });
    } catch {
      setToast({ message: `Failed to add "${server.name}"`, type: 'error' });
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="space-y-2 mb-4">
      <h3 className="text-[10px] uppercase tracking-wider font-semibold text-primary/50 px-1">
        Recommended
      </h3>
      <div className="space-y-1">
        {recommended.map(server => (
          <div key={server.name} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-primary/15 bg-primary/[0.02] hover:bg-primary/[0.05] transition-colors">
            <Plug className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{server.name}</span>
                {(server as any).tokens && (
                  <span className="text-[8px] text-cyan-400/40 font-mono">{(server as any).tokens}</span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/50 truncate">{server.description}</p>
            </div>
            {server.env && Object.keys(server.env).length > 0 && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400/50 flex-shrink-0">API key</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleInstall(server)}
              disabled={installing === server.name}
              className="text-[10px] h-6 px-2 shrink-0"
            >
              {installing === server.name ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Plus className="h-3 w-3 mr-0.5" />
                  Add
                </>
              )}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Server List ─── */
function ServerList({ servers, loading, expandedServer, onToggleExpand, onRemove, onTest, onImportClaudeDesktop, liveStatus }: {
  servers: MCPServer[];
  loading: boolean;
  expandedServer: string | null;
  onToggleExpand: (name: string) => void;
  onRemove: (name: string) => void;
  onTest: (name: string) => void;
  onImportClaudeDesktop: () => void;
  liveStatus: Map<string, any>;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground/50">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading servers...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <Plug className="h-8 w-8 mx-auto text-muted-foreground/20" />
        <p className="text-sm text-muted-foreground/50">No MCP servers configured</p>
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={onImportClaudeDesktop} className="text-xs">
            <Download className="h-3 w-3 mr-1" />
            Import from Claude Desktop
          </Button>
        </div>
      </div>
    );
  }

  // Group by scope
  const grouped = {
    user: servers.filter(s => s.scope === 'user'),
    project: servers.filter(s => s.scope === 'project'),
    local: servers.filter(s => s.scope === 'local'),
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([scope, scopeServers]) => {
        if (scopeServers.length === 0) return null;
        return (
          <div key={scope}>
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/40 mb-1.5 px-1">
              {scope === 'user' ? 'Global (all projects)' : scope === 'project' ? 'Project (.mcp.json)' : 'Session-local'}
            </h3>
            <div className="space-y-1">
              {scopeServers.map(server => (
                <ServerCard
                  key={server.name}
                  server={server}
                  isExpanded={expandedServer === server.name}
                  onToggle={() => onToggleExpand(server.name)}
                  onRemove={() => onRemove(server.name)}
                  onTest={() => onTest(server.name)}
                  liveInfo={liveStatus.get(server.name)}
                />
              ))}
            </div>
          </div>
        );
      })}

      <div className="pt-2 border-t border-border/15">
        <Button variant="ghost" size="sm" onClick={onImportClaudeDesktop} className="text-xs text-muted-foreground/50">
          <Download className="h-3 w-3 mr-1" />
          Import from Claude Desktop
        </Button>
      </div>

      {/* Connection help */}
      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/70 mt-3">
        <p className="font-medium text-blue-300/90 mb-1">How MCP servers connect</p>
        <ul className="space-y-0.5 text-blue-300/60">
          <li>Servers connect automatically when you start a new session.</li>
          <li>Stdio servers (npx, node) are launched as child processes.</li>
          <li>SSE servers connect to the URL you provide.</li>
          <li>If a server fails, check the error message and verify the command works in your terminal.</li>
          <li>Refresh this page to see updated connection status.</li>
        </ul>
      </div>
    </div>
  );
}

/* ─── Server Card ─── */
function ServerCard({ server, isExpanded, onToggle, onRemove, onTest, liveInfo }: {
  server: MCPServer;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onTest: () => void;
  liveInfo?: any;
}) {
  const isConnected = liveInfo?.status === 'connected';
  const hasFailed = liveInfo?.status === 'failed' || !!server.status?.error;

  return (
    <div className="rounded-lg border border-border/20 bg-muted/5 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10 transition-colors"
      >
        {/* Status dot */}
        <div className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          isConnected ? 'bg-emerald-400' : hasFailed ? 'bg-red-400' : 'bg-muted-foreground/30'
        )} />
        {/* Transport icon */}
        {server.transport === 'stdio' ? (
          <Terminal className="h-3.5 w-3.5 text-amber-400/60 flex-shrink-0" />
        ) : (
          <Globe className="h-3.5 w-3.5 text-blue-400/60 flex-shrink-0" />
        )}
        {/* Name */}
        <span className="text-xs font-medium flex-1 truncate">{server.name}</span>
        {/* Status badge */}
        <span className={cn(
          'text-[9px] px-1.5 py-0.5 rounded-full font-mono',
          isConnected ? 'bg-emerald-500/10 text-emerald-400' :
          hasFailed ? 'bg-red-500/10 text-red-400' :
          'bg-muted-foreground/10 text-muted-foreground/50'
        )}>
          {liveInfo?.status || (server.status?.running ? 'connected' : 'configured')}
        </span>
        {/* Chevron */}
        {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-border/10 space-y-2">
              {/* Details */}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                <span className="text-muted-foreground/40">Transport</span>
                <span className="font-mono">{server.transport}</span>
                {server.command && (
                  <>
                    <span className="text-muted-foreground/40">Command</span>
                    <span className="font-mono truncate">{server.command} {server.args?.join(' ')}</span>
                  </>
                )}
                {server.url && (
                  <>
                    <span className="text-muted-foreground/40">URL</span>
                    <span className="font-mono truncate">{server.url}</span>
                  </>
                )}
                <span className="text-muted-foreground/40">Scope</span>
                <span className="font-mono">{server.scope}</span>
                {server.status?.error && (
                  <>
                    <span className="text-red-400/60">Error</span>
                    <span className="text-red-400/70">{server.status.error}</span>
                  </>
                )}
              </div>

              {/* Live connection status */}
              {liveInfo && (
                <div className="mt-2 pt-2 border-t border-border/10">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                    <span className="text-muted-foreground/40">Status</span>
                    <span className={cn('font-medium',
                      liveInfo.status === 'connected' ? 'text-emerald-400' :
                      liveInfo.status === 'failed' ? 'text-red-400' :
                      liveInfo.status === 'pending' ? 'text-amber-400' : 'text-muted-foreground/50'
                    )}>
                      {liveInfo.status}
                    </span>
                    {liveInfo.serverInfo && (
                      <>
                        <span className="text-muted-foreground/40">Server</span>
                        <span className="font-mono">{liveInfo.serverInfo.name} v{liveInfo.serverInfo.version}</span>
                      </>
                    )}
                    {liveInfo.error && (
                      <>
                        <span className="text-red-400/60">Error</span>
                        <span className="text-red-400/70 break-all">{liveInfo.error}</span>
                      </>
                    )}
                  </div>
                  {/* Available tools */}
                  {liveInfo.tools && liveInfo.tools.length > 0 && (
                    <div className="mt-2">
                      <span className="text-[9px] text-muted-foreground/40 uppercase tracking-wider font-semibold">
                        Tools ({liveInfo.tools.length})
                      </span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {liveInfo.tools.map((tool: any) => (
                          <span
                            key={tool.name}
                            title={tool.description || tool.name}
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-muted/30 text-muted-foreground/60 border border-border/15"
                          >
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Env vars */}
              {Object.keys(server.env || {}).length > 0 && (
                <div className="text-[10px]">
                  <span className="text-muted-foreground/40">Env: </span>
                  {Object.keys(server.env).map(k => (
                    <span key={k} className="font-mono text-muted-foreground/60 mr-2">{k}=***</span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button variant="ghost" size="sm" onClick={onTest} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  <RefreshCw className="h-2.5 w-2.5 mr-1" />
                  Test
                </Button>
                <Button variant="ghost" size="sm" onClick={() => {
                  const config = { command: server.command, args: server.args, env: server.env };
                  navigator.clipboard.writeText(JSON.stringify({ [server.name]: config }, null, 2));
                }} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  <Copy className="h-2.5 w-2.5 mr-1" />
                  Copy JSON
                </Button>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" onClick={onRemove} className="text-[10px] h-6 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10">
                  <Trash2 className="h-2.5 w-2.5 mr-1" />
                  Remove
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Add Server Form ─── */
function AddServerForm({ onAdded, onCancel, setToast }: {
  onAdded: () => void;
  onCancel: () => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
}) {
  const [transport, setTransport] = useState<'stdio' | 'sse'>('stdio');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [url, setUrl] = useState('');
  const [scope, setScope] = useState<'user' | 'project' | 'local'>('user');
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState('');

  const handleSave = async () => {
    if (jsonMode) {
      if (!name.trim() || !jsonInput.trim()) return;
      try {
        setSaving(true);
        await api.mcpAddJson(name.trim(), jsonInput.trim(), scope);
        setToast({ message: `Added "${name}"`, type: 'success' });
        onAdded();
      } catch {
        setToast({ message: 'Failed to add server from JSON', type: 'error' });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!name.trim()) return;
    if (transport === 'stdio' && !command.trim()) return;
    if (transport === 'sse' && !url.trim()) return;

    try {
      setSaving(true);
      const envObj = envVars.reduce((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {} as Record<string, string>);

      await api.mcpAdd(
        name.trim(),
        transport,
        transport === 'stdio' ? command.trim() : undefined,
        transport === 'stdio' ? args.split(/\s+/).filter(Boolean) : [],
        envObj,
        transport === 'sse' ? url.trim() : undefined,
        scope
      );
      setToast({ message: `Added "${name}"`, type: 'success' });
      onAdded();
    } catch {
      setToast({ message: 'Failed to add server', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Add MCP Server</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 cursor-pointer">
            <input type="checkbox" checked={jsonMode} onChange={(e) => setJsonMode(e.target.checked)} className="rounded" />
            JSON mode
          </label>
        </div>
      </div>

      {/* Name + Scope */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Server Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-server" className="h-8 text-xs" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Scope</Label>
          <div className="flex gap-1">
            {(['user', 'project', 'local'] as const).map(s => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  'flex-1 px-2 py-1.5 rounded text-[10px] font-medium border transition-all',
                  scope === s ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border/30 text-muted-foreground/50 hover:border-border/50'
                )}
              >
                {s === 'user' ? 'Global' : s === 'project' ? 'Project' : 'Local'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {jsonMode ? (
        /* JSON input */
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Server JSON Config</Label>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={'{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],\n  "env": {}\n}'}
            className="w-full h-32 px-3 py-2 rounded-md border border-border/30 bg-background text-xs font-mono resize-none focus:border-primary/50 focus:outline-none"
          />
        </div>
      ) : (
        <>
          {/* Transport */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">Transport</Label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setTransport('stdio')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-all',
                  transport === 'stdio' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-border/30 text-muted-foreground/50'
                )}
              >
                <Terminal className="h-3 w-3" />
                Stdio (command)
              </button>
              <button
                onClick={() => setTransport('sse')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-all',
                  transport === 'sse' ? 'border-blue-500/30 bg-blue-500/10 text-blue-400' : 'border-border/30 text-muted-foreground/50'
                )}
              >
                <Globe className="h-3 w-3" />
                SSE (HTTP)
              </button>
            </div>
          </div>

          {/* Stdio fields */}
          {transport === 'stdio' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground/60">Command</Label>
                <Input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" className="h-8 text-xs font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground/60">Arguments (space-separated)</Label>
                <Input value={args} onChange={(e) => setArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-filesystem /path" className="h-8 text-xs font-mono" />
              </div>
            </div>
          )}

          {/* SSE fields */}
          {transport === 'sse' && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">Server URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3001/sse" className="h-8 text-xs font-mono" />
            </div>
          )}

          {/* Env vars */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground/60">Environment Variables</Label>
              <button onClick={() => setEnvVars([...envVars, { key: '', value: '' }])} className="text-[10px] text-primary/60 hover:text-primary">
                + Add
              </button>
            </div>
            {envVars.map((ev, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <Input value={ev.key} onChange={(e) => { const n = [...envVars]; n[i].key = e.target.value; setEnvVars(n); }} placeholder="KEY" className="h-7 text-[10px] font-mono flex-1" />
                <span className="text-muted-foreground/30 text-xs">=</span>
                <Input value={ev.value} onChange={(e) => { const n = [...envVars]; n[i].value = e.target.value; setEnvVars(n); }} placeholder="value" type="password" className="h-7 text-[10px] font-mono flex-1" />
                <button onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))} className="text-red-400/40 hover:text-red-400 p-0.5">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button onClick={handleSave} disabled={saving || !name.trim()} size="sm" className="text-xs">
          {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          Add Server
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm" className="text-xs text-muted-foreground">
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ─── MCP Directory (Popular servers) ─── */
const POPULAR_MCP_SERVERS = [
  // ── Recommended ──
  {
    name: 'github',
    description: 'GitHub integration — repos, issues, PRs, code search, actions. Essential for any project on GitHub.',
    package: '@modelcontextprotocol/server-github',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-github'],
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' },
    category: 'Recommended',
    tokens: '~500 per tool call',
    recommended: true,
  },
  {
    name: 'jcodemunch',
    description: 'Code intelligence — symbol search, dependency graphs, blast radius analysis, class hierarchy. Deep codebase understanding without reading every file.',
    package: 'jcodemunch-mcp (uvx)',
    command: 'uvx',
    args: ['jcodemunch-mcp'],
    category: 'Recommended',
    tokens: '~200-800 per query (indexed, very efficient)',
    recommended: true,
  },
  {
    name: 'context7',
    description: 'Up-to-date documentation for any library. Pulls latest docs so Claude never uses outdated APIs. Dramatically reduces hallucinated function calls.',
    package: '@upstash/context7-mcp',
    command: 'npx',
    args: ['-y', '@upstash/context7-mcp'],
    category: 'Recommended',
    tokens: '~1000-3000 per doc lookup (returns relevant sections)',
    recommended: true,
  },
  {
    name: 'memory',
    description: 'Persistent knowledge graph — Claude remembers facts, decisions, and context across sessions. Builds a project knowledge base over time.',
    package: '@modelcontextprotocol/server-memory',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    category: 'Recommended',
    tokens: '~100-500 per read/write (lightweight)',
    recommended: true,
  },
  // ── Code Analysis ──
  {
    name: 'sequential-thinking',
    description: 'Step-by-step reasoning — forces Claude to think through complex problems methodically before acting.',
    package: '@modelcontextprotocol/server-sequential-thinking',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    category: 'Code Analysis',
    tokens: '~200-400 per step (minimal overhead)',
  },
  // ── Databases ──
  {
    name: 'postgres',
    description: 'Query and manage PostgreSQL — schema inspection, SQL execution, data analysis.',
    package: '@modelcontextprotocol/server-postgres',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost/mydb'],
    category: 'Databases',
    tokens: '~200-2000 per query (depends on result size)',
  },
  // ── Web & Search ──
  {
    name: 'brave-search',
    description: 'Web search via Brave API — Claude can search the internet for current information, docs, and solutions.',
    package: '@modelcontextprotocol/server-brave-search',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    category: 'Web & Search',
    tokens: '~500-1500 per search (results summary)',
  },
  {
    name: 'puppeteer',
    description: 'Browser automation — navigate pages, take screenshots, fill forms, scrape content.',
    package: '@modelcontextprotocol/server-puppeteer',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    category: 'Web & Search',
    tokens: '~1000-5000 per action (screenshots are large)',
  },
  // ── Communication ──
  {
    name: 'slack',
    description: 'Slack integration — send messages, read channels, search conversations.',
    package: '@modelcontextprotocol/server-slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: { SLACK_BOT_TOKEN: '', SLACK_TEAM_ID: '' },
    category: 'Communication',
    tokens: '~300-1000 per message/search',
  },
  // ── Infrastructure ──
  {
    name: 'filesystem',
    description: 'Sandboxed file access — read, write, search files in a specific directory. Useful for restricting Claude to a sandbox.',
    package: '@modelcontextprotocol/server-filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/dir'],
    category: 'Infrastructure',
    tokens: '~100-2000 per operation (file-size dependent)',
  },
  {
    name: 'google-maps',
    description: 'Geocoding, directions, and place search via Google Maps API.',
    package: '@modelcontextprotocol/server-google-maps',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-maps'],
    env: { GOOGLE_MAPS_API_KEY: '' },
    category: 'Infrastructure',
    tokens: '~300-800 per query',
  },
];

function MCPDirectory({ installedNames, onInstall, setToast }: {
  installedNames: Set<string>;
  onInstall: (name: string, config: any) => void;
  setToast: (t: { message: string; type: 'success' | 'error' }) => void;
}) {
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  const filtered = POPULAR_MCP_SERVERS.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description.toLowerCase().includes(search.toLowerCase()) ||
    s.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleInstall = async (server: typeof POPULAR_MCP_SERVERS[0]) => {
    try {
      setInstalling(server.name);
      const envObj = server.env || {};
      await api.mcpAdd(server.name, 'stdio', server.command, server.args, envObj, undefined, 'user');
      setJustAdded(prev => new Set([...prev, server.name]));
      onInstall(server.name, server);
    } catch {
      setToast({ message: `Failed to add "${server.name}"`, type: 'error' });
    } finally {
      setInstalling(null);
    }
  };

  const isAdded = (name: string) => installedNames.has(name) || justAdded.has(name);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">MCP Server Directory</h3>
        <p className="text-[11px] text-muted-foreground/60">
          Extend Claude's capabilities with MCP servers. Each server adds tools that Claude can use in terminal sessions.
          Token estimates show approximate context usage per tool call — more tokens means more of your context window is used.
        </p>
        <p className="text-[10px] text-emerald-400/50 mt-1">
          Saved to <code className="font-mono bg-muted px-0.5 rounded">~/.claude.json</code> — works in all Claude Code sessions.
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers..."
          className="h-8 text-xs pl-7"
        />
      </div>

      {/* Server cards */}
      <div className="space-y-1.5">
        {filtered.map(server => (
          <div key={server.name} className={cn(
            "flex items-start gap-3 p-3 rounded-lg border transition-colors",
            (server as any).recommended
              ? "border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.05]"
              : "border-border/20 bg-muted/5 hover:bg-muted/10"
          )}>
            <Terminal className={cn("h-4 w-4 mt-0.5 flex-shrink-0", (server as any).recommended ? "text-primary/60" : "text-amber-400/50")} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{server.name}</span>
                {(server as any).recommended && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase tracking-wider">Recommended</span>
                )}
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/40">{server.category}</span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">{server.description}</p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[9px] font-mono text-muted-foreground/30">{server.package}</span>
                {(server as any).tokens && (
                  <span className="text-[9px] text-cyan-400/40" title="Estimated tokens per tool call">
                    {(server as any).tokens}
                  </span>
                )}
              </div>
              {server.env && Object.keys(server.env).length > 0 && (
                <p className="text-[9px] text-amber-400/50 mt-0.5">Requires: {Object.keys(server.env).join(', ')}</p>
              )}
              {(server as any).note && (
                <a href={(server as any).note} target="_blank" rel="noopener noreferrer" className="text-[9px] text-primary/40 hover:text-primary/60 mt-0.5 inline-flex items-center gap-0.5">
                  <ExternalLink className="h-2.5 w-2.5" /> More info
                </a>
              )}
            </div>
            {isAdded(server.name) ? (
              <span className="text-[10px] px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20 shrink-0">
                Added
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleInstall(server)}
                disabled={installing === server.name}
                className="text-[10px] h-7 px-2.5 shrink-0"
              >
                {installing === server.name ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </>
                )}
              </Button>
            )}
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-xs text-muted-foreground/40 py-6">No servers match "{search}"</p>
      )}

      {/* External link */}
      <div className="pt-2 border-t border-border/15 text-center">
        <a
          href="https://github.com/modelcontextprotocol/servers"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-primary/50 hover:text-primary/80 inline-flex items-center gap-1"
        >
          <ExternalLink className="h-3 w-3" />
          Browse all servers on GitHub
        </a>
      </div>
    </div>
  );
}
