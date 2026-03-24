import React, { useRef } from "react";
import { motion } from "motion/react";
import {
  Play,
  StopCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface AgentControlsProps {
  task: string;
  onTaskChange: (task: string) => void;
  model: string;
  onModelChange: (model: string) => void;
  isRunning: boolean;
  projectPath: string;
  error: string | null;
  isolation: boolean;
  onIsolationChange: (v: boolean) => void;
  runInBackground: boolean;
  onRunInBackgroundChange: (v: boolean) => void;
  permissionMode: string;
  onPermissionModeChange: (v: string) => void;
  onExecute: () => void;
  onStop: () => void;
}

/**
 * Configuration and execution controls for an agent session.
 * Includes model selection, runtime options, task input, and start/stop buttons.
 */
export const AgentControls: React.FC<AgentControlsProps> = ({
  task,
  onTaskChange,
  model,
  onModelChange,
  isRunning,
  projectPath,
  error,
  isolation,
  onIsolationChange,
  runInBackground,
  onRunInBackgroundChange,
  permissionMode,
  onPermissionModeChange,
  onExecute,
  onStop,
}) => {
  const isIMEComposingRef = useRef(false);

  const handleCompositionStart = () => { isIMEComposingRef.current = true; };
  const handleCompositionEnd = () => { setTimeout(() => { isIMEComposingRef.current = false; }, 0); };

  return (
    <div className="p-6 border-b border-border">
      <div className="max-w-4xl mx-auto space-y-4">
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="p-3 rounded-md bg-destructive/10 border border-destructive/50 flex items-center gap-2"
          >
            <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
            <span className="text-caption text-destructive">{error}</span>
          </motion.div>
        )}

        {/* Model Selection */}
        <div className="space-y-3">
          <Label className="text-caption text-muted-foreground">Model Selection</Label>
          <div className="flex gap-2">
            {["sonnet", "opus"].map((m) => (
              <motion.button
                key={m}
                type="button"
                onClick={() => !isRunning && onModelChange(m)}
                whileTap={{ scale: 0.97 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  "flex-1 px-4 py-3 rounded-md border transition-all",
                  model === m ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/50 hover:bg-accent",
                  isRunning && "opacity-50 cursor-not-allowed"
                )}
                disabled={isRunning}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-4 h-4 rounded-full border-2 flex items-center justify-center", model === m ? "border-primary" : "border-muted-foreground")}>
                    {model === m && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="text-left">
                    <div className="text-body-small font-medium">{m === "sonnet" ? "Claude Sonnet" : "Claude Opus"}</div>
                    <div className="text-caption text-muted-foreground">{m === "sonnet" ? "Fast, capable" : "Most powerful"}</div>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Runtime Options */}
        {!isRunning && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={isolation}
                onChange={(e) => onIsolationChange(e.target.checked)}
                className="rounded border-border w-3 h-3"
              />
              <span>Worktree</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={runInBackground}
                onChange={(e) => onRunInBackgroundChange(e.target.checked)}
                className="rounded border-border w-3 h-3"
              />
              <span>Background</span>
            </label>
            <select
              value={permissionMode}
              onChange={(e) => onPermissionModeChange(e.target.value)}
              className="bg-transparent border border-border/50 rounded px-1.5 py-0.5 text-xs"
            >
              <option value="default">Ask Perms</option>
              <option value="acceptEdits">Auto-Edit</option>
              <option value="plan">Plan Only</option>
            </select>
          </div>
        )}

        {/* Task Input */}
        <div className="space-y-3">
          <Label className="text-caption text-muted-foreground">Task Description</Label>
          <div className="flex gap-2">
            <Input
              value={task}
              onChange={(e) => onTaskChange(e.target.value)}
              placeholder="What would you like the agent to do?"
              disabled={isRunning}
              className="flex-1 h-9"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isRunning && projectPath && task.trim()) {
                  if (e.nativeEvent.isComposing || isIMEComposingRef.current) return;
                  onExecute();
                }
              }}
              onCompositionStart={handleCompositionStart}
              onCompositionEnd={handleCompositionEnd}
            />
            <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
              <Button
                onClick={isRunning ? onStop : onExecute}
                disabled={!projectPath || !task.trim()}
                variant={isRunning ? "destructive" : "default"}
                size="default"
              >
                {isRunning ? (
                  <><StopCircle className="mr-2 h-4 w-4" />Stop</>
                ) : (
                  <><Play className="mr-2 h-4 w-4" />Execute</>
                )}
              </Button>
            </motion.div>
          </div>
          {projectPath && (
            <p className="text-caption text-muted-foreground">
              Working in: <span className="font-mono">{projectPath.split('/').pop() || projectPath}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
