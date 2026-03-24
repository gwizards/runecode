import { useState, useRef, useCallback, useEffect, startTransition } from "react";
import { api, type Session } from "@/lib/api";
import { useSessionConfig } from "@/hooks/useSessionConfig";
import { useTrackEvent, useWorkflowTracking } from "@/hooks";
import { SessionPersistenceService } from "@/services/sessionPersistence";
import { getSelectedEnvironment } from "@/components/FloatingPromptInput";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";

// ---------------------------------------------------------------------------
// Tauri / web-mode event bridge
// ---------------------------------------------------------------------------
let tauriListen: any;
type UnlistenFn = () => void;

try {
  const isRealTauri =
    typeof window !== "undefined" &&
    window.__TAURI__ &&
    !(window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);
  if (isRealTauri) {
    tauriListen = require("@tauri-apps/api/event").listen;
  }
} catch {
  // Tauri APIs not available — web mode
}

const listen =
  tauriListen ||
  ((eventName: string, callback: (event: any) => void) => {
    const handler = (event: any) => callback({ payload: event.detail });
    window.addEventListener(eventName, handler);
    return Promise.resolve(() => window.removeEventListener(eventName, handler));
  });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QueuedPrompt {
  id: string;
  prompt: string;
  model: string;
  thinkingMode?: string;
  effort?: string;
  permissionMode?: string;
}

export interface SessionMetrics {
  firstMessageTime: number | null;
  promptsSent: number;
  toolsExecuted: number;
  toolsFailed: number;
  filesCreated: number;
  filesModified: number;
  filesDeleted: number;
  codeBlocksGenerated: number;
  errorsEncountered: number;
  lastActivityTime: number;
  toolExecutionTimes: number[];
  checkpointCount: number;
  wasResumed: boolean;
  modelChanges: Array<{ from: string; to: string; timestamp: number }>;
}

