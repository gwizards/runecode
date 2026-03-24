/**
 * Message sending and cancellation logic extracted from useClaudeSession.
 * Handles prompt dispatch, CLI command interception, queue management,
 * and cancel execution.
 *
 * Stream-message parsing helpers live in sessionMessageParser.ts.
 */

import { useCallback } from "react";
import { api } from "@/lib/api";
import { useSessionConfig } from "@/hooks/useSessionConfig";
import { getSelectedEnvironment } from "@/components/FloatingPromptInput";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";
import type { SessionMetrics, QueuedPrompt } from "@/hooks/useClaudeSession";
import type { Session } from "@/lib/api";
import { useTrackEvent, useWorkflowTracking } from "@/hooks";
import {
  trackToolUses,
  trackToolResults,
  countCodeBlocks,
  isSystemError,
  buildSessionStoppedPayload,
} from "./sessionMessageParser";

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
    projectPath, isLoading, effectiveSession, claudeSessionId,
    extractedSessionInfo, messages, sessionMetrics, sessionStartTime,
    queuedPromptsRef, connectionIdRef, resumeAtRef, totalTokens,
    setMessages, setQueuedPrompts, setError, setIsLoading,
    setClaudeSessionId, setConnectionId,
  } = opts;

  const trackEvent = useTrackEvent();
  const workflowTracking = useWorkflowTracking("claude_session");

  // ─── handleStreamMessage ────────────────────────────────────────────────
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

          // Track tool executions (delegated to parser)
          const toolNames = trackToolUses(message, sessionMetrics.current);
          toolNames.forEach((name) => workflowTracking.trackStep(name));

          // Track tool results / failures
          const errors = trackToolResults(message, sessionMetrics.current);
          errors.forEach((content) => {
            trackEvent.enhancedError({
              error_type: "tool_execution",
              error_code: "tool_failed",
              error_message: content,
              context: "Tool execution failed",
              user_action_before_error: "executing_tool",
              recovery_attempted: false,
              recovery_successful: false,
              error_frequency: 1,
              stack_trace_hash: undefined,
            });
          });

          // Track code blocks
          sessionMetrics.current.codeBlocksGenerated += countCodeBlocks(message);

          // Track system errors
          if (isSystemError(message)) {
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

  // ─── processComplete ────────────────────────────────────────────────────
  const buildProcessComplete = useCallback(
    (
      isMountedRef: React.MutableRefObject<boolean>,
      hasActiveSessionRef: React.MutableRefObject<boolean>,
      isListeningRef: React.MutableRefObject<boolean>,
      onSessionComplete: (prompt: string, success: boolean) => Promise<void>,
      handleSendPromptInternal: (
        prompt: string, model: string, thinkingMode: string,
        effort: string, permissionMode: string,
      ) => Promise<void>,
    ) => {
      return async function processComplete(success: boolean, promptForCheckpoint: string) {
        if (!isMountedRef.current) return;

        setIsLoading(false);
        hasActiveSessionRef.current = false;
        isListeningRef.current = false;

        if (effectiveSession && claudeSessionId) {
          const payload = buildSessionStoppedPayload(sessionMetrics.current, {
            messages, sessionStartTime: sessionStartTime.current,
            totalTokens, pendingCount: queuedPromptsRef.current.length,
            reason: success ? "completed" : "error",
            stopSource: "completed",
            finalState: success ? "success" : "failed",
            agentSuccess: success,
          });
          trackEvent.enhancedSessionStopped(payload);
        }

        await onSessionComplete(promptForCheckpoint, success);

        if (queuedPromptsRef.current.length > 0) {
          const [nextPrompt, ...remaining] = queuedPromptsRef.current;
          setQueuedPrompts(remaining);
          setTimeout(() => {
            handleSendPromptInternal(
              nextPrompt.prompt, nextPrompt.model,
              nextPrompt.thinkingMode ?? "auto",
              nextPrompt.effort ?? "high",
              nextPrompt.permissionMode ?? "default",
            );
          }, 100);
        }
      };
    },
    [
      effectiveSession, claudeSessionId, messages, totalTokens,
      sessionMetrics, sessionStartTime, queuedPromptsRef, trackEvent,
      setIsLoading, setQueuedPrompts,
    ],
  );

  // ─── handleSendPromptImpl ───────────────────────────────────────────────
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
        prompt: string, model: string, thinkingMode = "auto",
        effort = "high", permissionMode = "default",
      ) {
        const trimmed = prompt.trim();
        if (trimmed.startsWith("/")) {
          const command = trimmed.split(/\s+/)[0].toLowerCase();
          if (command === "/clear") {
            setMessages([]); setClaudeSessionId(null);
            setConnectionId(null); setError(null);
            return;
          }
          if (UNSUPPORTED_CLI_COMMANDS.includes(command)) {
            const infoMessage: ClaudeStreamMessage = {
              type: "system", subtype: "info",
              content: `\`${command}\` is a Claude CLI interactive command and is not available in RuneCode. Use the Claude CLI terminal for interactive commands.`,
            } as ClaudeStreamMessage;
            setMessages((prev) => [...prev, infoMessage]);
            return;
          }
        }

        if (!projectPath) { setError("Please select a project directory first"); return; }

        if (isLoading) {
          setQueuedPrompts((prev) => [
            ...prev,
            { id: crypto.randomUUID(), prompt, model, thinkingMode, effort, permissionMode },
          ]);
          return;
        }

        try {
          setIsLoading(true); setError(null);
          hasActiveSessionRef.current = true;
          if (effectiveSession && !claudeSessionId) setClaudeSessionId(effectiveSession.id);

          if (!isListeningRef.current) {
            unlistenRefs.current.forEach((u) => u());
            unlistenRefs.current = [];
            isListeningRef.current = true;

            const currentSessionIdRef: React.MutableRefObject<string | null> = {
              current: claudeSessionId || effectiveSession?.id || null,
            };
            await attachGenericListeners(
              currentSessionIdRef, handleStreamMessage, processComplete,
              async (sid: string) => {
                if (!extractedSessionInfo) await onSessionIdDiscovered(sid);
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
                ? sessionMetrics.current.modelChanges[sessionMetrics.current.modelChanges.length - 1].to
                : sessionMetrics.current.wasResumed ? "sonnet" : model;
            if (lastModel !== model) {
              sessionMetrics.current.modelChanges.push({ from: lastModel, to: model, timestamp: Date.now() });
            }

            // Analytics
            const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
            const hasCode = codeBlockMatches.length > 0;
            const conversationDepth = messages.filter((m) => m.user_message).length;
            const sessionAge = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
            const wordCount = prompt.split(/\s+/).filter((w) => w.length > 0).length;

            trackEvent.enhancedPromptSubmitted({
              prompt_length: prompt.length, model, has_attachments: false,
              source: "keyboard", word_count: wordCount,
              conversation_depth: conversationDepth,
              prompt_complexity: wordCount < 20 ? "simple" : wordCount < 100 ? "moderate" : "complex",
              contains_code: hasCode,
              language_detected: hasCode ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1] : undefined,
              session_age_ms: sessionAge,
            });

            // Execute
            const sessionConfig = useSessionConfig.getState();
            const selectedEnv = getSelectedEnvironment();
            const environmentConfig = selectedEnv
              ? {
                  type: selectedEnv.type, sshHost: selectedEnv.sshHost,
                  sshPort: selectedEnv.sshPort, sshIdentityFile: selectedEnv.sshIdentityFile,
                  startDirectory: selectedEnv.startDirectory, wslDistro: selectedEnv.wslDistro,
                  dockerContainer: selectedEnv.dockerContainer,
                }
              : undefined;
            const agentConfig = { teamsEnabled: sessionConfig.teamsEnabled, environment: environmentConfig };

            if (connectionIdRef.current) {
              trackEvent.modelSelected(model);
              await api.executeClaudeCode(
                projectPath, prompt, model, thinkingMode,
                connectionIdRef.current, undefined, effort, undefined,
                permissionMode, agentConfig,
              );
            } else {
              const sessId = effectiveSession?.id;
              if (sessId) trackEvent.sessionResumed(sessId);
              else trackEvent.sessionCreated(model, "prompt_input");
              trackEvent.modelSelected(model);

              const resumeAt = resumeAtRef.current;
              resumeAtRef.current = null;

              const result = await api.executeClaudeCode(
                projectPath, prompt, model, thinkingMode,
                undefined, sessId, effort, resumeAt || undefined,
                permissionMode, agentConfig,
              );
              if (result && typeof result === "object" && "connectionId" in result) {
                setConnectionId((result as { connectionId: string | null }).connectionId);
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
      projectPath, isLoading, effectiveSession, claudeSessionId,
      extractedSessionInfo, messages, sessionMetrics, sessionStartTime,
      connectionIdRef, resumeAtRef, trackEvent,
      setMessages, setQueuedPrompts, setError, setIsLoading,
      setClaudeSessionId, setConnectionId,
    ],
  );

  // ─── handleCancelExecution ──────────────────────────────────────────────
  const buildHandleCancelExecution = useCallback(
    (
      unlistenRefs: React.MutableRefObject<Array<() => void>>,
      hasActiveSessionRef: React.MutableRefObject<boolean>,
      isListeningRef: React.MutableRefObject<boolean>,
    ) => {
      return async function handleCancelExecution() {
        if (!claudeSessionId || !isLoading) return;

        try {
          await api.cancelClaudeExecution(
            connectionIdRef.current || undefined, claudeSessionId,
          );

          const payload = buildSessionStoppedPayload(sessionMetrics.current, {
            messages, sessionStartTime: sessionStartTime.current,
            totalTokens, pendingCount: queuedPromptsRef.current.length,
            reason: "user_stopped", stopSource: "user_button",
            finalState: "cancelled", agentSuccess: undefined,
          });
          trackEvent.enhancedSessionStopped(payload);

          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [];
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false;
          setError(null);
          setQueuedPrompts([]);

          const cancelMessage: ClaudeStreamMessage = {
            type: "system", subtype: "info",
            result: "Session cancelled by user",
            timestamp: new Date().toISOString(),
          };
          setMessages((prev) => [...prev, cancelMessage]);
        } catch (err) {
          console.error("Failed to cancel execution:", err);
          const errorMessage: ClaudeStreamMessage = {
            type: "system", subtype: "error",
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
      claudeSessionId, isLoading, messages, totalTokens,
      sessionMetrics, sessionStartTime, connectionIdRef,
      queuedPromptsRef, trackEvent,
      setMessages, setQueuedPrompts, setError, setIsLoading,
    ],
  );

  return {
    buildHandleStreamMessage,
    buildProcessComplete,
    buildHandleSendPrompt,
    buildHandleCancelExecution,
  };
}
