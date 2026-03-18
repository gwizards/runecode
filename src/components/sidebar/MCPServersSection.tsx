import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, ExternalLink, Loader2 } from 'lucide-react';

type MCPStatus = 'connected' | 'configured' | 'needs_auth' | 'error' | 'disconnected' | 'unknown';

interface MCPServer {
  name: string;
  command: string;
  status: MCPStatus;
}

const STATUS_ORDER: Record<MCPStatus, number> = {
  connected: 0,
  configured: 1,
  needs_auth: 2,
  error: 3,
  disconnected: 4,
  unknown: 5,
};

const STATUS_DOT_COLOR: Record<MCPStatus, string> = {
  connected: 'bg-green-500',
  configured: 'bg-blue-400',
  needs_auth: 'bg-yellow-500',
  error: 'bg-red-500',
  disconnected: 'bg-red-400',
  unknown: 'bg-muted-foreground/50',
};

function parseMCPServer(raw: unknown): MCPServer | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    const name = String(r.name || r.id || '');
    if (!name) return null;
    // Status can be a string ('connected') or object ({ running: true })
    let status: MCPStatus = 'unknown';
    if (typeof r.status === 'string' && r.status in STATUS_ORDER) {
      status = r.status as MCPStatus;
    } else if (typeof r.status === 'object' && r.status !== null) {
      const s = r.status as Record<string, unknown>;
      if (s.running === true) status = 'connected';
      else if (s.error) status = 'error';
      else status = 'disconnected';
    } else if (r.is_active !== undefined) {
      status = r.is_active ? 'connected' : 'disconnected';
    }
    // Any server in the config file is at least "configured"
    if (status === 'unknown' || status === 'disconnected') status = 'disconnected';
    return {
      name,
      command: String(r.command || r.cmd || ''),
      status,
    };
  } catch {
    return null;
  }
}

export function MCPServersSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const { data: servers = [], isLoading } = useQuery<MCPServer[]>({
    queryKey: ['mcp-servers'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/commands/mcp');
        if (!res.ok) return [];
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) return [];
        const json = await res.json();
        const raw = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : [];
        return raw.map(parseMCPServer).filter(Boolean) as MCPServer[];
      } catch {
        return [];
      }
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });

  if (servers.length === 0 && !isLoading) return null;

  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const displayServers = showAll ? servers : servers.filter(s => {
    const status = s.status;
    return status === 'connected' || status === 'configured' || status === 'needs_auth';
  });
  const sorted = [...displayServers].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 4) - (STATUS_ORDER[b.status] ?? 4)
  );

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          MCP Servers
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {connectedCount}/{servers.length}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-0.5">
              {isLoading && (
                <div className="px-3 py-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Loading servers...</span>
                </div>
              )}
              {sorted.map((server) => (
                <div
                  key={server.name}
                  className="flex items-center gap-1.5 px-1 py-1 rounded transition-colors group sidebar-item"
                  title={server.command || server.name}
                >
                  <span
                    className={`h-2 w-2 rounded-full flex-shrink-0 ${STATUS_DOT_COLOR[server.status]}`}
                  />
                  <span className="text-[11px] truncate transition-colors flex-1 min-w-0" style={{ color: 'var(--color-text-secondary)' }}>
                    {server.name.replace(/^plugin:.*?:/, '').replace(/^claude\.ai /, '')}
                  </span>
                  {server.status === 'needs_auth' && (
                    <span className="flex items-center gap-0.5 text-[10px] text-yellow-500 hover:text-yellow-400 flex-shrink-0 cursor-pointer">
                      Auth
                      <ExternalLink className="h-2.5 w-2.5" />
                    </span>
                  )}
                </div>
              ))}

              {/* Filter toggle + manage link */}
              <div className="flex items-center gap-2 pt-1.5 mt-1 border-t border-border/20 px-1">
                {servers.length > displayServers.length && !showAll && (
                  <button onClick={() => setShowAll(true)} className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/50">
                    +{servers.length - displayServers.length} hidden
                  </button>
                )}
                {showAll && servers.length !== displayServers.length && (
                  <button onClick={() => setShowAll(false)} className="text-[9px] text-muted-foreground/30 hover:text-muted-foreground/50">
                    Hide disconnected
                  </button>
                )}
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'mcp-servers' } }))}
                  className="text-[9px] text-primary/50 hover:text-primary/80 transition-colors ml-auto"
                >
                  Manage
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
