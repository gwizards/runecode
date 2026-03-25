/**
 * MCPSettings — orchestrator for MCP server management.
 *
 * Delegates rendering to:
 *  - McpServerList  (server list, recommended strip, directory browse)
 *  - McpServerForm  (add server form)
 */

import { useState, useEffect } from "react";
import { applyStartupToken } from "@/lib/startupToken";
import { motion, AnimatePresence } from "motion/react";
import { Plug, Plus, Search, RefreshCw, AlertCircle } from "lucide-react";
import { api, type MCPServer } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ServerList,
  RecommendedServers,
  MCPDirectory,
} from "./mcp/McpServerList";
import { McpServerForm } from "./mcp/McpServerForm";

type ViewMode = "list" | "add" | "browse";

interface MCPLiveStatus {
  name: string;
  status?: string;
  serverInfo?: { name: string; version: string };
  error?: string;
  tools?: Array<{ name: string; description?: string }>;
}

export function MCPSettings() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [expandedServer, setExpandedServer] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<Map<string, MCPLiveStatus>>(new Map());

  const loadServers = async () => {
    try {
      setLoading(true);
      const result = await api.mcpList();
      setServers(result);
      setError(null);
    } catch {
      setError("Failed to load MCP servers");
      setServers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLiveStatus = async () => {
    try {
      const res = await fetch("/api/mcp/status", { headers: applyStartupToken({}) });
      if (res.ok) {
        const data = await res.json();
        const statusMap = new Map<string, MCPLiveStatus>();
        if (Array.isArray(data)) {
          (data as MCPLiveStatus[]).forEach((s) => statusMap.set(s.name, s));
        }
        setLiveStatus(statusMap);
      }
    } catch (err) {
      console.error("[MCPSettings] Failed to load MCP server status:", err);
    }
  };

  useEffect(() => {
    loadServers();
    loadLiveStatus();
  }, []);

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
      setToast({ message: `Removed "${name}"`, type: "success" });
      loadServers();
    } catch {
      setToast({ message: `Failed to remove "${name}"`, type: "error" });
    }
  };

  const handleTest = async (name: string) => {
    try {
      await api.mcpTestConnection(name);
      setToast({ message: `"${name}" is reachable`, type: "success" });
    } catch {
      setToast({
        message: `"${name}" connection failed`,
        type: "error",
      });
    }
  };

  const handleImportClaudeDesktop = async () => {
    try {
      const result = await api.mcpAddFromClaudeDesktop("user");
      setToast({
        message: `Imported ${result.imported_count} servers`,
        type: "success",
      });
      loadServers();
    } catch {
      setToast({
        message: "Failed to import from Claude Desktop",
        type: "error",
      });
    }
  };

  const connectedCount =
    Array.from(liveStatus.values()).filter((s) => s.status === "connected")
      .length || servers.filter((s) => s.status?.running).length;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Plug className="w-5 h-5 text-blue-400" />
          MCP Servers
        </h2>
        <p className="text-sm text-muted-foreground">
          Manage Model Context Protocol servers that extend Claude's capabilities
          with custom tools, data sources, and integrations.
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
          variant={viewMode === "list" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("list")}
          className="text-xs"
        >
          My Servers
        </Button>
        <Button
          variant={viewMode === "add" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("add")}
          className="text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Server
        </Button>
        <Button
          variant={viewMode === "browse" ? "default" : "outline"}
          size="sm"
          onClick={() => setViewMode("browse")}
          className="text-xs"
        >
          <Search className="h-3 w-3 mr-1" />
          Browse Directory
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            loadServers();
            loadLiveStatus();
          }}
          className="text-xs text-muted-foreground"
        >
          <RefreshCw
            className={cn("h-3 w-3 mr-1", loading && "animate-spin")}
          />
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
      {viewMode === "list" && (
        <>
          <RecommendedServers
            installedNames={new Set(servers.map((s) => s.name))}
            onInstalled={() => {
              loadServers();
              loadLiveStatus();
            }}
            setToast={setToast}
          />
          <ServerList
            servers={servers}
            loading={loading}
            expandedServer={expandedServer}
            onToggleExpand={(name) =>
              setExpandedServer(expandedServer === name ? null : name)
            }
            onRemove={handleRemove}
            onTest={handleTest}
            onImportClaudeDesktop={handleImportClaudeDesktop}
            liveStatus={liveStatus}
          />
        </>
      )}

      {viewMode === "add" && (
        <McpServerForm
          onAdded={() => {
            loadServers();
            setViewMode("list");
          }}
          onCancel={() => setViewMode("list")}
          setToast={setToast}
        />
      )}

      {viewMode === "browse" && (
        <MCPDirectory
          installedNames={new Set(servers.map((s) => s.name))}
          onInstall={(name) => {
            loadServers();
            setViewMode("list");
            setToast({
              message: `Added "${name}" from directory`,
              type: "success",
            });
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
              "fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-xs font-medium shadow-lg",
              toast.type === "success"
                ? "bg-emerald-500/90 text-white"
                : "bg-red-500/90 text-white"
            )}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
