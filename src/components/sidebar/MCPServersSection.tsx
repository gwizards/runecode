import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

type MCPStatus = 'connected' | 'needs_auth' | 'error' | 'disconnected' | 'unknown';

interface MCPServer {
  name: string;
  command: string;
  status: MCPStatus;
}

const STATUS_ORDER: Record<MCPStatus, number> = {
  connected: 0,
  needs_auth: 1,
  error: 2,
  disconnected: 3,
  unknown: 4,
};

const STATUS_DOT_COLOR: Record<MCPStatus, string> = {
  connected: 'bg-green-500',
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
    const status = typeof r.status === 'string' && r.status in STATUS_ORDER
      ? (r.status as MCPStatus)
      : 'unknown';
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

  const { data: servers = [] } = useQuery<MCPServer[]>({
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
    refetchInterval: 30000,
  });

  if (servers.length === 0) return null;

  const connectedCount = servers.filter((s) => s.status === 'connected').length;
  const sorted = [...servers].sort(
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
          {collapsed ? (
            <span>
              {connectedCount}/{servers.length} connected
            </span>
          ) : (
            servers.length
          )}
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