export interface ClaudeSessionState {
  isLoading: boolean;
  error: string | null;
  claudeSessionId: string | null;
  rawJsonlOutput: string[];
  queuedPrompts: QueuedPrompt[];
  setQueuedPrompts: React.Dispatch<React.SetStateAction<QueuedPrompt[]>>;
  connectionIdRef: React.MutableRefObject<string | null>;
  /** Ref holding the message UUID to resume from after a rewind. */
  resumeAtRef: React.MutableRefObject<string | null>;
  sessionMetrics: React.MutableRefObject<SessionMetrics>;
  /** Sends a prompt; queues it if a session is already running. */
  handleSendPrompt: (
    prompt: string,
    model: string,
    thinkingMode?: string,
    effort?: string,
    permissionMode?: string,
  ) => Promise<void>;
  /** Cancels the running execution and cleans up listeners. */
  handleCancelExecution: () => Promise<void>;
  /** Loads history for a resumed session and reconnects if it is still live. */
  initializeFromSession: (session: Session) => Promise<void>;
  /** Clears the connectionId (used after a rewind that resets conversation). */
  resetConnection: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseClaudeSessionOptions {
  projectPath: string;
  session: Session | undefined;
  effectiveSession: Session | null;
  /** Messages array — read-only; hook appends via the provided setter. */
  messages: ClaudeStreamMessage[];
  messagesRef: React.MutableRefObject<ClaudeStreamMessage[]>;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  totalTokens: number;
  /** Called after session completes to trigger auto-checkpoint logic. */
  onSessionComplete: (prompt: string, success: boolean) => Promise<void>;
  /** rAF-based message buffer — hook calls this to batch appends. */
  bufferMessage: (message: ClaudeStreamMessage, raw: string) => void;
}

export function useClaudeSession({
  projectPath,
  session,
  effectiveSession,
  messages,
  messagesRef,
  setMessages,
  totalTokens,
  onSessionComplete,
  bufferMessage,
}: UseClaudeSessionOptions): ClaudeSessionState {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(
    session?.id ?? null,
  );
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{
    sessionId: string;
    projectId: string;
  } | null>(null);

  // Internal refs
  const [, _setConnectionId] = useState<string | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const setConnectionId = useCallback(
    (val: string | null | ((prev: string | null) => string | null)) => {
      _setConnectionId((prev) => {
        const next = typeof val === "function" ? val(prev) : val;
        connectionIdRef.current = next;
        return next;
      });
    },
    [],
  );

  const resumeAtRef = useRef<string | null>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const isListeningRef = useRef(false);
  const isMountedRef = useRef(true);
  const sessionStartTime = useRef<number>(Date.now());
  const queuedPromptsRef = useRef<QueuedPrompt[]>([]);

  const sessionMetrics = useRef<SessionMetrics>({
    firstMessageTime: null,
    promptsSent: 0,
    toolsExecuted: 0,
    toolsFailed: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    codeBlocksGenerated: 0,
    errorsEncountered: 0,
    lastActivityTime: Date.now(),
    toolExecutionTimes: [],
    checkpointCount: 0,
    wasResumed: !!session,
    modelChanges: [],
  });

  // Analytics
  const trackEvent = useTrackEvent();
  const workflowTracking = useWorkflowTracking("claude_session");

  // Keep queued-prompts ref in sync
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  // Sync model changes to the active SDK session
  const currentModel = useSessionConfig((s) => s.model);
  useEffect(() => {
    if (connectionIdRef.current && currentModel) {
      import("@/lib/apiAdapter")
        .then(({ setSessionModel }) => {
          setSessionModel(connectionIdRef.current!, currentModel);
        })
        .catch(() => {});
    }
  }, [currentModel]);

  // Mount / unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isListeningRef.current = false;

      // Track session engagement on unmount
      if (effectiveSession) {
        trackEvent.sessionCompleted();

        const sessionDuration = sessionStartTime.current
          ? Date.now() - sessionStartTime.current
          : 0;
        const currentMessages = messagesRef.current;
        const messageCount = currentMessages.filter((m) => m.user_message).length;
        const toolsUsed = new Set<string>();
        currentMessages.forEach((msg) => {
          if (msg.type === "assistant" && msg.message?.content) {
            const tools = msg.message.content.filter(
              (c: any) => c.type === "tool_use",
            );
            tools.forEach((tool: any) => toolsUsed.add(tool.name));
          }
        });

        const engagementScore = Math.min(
          100,
          (messageCount * 10) +
            (toolsUsed.size * 5) +
            (sessionDuration > 300000 ? 20 : sessionDuration / 15000),
        );

        trackEvent.sessionEngagement({
          session_duration_ms: sessionDuration,
          messages_sent: messageCount,
          tools_used: Array.from(toolsUsed),
          files_modified: 0,
          engagement_score: Math.round(engagementScore),
        });
      }

      // Tear down listeners
      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];

      // Close WebSocket
      if (connectionIdRef.current) {
        import("@/lib/apiAdapter")
          .then(({ closeSessionSocket }) => {
            closeSessionSocket(connectionIdRef.current!);
          })
          .catch(() => {});
      }

