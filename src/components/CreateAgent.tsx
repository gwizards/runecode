import React, { useState, useMemo } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Save, Loader2, Zap, AlertCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { api, type Agent } from "@/lib/api";
import { cn } from "@/lib/utils";
import MDEditor from "@uiw/react-md-editor";
import { GatewayRecommendation } from "@/integrations/intelligence/GatewayRecommendation";

// Common Claude Code tools for the tools selector
const COMMON_TOOLS = [
  "Bash", "Read", "Write", "Edit", "Glob", "Grep",
  "Agent", "WebSearch", "WebFetch", "NotebookEdit",
];

interface CreateAgentProps {
  agent?: Agent;
  onBack: () => void;
  onAgentCreated: () => void;
  className?: string;
}

export const CreateAgent: React.FC<CreateAgentProps> = ({
  agent,
  onBack,
  onAgentCreated,
  className,
}) => {
  const [name, setName] = useState(agent?.name || "");
  const [description, setDescription] = useState(agent?.description || "");
  const [systemPrompt, setSystemPrompt] = useState(agent?.system_prompt || "");
  const [model, setModel] = useState(agent?.model || "sonnet");
  const [selectedTools, setSelectedTools] = useState<string[]>(agent?.tools || []);
  const [disallowedTools, _setDisallowedTools] = useState<string[]>(agent?.disallowedTools || []);
  const [maxTurns, setMaxTurns] = useState<string>(agent?.maxTurns?.toString() || "");
  const [scope, setScope] = useState<'user' | 'project'>(agent?.scope || 'user');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [permissionMode, setPermissionMode] = useState<string>(agent?.permissionMode || '');
  const [isolation, setIsolation] = useState(agent?.isolation === 'worktree');
  const [runInBackground, setRunInBackground] = useState(agent?.background || false);

  const isEditMode = !!agent;

  // Generate the .md file preview
  const mdPreview = useMemo(() => {
    const lines: string[] = ["---"];
    if (name) lines.push(`name: ${name}`);
    if (description) lines.push(`description: ${description}`);
    if (model) lines.push(`model: ${model}`);
    if (selectedTools.length) lines.push(`tools: [${selectedTools.join(", ")}]`);
    if (disallowedTools.length) lines.push(`disallowedTools: [${disallowedTools.join(", ")}]`);
    if (maxTurns) lines.push(`maxTurns: ${maxTurns}`);
    if (permissionMode) lines.push(`permissionMode: ${permissionMode}`);
    if (isolation) lines.push(`isolation: worktree`);
    if (runInBackground) lines.push(`background: true`);
    lines.push("---", "");
    lines.push(systemPrompt || "");
    return lines.join("\n");
  }, [name, description, model, selectedTools, disallowedTools, maxTurns, permissionMode, isolation, runInBackground, systemPrompt]);

  const toggleTool = (tool: string) => {
    setSelectedTools(prev =>
      prev.includes(tool) ? prev.filter(t => t !== tool) : [...prev, tool]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { setError("Agent name is required"); return; }
    if (!systemPrompt.trim()) { setError("System prompt is required"); return; }

    try {
      setSaving(true);
      setError(null);

      const agentData = {
        name: name.trim(),
        description: description.trim() || undefined,
        model: model || undefined,
        tools: selectedTools.length ? selectedTools : undefined,
        disallowedTools: disallowedTools.length ? disallowedTools : undefined,
        maxTurns: maxTurns ? parseInt(maxTurns, 10) : undefined,
        permissionMode: permissionMode || undefined,
        isolation: isolation ? 'worktree' : undefined,
        background: runInBackground || undefined,
        system_prompt: systemPrompt,
        scope,
      };

      if (isEditMode) {
        await api.updateAgent(agent.name, agentData);
      } else {
        await api.createAgent(agentData);
      }

      onAgentCreated();
    } catch (err) {
      console.error("Failed to save agent:", err);
      setError(isEditMode ? "Failed to update agent" : "Failed to create agent");
      setToast({
        message: isEditMode ? "Failed to update agent" : "Failed to create agent",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    const hasChanges = name !== (agent?.name || "") ||
      description !== (agent?.description || "") ||
      systemPrompt !== (agent?.system_prompt || "") ||
      model !== (agent?.model || "sonnet");
    if (hasChanges && !confirm("You have unsaved changes. Are you sure you want to leave?")) return;
    onBack();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      className={cn("h-full overflow-y-auto bg-background", className)}
    >
      <div className="max-w-6xl mx-auto flex flex-col h-full">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                <Button variant="ghost" size="icon" onClick={handleBack} className="h-9 w-9 -ml-2" title="Back to Agents">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </motion.div>
              <div>
                <h1 className="text-heading-1">{isEditMode ? "Edit Agent" : "Create New Agent"}</h1>
                <p className="mt-1 text-body-small text-muted-foreground">
                  {isEditMode ? "Update your agent's .md configuration" : "Create a native Claude Code agent (.md file)"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                onClick={() => setShowPreview(!showPreview)}
              >
                {showPreview ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
                {showPreview ? "Hide" : "Preview"} .md
              </Button>
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                <Button onClick={handleSave} disabled={saving || !name.trim() || !systemPrompt.trim()} size="default">
                  {saving ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                  ) : (
                    <><Save className="mr-2 h-4 w-4" />Save Agent</>
                  )}
                </Button>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="mx-6 mt-4 p-3 rounded-md bg-destructive/10 border border-destructive/50 flex items-center gap-2"
          >
            <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
            <span className="text-caption text-destructive">{error}</span>
          </motion.div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column — form */}
            <div className="space-y-4">
              {/* Basic Information */}
              <Card className="p-5">
                <h3 className="text-heading-4 mb-4">Basic Information</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-caption text-muted-foreground">Agent Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g., code-reviewer"
                      required
                      className="h-9"
                    />
                    <p className="text-caption text-muted-foreground">
                      Used as the filename: <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : 'agent-name'}.md</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-caption text-muted-foreground">Description</Label>
                    <Input
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A short description of what this agent does"
                      className="h-9"
                    />
                  </div>

                  {/* Scope */}
                  <div className="space-y-2">
                    <Label className="text-caption text-muted-foreground">Scope</Label>
                    <div className="flex gap-2">
                      {(["user", "project"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setScope(s)}
                          className={cn(
                            "flex-1 px-3 py-2 rounded-md border text-sm transition-all",
                            scope === s ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50"
                          )}
                        >
                          {s === "user" ? "User (~/.claude/agents/)" : "Project (.claude/agents/)"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Model & Limits */}
              <Card className="p-5">
                <h3 className="text-heading-4 mb-4">Model & Limits</h3>
                <div className="space-y-2">
                  <Label className="text-caption text-muted-foreground">Model</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    {["sonnet", "opus"].map((m) => (
                      <motion.button
                        key={m}
                        type="button"
                        onClick={() => setModel(m)}
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className={cn(
                          "flex-1 px-4 py-3 rounded-md border transition-all",
                          model === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 hover:bg-accent"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <Zap className={cn("h-4 w-4", model === m ? "text-primary" : "text-muted-foreground")} />
                          <div className="text-left">
                            <div className="text-body-small font-medium">{m === "sonnet" ? "Claude Sonnet" : "Claude Opus"}</div>
                            <div className="text-caption text-muted-foreground">{m === "sonnet" ? "Fast, capable" : "Most powerful"}</div>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  <GatewayRecommendation variant="inline" />
                </div>

                <div className="space-y-2 mt-4">
                  <Label htmlFor="maxTurns" className="text-caption text-muted-foreground">Max Turns (Optional)</Label>
                  <Input
                    id="maxTurns"
                    type="number"
                    value={maxTurns}
                    onChange={(e) => setMaxTurns(e.target.value)}
                    placeholder="e.g., 10"
                    className="h-9 w-32"
                    min={1}
                  />
                </div>
              </Card>

              {/* Tools */}
              <Card className="p-5">
                <h3 className="text-heading-4 mb-4">Allowed Tools</h3>
                <p className="text-caption text-muted-foreground mb-3">
                  Select which tools this agent can use. Leave empty for all tools.
                </p>
                <div className="flex flex-wrap gap-2">
                  {COMMON_TOOLS.map((tool) => (
                    <button
                      key={tool}
                      type="button"
                      onClick={() => toggleTool(tool)}
                      className={cn(
                        "px-3 py-1.5 rounded-md border text-sm transition-all",
                        selectedTools.includes(tool)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 text-muted-foreground"
                      )}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </Card>

              {/* Advanced Options */}
              <Card className="p-5">
                <h3 className="text-heading-4 mb-4">Advanced Options</h3>
                <div className="space-y-4">
                  {/* Permission Mode */}
                  <div className="space-y-2">
                    <Label className="text-caption text-muted-foreground">Permission Mode</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { id: '', label: 'Default' },
                        { id: 'acceptEdits', label: 'Auto-Edit' },
                        { id: 'plan', label: 'Plan Only' },
                        { id: 'bypassPermissions', label: 'Bypass' },
                      ].map(({ id, label }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPermissionMode(id)}
                          className={cn(
                            "px-3 py-1.5 rounded-md border text-sm transition-all",
                            permissionMode === id
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:border-primary/50 text-muted-foreground"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Isolation */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isolation}
                      onChange={(e) => setIsolation(e.target.checked)}
                      className="rounded border-border"
                    />
                    <div>
                      <span className="text-sm font-medium">Worktree Isolation</span>
                      <p className="text-caption text-muted-foreground">Run in an isolated git worktree copy</p>
                    </div>
                  </label>

                  {/* Background */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={runInBackground}
                      onChange={(e) => setRunInBackground(e.target.checked)}
                      className="rounded border-border"
                    />
                    <div>
                      <span className="text-sm font-medium">Background Execution</span>
                      <p className="text-caption text-muted-foreground">Default to running in the background</p>
                    </div>
                  </label>
                </div>
              </Card>
            </div>

            {/* Right column — system prompt + preview */}
            <div className="space-y-4">
              {/* System Prompt */}
              <Card className="p-5">
                <div className="mb-4">
                  <h3 className="text-heading-4 mb-1">System Prompt</h3>
                  <p className="text-caption text-muted-foreground">
                    The markdown body of the agent file — defines its behavior
                  </p>
                </div>
                <div className="rounded-md border border-border overflow-hidden" data-color-mode="dark">
                  <MDEditor
                    value={systemPrompt}
                    onChange={(val) => setSystemPrompt(val || "")}
                    preview="edit"
                    height={350}
                    visibleDragbar={false}
                  />
                </div>
              </Card>

              {/* .md Preview */}
              {showPreview && (
                <Card className="p-5">
                  <h3 className="text-heading-4 mb-4">Generated .md File</h3>
                  <pre className="text-xs font-mono bg-muted/50 rounded-md p-4 overflow-x-auto whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto">
                    {mdPreview}
                  </pre>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>

      <ToastContainer>
        {toast && (
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        )}
      </ToastContainer>
    </motion.div>
  );
};
