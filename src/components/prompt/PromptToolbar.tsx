/**
 * PromptToolbar — the right-side toolbar row for FloatingPromptInput.
 *
 * Contains:
 *  - Orchestration mode buttons (Sub-Agents, Team)
 *  - Environment selector (when remote envs are configured)
 *  - Config Pill + Config Panel
 *  - Timeline button
 */

import React from "react";
import { AnimatePresence } from "motion/react";
import { Bot, Users, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { TooltipSimple } from "@/components/ui/tooltip-modern";
import { Button } from "@/components/ui/button";
import { ConfigPill } from "@/components/ConfigPill";
import { ConfigPanel } from "@/components/ConfigPanel";
import type { OrchestrationMode } from "./PromptAttachments";
import type { RemoteEnvironment } from "@/components/settings/EnvironmentsSettings";

interface PromptToolbarProps {
  orchestrationMode: OrchestrationMode;
  setOrchestrationMode: (mode: OrchestrationMode) => void;
  remoteEnvironments: RemoteEnvironment[];
  selectedEnvId: string | null;
  setSelectedEnvId: (id: string | null) => void;
  selectedEnv: RemoteEnvironment | null;
  configPanelOpen: boolean;
  setConfigPanelOpen: (open: boolean) => void;
  checkpointCount: number;
  sessionId?: string;
  projectId?: string;
  projectPath?: string;
}

export const PromptToolbar: React.FC<PromptToolbarProps> = ({
  orchestrationMode,
  setOrchestrationMode,
  remoteEnvironments,
  selectedEnvId,
  setSelectedEnvId,
  selectedEnv,
  configPanelOpen,
  setConfigPanelOpen,
  checkpointCount,
  sessionId,
  projectId,
  projectPath,
}) => (
  <>
    {/* Orchestration mode buttons */}
    <div className="flex items-center gap-0.5 shrink-0">
      <TooltipSimple content="Sub-Agents — parallel execution (~3-5x tokens)" side="top">
        <button
          onClick={() =>
            setOrchestrationMode(orchestrationMode === "subagents" ? "normal" : "subagents")
          }
          className={cn(
            "p-1.5 rounded-md transition-all",
            orchestrationMode === "subagents"
              ? "bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30"
              : "text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30"
          )}
        >
          <Bot className="h-3.5 w-3.5" />
        </button>
      </TooltipSimple>
      <TooltipSimple content="Team — coordinated agents (~5-10x tokens)" side="top">
        <button
          onClick={() =>
            setOrchestrationMode(orchestrationMode === "team" ? "normal" : "team")
          }
          className={cn(
            "p-1.5 rounded-md transition-all",
            orchestrationMode === "team"
              ? "bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30"
              : "text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30"
          )}
        >
          <Users className="h-3.5 w-3.5" />
        </button>
      </TooltipSimple>
    </div>

    {/* Environment selector */}
    {remoteEnvironments.length > 0 && (
      <TooltipSimple
        content={selectedEnv ? `Running on: ${selectedEnv.name}` : "Running locally"}
        side="top"
      >
        <select
          value={selectedEnvId || ""}
          onChange={(e) => setSelectedEnvId(e.target.value || null)}
          className={cn(
            "h-8 px-2 rounded-md border text-[10px] font-medium bg-transparent transition-all appearance-none cursor-pointer",
            selectedEnvId
              ? "border-purple-500/30 text-purple-400 bg-purple-500/5"
              : "border-border/30 text-muted-foreground/50"
          )}
          style={{ minWidth: "70px" }}
        >
          <option value="">Local</option>
          {remoteEnvironments.map((env) => (
            <option key={env.id} value={env.id}>
              [{env.type.toUpperCase()}] {env.name}
            </option>
          ))}
        </select>
      </TooltipSimple>
    )}

    {/* Config Pill */}
    <div className="relative config-panel-container shrink-0">
      <ConfigPill
        onClick={() => setConfigPanelOpen(!configPanelOpen)}
        isOpen={configPanelOpen}
        checkpointCount={checkpointCount}
      />
      <AnimatePresence>
        {configPanelOpen && (
          <ConfigPanel
            onClose={() => setConfigPanelOpen(false)}
            sessionId={sessionId}
            projectId={projectId}
            projectPath={projectPath}
          />
        )}
      </AnimatePresence>
    </div>

    {/* Timeline button */}
    <TooltipSimple content="Rewind Timeline" side="top">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => window.dispatchEvent(new Event("runecode:open-timeline"))}
        className="h-9 w-9 shrink-0"
        style={{ color: "var(--color-text-muted)" }}
      >
        <GitBranch className="h-4 w-4" />
      </Button>
    </TooltipSimple>
  </>
);
