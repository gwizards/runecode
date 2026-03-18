import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  ArrowDown,
  Play,
  StopCircle,
  Terminal,
  AlertCircle,
  Loader2,
  Copy,
  ChevronDown,
  Maximize2,
  X,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover } from "@/components/ui/popover";
import { type Agent } from "@/lib/api";
import { initAgentSession, interruptSession, closeSessionSocket } from "@/lib/apiAdapter";
import { cn } from "@/lib/utils";
import { StreamMessage } from "./StreamMessage";
import { ExecutionControlBar } from "./ExecutionControlBar";
import { ErrorBoundary } from "./ErrorBoundary";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { useTrackEvent, useComponentMetrics, useFeatureAdoptionTracking } from "@/hooks";
import { useTabState } from "@/hooks/useTabState";

interface AgentExecutionProps {
  agent: Agent;
  projectPath?: string;
  tabId?: string;
  onBack: () => void;
  className?: string;
}

export interface ClaudeStreamMessage {
  type: "system" | "assistant" | "user" | "result" | "summary" | "start" | "partial" | "response" | "error" | "output" | "session_info" | "rate_limit_event";
  subtype?: string;
  session_id?: string;
  project_id?: string;
  uuid?: string;
  message?: {
    role?: "user" | "assistant";
    content?: any[];
    model?: string;
    id?: string;
    type?: string;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    stop_reason?: string | null;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  tool_calls?: Array<{
    content?: string;
    partial_tool_call_index?: number;
    accumulated_content?: string;
    [key: string]: any;
  }>;
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  stop_reason?: string;
  rate_limit_info?: {
    status: string;
    resetsAt?: number;
    rateLimitType?: string;
  };
  claude_code_version?: string;
  model?: string;
  cwd?: string;
  tools?: string[];
  [key: string]: any;
}

export const AgentExecution: React.FC<AgentExecutionProps> = ({
  agent,
  projectPath: initialProjectPath,
  tabId,
  onBack,
  className,
}) => {
  const [projectPath] = useState(initialProjectPath || "");
  const [task, setTask] = useState("");
  const [model, setModel] = useState(agent.model || "sonnet");
  const [isRunning, setIsRunning] = useState(false);
  const [permissionMode, setPermissionMode] = useState(agent.permissionMode || "default");
  const [isolation, setIsolation] = useState(agent.isolation === 'worktree');
  const [runInBackground, setRunInBackground] = useState(agent.background || false);

  const { updateTabStatus } = useTabState();
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);

  const trackEvent = useTrackEvent();
  useComponentMetrics('AgentExecution');
  const agentFeatureTracking = useFeatureAdoptionTracking(`agent_${agent.name || 'custom'}`);

  const isIMEComposingRef = useRef(false);

