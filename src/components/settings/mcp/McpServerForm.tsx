/**
 * McpServerForm — the "Add MCP Server" form, extracted from MCPSettings.
 */

import { useState } from "react";
import { Plus, Terminal, Globe, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function McpServerForm({
  onAdded,
  onCancel,
  setToast,
}: {
  onAdded: () => void;
  onCancel: () => void;
  setToast: (t: { message: string; type: "success" | "error" }) => void;
}) {
  const [transport, setTransport] = useState<"stdio" | "sse">("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [scope, setScope] = useState<"user" | "project" | "local">("user");
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>(
    []
  );
  const [saving, setSaving] = useState(false);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonInput, setJsonInput] = useState("");

  const handleSave = async () => {
    if (jsonMode) {
      if (!name.trim() || !jsonInput.trim()) return;
      try {
        setSaving(true);
        await api.mcpAddJson(name.trim(), jsonInput.trim(), scope);
        setToast({ message: `Added "${name}"`, type: "success" });
        onAdded();
      } catch {
        setToast({
          message: "Failed to add server from JSON",
          type: "error",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!name.trim()) return;
    if (transport === "stdio" && !command.trim()) return;
    if (transport === "sse" && !url.trim()) return;

    try {
      setSaving(true);
      const envObj = envVars.reduce((acc, { key, value }) => {
        if (key.trim()) acc[key.trim()] = value;
        return acc;
      }, {} as Record<string, string>);

      await api.mcpAdd(
        name.trim(),
        transport,
        transport === "stdio" ? command.trim() : undefined,
        transport === "stdio" ? args.split(/\s+/).filter(Boolean) : [],
        envObj,
        transport === "sse" ? url.trim() : undefined,
        scope
      );
      setToast({ message: `Added "${name}"`, type: "success" });
      onAdded();
    } catch {
      setToast({ message: "Failed to add server", type: "error" });
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
            <input
              type="checkbox"
              checked={jsonMode}
              onChange={(e) => setJsonMode(e.target.checked)}
              className="rounded"
            />
            JSON mode
          </label>
        </div>
      </div>

      {/* Name + Scope */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">
            Server Name
          </Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-server"
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Scope</Label>
          <div className="flex gap-1">
            {(["user", "project", "local"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScope(s)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded text-[10px] font-medium border transition-all",
                  scope === s
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground/50 hover:border-border/50"
                )}
              >
                {s === "user" ? "Global" : s === "project" ? "Project" : "Local"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {jsonMode ? (
        /* JSON input */
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">
            Server JSON Config
          </Label>
          <textarea
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            placeholder={
              '{\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"],\n  "env": {}\n}'
            }
            className="w-full h-32 px-3 py-2 rounded-md border border-border/30 bg-background text-xs font-mono resize-none focus:border-primary/50 focus:outline-none"
          />
        </div>
      ) : (
        <>
          {/* Transport */}
          <div className="space-y-1.5">
            <Label className="text-[11px] text-muted-foreground/60">
              Transport
            </Label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setTransport("stdio")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-all",
                  transport === "stdio"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                    : "border-border/30 text-muted-foreground/50"
                )}
              >
                <Terminal className="h-3 w-3" />
                Stdio (command)
              </button>
              <button
                onClick={() => setTransport("sse")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs transition-all",
                  transport === "sse"
                    ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                    : "border-border/30 text-muted-foreground/50"
                )}
              >
                <Globe className="h-3 w-3" />
                SSE (HTTP)
              </button>
            </div>
          </div>

          {/* Stdio fields */}
          {transport === "stdio" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground/60">
                  Command
                </Label>
                <Input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="npx"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground/60">
                  Arguments (space-separated)
                </Label>
                <Input
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                  placeholder="-y @modelcontextprotocol/server-filesystem /path"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          )}

          {/* SSE fields */}
          {transport === "sse" && (
            <div className="space-y-1.5">
              <Label className="text-[11px] text-muted-foreground/60">
                Server URL
              </Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:3001/sse"
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {/* Env vars */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] text-muted-foreground/60">
                Environment Variables
              </Label>
              <button
                onClick={() =>
                  setEnvVars([...envVars, { key: "", value: "" }])
                }
                className="text-[10px] text-primary/60 hover:text-primary"
              >
                + Add
              </button>
            </div>
            {envVars.map((ev, i) => (
              <div key={i} className="flex gap-1.5 items-center">
                <Input
                  value={ev.key}
                  onChange={(e) => {
                    const n = [...envVars];
                    n[i].key = e.target.value;
                    setEnvVars(n);
                  }}
                  placeholder="KEY"
                  className="h-7 text-[10px] font-mono flex-1"
                />
                <span className="text-muted-foreground/30 text-xs">=</span>
                <Input
                  value={ev.value}
                  onChange={(e) => {
                    const n = [...envVars];
                    n[i].value = e.target.value;
                    setEnvVars(n);
                  }}
                  placeholder="value"
                  type="password"
                  className="h-7 text-[10px] font-mono flex-1"
                />
                <button
                  onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))}
                  className="text-red-400/40 hover:text-red-400 p-0.5"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <Button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          size="sm"
          className="text-xs"
        >
          {saving ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Add Server
        </Button>
        <Button
          variant="ghost"
          onClick={onCancel}
          size="sm"
          className="text-xs text-muted-foreground"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
