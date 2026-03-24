/**
 * WebSocket / event-listener connection logic extracted from useClaudeSession.
 * Handles attaching and cleaning up Tauri/web-mode event listeners for a session.
 */

import { useCallback } from "react";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";
import { isRealTauri } from "@/lib/tauri-env";

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

/** Shape emitted by Tauri's `listen()` — mirrors `@tauri-apps/api/event.Event`. */
export interface TauriEvent<T = unknown> {
  payload: T;
}

/** A listen function that registers a callback and returns an unlisten handle. */
type ListenFn = (
  eventName: string,
  callback: (event: TauriEvent<string>) => void,
) => Promise<UnlistenFn>;

// ---------------------------------------------------------------------------
// Tauri / web-mode event bridge (shared module-level singleton)
// ---------------------------------------------------------------------------
let tauriListen: ListenFn | undefined;
export type UnlistenFn = () => void;

try {
  if (isRealTauri()) {
    tauriListen = require("@tauri-apps/api/event").listen;
  }
} catch {
  // Tauri APIs not available — web mode
}

export const listen: ListenFn =
  tauriListen ||
  ((eventName: string, callback: (event: TauriEvent<string>) => void) => {
    const handler = (event: Event) =>
      callback({ payload: (event as CustomEvent).detail });
    window.addEventListener(eventName, handler);
    return Promise.resolve(() => window.removeEventListener(eventName, handler));
  });

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface SessionSocketOptions {
  isMountedRef: React.MutableRefObject<boolean>;
  isListeningRef: React.MutableRefObject<boolean>;
  unlistenRefs: React.MutableRefObject<UnlistenFn[]>;
  setMessages: React.Dispatch<React.SetStateAction<ClaudeStreamMessage[]>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  setClaudeSessionId: React.Dispatch<React.SetStateAction<string | null>>;
  hasActiveSessionRef: React.MutableRefObject<boolean>;
}

export function useSessionSocket(opts: SessionSocketOptions) {
  const {
    isMountedRef,
    isListeningRef,
    unlistenRefs,
    setMessages,
    setIsLoading,
    setError,
    setClaudeSessionId,
    hasActiveSessionRef,
  } = opts;

  /**
   * Attaches session-scoped listeners (output/error/complete) for a known
   * session ID, replacing any previously registered generic listeners.
   */
  const attachSessionSpecificListeners = useCallback(
    async (
      sid: string,
      handleStreamMessage: (payload: string | ClaudeStreamMessage) => void,
      processComplete: (success: boolean, promptForCheckpoint: string) => Promise<void>,
      prompt: string,
    ) => {
      const specificOutputUnlisten = await listen(
        `claude-output:${sid}`,
        (evt: TauriEvent<string>) => { handleStreamMessage(evt.payload); },
      );
      const specificErrorUnlisten = await listen(
        `claude-error:${sid}`,
        (evt: TauriEvent<string>) => {
          console.error("Claude error (scoped):", evt.payload);
          setError(evt.payload);
        },
      );
      const specificCompleteUnlisten = await listen(
        `claude-complete:${sid}`,
        (evt: TauriEvent<string>) => { processComplete(evt.payload as unknown as boolean, prompt); },
      );

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [
        specificOutputUnlisten,
        specificErrorUnlisten,
        specificCompleteUnlisten,
      ];
    },
    [setError, unlistenRefs],
  );

  /**
   * Attaches generic (session-agnostic) listeners for output/error/complete,
   * plus a helper that upgrades to session-scoped listeners once a session_id
   * is discovered from the init message.
   */
  const attachGenericListeners = useCallback(
    async (
      currentSessionId: React.MutableRefObject<string | null>,
      handleStreamMessage: (payload: string | ClaudeStreamMessage) => void,
      processComplete: (success: boolean, promptForCheckpoint: string) => Promise<void>,
      onSessionIdDiscovered: (sid: string) => Promise<void>,
      prompt: string,
    ) => {
      const genericOutputUnlisten = await listen(
        "claude-output",
        async (event: TauriEvent<string>) => {
          handleStreamMessage(event.payload);

          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (
              msg.type === "system" &&
              msg.subtype === "init" &&
              msg.session_id
            ) {
              if (!currentSessionId.current || currentSessionId.current !== msg.session_id) {
                currentSessionId.current = msg.session_id;
                setClaudeSessionId(msg.session_id);
                await onSessionIdDiscovered(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        },
      );

      const genericErrorUnlisten = await listen(
        "claude-error",
        (evt: TauriEvent<string>) => {
          console.error("Claude error:", evt.payload);
          setError(evt.payload);
        },
      );

      const genericCompleteUnlisten = await listen(
        "claude-complete",
        (evt: TauriEvent<string>) => { processComplete(evt.payload as unknown as boolean, prompt); },
      );

      unlistenRefs.current = [
        genericOutputUnlisten,
        genericErrorUnlisten,
        genericCompleteUnlisten,
      ];
    },
    [setClaudeSessionId, setError, unlistenRefs],
  );

  /**
   * Reconnects to an already-active session (resume path).
   */
  const reconnectToSession = useCallback(
    async (sid: string) => {
      if (isListeningRef.current) return;

      unlistenRefs.current.forEach((u) => u());
      unlistenRefs.current = [];
      setClaudeSessionId(sid);
      isListeningRef.current = true;

      const outputUnlisten = await listen(
        `claude-output:${sid}`,
        async (event: TauriEvent<string>) => {
          try {
            if (!isMountedRef.current) return;
            const message = JSON.parse(event.payload) as ClaudeStreamMessage;
            setMessages((prev) => [...prev, message]);
          } catch (err) {
            console.error("Failed to parse message:", err, event.payload);
          }
        },
      );

      const errorUnlisten = await listen(
        `claude-error:${sid}`,
        (event: TauriEvent<string>) => {
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
    [
      isMountedRef,
      isListeningRef,
      unlistenRefs,
      setClaudeSessionId,
      setMessages,
      setError,
      setIsLoading,
      hasActiveSessionRef,
    ],
  );

  return {
    attachSessionSpecificListeners,
    attachGenericListeners,
    reconnectToSession,
  };
}
