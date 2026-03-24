/**
 * McpRecommended — the recommended-servers strip and the full MCP directory.
 */

import { useState } from "react";
import {
  Plug,
  Plus,
  Terminal,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { POPULAR_MCP_SERVERS, type PopularMcpServer } from "./mcpServerData";

// Re-export for consumers that imported from McpServerList
export type { PopularMcpServer } from "./mcpServerData";
export { POPULAR_MCP_SERVERS } from "./mcpServerData";

// ─── RecommendedServers ───────────────────────────────────────────────────────

export function RecommendedServers({
  installedNames,
  onInstalled,
  setToast,
}: {
  installedNames: Set<string>;
  onInstalled: () => void;
  setToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [installing, setInstalling] = useState<string | null>(null);
  const recommended = POPULAR_MCP_SERVERS.filter(
    (s) => s.recommended && !installedNames.has(s.name)
  );

  if (recommended.length === 0) return null;

  const handleInstall = async (server: PopularMcpServer) => {
    try {
      setInstalling(server.name);
      const envObj = server.env || {};
      await api.mcpAdd(
        server.name,
        "stdio",
        server.command,
        server.args,
        envObj,
        undefined,
        "user"
      );
      onInstalled();
      setToast({ message: `Added "${server.name}"`, type: "success" });
    } catch {
      setToast({
        message: `Failed to add "${server.name}"`,
        type: "error",
      });
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
        {recommended.map((server) => (
          <div
            key={server.name}
            className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-primary/15 bg-primary/[0.02] hover:bg-primary/[0.05] transition-colors"
          >
            <Plug className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium">{server.name}</span>
                {server.tokens && (
                  <span className="text-[8px] text-cyan-400/40 font-mono">
                    {server.tokens}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground/50 truncate">
                {server.description}
              </p>
            </div>
            {server.env && Object.keys(server.env).length > 0 && (
              <span className="text-[8px] px-1 py-0.5 rounded bg-amber-500/10 text-amber-400/50 flex-shrink-0">
                API key
              </span>
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

// ─── MCPDirectory ─────────────────────────────────────────────────────────────

export function MCPDirectory({
  installedNames,
  onInstall,
  setToast,
}: {
  installedNames: Set<string>;
  onInstall: (name: string, config: any) => void;
  setToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [search, setSearch] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());

  const filtered = POPULAR_MCP_SERVERS.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleInstall = async (server: PopularMcpServer) => {
    try {
      setInstalling(server.name);
      const envObj = server.env || {};
      await api.mcpAdd(
        server.name,
        "stdio",
        server.command,
        server.args,
        envObj,
        undefined,
        "user"
      );
      setJustAdded((prev) => new Set([...prev, server.name]));
      onInstall(server.name, server);
    } catch {
      setToast({
        message: `Failed to add "${server.name}"`,
        type: "error",
      });
    } finally {
      setInstalling(null);
    }
  };

  const isAdded = (name: string) =>
    installedNames.has(name) || justAdded.has(name);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-1">MCP Server Directory</h3>
        <p className="text-[11px] text-muted-foreground/60">
          Extend Claude's capabilities with MCP servers. Each server adds tools
          that Claude can use in terminal sessions. Token estimates show
          approximate context usage per tool call — more tokens means more of
          your context window is used.
        </p>
        <p className="text-[10px] text-emerald-400/50 mt-1">
          Saved to{" "}
          <code className="font-mono bg-muted px-0.5 rounded">
            ~/.claude.json
          </code>{" "}
          — works in all Claude Code sessions.
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
        {filtered.map((server) => (
          <div
            key={server.name}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              server.recommended
                ? "border-primary/20 bg-primary/[0.02] hover:bg-primary/[0.05]"
                : "border-border/20 bg-muted/5 hover:bg-muted/10"
            )}
          >
            <Terminal
              className={cn(
                "h-4 w-4 mt-0.5 flex-shrink-0",
                server.recommended ? "text-primary/60" : "text-amber-400/50"
              )}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium">{server.name}</span>
                {server.recommended && (
                  <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase tracking-wider">
                    Recommended
                  </span>
                )}
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/40">
                  {server.category}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                {server.description}
              </p>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-[9px] font-mono text-muted-foreground/30">
                  {server.package}
                </span>
                {server.tokens && (
                  <span
                    className="text-[9px] text-cyan-400/40"
                    title="Estimated tokens per tool call"
                  >
                    {server.tokens}
                  </span>
                )}
              </div>
              {server.env && Object.keys(server.env).length > 0 && (
                <p className="text-[9px] text-amber-400/50 mt-0.5">
                  Requires: {Object.keys(server.env).join(", ")}
                </p>
              )}
              {server.note && (
                <a
                  href={server.note}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-primary/40 hover:text-primary/60 mt-0.5 inline-flex items-center gap-0.5"
                >
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
        <p className="text-center text-xs text-muted-foreground/40 py-6">
          No servers match "{search}"
        </p>
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
