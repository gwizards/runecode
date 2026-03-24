/**
 * Message sending and cancellation logic extracted from useClaudeSession.
 * Handles prompt dispatch, CLI command interception, queue management,
 * and cancel execution.
 */

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useSessionConfig } from "@/hooks/useSessionConfig";
import { getSelectedEnvironment } from "@/components/FloatingPromptInput";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";
import type { SessionMetrics, QueuedPrompt } from "@/hooks/useClaudeSession";
import type { Session } from "@/lib/api";
import { useTrackEvent, useWorkflowTracking } from "@/hooks";

// Unsupported CLI commands in -p (non-interactive) mode
export const UNSUPPORTED_CLI_COMMANDS = [
  "/help", "/compact", "/cost", "/status", "/model", "/config",
  "/doctor", "/login", "/logout", "/memory", "/permissions",
  "/terminal-setup", "/vim", "/bug", "/listen", "/fast", "/think",
  "/undo", "/pr-comments", "/review", "/init",
];

export interface SessionCommandsOptions {
  projectPath: string;
  isLoading: boolean;
  effectiveSession: Session | null;
  claudeSessionId: string | null;
  extractedSessionInfo: { sessionId: string; projectId: string } | null;
  messages: ClaudeStreamMessage[];
  sessionMetrics: React.MutableRefObject<SessionMetrics>;
  sessionStartTime: React.MutableRefObject<number>;
  queuedPromptsRef: React.MutableRefObject<QueuedPrompt[]>;
  connectionIdRef: React.MutableRefObject<string | null>;
  resumeAtRef: React.MutableRefObject<string | null>;
  totalTokens: number;

  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  setQueuedPrompts: React.Dispatch<React.SetStateAction<QueuedPrompt[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setClaudeSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  setConnectionId: (val: string | null | ((prev: string | null) => string | null)) => void;
}

/**
 * Returns helpers for handling stream messages, completing sessions,
 * sending prompts, and cancelling execution.
 *
 * Note: this hook is intentionally not self-contained — callers must wire
 * `handleSendPromptImpl` into a ref so that `processComplete`'s setTimeout
 * closure always invokes the latest version (see useClaudeSession).
 */
export function useSessionCommands(opts: SessionCommandsOptions) {
  const {
    projectPath,
    isLoading,
    effectiveSession,
    claudeSessionId,
    extractedSessionInfo,
    messages,
    sessionMetrics,
    sessionStartTime,
    queuedPromptsRef,
    connectionIdRef,
    resumeAtRef,
    totalTokens,
    setMessages,
    setQueuedPrompts,
    setError,
    setIsLoading,
    setClaudeSessionId,
    setConnectionId,
  } = opts;

  const trackEvent = useTrackEvent();
  const workflowTracking = useWorkflowTracking("claude_session");

  // -------------------------------------------------------------------------
  // handleStreamMessage — parse + buffer one event payload
  // -------------------------------------------------------------------------
  const buildHandleStreamMessage = useCallback(
    (
      isMountedRef: React.MutableRefObject<boolean>,
      bufferMessage: (message: ClaudeStreamMessage, raw: string) => void,
    ) => {
      return function handleStreamMessage(payload: string | ClaudeStreamMessage) {
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
      };
    },
    [sessionMetrics, trackEvent, workflowTracking],
  );

  // -------------------------------------------------------------------------
  // processComplete — analytics, auto-checkpoint, queue drain
  // -------------------------------------------------------------------------
  const buildProcessComplete = useCallback(
    (
      isMountedRef: React.MutableRefObject<boolean>,
      hasActiveSessionRef: React.MutableRefObject<boolean>,
      isListeningRef: React.MutableRefObject<boolean>,
      onSessionComplete: (prompt: string, success: boolean) => Promise<void>,
      handleSendPromptInternal: (
        prompt: string,
        model: string,
        thinkingMode: string,
        effort: string,
        permissionMode: string,
      ) => Promise<void>,
    ) => {
      return async function processComplete(success: boolean, promptForCheckpoint: string) {
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

        await onSessionComplete(promptForCheckpoint, success);

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
      };
    },
    [
      effectiveSession,
      claudeSessionId,
      messages,
      totalTokens,
      sessionMetrics,
      sessionStartTime,
      queuedPromptsRef,
      trackEvent,
      setIsLoading,
      setQueuedPrompts,
    ],
  );

  // -------------------------------------------------------------------------
  // handleSendPromptImpl
  // -------------------------------------------------------------------------
  const buildHandleSendPrompt = useCallback(
    (
      _isMountedRef: React.MutableRefObject<boolean>,
      hasActiveSessionRef: React.MutableRefObject<boolean>,
      isListeningRef: React.MutableRefObject<boolean>,
      unlistenRefs: React.MutableRefObject<Array<() => void>>,
      attachGenericListeners: (
        currentSessionId: React.MutableRefObject<string | null>,
        handleStreamMessage: (payload: string | ClaudeStreamMessage) => void,
        processComplete: (success: boolean, promptForCheckpoint: string) => Promise<void>,
        onSessionIdDiscovered: (sid: string) => Promise<void>,
        prompt: string,
      ) => Promise<void>,
      attachSessionSpecificListeners: (
        sid: string,
        handleStreamMessage: (payload: string | ClaudeStreamMessage) => void,
        processComplete: (success: boolean, promptForCheckpoint: string) => Promise<void>,
        prompt: string,
      ) => Promise<void>,
      handleStreamMessage: (payload: string | ClaudeStreamMessage) => void,
      processComplete: (success: boolean, promptForCheckpoint: string) => Promise<void>,
      onSessionIdDiscovered: (sid: string) => Promise<void>,
    ) => {
      return async function handleSendPromptImpl(
        prompt: string,
        model: string,
        thinkingMode = "auto",
        effort = "high",
        permissionMode = "default",
      ) {
        const trimmed = prompt.trim();
        if (trimmed.startsWith("/")) {
          const command = trimmed.split(/\s+/)[0].toLowerCase();

          if (command === "/clear") {
            setMessages([]);
            setClaudeSessionId(null);
            setConnectionId(null);
            setError(null);
            return;
          }

          if (UNSUPPORTED_CLI_COMMANDS.includes(command)) {
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

            const currentSessionIdRef: React.MutableRefObject<string | null> = {
              current: claudeSessionId || effectiveSession?.id || null,
            };

            await attachGenericListeners(
              currentSessionIdRef,
              handleStreamMessage,
              processComplete,
              async (sid: string) => {
                if (!extractedSessionInfo) {
                  await onSessionIdDiscovered(sid);
                }
                await attachSessionSpecificListeners(sid, handleStreamMessage, processComplete, prompt);
              },
              prompt,
            );

            // Append user message
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
            const wordCount = prompt.split(/\s+/).filter((w) => w.length > 0).length;

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
      };
    },
    [
      projectPath,
      isLoading,
      effectiveSession,
      claudeSessionId,
      extractedSessionInfo,
      messages,
      sessionMetrics,
      sessionStartTime,
      connectionIdRef,
      resumeAtRef,
      trackEvent,
      setMessages,
      setQueuedPrompts,
      setError,
      setIsLoading,
      setClaudeSessionId,
      setConnectionId,
    ],
  );

  // -------------------------------------------------------------------------
  // handleCancelExecution
  // -------------------------------------------------------------------------
  const buildHandleCancelExecution = useCallback(
    (
      unlistenRefs: React.MutableRefObject<Array<() => void>>,
      hasActiveSessionRef: React.MutableRefObject<boolean>,
      isListeningRef: React.MutableRefObject<boolean>,
    ) => {
      return async function handleCancelExecution() {
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
      };
    },
    [
      claudeSessionId,
      isLoading,
      messages,
      totalTokens,
      sessionMetrics,
      sessionStartTime,
      connectionIdRef,
      queuedPromptsRef,
      trackEvent,
      setMessages,
      setQueuedPrompts,
      setError,
      setIsLoading,
    ],
  );

  return {
    buildHandleStreamMessage,
    buildProcessComplete,
    buildHandleSendPrompt,
    buildHandleCancelExecution,
  };
}
