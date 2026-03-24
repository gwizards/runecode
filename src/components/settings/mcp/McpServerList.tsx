/**
 * McpServerList — renders the list of configured MCP servers, grouped by scope.
 *
 * The recommended-servers strip and MCP directory have been extracted to
 * McpRecommended.tsx; the static server catalogue lives in mcpServerData.ts.
 */

import { motion, AnimatePresence } from "motion/react";
import {
  Plug,
  Trash2,
  RefreshCw,
  Terminal,
  Globe,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Loader2,
} from "lucide-react";
import { type MCPServer } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// Re-export extracted pieces so existing consumers keep working
export { POPULAR_MCP_SERVERS, type PopularMcpServer } from "./mcpServerData";
export { RecommendedServers, MCPDirectory } from "./McpRecommended";

// ─── ServerCard ───────────────────────────────────────────────────────────────

function ServerCard({
  server,
  isExpanded,
  onToggle,
  onRemove,
  onTest,
  liveInfo,
}: {
  server: MCPServer;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
  onTest: () => void;
  liveInfo?: any;
}) {
  const isConnected = liveInfo?.status === "connected";
  const hasFailed =
    liveInfo?.status === "failed" || !!server.status?.error;

  return (
    <div className="rounded-lg border border-border/20 bg-muted/5 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/10 transition-colors"
      >
        {/* Status dot */}
        <div
          className={cn(
            "w-2 h-2 rounded-full flex-shrink-0",
            isConnected
              ? "bg-emerald-400"
              : hasFailed
              ? "bg-red-400"
              : "bg-muted-foreground/30"
          )}
        />
        {/* Transport icon */}
        {server.transport === "stdio" ? (
          <Terminal className="h-3.5 w-3.5 text-amber-400/60 flex-shrink-0" />
        ) : (
          <Globe className="h-3.5 w-3.5 text-blue-400/60 flex-shrink-0" />
        )}
        {/* Name */}
        <span className="text-xs font-medium flex-1 truncate">
          {server.name}
        </span>
        {/* Status badge */}
        <span
          className={cn(
            "text-[9px] px-1.5 py-0.5 rounded-full font-mono",
            isConnected
              ? "bg-emerald-500/10 text-emerald-400"
              : hasFailed
              ? "bg-red-500/10 text-red-400"
              : "bg-muted-foreground/10 text-muted-foreground/50"
          )}
        >
          {liveInfo?.status ||
            (server.status?.running ? "connected" : "configured")}
        </span>
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
        )}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
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
                    <span className="font-mono truncate">
                      {server.command} {server.args?.join(" ")}
                    </span>
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
                    <span className="text-red-400/70">
                      {server.status.error}
                    </span>
                  </>
                )}
              </div>

              {/* Live connection status */}
              {liveInfo && (
                <div className="mt-2 pt-2 border-t border-border/10">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                    <span className="text-muted-foreground/40">Status</span>
                    <span
                      className={cn(
                        "font-medium",
                        liveInfo.status === "connected"
                          ? "text-emerald-400"
                          : liveInfo.status === "failed"
                          ? "text-red-400"
                          : liveInfo.status === "pending"
                          ? "text-amber-400"
                          : "text-muted-foreground/50"
                      )}
                    >
                      {liveInfo.status}
                    </span>
                    {liveInfo.serverInfo && (
                      <>
                        <span className="text-muted-foreground/40">Server</span>
                        <span className="font-mono">
                          {liveInfo.serverInfo.name} v{liveInfo.serverInfo.version}
                        </span>
                      </>
                    )}
                    {liveInfo.error && (
                      <>
                        <span className="text-red-400/60">Error</span>
                        <span className="text-red-400/70 break-all">
                          {liveInfo.error}
                        </span>
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
                  {Object.keys(server.env).map((k) => (
                    <span
                      key={k}
                      className="font-mono text-muted-foreground/60 mr-2"
                    >
                      {k}=***
                    </span>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onTest}
                  className="text-[10px] h-6 px-2 text-muted-foreground/60"
                >
                  <RefreshCw className="h-2.5 w-2.5 mr-1" />
                  Test
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const config = {
                      command: server.command,
                      args: server.args,
                      env: server.env,
                    };
                    navigator.clipboard.writeText(
                      JSON.stringify({ [server.name]: config }, null, 2)
                    );
                  }}
                  className="text-[10px] h-6 px-2 text-muted-foreground/60"
                >
                  <Copy className="h-2.5 w-2.5 mr-1" />
                  Copy JSON
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="text-[10px] h-6 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                >
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

// ─── ServerList ───────────────────────────────────────────────────────────────

export function ServerList({
  servers,
  loading,
  expandedServer,
  onToggleExpand,
  onRemove,
  onTest,
  onImportClaudeDesktop,
  liveStatus,
}: {
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
        <p className="text-sm text-muted-foreground/50">
          No MCP servers configured
        </p>
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onImportClaudeDesktop}
            className="text-xs"
          >
            <Download className="h-3 w-3 mr-1" />
            Import from Claude Desktop
          </Button>
        </div>
      </div>
    );
  }

  const grouped = {
    user: servers.filter((s) => s.scope === "user"),
    project: servers.filter((s) => s.scope === "project"),
    local: servers.filter((s) => s.scope === "local"),
  };

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([scope, scopeServers]) => {
        if (scopeServers.length === 0) return null;
        return (
          <div key={scope}>
            <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/40 mb-1.5 px-1">
              {scope === "user"
                ? "Global (all projects)"
                : scope === "project"
                ? "Project (.mcp.json)"
                : "Session-local"}
            </h3>
            <div className="space-y-1">
              {scopeServers.map((server) => (
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
        <Button
          variant="ghost"
          size="sm"
          onClick={onImportClaudeDesktop}
          className="text-xs text-muted-foreground/50"
        >
          <Download className="h-3 w-3 mr-1" />
          Import from Claude Desktop
        </Button>
      </div>

      {/* Connection help */}
      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/70 mt-3">
        <p className="font-medium text-blue-300/90 mb-1">
          How MCP servers connect
        </p>
        <ul className="space-y-0.5 text-blue-300/60">
          <li>Servers connect automatically when you start a new session.</li>
          <li>Stdio servers (npx, node) are launched as child processes.</li>
          <li>SSE servers connect to the URL you provide.</li>
          <li>
            If a server fails, check the error message and verify the command
            works in your terminal.
          </li>
          <li>Refresh this page to see updated connection status.</li>
        </ul>
      </div>
    </div>
  );
}