  const [executionStartTime, setExecutionStartTime] = useState<number | null>(null);
  const [totalTokens, setTotalTokens] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [scrollLocked, setScrollLocked] = useState(true);
  const [isFullscreenModalOpen, setIsFullscreenModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fullscreenScrollRef = useRef<HTMLDivElement>(null);
  const fullscreenMessagesEndRef = useRef<HTMLDivElement>(null);
  const elapsedTimeIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionIdRef = useRef<string | null>(null);

  // Filter out non-displayable messages
  const displayableMessages = React.useMemo(() => {
    return messages.filter((message, index) => {
      if (message.isMeta && !message.leafUuid && !message.summary) return false;
      // Filter out SDK control messages (permission requests, keep-alive, etc.)
      const controlTypes = ['control_request', 'control_response', 'control_cancel', 'keep_alive'];
      if (controlTypes.includes(message.type)) return false;
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;
        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) return false;
        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") { hasVisibleContent = true; break; }
            else if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                for (let i = index - 1; i >= 0; i--) {
                  const prevMsg = messages[i];
                  if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                    const toolUse = prevMsg.message.content.find((c: any) =>
                      c.type === 'tool_use' && c.id === content.tool_use_id
                    );
                    if (toolUse) {
                      const toolName = toolUse.name?.toLowerCase();
                      const toolsWithWidgets = ['task', 'edit', 'multiedit', 'todowrite', 'ls', 'read', 'glob', 'bash', 'write', 'grep'];
                      if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) willBeSkipped = true;
                      break;
                    }
                  }
                }
              }
              if (!willBeSkipped) { hasVisibleContent = true; break; }
            }
          }
          if (!hasVisibleContent) return false;
        }
      }
      return true;
    });
  }, [messages]);

  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  const fullscreenRowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => fullscreenScrollRef.current,
    estimateSize: () => 150,
    overscan: 5,
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current);
      if (connectionIdRef.current) closeSessionSocket(connectionIdRef.current);
    };
  }, []);

  const isAtBottom = () => {
    const container = isFullscreenModalOpen ? fullscreenScrollRef.current : scrollContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      return scrollHeight - scrollTop - clientHeight < 80;
    }
    return true;
  };

  useEffect(() => {
    if (displayableMessages.length === 0) return;
    if (!scrollLocked) return;
    // Use 'auto' not 'smooth' — smooth can be interrupted by resize/rAF
    if (isFullscreenModalOpen) {
      fullscreenRowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: "end", behavior: "auto" });
    } else {
      rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: "end", behavior: "auto" });
    }
    // Double-tap: also scrollTo scrollHeight after virtualizer settles
    requestAnimationFrame(() => {
      const container = isFullscreenModalOpen ? fullscreenScrollRef.current : scrollContainerRef.current;
      if (container && scrollLocked) {
        container.scrollTop = container.scrollHeight;
      }
    });
  }, [displayableMessages.length, scrollLocked, isFullscreenModalOpen, rowVirtualizer, fullscreenRowVirtualizer]);

  useEffect(() => {
    if (isRunning && executionStartTime) {
      elapsedTimeIntervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - executionStartTime) / 1000));
      }, 100);
    } else {
      if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current);
    }
    return () => {
      if (elapsedTimeIntervalRef.current) clearInterval(elapsedTimeIntervalRef.current);
    };
  }, [isRunning, executionStartTime]);

  useEffect(() => {
    const tokens = messages.reduce((total, msg) => {
      if (msg.message?.usage) return total + msg.message.usage.input_tokens + msg.message.usage.output_tokens;
      if (msg.usage) return total + msg.usage.input_tokens + msg.usage.output_tokens;
      return total;
    }, 0);
    setTotalTokens(tokens);
  }, [messages]);

  // Stable event handler refs — avoids stale closures and guarantees
  // the same function reference is used for add/remove.
  const executionStartTimeRef = useRef<number | null>(null);
  const listenersAttachedRef = useRef(false);

  const handleClaudeOutput = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (!detail) return;
    setRawJsonlOutput(prev => [...prev, JSON.stringify(detail)]);
    setMessages(prev => [...prev, detail as ClaudeStreamMessage]);
  }, []);

  const handleClaudeComplete = useCallback(() => {
    setIsRunning(false);
    setExecutionStartTime(null);
    if (tabId) updateTabStatus(tabId, 'complete');
    const duration = executionStartTimeRef.current ? Date.now() - executionStartTimeRef.current : undefined;
    trackEvent.agentExecuted(agent.name || 'custom', true, agent.name, duration);
    removeListeners();
  }, [tabId, agent.name, trackEvent, updateTabStatus]);

  const handleClaudeError = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setError(typeof detail === 'string' ? detail : 'Agent execution error');
    trackEvent.agentError({
      error_type: 'runtime_error',
      error_stage: 'execution',
      retry_count: 0,
      agent_type: agent.name || 'custom',
    });
  }, [agent.name, trackEvent]);

  // Store stable refs so add/remove always use the same instances
  const handlersRef = useRef({ output: handleClaudeOutput, complete: handleClaudeComplete, error: handleClaudeError });
  handlersRef.current = { output: handleClaudeOutput, complete: handleClaudeComplete, error: handleClaudeError };

  const stableOutput = useCallback((e: Event) => handlersRef.current.output(e), []);
  const stableComplete = useCallback(() => handlersRef.current.complete(), []);
  const stableError = useCallback((e: Event) => handlersRef.current.error(e), []);

  const addListeners = useCallback(() => {
    if (listenersAttachedRef.current) return;
    window.addEventListener('claude-output', stableOutput);
    window.addEventListener('claude-complete', stableComplete);
    window.addEventListener('claude-error', stableError);
    listenersAttachedRef.current = true;
  }, [stableOutput, stableComplete, stableError]);

  const removeListeners = useCallback(() => {
    window.removeEventListener('claude-output', stableOutput);
    window.removeEventListener('claude-complete', stableComplete);
    window.removeEventListener('claude-error', stableError);
    listenersAttachedRef.current = false;
  }, [stableOutput, stableComplete, stableError]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { removeListeners(); };
  }, [removeListeners]);

  const handleExecute = async () => {
    try {
      setIsRunning(true);
      if (tabId) updateTabStatus(tabId, 'running');
      const startTime = Date.now();
      setExecutionStartTime(startTime);
      executionStartTimeRef.current = startTime;
      setMessages([]);
      setRawJsonlOutput([]);
      setError(null);

      // Register event listeners before starting session
      addListeners();

      // Start agent session via WebSocket
      const connId = await initAgentSession({
        agentName: agent.name,
        projectPath,
        prompt: task,
        model,
        permissionMode,
      });
      connectionIdRef.current = connId;

      trackEvent.agentStarted({
        agent_type: agent.name || 'custom',
        agent_name: agent.name,
        has_custom_prompt: !!task.trim(),
      });
      agentFeatureTracking.trackUsage();
    } catch (err) {
      // Remove listeners on error to prevent leaks
      removeListeners();
      console.error("Failed to execute agent:", err);
      setIsRunning(false);
      setExecutionStartTime(null);
      executionStartTimeRef.current = null;
      if (tabId) updateTabStatus(tabId, 'error');
      setMessages(prev => [...prev, {
        type: "result",
        subtype: "error",
        is_error: true,
        result: `Failed to execute agent: ${err instanceof Error ? err.message : 'Unknown error'}`,
        duration_ms: 0,
        usage: { input_tokens: 0, output_tokens: 0 },
      }]);
    }
  };

  const handleStop = async () => {
    const connId = connectionIdRef.current;
    if (connId) {
      interruptSession(connId);
    }
    setIsRunning(false);
    setExecutionStartTime(null);
    executionStartTimeRef.current = null;
    if (tabId) updateTabStatus(tabId, 'idle');
    removeListeners();
  };

  const handleCompositionStart = () => { isIMEComposingRef.current = true; };
  const handleCompositionEnd = () => { setTimeout(() => { isIMEComposingRef.current = false; }, 0); };

  const handleBackWithConfirmation = () => {
    if (isRunning) {
      const shouldLeave = window.confirm(
        "An agent is currently running. If you navigate away, the agent will continue running in the background.\n\nDo you want to continue?"
      );
      if (!shouldLeave) return;
    }
    if (connectionIdRef.current && !isRunning) {
      closeSessionSocket(connectionIdRef.current);
    }
    onBack();
  };

  const handleCopyAsJsonl = async () => {
    await navigator.clipboard.writeText(rawJsonlOutput.join('\n'));
    setCopyPopoverOpen(false);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Agent Execution: ${agent.name}\n\n`;
    markdown += `**Task:** ${task}\n`;
    markdown += `**Model:** ${model === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n---\n\n`;

    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n`;
        markdown += `- Session ID: \`${msg.session_id || 'N/A'}\`\n`;
        markdown += `- Model: \`${msg.model || 'default'}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") markdown += `${content.text}\n\n`;
          else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") markdown += `${content.text}\n\n`;
          else if (content.type === "tool_result") markdown += `### Tool Result\n\n\`\`\`\n${content.content}\n\`\`\`\n\n`;
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) markdown += `${msg.result}\n\n`;
        if (msg.cost_usd !== undefined) markdown += `- **Cost:** $${msg.cost_usd.toFixed(4)} USD\n`;
        if (msg.duration_ms !== undefined) markdown += `- **Duration:** ${(msg.duration_ms / 1000).toFixed(2)}s\n`;
        if (msg.num_turns !== undefined) markdown += `- **Turns:** ${msg.num_turns}\n`;
        if (msg.usage) {
          const total = msg.usage.input_tokens + msg.usage.output_tokens;
          markdown += `- **Total Tokens:** ${total} (${msg.usage.input_tokens} in, ${msg.usage.output_tokens} out)\n`;
        }
      }
    }
    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
  };

  const scrollRafRef = useRef(0);
  const scrollHandler = () => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const atBottom = isAtBottom();
      if (atBottom && !scrollLocked) {
        setScrollLocked(true); // Re-lock when user scrolls to bottom
      } else if (!atBottom && scrollLocked) {
        setScrollLocked(false); // Unlock when user scrolls up
      }
    });
  };

  const renderVirtualList = (virtualizer: Virtualizer<HTMLDivElement, Element>) => (
    <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
      <AnimatePresence>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = displayableMessages[virtualItem.index];
          return (
            <motion.div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={(el) => { if (el) virtualizer.measureElement(el); }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-x-4 pb-4"
              style={{ top: virtualItem.start }}
            >
              <ErrorBoundary>
                <StreamMessage message={message} streamMessages={messages} />
              </ErrorBoundary>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="p-6 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={handleBackWithConfirmation} className="h-9 w-9 -ml-2" title="Back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-heading-1">{agent.name}</h1>
                <p className="mt-1 text-body-small text-muted-foreground">
                  {isRunning ? 'Running' : messages.length > 0 ? 'Complete' : 'Ready'} • {model === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}
                  {agent.description && ` • ${agent.description}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <Button variant="outline" size="default" onClick={() => setIsFullscreenModalOpen(true)}>
                  <Maximize2 className="h-4 w-4 mr-2" />
                  Fullscreen
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Configuration Section */}
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
                    onClick={() => !isRunning && setModel(m)}
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
                    onChange={(e) => setIsolation(e.target.checked)}
                    className="rounded border-border w-3 h-3"
                  />
                  <span>Worktree</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={runInBackground}
                    onChange={(e) => setRunInBackground(e.target.checked)}
                    className="rounded border-border w-3 h-3"
                  />
                  <span>Background</span>
                </label>
                <select
                  value={permissionMode}
                  onChange={(e) => setPermissionMode(e.target.value)}
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
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="What would you like the agent to do?"
                  disabled={isRunning}
                  className="flex-1 h-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isRunning && projectPath && task.trim()) {
                      if (e.nativeEvent.isComposing || isIMEComposingRef.current) return;
                      handleExecute();
                    }
                  }}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                />
                <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                  <Button
                    onClick={isRunning ? handleStop : handleExecute}
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

        {/* Scrollable Output Display */}
        <div className="flex-1 overflow-hidden relative">
          <div className="w-full max-w-5xl mx-auto h-full">
            <div ref={scrollContainerRef} className="h-full overflow-y-auto p-6 space-y-8" onScroll={scrollHandler}>
              <div ref={messagesContainerRef}>
                {messages.length === 0 && !isRunning && (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <Terminal className="h-16 w-16 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Ready to Execute</h3>
                    <p className="text-sm text-muted-foreground">Enter a task to run the agent</p>
                  </div>
                )}
                {isRunning && messages.length === 0 && (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="text-sm text-muted-foreground">Initializing agent...</span>
                    </div>
                  </div>
                )}
                {renderVirtualList(rowVirtualizer)}
                <div ref={messagesEndRef} />
              </div>
            </div>
          </div>
          {/* Scroll control */}
          <AnimatePresence mode="wait">
            {displayableMessages.length > 0 && scrollLocked && (
              <motion.div
                key="locked"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-3 right-3 z-20"
              >
                <button
                  onClick={() => setScrollLocked(false)}
                  title="Auto-scroll on — click to unlock"
                  className="p-1.5 rounded-full text-primary/40 hover:text-primary/70 hover:bg-primary/10 transition-colors"
                >
                  <Lock className="h-3 w-3" />
                </button>
              </motion.div>
            )}
            {displayableMessages.length > 0 && !scrollLocked && (
              <motion.div
                key="unlocked"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-3 right-3 z-20"
              >
                <button
                  onClick={() => {
                    setScrollLocked(true);
                    rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
                    requestAnimationFrame(() => {
                      const el = scrollContainerRef.current;
                      if (el) el.scrollTop = el.scrollHeight;
                    });
                  }}
                  title="Scroll to bottom"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border shadow-lg backdrop-blur-sm bg-primary/15 text-primary border-primary/25 hover:bg-primary/25 transition-all"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  <span>Bottom</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <ExecutionControlBar isExecuting={isRunning} onStop={handleStop} totalTokens={totalTokens} elapsedTime={elapsedTime} />

      {/* Fullscreen Modal */}
      {isFullscreenModalOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{agent.name} - Output</h2>
              {isRunning && (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-600 font-medium">Running</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Popover
                trigger={
                  <Button variant="ghost" size="sm" className="flex items-center gap-2">
                    <Copy className="h-4 w-4" />Copy Output<ChevronDown className="h-3 w-3" />
                  </Button>
                }
                content={
                  <div className="w-44 p-1">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCopyAsJsonl}>Copy as JSONL</Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCopyAsMarkdown}>Copy as Markdown</Button>
                  </div>
                }
                open={copyPopoverOpen}
                onOpenChange={setCopyPopoverOpen}
                align="end"
              />
              <Button variant="ghost" size="sm" onClick={() => setIsFullscreenModalOpen(false)} className="flex items-center gap-2">
                <X className="h-4 w-4" />Close
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-hidden p-6 relative">
            <div ref={fullscreenScrollRef} className="h-full overflow-y-auto space-y-8" onScroll={scrollHandler}>
              {messages.length === 0 && !isRunning && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Terminal className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Ready to Execute</h3>
                  <p className="text-sm text-muted-foreground">Enter a task to run the agent</p>
                </div>
              )}
              {isRunning && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm text-muted-foreground">Initializing agent...</span>
                  </div>
                </div>
              )}
              <div className="relative w-full max-w-5xl mx-auto" style={{ height: `${fullscreenRowVirtualizer.getTotalSize()}px` }}>
                <AnimatePresence>
                  {fullscreenRowVirtualizer.getVirtualItems().map((virtualItem) => {
                    const message = displayableMessages[virtualItem.index];
                    return (
                      <motion.div
                        key={virtualItem.key}
                        data-index={virtualItem.index}
                        ref={(el) => { if (el) fullscreenRowVirtualizer.measureElement(el); }}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className="absolute inset-x-4 pb-4"
                        style={{ top: virtualItem.start }}
                      >
                        <ErrorBoundary>
                          <StreamMessage message={message} streamMessages={messages} />
                        </ErrorBoundary>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
              <div ref={fullscreenMessagesEndRef} />
            </div>
            {/* Scroll control — fullscreen */}
            <AnimatePresence mode="wait">
              {displayableMessages.length > 0 && scrollLocked && (
                <motion.div key="fs-locked" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.12 }} className="absolute bottom-3 right-3 z-20">
                  <button onClick={() => setScrollLocked(false)} title="Auto-scroll on — click to unlock" className="p-1.5 rounded-full text-primary/40 hover:text-primary/70 hover:bg-primary/10 transition-colors">
                    <Lock className="h-3 w-3" />
                  </button>
                </motion.div>
              )}
              {displayableMessages.length > 0 && !scrollLocked && (
                <motion.div key="fs-unlocked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }} className="absolute bottom-3 right-3 z-20">
                  <button
                    onClick={() => {
                      setScrollLocked(true);
                      fullscreenRowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
                      requestAnimationFrame(() => { const el = fullscreenScrollRef.current; if (el) el.scrollTop = el.scrollHeight; });
                    }}
                    title="Scroll to bottom"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border shadow-lg backdrop-blur-sm bg-primary/15 text-primary border-primary/25 hover:bg-primary/25 transition-all"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                    <span>Bottom</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
};