      // Clear checkpoint manager
      if (effectiveSession) {
        api
          .clearCheckpointManager(effectiveSession.id)
          .catch((err) =>
            console.error("Failed to clear checkpoint manager:", err),
          );
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSession, projectPath]);

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Parses and buffers a single stream event payload. */
  function handleStreamMessage(payload: string | ClaudeStreamMessage) {
    try {
      if (!isMountedRef.current) return;

      let message: ClaudeStreamMessage;
      let rawPayload: string;

      if (typeof payload === "string") {
        rawPayload = payload;
        message = JSON.parse(payload) as ClaudeStreamMessage;
      } else {
        message = payload;
        rawPayload = JSON.stringify(payload);
      }

      // Track tool executions
      if (message.type === "assistant" && message.message?.content) {
        const toolUses = message.message.content.filter(
          (c: any) => c.type === "tool_use",
        );
        toolUses.forEach((toolUse: any) => {
          sessionMetrics.current.toolsExecuted += 1;
          sessionMetrics.current.lastActivityTime = Date.now();

          const toolName = toolUse.name?.toLowerCase() || "";
          if (toolName.includes("create") || toolName.includes("write")) {
            sessionMetrics.current.filesCreated += 1;
          } else if (
            toolName.includes("edit") ||
            toolName.includes("multiedit") ||
            toolName.includes("search_replace")
          ) {
            sessionMetrics.current.filesModified += 1;
          } else if (toolName.includes("delete")) {
            sessionMetrics.current.filesDeleted += 1;
          }

          workflowTracking.trackStep(toolUse.name);
        });
      }

      // Track tool results
      if (message.type === "user" && message.message?.content) {
        const toolResults = message.message.content.filter(
          (c: any) => c.type === "tool_result",
        );
        toolResults.forEach((result: any) => {
          if (result.is_error) {
            sessionMetrics.current.toolsFailed += 1;
            sessionMetrics.current.errorsEncountered += 1;

            trackEvent.enhancedError({
              error_type: "tool_execution",
              error_code: "tool_failed",
              error_message: result.content,
              context: "Tool execution failed",
              user_action_before_error: "executing_tool",
              recovery_attempted: false,
              recovery_successful: false,
              error_frequency: 1,
              stack_trace_hash: undefined,
            });
          }
        });
      }

      // Track code blocks
      if (message.type === "assistant" && message.message?.content) {
        const codeBlocks = message.message.content.filter(
          (c: any) => c.type === "text" && c.text?.includes("```"),
        );
        codeBlocks.forEach((block: any) => {
          const matches = (block.text.match(/```/g) || []).length;
          sessionMetrics.current.codeBlocksGenerated += Math.floor(matches / 2);
        });
      }

      // Track system errors
      if (
        message.type === "system" &&
        (message.subtype === "error" || message.error)
      ) {
        sessionMetrics.current.errorsEncountered += 1;
      }

      bufferMessage(message, rawPayload);
    } catch (err) {
      console.error("Failed to parse message:", err, payload);
    }
  }

  /** Handles session completion — analytics, auto-checkpoint, queue processing. */
  const processComplete = useCallback(
    async (success: boolean, promptForCheckpoint: string) => {
      if (!isMountedRef.current) return;

      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;

      if (effectiveSession && claudeSessionId) {
        const sessionStartTimeValue =
          messages.length > 0
            ? (messages[0] as any).timestamp || Date.now()
            : Date.now();
        const duration = Date.now() - sessionStartTimeValue;
        const metrics = sessionMetrics.current;
        const timeToFirstMessage = metrics.firstMessageTime
          ? metrics.firstMessageTime - sessionStartTime.current
          : undefined;
        const idleTime = Date.now() - metrics.lastActivityTime;
        const avgResponseTime =
          metrics.toolExecutionTimes.length > 0
            ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) /
              metrics.toolExecutionTimes.length
            : undefined;

        trackEvent.enhancedSessionStopped({
          duration_ms: duration,
          messages_count: messages.length,
          reason: success ? "completed" : "error",
          time_to_first_message_ms: timeToFirstMessage,
          average_response_time_ms: avgResponseTime,
          idle_time_ms: idleTime,
          prompts_sent: metrics.promptsSent,
          tools_executed: metrics.toolsExecuted,
          tools_failed: metrics.toolsFailed,
          files_created: metrics.filesCreated,
          files_modified: metrics.filesModified,
          files_deleted: metrics.filesDeleted,
          total_tokens_used: totalTokens,
          code_blocks_generated: metrics.codeBlocksGenerated,
          errors_encountered: metrics.errorsEncountered,
          model:
            metrics.modelChanges.length > 0
              ? metrics.modelChanges[metrics.modelChanges.length - 1].to
              : "sonnet",
          has_checkpoints: metrics.checkpointCount > 0,
          checkpoint_count: metrics.checkpointCount,
          was_resumed: metrics.wasResumed,
          agent_type: undefined,
          agent_name: undefined,
          agent_success: success,
          stop_source: "completed",
          final_state: success ? "success" : "failed",
          has_pending_prompts: queuedPromptsRef.current.length > 0,
          pending_prompts_count: queuedPromptsRef.current.length,
        });
      }

      // Trigger auto-checkpoint
      await onSessionComplete(promptForCheckpoint, success);

      // Process queued prompts
      if (queuedPromptsRef.current.length > 0) {
        const [nextPrompt, ...remaining] = queuedPromptsRef.current;
        setQueuedPrompts(remaining);
        setTimeout(() => {
          handleSendPromptInternal(
            nextPrompt.prompt,
            nextPrompt.model,
            nextPrompt.thinkingMode ?? "auto",
            nextPrompt.effort ?? "high",
            nextPrompt.permissionMode ?? "default",
          );
        }, 100);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effectiveSession, claudeSessionId, messages, totalTokens, onSessionComplete],
  );

  // -------------------------------------------------------------------------
  // reconnectToSession — used when resuming an already-active session
  // -------------------------------------------------------------------------
  const reconnectToSession = useCallback(
    async (sid: string) => {
      if (isListeningRef.current) return;

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];
      setClaudeSessionId(sid);
      isListeningRef.current = true;

      const outputUnlisten = await listen(
        `claude-output:${sid}`,
        async (event: any) => {
          try {
            if (!isMountedRef.current) return;
            setRawJsonlOutput((prev) => [...prev, event.payload]);
            const message = JSON.parse(event.payload) as ClaudeStreamMessage;
            setMessages((prev) => [...prev, message]);
          } catch (err) {
            console.error("Failed to parse message:", err, event.payload);
          }
        },
      );

      const errorUnlisten = await listen(
        `claude-error:${sid}`,
        (event: any) => {
          console.error("Claude error:", event.payload);
          if (isMountedRef.current) setError(event.payload);
        },
      );

      const completeUnlisten = await listen(
        `claude-complete:${sid}`,
        async () => {
          if (isMountedRef.current) {
            setIsLoading(false);
            hasActiveSessionRef.current = false;
          }
        },
      );

      unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];

      if (isMountedRef.current) {
        setIsLoading(true);
        hasActiveSessionRef.current = true;
      }
    },
    [setMessages],
  );

  // -------------------------------------------------------------------------
  // initializeFromSession — load history + check if session is still active
  // -------------------------------------------------------------------------
  const initializeFromSession = useCallback(
    async (sess: Session) => {
      // Load history
      try {
        setIsLoading(true);
        setError(null);

        const history = await api.loadSessionHistory(sess.id, sess.project_id);

        if (history && history.length > 0) {
          SessionPersistenceService.saveSession(
            sess.id,
            sess.project_id,
            sess.project_path,
            history.length,
          );
        }

        const loadedMessages: ClaudeStreamMessage[] = history.map(
          (entry: any) => ({
            ...entry,
            type: entry.type || "assistant",
          }),
        );

        startTransition(() => {
          setMessages(loadedMessages);
          setRawJsonlOutput(history.map((h: any) => JSON.stringify(h)));
        });
      } catch (err) {
        console.error("Failed to load session history:", err);
        setError("Failed to load session history");
      } finally {
        setIsLoading(false);
      }

      // Check if active
      if (!isMountedRef.current) return;
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: Record<string, unknown>) => {
          if (
            "process_type" in s &&
            s.process_type &&
            typeof s.process_type === "object" &&
            "ClaudeSession" in (s.process_type as Record<string, unknown>)
          ) {
            const claudeSession = (
              s.process_type as Record<string, Record<string, unknown>>
            ).ClaudeSession;
            return claudeSession?.session_id === sess.id;
          }
          return false;
        });

        if (activeSession) {
          setClaudeSessionId(sess.id);
          await reconnectToSession(sess.id);
        }
      } catch (err) {
        console.error("Failed to check for active sessions:", err);
      }
    },
    [reconnectToSession, setMessages],
  );

  // -------------------------------------------------------------------------
  // handleSendPrompt (internal — used by the public version and queue drain)
  // -------------------------------------------------------------------------
  // Wrap in a ref so processComplete can call it without stale closure
  const handleSendPromptRef = useRef<
    (
      prompt: string,
      model: string,
      thinkingMode: string,
      effort: string,
      permissionMode: string,
    ) => Promise<void>
  >(async () => {});

  async function handleSendPromptInternal(
    prompt: string,
    model: string,
    thinkingMode: string,
    effort: string,
    permissionMode: string,
  ) {
    await handleSendPromptRef.current(prompt, model, thinkingMode, effort, permissionMode);
  }

  const handleSendPromptImpl = useCallback(
    async (
      prompt: string,
      model: string,
      thinkingMode = "auto",
      effort = "high",
      permissionMode = "default",
    ) => {
      // Intercept built-in CLI commands not supported in -p mode
      const trimmed = prompt.trim();
      if (trimmed.startsWith("/")) {
        const command = trimmed.split(/\s+/)[0].toLowerCase();

        if (command === "/clear") {
          setMessages([]);
          setRawJsonlOutput([]);
          setClaudeSessionId(null);
          setConnectionId(null);
          setError(null);
          return;
        }

        const unsupportedCliCommands = [
          "/help", "/compact", "/cost", "/status", "/model", "/config",
          "/doctor", "/login", "/logout", "/memory", "/permissions",
          "/terminal-setup", "/vim", "/bug", "/listen", "/fast", "/think",
          "/undo", "/pr-comments", "/review", "/init",
        ];
        if (unsupportedCliCommands.includes(command)) {
          const infoMessage: ClaudeStreamMessage = {
            type: "system",
            subtype: "info",
            content: `\`${command}\` is a Claude CLI interactive command and is not available in RuneCode. Use the Claude CLI terminal for interactive commands.`,
          } as ClaudeStreamMessage;
          setMessages((prev) => [...prev, infoMessage]);
          return;
        }
      }

      if (!projectPath) {
        setError("Please select a project directory first");
        return;
      }

      // Queue if already loading
      if (isLoading) {
        setQueuedPrompts((prev) => [
          ...prev,
          { id: crypto.randomUUID(), prompt, model, thinkingMode, effort, permissionMode },
        ]);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        hasActiveSessionRef.current = true;

        if (effectiveSession && !claudeSessionId) {
          setClaudeSessionId(effectiveSession.id);
        }

        if (!isListeningRef.current) {
          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [];
          isListeningRef.current = true;

          let currentSessionId: string | null =
            claudeSessionId || effectiveSession?.id || null;

          const attachSessionSpecificListeners = async (sid: string) => {
            const specificOutputUnlisten = await listen(
              `claude-output:${sid}`,
              (evt: any) => { handleStreamMessage(evt.payload); },
            );
            const specificErrorUnlisten = await listen(
              `claude-error:${sid}`,
              (evt: any) => {
                console.error("Claude error (scoped):", evt.payload);
                setError(evt.payload);
              },
            );
            const specificCompleteUnlisten = await listen(
              `claude-complete:${sid}`,
              (evt: any) => { processComplete(evt.payload, prompt); },
            );

            unlistenRefs.current.forEach((u) => u());
            unlistenRefs.current = [
              specificOutputUnlisten,
              specificErrorUnlisten,
              specificCompleteUnlisten,
            ];
          };

          const genericOutputUnlisten = await listen(
            "claude-output",
            async (event: any) => {
              handleStreamMessage(event.payload);

              try {
                const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
                if (
                  msg.type === "system" &&
                  msg.subtype === "init" &&
                  msg.session_id
                ) {
                  if (!currentSessionId || currentSessionId !== msg.session_id) {
                    currentSessionId = msg.session_id;
                    setClaudeSessionId(msg.session_id);

                    if (!extractedSessionInfo) {
                      const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, "-");
                      setExtractedSessionInfo({
                        sessionId: msg.session_id,
                        projectId,
                      });
                      SessionPersistenceService.saveSession(
                        msg.session_id,
                        projectId,
                        projectPath,
                        messages.length,
                      );
                    }

                    await attachSessionSpecificListeners(msg.session_id);
                  }
                }
              } catch {
                /* ignore parse errors */
              }
            },
          );

          const genericErrorUnlisten = await listen(
            "claude-error",
            (evt: any) => {
              console.error("Claude error:", evt.payload);
              setError(evt.payload);
            },
          );

          const genericCompleteUnlisten = await listen(
            "claude-complete",
            (evt: any) => { processComplete(evt.payload, prompt); },
          );

          unlistenRefs.current = [
            genericOutputUnlisten,
            genericErrorUnlisten,
            genericCompleteUnlisten,
          ];

          // Append user message to UI
          const userMessage: ClaudeStreamMessage = {
            type: "user",
            message: { content: [{ type: "text", text: prompt }] },
          };
          setMessages((prev) => [...prev, userMessage]);

          // Update metrics
          sessionMetrics.current.promptsSent += 1;
          sessionMetrics.current.lastActivityTime = Date.now();
          if (!sessionMetrics.current.firstMessageTime) {
            sessionMetrics.current.firstMessageTime = Date.now();
          }

          const lastModel =
            sessionMetrics.current.modelChanges.length > 0
              ? sessionMetrics.current.modelChanges[
                  sessionMetrics.current.modelChanges.length - 1
                ].to
              : sessionMetrics.current.wasResumed ? "sonnet" : model;

          if (lastModel !== model) {
            sessionMetrics.current.modelChanges.push({
              from: lastModel,
              to: model,
              timestamp: Date.now(),
            });
          }

          // Analytics
          const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
          const hasCode = codeBlockMatches.length > 0;
          const conversationDepth = messages.filter((m) => m.user_message).length;
          const sessionAge = sessionStartTime.current
            ? Date.now() - sessionStartTime.current
            : 0;
          const wordCount = prompt
            .split(/\s+/)
            .filter((word) => word.length > 0).length;

          trackEvent.enhancedPromptSubmitted({
            prompt_length: prompt.length,
            model,
            has_attachments: false,
            source: "keyboard",
            word_count: wordCount,
            conversation_depth: conversationDepth,
            prompt_complexity:
              wordCount < 20 ? "simple" : wordCount < 100 ? "moderate" : "complex",
            contains_code: hasCode,
            language_detected: hasCode
              ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1]
              : undefined,
            session_age_ms: sessionAge,
          });

          // Execute
          const sessionConfig = useSessionConfig.getState();
          const selectedEnv = getSelectedEnvironment();
          const environmentConfig = selectedEnv
            ? {
                type: selectedEnv.type,
                sshHost: selectedEnv.sshHost,
                sshPort: selectedEnv.sshPort,
                sshIdentityFile: selectedEnv.sshIdentityFile,
                startDirectory: selectedEnv.startDirectory,
                wslDistro: selectedEnv.wslDistro,
                dockerContainer: selectedEnv.dockerContainer,
              }
            : undefined;

          const agentConfig = {
            teamsEnabled: sessionConfig.teamsEnabled,
            environment: environmentConfig,
          };

          if (connectionIdRef.current) {
            trackEvent.modelSelected(model);
            await api.executeClaudeCode(
              projectPath, prompt, model, thinkingMode,
              connectionIdRef.current, undefined, effort, undefined,
              permissionMode, agentConfig,
            );
          } else {
            const sessId = effectiveSession?.id;
            if (sessId) {
              trackEvent.sessionResumed(sessId);
            } else {
              trackEvent.sessionCreated(model, "prompt_input");
            }
            trackEvent.modelSelected(model);

            const resumeAt = resumeAtRef.current;
            resumeAtRef.current = null;

            const result = await api.executeClaudeCode(
              projectPath, prompt, model, thinkingMode,
              undefined, sessId, effort, resumeAt || undefined,
              permissionMode, agentConfig,
            );

            if (result && typeof result === "object" && "connectionId" in result) {
              setConnectionId(
                (result as { connectionId: string | null }).connectionId,
              );
            }
          }
        }
      } catch (err) {
        console.error("Failed to send prompt:", err);
        setError("Failed to send prompt");
        setIsLoading(false);
        hasActiveSessionRef.current = false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      projectPath, isLoading, effectiveSession, claudeSessionId,
      extractedSessionInfo, messages, processComplete, bufferMessage,
      setMessages, setConnectionId, trackEvent,
    ],
  );

  // Keep ref in sync so processComplete's setTimeout closure is always fresh
  useEffect(() => {
    handleSendPromptRef.current = handleSendPromptImpl;
  });

  // -------------------------------------------------------------------------
  // handleCancelExecution
  // -------------------------------------------------------------------------
  const handleCancelExecution = useCallback(async () => {
    if (!claudeSessionId || !isLoading) return;

    try {
      const sessionStartTimeValue =
        messages.length > 0
          ? (messages[0] as any).timestamp || Date.now()
          : Date.now();
      const duration = Date.now() - sessionStartTimeValue;

      await api.cancelClaudeExecution(
        connectionIdRef.current || undefined,
        claudeSessionId,
      );

      const metrics = sessionMetrics.current;
      const timeToFirstMessage = metrics.firstMessageTime
        ? metrics.firstMessageTime - sessionStartTime.current
        : undefined;
      const idleTime = Date.now() - metrics.lastActivityTime;
      const avgResponseTime =
        metrics.toolExecutionTimes.length > 0
          ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) /
            metrics.toolExecutionTimes.length
          : undefined;

      trackEvent.enhancedSessionStopped({
        duration_ms: duration,
        messages_count: messages.length,
        reason: "user_stopped",
        time_to_first_message_ms: timeToFirstMessage,
        average_response_time_ms: avgResponseTime,
        idle_time_ms: idleTime,
        prompts_sent: metrics.promptsSent,
        tools_executed: metrics.toolsExecuted,
        tools_failed: metrics.toolsFailed,
        files_created: metrics.filesCreated,
        files_modified: metrics.filesModified,
        files_deleted: metrics.filesDeleted,
        total_tokens_used: totalTokens,
        code_blocks_generated: metrics.codeBlocksGenerated,
        errors_encountered: metrics.errorsEncountered,
        model:
          metrics.modelChanges.length > 0
            ? metrics.modelChanges[metrics.modelChanges.length - 1].to
            : "sonnet",
        has_checkpoints: metrics.checkpointCount > 0,
        checkpoint_count: metrics.checkpointCount,
        was_resumed: metrics.wasResumed,
        agent_type: undefined,
        agent_name: undefined,
        agent_success: undefined,
        stop_source: "user_button",
        final_state: "cancelled",
        has_pending_prompts: queuedPromptsRef.current.length > 0,
        pending_prompts_count: queuedPromptsRef.current.length,
      });

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];

      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      setQueuedPrompts([]);

      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, cancelMessage]);
    } catch (err) {
      console.error("Failed to cancel execution:", err);

      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${
          err instanceof Error ? err.message : "Unknown error"
        }. The process may still be running in the background.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];

      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
    }
  }, [claudeSessionId, isLoading, messages, totalTokens, setMessages, trackEvent]);

  const resetConnection = useCallback(() => {
    setConnectionId(null);
  }, [setConnectionId]);

  return {
    isLoading,
    error,
    claudeSessionId,
    rawJsonlOutput,
    queuedPrompts,
    setQueuedPrompts,
    connectionIdRef,
    resumeAtRef,
    sessionMetrics,
    handleSendPrompt: handleSendPromptImpl,
    handleCancelExecution,
    initializeFromSession,
    resetConnection,
  };
}
