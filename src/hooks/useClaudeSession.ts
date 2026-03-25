import { useState, useRef, useCallback, useEffect, startTransition } from "react";
import { api, type Session } from "@/lib/api";
import { useSessionConfig } from "@/hooks/useSessionConfig";
import { useTrackEvent } from "@/hooks";
import { SessionPersistenceService } from "@/services/sessionPersistence";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";
import { useSessionSocket } from "@/hooks/session/useSessionSocket";
import { useSessionCommands } from "@/hooks/session/useSessionCommands";

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
  resumeAtRef: React.MutableRefObject<string | null>;
  sessionMetrics: React.MutableRefObject<SessionMetrics>;
  handleSendPrompt: (
    prompt: string,
    model: string,
    thinkingMode?: string,
    effort?: string,
    permissionMode?: string,
  ) => Promise<void>;
  handleCancelExecution: () => Promise<void>;
  initializeFromSession: (session: Session) => Promise<void>;
  resetConnection: () => void;
}

// ---------------------------------------------------------------------------
// Hook options
// ---------------------------------------------------------------------------

interface UseClaudeSessionOptions {
  projectPath: string;
  session: Session | undefined;
  effectiveSession: Session | null;
  messages: ClaudeStreamMessage[];
  messagesRef: React.MutableRefObject<ClaudeStreamMessage[]>;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  totalTokens: number;
  onSessionComplete: (prompt: string, success: boolean) => Promise<void>;
  bufferMessage: (message: ClaudeStreamMessage, raw: string) => void;
}

// ---------------------------------------------------------------------------
// Composition hook
// ---------------------------------------------------------------------------

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
  const unlistenRefs = useRef<Array<() => void>>([]);
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

  const trackEvent = useTrackEvent();

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
        .catch((e) => console.warn('[SessionModel] failed to set model', e));
    }
  }, [currentModel]);

  // Mount / unmount cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      isListeningRef.current = false;

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
            const tools = (msg.message.content as Array<{ type: string; name?: string }>).filter(
              (c) => c.type === "tool_use",
            );
            tools.forEach((tool) => { if (tool.name) toolsUsed.add(tool.name); });
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

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];

      if (connectionIdRef.current) {
        import("@/lib/apiAdapter")
          .then(({ closeSessionSocket }) => {
            closeSessionSocket(connectionIdRef.current!);
          })
          .catch((e) => console.warn('[SessionCleanup] failed to close socket', e));
      }

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
  // Sub-hooks
  // -------------------------------------------------------------------------

  const { attachSessionSpecificListeners, attachGenericListeners, reconnectToSession } =
    useSessionSocket({
      isMountedRef,
      isListeningRef,
      unlistenRefs,
      setMessages,
      setIsLoading,
      setError,
      setClaudeSessionId,
      hasActiveSessionRef,
    });

  const {
    buildHandleStreamMessage,
    buildProcessComplete,
    buildHandleSendPrompt,
    buildHandleCancelExecution,
  } = useSessionCommands({
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
  });

  // Ref so processComplete's setTimeout always calls the latest send impl
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

  // Build the concrete implementations that depend on all the refs
  const handleStreamMessage = buildHandleStreamMessage(isMountedRef, bufferMessage);

  const processComplete = buildProcessComplete(
    isMountedRef,
    hasActiveSessionRef,
    isListeningRef,
    onSessionComplete,
    handleSendPromptInternal,
  );

  const onSessionIdDiscovered = useCallback(
    async (sid: string) => {
      const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, "-");
      setExtractedSessionInfo({ sessionId: sid, projectId });
      SessionPersistenceService.saveSession(sid, projectId, projectPath, messages.length);
    },
    [projectPath, messages.length],
  );

  const handleSendPromptImpl = buildHandleSendPrompt(
    isMountedRef,
    hasActiveSessionRef,
    isListeningRef,
    unlistenRefs,
    attachGenericListeners,
    attachSessionSpecificListeners,
    handleStreamMessage,
    processComplete,
    onSessionIdDiscovered,
  );

  // Keep ref in sync
  useEffect(() => {
    handleSendPromptRef.current = handleSendPromptImpl;
  });

  const handleCancelExecution = buildHandleCancelExecution(
    unlistenRefs,
    hasActiveSessionRef,
    isListeningRef,
  );

  // -------------------------------------------------------------------------
  // initializeFromSession
  // -------------------------------------------------------------------------
  const initializeFromSession = useCallback(
    async (sess: Session) => {
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

        const loadedMessages: ClaudeStreamMessage[] = (history as Record<string, unknown>[]).map(
          (entry) => ({
            ...entry,
            type: (entry.type as ClaudeStreamMessage["type"]) || "assistant",
          } as ClaudeStreamMessage),
        );

        startTransition(() => {
          setMessages(loadedMessages);
          setRawJsonlOutput((history as Record<string, unknown>[]).map((h) => JSON.stringify(h)));
        });
      } catch (err) {
        console.error("Failed to load session history:", err);
        setError("Failed to load session history");
      } finally {
        setIsLoading(false);
      }

      if (!isMountedRef.current) return;
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s) => {
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
