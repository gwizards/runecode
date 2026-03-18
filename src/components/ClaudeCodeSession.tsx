import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Lock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { RotatingRune } from "./RuneCodeLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/stores/sessionStore";
import { useSessionConfig } from "@/hooks/useSessionConfig";

// Conditional imports for Tauri APIs
let tauriListen: any;
type UnlistenFn = () => void;

try {
  // Only use real Tauri listen if we're in a genuine Tauri environment,
  // not our web-mode mock (which sets __WEB_MODE_MOCK__ on __TAURI_INTERNALS__)
  const isRealTauri = typeof window !== 'undefined' && window.__TAURI__ &&
    !(window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);
  if (isRealTauri) {
    tauriListen = require("@tauri-apps/api/event").listen;
  }
} catch (e) {
  // Tauri APIs not available, using web mode
}

// Web-compatible replacements
const listen = tauriListen || ((eventName: string, callback: (event: any) => void) => {
  // In web mode, listen for DOM events
  const domEventHandler = (event: any) => {
    callback({ payload: event.detail });
  };

  window.addEventListener(eventName, domEventHandler);

  // Return unlisten function
  return Promise.resolve(() => {
    window.removeEventListener(eventName, domEventHandler);
  });
});
import { StreamMessage } from "./StreamMessage";
import { FloatingPromptInput, type FloatingPromptInputRef, getSelectedEnvironment } from "./FloatingPromptInput";
import { SessionActivityBar } from "./SessionActivityBar";
import { SubAgentTracker } from "./SubAgentTracker";
import { TeamDashboard } from "./TeamDashboard";
import { ErrorBoundary } from "./ErrorBoundary";
import { CheckpointSettings } from "./CheckpointSettings";
import { SlashCommandsManager } from "./SlashCommandsManager";
import { RewindPanel } from './RewindPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { TooltipProvider, TooltipSimple } from "@/components/ui/tooltip-modern";
import { SplitPane } from "@/components/ui/split-pane";
import { WebviewPreview } from "./WebviewPreview";
import type { ClaudeStreamMessage } from "./AgentExecution";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTrackEvent, useComponentMetrics, useWorkflowTracking } from "@/hooks";
import { SessionPersistenceService } from "@/services/sessionPersistence";

interface ClaudeCodeSessionProps {
  /**
   * Optional session to resume (when clicking from SessionList)
   */
  session?: Session;
  /**
   * Initial project path (for new sessions)
   */
  initialProjectPath?: string;
  /**
   * Callback to go back
   */
  onBack: () => void;
  /**
   * Callback to open hooks configuration
   */
  onProjectSettings?: (projectPath: string) => void;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when streaming state changes
   */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
  /**
   * Callback when project path changes
   */
  onProjectPathChange?: (path: string) => void;
  /**
   * Whether this session's tab is visible and should auto-scroll
   */
  isActive?: boolean;
  /**
   * Whether this session owns the shared footer input portal.
   * In single mode this equals isActive. In grid mode only the focused tab is true.
   */
  ownsFooter?: boolean;
}

/**
 * ClaudeCodeSession component for interactive Claude Code sessions
 * 
 * @example
 * <ClaudeCodeSession onBack={() => setView('projects')} />
 */
export const ClaudeCodeSession: React.FC<ClaudeCodeSessionProps> = ({
  session,
  initialProjectPath = "",
  className,
  onStreamingChange,
  onProjectPathChange,
  isActive = true,
  ownsFooter,
}) => {
  const showFooter = ownsFooter ?? isActive;
  const [projectPath] = useState(initialProjectPath || session?.project_path || "");
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  // Ref mirror of messages — passed to StreamMessage to avoid re-renders when messages array changes
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Reset live usage when session changes
  useEffect(() => {
    useSessionStore.getState().resetLiveUsage();
    return () => {
      useSessionStore.getState().resetLiveUsage();
    };
  }, [session?.id]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [totalTokens, setTotalTokens] = useState(0);
  const [_sessionCostUsd, setSessionCostUsd] = useState(0);
  const [extractedSessionInfo, setExtractedSessionInfo] = useState<{ sessionId: string; projectId: string } | null>(null);
  const [claudeSessionId, setClaudeSessionId] = useState<string | null>(null);
  const [, _setConnectionId] = useState<string | null>(null);
  const connectionIdRef = useRef<string | null>(null);
  const resumeAtRef = useRef<string | null>(null);
  const setConnectionId = useCallback((val: string | null | ((prev: string | null) => string | null)) => {
    _setConnectionId((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      connectionIdRef.current = next;
      return next;
    });
  }, []);
  const [showTimeline, setShowTimeline] = useState(false);
  const [, setTimelineVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");
  
  // Queued prompts state
  const [queuedPrompts, setQueuedPrompts] = useState<Array<{ id: string; prompt: string; model: string; thinkingMode?: string; effort?: string; permissionMode?: string }>>([]);
  
  // New state for preview feature
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [, setShowPreviewPrompt] = useState(false);
  const [showRewindPanel, setShowRewindPanel] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  // Message batching — buffer incoming stream messages and flush in rAF
  // to avoid per-message re-renders (reduces 50+ renders/sec to ~16/sec)
  const msgBufferRef = useRef<any[]>([]);
  const rawBufferRef = useRef<string[]>([]);
  const flushRafRef = useRef(0);

  const flushMessageBuffer = useCallback(() => {
    flushRafRef.current = 0;
    const msgs = msgBufferRef.current;
    const raws = rawBufferRef.current;
    if (msgs.length === 0) return;
    msgBufferRef.current = [];
    rawBufferRef.current = [];
    // Low-priority update — React can yield to browser between renders
    startTransition(() => {
      setMessages(prev => [...prev, ...msgs]);
      setRawJsonlOutput(prev => [...prev, ...raws]);
    });
  }, []);

  const bufferMessage = useCallback((message: any, raw: string) => {
    msgBufferRef.current.push(message);
    rawBufferRef.current.push(raw);
    if (!flushRafRef.current) {
      flushRafRef.current = requestAnimationFrame(flushMessageBuffer);
    }
  }, [flushMessageBuffer]);

  // Flush on unmount
  useEffect(() => {
    return () => { if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current); };
  }, []);

  // Detect scroll position — show/hide scroll button, load more at top, shrink at bottom
  const loadMoreCooldown = useRef(false);
  const shrinkCooldown = useRef(false);
  // Guard: prevents scroll handler from fighting with programmatic scroll
  const isRestoringScroll = useRef(false);
  // Scrollbar auto-hide
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        // Skip during programmatic scroll to prevent fighting
        if (isRestoringScroll.current) return;

        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distFromBottom < 80;
        isAtBottomRef.current = atBottom;

        // User scrolled to bottom → re-lock
        if (atBottom && !scrollLockedRef.current) {
          setScrollLocked(true);
          setNewMessageCount(0);
          setIsScrolledUp(false);
        }
        // User scrolled away from bottom → unlock
        if (!atBottom && scrollLockedRef.current) {
          setScrollLocked(false);
          setIsScrolledUp(true);
        }

        // Scrollbar auto-hide
        if (!scrollTimeoutRef.current) setIsScrolling(true);
        else clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => { scrollTimeoutRef.current = null; setIsScrolling(false); }, 2000);

        // Load more messages when scrolling near the top
        if (el.scrollTop < 100 && !loadMoreCooldown.current) {
          loadMoreCooldown.current = true;
          setVisibleLimit(prev => {
            const total = allDisplayableRef.current;
            if (prev >= total) return prev;
            return Math.min(prev + LOAD_MORE_COUNT, total);
          });
          setTimeout(() => { loadMoreCooldown.current = false; }, 300);
        }

        // Shrink back to initial when at the bottom
        if (atBottom && !shrinkCooldown.current) {
          shrinkCooldown.current = true;
          setVisibleLimit(INITIAL_VISIBLE);
          setTimeout(() => { shrinkCooldown.current = false; }, 500);
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });

    // Keep pinned to bottom on resize (sidebar, window, grid layout change).
    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!scrollLockedRef.current) return;
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        if (scrollLockedRef.current && el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
          isAtBottomRef.current = true;
        }
      });
    });
    resizeObserver.observe(el);

    return () => {
      el.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
      cancelAnimationFrame(resizeRaf);
      cancelAnimationFrame(scrollRaf);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  // Close rewind panel when this session loses focus (e.g. grid tab switch)
  useEffect(() => {
    if (!showFooter) {
      setShowRewindPanel(false);
      setShowTimeline(false);
    }
  }, [showFooter]);

  // When tab becomes active again and scroll is locked, force scroll to bottom.
  // visibility:hidden panels preserve scroll position but the virtualizer may
  // have stale measurements, so we need to explicitly re-pin.
  useEffect(() => {
    if (!isActive || !scrollLockedRef.current) return;
    // Small delay to let the virtualizer re-measure after visibility change
    const timer = setTimeout(() => {
      const el = parentRef.current;
      if (el && scrollLockedRef.current) {
        el.scrollTop = el.scrollHeight;
        isAtBottomRef.current = true;
      }
    }, 16);
    return () => clearTimeout(timer);
  }, [isActive]);

  const [splitPosition, setSplitPosition] = useState(50);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  
  // Add collapsed state for queued prompts
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const hasActiveSessionRef = useRef(false);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const queuedPromptsRef = useRef<Array<{ id: string; prompt: string; model: string; thinkingMode?: string; effort?: string; permissionMode?: string }>>([]);
  const isMountedRef = useRef(true);
  const isListeningRef = useRef(false);
  const sessionStartTime = useRef<number>(Date.now());

  // Sync model changes to active SDK session
  const currentModel = useSessionConfig((s) => s.model);

  useEffect(() => {
    if (connectionIdRef.current && currentModel) {
      import('@/lib/apiAdapter').then(({ setSessionModel }) => {
        setSessionModel(connectionIdRef.current!, currentModel);
      }).catch(() => {});
    }
  }, [currentModel]);

  // Toggle RewindPanel when timeline button is clicked — only the focused session responds
  useEffect(() => {
    if (!showFooter) return; // only the session that owns the footer handles this
    const handleToggleRewind = () => {
      setShowRewindPanel(prev => !prev);
      setShowTimeline(false);
    };
    window.addEventListener('runecode:open-timeline', handleToggleRewind);
    return () => window.removeEventListener('runecode:open-timeline', handleToggleRewind);
  }, [showFooter]);

  // Handle rewind actions from the RewindPanel — only the focused session
  useEffect(() => {
    if (!showFooter) return;
    const handleRewind = async (e: CustomEvent) => {
      const { userMessageId, mode } = e.detail;

      try {
        if (connectionIdRef.current && (mode === 'code_and_conversation' || mode === 'code_only')) {
          const { rewindSessionFiles } = await import('@/lib/apiAdapter');
          rewindSessionFiles(connectionIdRef.current, userMessageId, false);
        }

        if (mode === 'code_and_conversation') {
          // Use ref to avoid messages in dep array (prevents listener churn)
          const rewindIdx = messagesRef.current.findIndex(m => m.uuid === userMessageId);
          if (rewindIdx >= 0) {
            setMessages(prev => prev.slice(0, rewindIdx + 1));
          }
          setConnectionId(null);
          resumeAtRef.current = userMessageId;
        }

        setShowRewindPanel(false);
      } catch (err) {
        console.error('Rewind failed:', err);
      }
    };

    window.addEventListener('runecode:rewind', handleRewind as unknown as EventListener);
    return () => window.removeEventListener('runecode:rewind', handleRewind as unknown as EventListener);
  }, [showFooter]);

  const isIMEComposingRef = useRef(false);
  const historyLoadedRef = useRef<string | null>(null);

  // ── Auto-scroll system ──
  // scrollLocked = true means "pin to bottom". The ref mirrors state for
  // use inside ResizeObserver / scroll handler (avoids stale closures).
  const [scrollLocked, setScrollLocked] = useState(true);
  const scrollLockedRef = useRef(true);
  useEffect(() => { scrollLockedRef.current = scrollLocked; }, [scrollLocked]);
  const [newMessageCount, setNewMessageCount] = useState(0);
  // isAtBottomRef is a layout-level cache updated by the scroll handler.
  // It is NOT the source of truth for "should we auto-scroll" — scrollLocked is.
  const isAtBottomRef = useRef(true);
  // Session metrics state for enhanced analytics
  const sessionMetrics = useRef({
    firstMessageTime: null as number | null,
    promptsSent: 0,
    toolsExecuted: 0,
    toolsFailed: 0,
    filesCreated: 0,
    filesModified: 0,
    filesDeleted: 0,
    codeBlocksGenerated: 0,
    errorsEncountered: 0,
    lastActivityTime: Date.now(),
    toolExecutionTimes: [] as number[],
    checkpointCount: 0,
    wasResumed: !!session,
    modelChanges: [] as Array<{ from: string; to: string; timestamp: number }>,
  });

  // Analytics tracking
  const trackEvent = useTrackEvent();
  useComponentMetrics('ClaudeCodeSession');
  // const aiTracking = useAIInteractionTracking('sonnet'); // Default model
  const workflowTracking = useWorkflowTracking('claude_session');
  
  // handleScroll is now consolidated into the useEffect scroll listener above.
  // Keep as a no-op for JSX onScroll prop compatibility.
  const handleScroll = useCallback(() => {}, []);

  // (auto-scroll lock is now per-session, no localStorage listener needed)

  // Call onProjectPathChange when component mounts with initial path
  useEffect(() => {
    if (onProjectPathChange && projectPath) {
      onProjectPathChange(projectPath);
    }
  }, []); // Only run on mount
  
  // Keep ref in sync with state
  useEffect(() => {
    queuedPromptsRef.current = queuedPrompts;
  }, [queuedPrompts]);

  // Get effective session info (from prop or extracted) - use useMemo to ensure it updates
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return {
        id: extractedSessionInfo.sessionId,
        project_id: extractedSessionInfo.projectId,
        project_path: projectPath,
        created_at: Date.now(),
      } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);

  // How many messages to show from the end — grows as user scrolls up
  const INITIAL_VISIBLE = 12; // fewer items on initial load = faster first paint
  const LOAD_MORE_COUNT = 20;
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);
  const allDisplayableRef = useRef(0); // tracks total displayable count for scroll handler

  // Reset visible limit on session change; auto-expand for new messages
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length < prevMsgCount.current) {
      // Session changed or rewound — reset
      setVisibleLimit(INITIAL_VISIBLE);
    } else if (messages.length > prevMsgCount.current && !isScrolledUp) {
      // New messages arrived while at bottom — ensure they're visible
      setVisibleLimit(prev => Math.max(prev, INITIAL_VISIBLE));
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, isScrolledUp]);

  // Pre-build a map of tool_use_id → tool name for O(1) lookup in the filter below.
  // This replaces the O(n²) backward scan through messages.
  const toolUseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (msg.type === 'assistant' && msg.message?.content && Array.isArray(msg.message.content)) {
        for (const c of msg.message.content) {
          if (c.type === 'tool_use' && c.id) {
            map.set(c.id, c.name || '');
          }
        }
      }
    }
    return map;
  }, [messages]);

  const toolsWithWidgets = new Set([
    'task', 'edit', 'multiedit', 'todowrite', 'ls', 'read',
    'glob', 'bash', 'write', 'grep'
  ]);

  // Filter out messages that shouldn't be displayed
  const allDisplayableMessages = useMemo(() => {
    return messages.filter((message) => {
      // Skip non-renderable message types
      const nonDisplayableTypes = [
        'progress', 'file-history-snapshot', 'queue-operation', 'last-prompt',
        'rate_limit_event', 'system', 'start', 'partial', 'session_info',
        'content_block_start', 'content_block_delta', 'content_block_stop',
        'message_start', 'message_delta', 'message_stop', 'stream_event',
        'result', 'control_request', 'control_response', 'control_cancel',
        'keep_alive',
      ];
      if (nonDisplayableTypes.includes(message.type)) {
        return false;
      }

      // Skip assistant messages with empty or no content (partial streaming placeholders)
      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (!content) return false;
        if (Array.isArray(content) && content.length === 0) return false;
        // Skip if content is only empty text blocks
        if (Array.isArray(content) && content.every((b: any) =>
          b.type === 'text' && (!b.text || b.text.trim() === '')
        )) return false;
      }

      // Skip meta messages that don't have meaningful content
      if (message.isMeta && !message.leafUuid && !message.summary) {
        return false;
      }

      // Skip user messages that only contain tool results that are already displayed
      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) {
          return false;
        }

        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") {
              hasVisibleContent = true;
              break;
            }
            if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                // O(1) lookup via pre-built map instead of backward scan
                const toolName = toolUseNameMap.get(content.tool_use_id);
                if (toolName && (toolsWithWidgets.has(toolName.toLowerCase()) || toolName.startsWith('mcp__'))) {
                  willBeSkipped = true;
                }
              }
              if (!willBeSkipped) {
                hasVisibleContent = true;
                break;
              }
            }
          }
          if (!hasVisibleContent) {
            return false;
          }
        }
      }
      return true;
    });
  }, [messages]);

  // Windowed view — show only the last N messages, load more on scroll up
  const displayableMessages = useMemo(() => {
    if (allDisplayableMessages.length <= visibleLimit) return allDisplayableMessages;
    return allDisplayableMessages.slice(-visibleLimit);
  }, [allDisplayableMessages, visibleLimit]);

  allDisplayableRef.current = allDisplayableMessages.length;
  const hasMoreMessages = allDisplayableMessages.length > visibleLimit;

  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150, // Estimate, will be dynamically measured
    overscan: 2, // minimal overscan to reduce measurement work
  });

  // Debug logging
  useEffect(() => {
    // State tracking (debug only)
  }, [projectPath, session, extractedSessionInfo, effectiveSession, messages.length, isLoading]);

  // Load session history if resuming — keyed on session ID, not object reference,
  // so closing other tabs (which creates new tab objects) doesn't trigger a reload.
  const sessionId = session?.id;
  useEffect(() => {
    if (sessionId && sessionId !== historyLoadedRef.current) {
      historyLoadedRef.current = sessionId;
      // Set the claudeSessionId immediately when we have a session
      setClaudeSessionId(sessionId);

      // Load session history first, then check for active session
      const initializeSession = async () => {
        await loadSessionHistory();
        // After loading history, check if the session is still active
        if (isMountedRef.current) {
          await checkForActiveSession();
        }
      };

      initializeSession();
    }
  }, [sessionId]); // Depend on session ID string, not object reference

  // Report streaming state changes
  useEffect(() => {
    onStreamingChange?.(isLoading, claudeSessionId);
  }, [isLoading, claudeSessionId, onStreamingChange]);

  // (timeline open handled by toggle effect above)

  // Auto-scroll to bottom when new messages arrive
  const prevScrollMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length === 0) return;
    // Only act on actual new messages
    if (messages.length === prevScrollMsgCount.current) return;
    const newCount = messages.length - prevScrollMsgCount.current;
    prevScrollMsgCount.current = messages.length;

    if (!scrollLocked) {
      if (newCount > 0) setNewMessageCount(prev => prev + newCount);
      return;
    }
    // Scroll to bottom
    isRestoringScroll.current = true;
    let attempts = 0;
    const doScroll = () => {
      const scrollElement = parentRef.current;
      if (!scrollElement) { isRestoringScroll.current = false; return; }
      if (displayableMessages.length > 0) {
        rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
      }
      scrollElement.scrollTo({ top: scrollElement.scrollHeight, behavior: 'auto' });
      if (attempts < 3) {
        attempts++;
        requestAnimationFrame(doScroll);
      } else {
        requestAnimationFrame(() => { isRestoringScroll.current = false; });
      }
    };
    requestAnimationFrame(doScroll);
  }, [messages.length, scrollLocked]);

  // Calculate total tokens and estimated cost from messages
  useEffect(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalCacheWrite = 0;
    let totalCacheRead = 0;
    let msgCount = 0;
    for (const msg of messages) {
      const usage = msg.message?.usage ?? msg.usage;
      if (usage) {
        totalIn += usage.input_tokens;
        totalOut += usage.output_tokens;
        // Cache token fields are present in Claude API responses but not in the base TS type
        const usageAny = usage as Record<string, number>;
        totalCacheWrite += usageAny.cache_creation_input_tokens || 0;
        totalCacheRead += usageAny.cache_read_input_tokens || 0;
        msgCount++;
      }
    }
    const totalTok = totalIn + totalOut;
    // Default Claude Sonnet 4 pricing: $3/M input, $15/M output
    const cost = (totalIn * 3) / 1_000_000 + (totalOut * 15) / 1_000_000;
    setTotalTokens(totalTok);
    setSessionCostUsd(cost);

    // Push to global store for sidebar usage display
    useSessionStore.setState((state) => ({
      liveUsage: {
        ...state.liveUsage,
        inputTokens: totalIn,
        outputTokens: totalOut,
        cacheCreationTokens: totalCacheWrite,
        cacheReadTokens: totalCacheRead,
        costUsd: cost,
        messageCount: msgCount,
      },
    }));
  }, [messages]);

  const loadSessionHistory = async () => {
    if (!session) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const history = await api.loadSessionHistory(session.id, session.project_id);
      
      // Save session data for restoration
      if (history && history.length > 0) {
        SessionPersistenceService.saveSession(
          session.id,
          session.project_id,
          session.project_path,
          history.length
        );
      }
      
      // Convert history to messages format
      const loadedMessages: ClaudeStreamMessage[] = history.map(entry => ({
        ...entry,
        type: entry.type || "assistant"
      }));
      
      // Load messages in a low-priority transition so React can yield to the browser
      startTransition(() => {
        setMessages(loadedMessages);
        setRawJsonlOutput(history.map(h => JSON.stringify(h)));
      });

      // Scroll to bottom — wait 2 frames for React to process the transition
      // then retry gently until the virtualizer has rendered content.
      if (loadedMessages.length > 0) {
        isRestoringScroll.current = true;
        let attempts = 0;
        const scrollDown = () => {
          const el = parentRef.current;
          if (!el) { isRestoringScroll.current = false; return; }
          const sh = el.scrollHeight;
          const ch = el.clientHeight;
          if (sh > ch) {
            rowVirtualizer.scrollToIndex(loadedMessages.length - 1, { align: 'end', behavior: 'auto' });
            isAtBottomRef.current = true;
          }
          if (sh <= ch + 10 && attempts < 10) {
            attempts++;
            requestAnimationFrame(scrollDown);
            return;
          }
          requestAnimationFrame(() => {
            isRestoringScroll.current = false;
            // Now that restore is done, trigger a re-measure of visible items
            rowVirtualizer.measure();
          });
        };
        requestAnimationFrame(() => requestAnimationFrame(scrollDown));
        // Safety: ensure isRestoringScroll is cleared even if rAF chain gets interrupted
        setTimeout(() => { isRestoringScroll.current = false; }, 2000);
      }
    } catch (err) {
      console.error("Failed to load session history:", err);
      setError("Failed to load session history");
    } finally {
      setIsLoading(false);
    }
  };

  const checkForActiveSession = async () => {
    // If we have a session prop, check if it's still active
    if (session) {
      try {
        const activeSessions = await api.listRunningClaudeSessions();
        const activeSession = activeSessions.find((s: Record<string, unknown>) => {
          if ('process_type' in s && s.process_type && typeof s.process_type === 'object' && 'ClaudeSession' in (s.process_type as Record<string, unknown>)) {
            const claudeSession = (s.process_type as Record<string, Record<string, unknown>>).ClaudeSession;
            return claudeSession?.session_id === session.id;
          }
          return false;
        });
        
        if (activeSession) {
          // Session is still active, reconnect to its stream
          console.log('[ClaudeCodeSession] Found active session, reconnecting:', session.id);
          // IMPORTANT: Set claudeSessionId before reconnecting
          setClaudeSessionId(session.id);
          
          // Don't add buffered messages here - they've already been loaded by loadSessionHistory
          // Just set up listeners for new messages
          
          // Set up listeners for the active session
          reconnectToSession(session.id);
        }
      } catch (err) {
        console.error('Failed to check for active sessions:', err);
      }
    }
  };

  const reconnectToSession = async (sessionId: string) => {
    console.log('[ClaudeCodeSession] Reconnecting to session:', sessionId);
    
    // Prevent duplicate listeners
    if (isListeningRef.current) {
      console.log('[ClaudeCodeSession] Already listening to session, skipping reconnect');
      return;
    }
    
    // Clean up previous listeners
    unlistenRefs.current.forEach(unlisten => unlisten());
    unlistenRefs.current = [];
    
    // IMPORTANT: Set the session ID before setting up listeners
    setClaudeSessionId(sessionId);
    
    // Mark as listening
    isListeningRef.current = true;
    
    // Set up session-specific listeners
    const outputUnlisten = await listen(`claude-output:${sessionId}`, async (event: any) => {
      try {
        
        if (!isMountedRef.current) return;
        
        // Store raw JSONL
        setRawJsonlOutput(prev => [...prev, event.payload]);
        
        // Parse and display
        const message = JSON.parse(event.payload) as ClaudeStreamMessage;
        setMessages(prev => [...prev, message]);
      } catch (err) {
        console.error("Failed to parse message:", err, event.payload);
      }
    });

    const errorUnlisten = await listen(`claude-error:${sessionId}`, (event: any) => {
      console.error("Claude error:", event.payload);
      if (isMountedRef.current) {
        setError(event.payload);
      }
    });

    const completeUnlisten = await listen(`claude-complete:${sessionId}`, async (_event: any) => {
      if (isMountedRef.current) {
        setIsLoading(false);
        hasActiveSessionRef.current = false;
      }
    });

    unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten];
    
    // Mark as loading to show the session is active
    if (isMountedRef.current) {
      setIsLoading(true);
      hasActiveSessionRef.current = true;
    }
  };

  // Project path selection handled by parent tab controls

  const handleSendPrompt = async (prompt: string, model: string, thinkingMode: string = "auto", effort: string = "high", permissionMode: string = "bypassPermissions") => {

    // Intercept built-in Claude CLI commands that don't work in -p mode
    const trimmed = prompt.trim();
    if (trimmed.startsWith('/')) {
      const command = trimmed.split(/\s+/)[0].toLowerCase();

      if (command === '/clear') {
        setMessages([]);
        setRawJsonlOutput([]);
        setClaudeSessionId(null);
        setConnectionId(null);
        setError(null);
        return;
      }

      const unsupportedCliCommands = [
        '/help', '/compact', '/cost', '/status', '/model', '/config',
        '/doctor', '/login', '/logout', '/memory', '/permissions',
        '/terminal-setup', '/vim', '/bug', '/listen', '/fast', '/think',
        '/undo', '/pr-comments', '/review', '/init',
      ];
      if (unsupportedCliCommands.includes(command)) {
        const infoMessage: ClaudeStreamMessage = {
          type: 'system',
          subtype: 'info',
          content: `\`${command}\` is a Claude CLI interactive command and is not available in RuneCode. Use the Claude CLI terminal for interactive commands.`,
        } as ClaudeStreamMessage;
        setMessages(prev => [...prev, infoMessage]);
        return;
      }
    }

    if (!projectPath) {
      setError("Please select a project directory first");
      return;
    }

    // If already loading, queue the prompt
    if (isLoading) {
      const newPrompt = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        prompt,
        model,
        thinkingMode,
        effort,
        permissionMode
      };
      setQueuedPrompts(prev => [...prev, newPrompt]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      hasActiveSessionRef.current = true;
      
      // For resuming sessions, ensure we have the session ID
      if (effectiveSession && !claudeSessionId) {
        setClaudeSessionId(effectiveSession.id);
      }
      
      // Only clean up and set up new listeners if not already listening
      if (!isListeningRef.current) {
        // Clean up previous listeners
        unlistenRefs.current.forEach(unlisten => unlisten());
        unlistenRefs.current = [];
        
        // Mark as setting up listeners
        isListeningRef.current = true;
        
        // --------------------------------------------------------------------
        // 1️⃣  Event Listener Setup Strategy
        // --------------------------------------------------------------------
        // Claude Code may emit a *new* session_id even when we pass --resume. If
        // we listen only on the old session-scoped channel we will miss the
        // stream until the user navigates away & back. To avoid this we:
        //   • Always start with GENERIC listeners (no suffix) so we catch the
        //     very first "system:init" message regardless of the session id.
        //   • Once that init message provides the *actual* session_id, we
        //     dynamically switch to session-scoped listeners and stop the
        //     generic ones to prevent duplicate handling.
        // --------------------------------------------------------------------



        let currentSessionId: string | null = claudeSessionId || effectiveSession?.id || null;

        // Helper to attach session-specific listeners **once we are sure**
        const attachSessionSpecificListeners = async (sid: string) => {


          const specificOutputUnlisten = await listen(`claude-output:${sid}`, (evt: any) => {
            handleStreamMessage(evt.payload);
          });

          const specificErrorUnlisten = await listen(`claude-error:${sid}`, (evt: any) => {
            console.error('Claude error (scoped):', evt.payload);
            setError(evt.payload);
          });

          const specificCompleteUnlisten = await listen(`claude-complete:${sid}`, (evt: any) => {
            processComplete(evt.payload);
          });

          // Replace existing unlisten refs with these new ones (after cleaning up)
          unlistenRefs.current.forEach((u) => u());
          unlistenRefs.current = [specificOutputUnlisten, specificErrorUnlisten, specificCompleteUnlisten];
        };

        // Generic listeners (catch-all)
        const genericOutputUnlisten = await listen('claude-output', async (event: any) => {
          handleStreamMessage(event.payload);

          // Attempt to extract session_id on the fly (for the very first init)
          try {
            const msg = JSON.parse(event.payload) as ClaudeStreamMessage;
            if (msg.type === 'system' && msg.subtype === 'init' && msg.session_id) {
              if (!currentSessionId || currentSessionId !== msg.session_id) {
                console.log('[ClaudeCodeSession] Detected new session_id from generic listener:', msg.session_id);
                currentSessionId = msg.session_id;
                setClaudeSessionId(msg.session_id);

                // If we haven't extracted session info before, do it now
                if (!extractedSessionInfo) {
                  const projectId = projectPath.replace(/[^a-zA-Z0-9]/g, '-');
                  setExtractedSessionInfo({ sessionId: msg.session_id, projectId });
                  
                  // Save session data for restoration
                  SessionPersistenceService.saveSession(
                    msg.session_id,
                    projectId,
                    projectPath,
                    messages.length
                  );
                }

                // Switch to session-specific listeners
                await attachSessionSpecificListeners(msg.session_id);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        // Helper to process any JSONL stream message string or object
        function handleStreamMessage(payload: string | ClaudeStreamMessage) {
          try {
            // Don't process if component unmounted
            if (!isMountedRef.current) return;
            
            let message: ClaudeStreamMessage;
            let rawPayload: string;
            
            if (typeof payload === 'string') {
              // Tauri mode: payload is a JSON string
              rawPayload = payload;
              message = JSON.parse(payload) as ClaudeStreamMessage;
            } else {
              // Web mode: payload is already parsed object
              message = payload;
              rawPayload = JSON.stringify(payload);
            }
            
            // Track enhanced tool execution
            if (message.type === 'assistant' && message.message?.content) {
              const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
              toolUses.forEach((toolUse: any) => {
                // Increment tools executed counter
                sessionMetrics.current.toolsExecuted += 1;
                sessionMetrics.current.lastActivityTime = Date.now();

                // Track file operations
                const toolName = toolUse.name?.toLowerCase() || '';
                if (toolName.includes('create') || toolName.includes('write')) {
                  sessionMetrics.current.filesCreated += 1;
                } else if (toolName.includes('edit') || toolName.includes('multiedit') || toolName.includes('search_replace')) {
                  sessionMetrics.current.filesModified += 1;
                } else if (toolName.includes('delete')) {
                  sessionMetrics.current.filesDeleted += 1;
                }

                // Track tool start - we'll track completion when we get the result
                workflowTracking.trackStep(toolUse.name);
              });
            }

            // Track tool results
            if (message.type === 'user' && message.message?.content) {
              const toolResults = message.message.content.filter((c: any) => c.type === 'tool_result');
              toolResults.forEach((result: any) => {
                const isError = result.is_error || false;
                // Note: We don't have execution time here, but we can track success/failure
                if (isError) {
                  sessionMetrics.current.toolsFailed += 1;
                  sessionMetrics.current.errorsEncountered += 1;

                  trackEvent.enhancedError({
                    error_type: 'tool_execution',
                    error_code: 'tool_failed',
                    error_message: result.content,
                    context: `Tool execution failed`,
                    user_action_before_error: 'executing_tool',
                    recovery_attempted: false,
                    recovery_successful: false,
                    error_frequency: 1,
                    stack_trace_hash: undefined
                  });
                }
              });
            }

            // Track code blocks generated
            if (message.type === 'assistant' && message.message?.content) {
              const codeBlocks = message.message.content.filter((c: any) =>
                c.type === 'text' && c.text?.includes('```')
              );
              if (codeBlocks.length > 0) {
                // Count code blocks in text content
                codeBlocks.forEach((block: any) => {
                  const matches = (block.text.match(/```/g) || []).length;
                  sessionMetrics.current.codeBlocksGenerated += Math.floor(matches / 2);
                });
              }
            }

            // Track errors in system messages
            if (message.type === 'system' && (message.subtype === 'error' || message.error)) {
              sessionMetrics.current.errorsEncountered += 1;
            }

            // Buffer message — flushed to state in the next animation frame
            bufferMessage(message, rawPayload);
          } catch (err) {
            console.error('Failed to parse message:', err, payload);
          }
        }

        // Helper to handle completion events (both generic and scoped)
        const processComplete = async (success: boolean) => {
          setIsLoading(false);
          hasActiveSessionRef.current = false;
          isListeningRef.current = false; // Reset listening state
          
          // Track enhanced session stopped metrics when session completes
          if (effectiveSession && claudeSessionId) {
            const sessionStartTimeValue = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
            const duration = Date.now() - sessionStartTimeValue;
            const metrics = sessionMetrics.current;
            const timeToFirstMessage = metrics.firstMessageTime 
              ? metrics.firstMessageTime - sessionStartTime.current 
              : undefined;
            const idleTime = Date.now() - metrics.lastActivityTime;
            const avgResponseTime = metrics.toolExecutionTimes.length > 0
              ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
              : undefined;
            
            trackEvent.enhancedSessionStopped({
              // Basic metrics
              duration_ms: duration,
              messages_count: messages.length,
              reason: success ? 'completed' : 'error',
              
              // Timing metrics
              time_to_first_message_ms: timeToFirstMessage,
              average_response_time_ms: avgResponseTime,
              idle_time_ms: idleTime,
              
              // Interaction metrics
              prompts_sent: metrics.promptsSent,
              tools_executed: metrics.toolsExecuted,
              tools_failed: metrics.toolsFailed,
              files_created: metrics.filesCreated,
              files_modified: metrics.filesModified,
              files_deleted: metrics.filesDeleted,
              
              // Content metrics
              total_tokens_used: totalTokens,
              code_blocks_generated: metrics.codeBlocksGenerated,
              errors_encountered: metrics.errorsEncountered,
              
              // Session context
              model: metrics.modelChanges.length > 0 
                ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
                : 'sonnet',
              has_checkpoints: metrics.checkpointCount > 0,
              checkpoint_count: metrics.checkpointCount,
              was_resumed: metrics.wasResumed,
              
              // Agent context (if applicable)
              agent_type: undefined, // TODO: Pass from agent execution
              agent_name: undefined, // TODO: Pass from agent execution
              agent_success: success,
              
              // Stop context
              stop_source: 'completed',
              final_state: success ? 'success' : 'failed',
              has_pending_prompts: queuedPrompts.length > 0,
              pending_prompts_count: queuedPrompts.length,
            });
          }

          if (effectiveSession && success) {
            try {
              const settings = await api.getCheckpointSettings(
                effectiveSession.id,
                effectiveSession.project_id,
                projectPath
              );

              if (settings.auto_checkpoint_enabled) {
                await api.checkAutoCheckpoint(
                  effectiveSession.id,
                  effectiveSession.project_id,
                  projectPath,
                  prompt
                );
                // Reload timeline to show new checkpoint
                setTimelineVersion((v) => v + 1);
              }
            } catch (err) {
              console.error('Failed to check auto checkpoint:', err);
            }
          }

          // Process queued prompts after completion
          if (queuedPromptsRef.current.length > 0) {
            const [nextPrompt, ...remainingPrompts] = queuedPromptsRef.current;
            setQueuedPrompts(remainingPrompts);
            
            // Small delay to ensure UI updates
            setTimeout(() => {
              handleSendPrompt(nextPrompt.prompt, nextPrompt.model, nextPrompt.thinkingMode || "auto", nextPrompt.effort || "high", nextPrompt.permissionMode || "bypassPermissions");
            }, 100);
          }
        };

        const genericErrorUnlisten = await listen('claude-error', (evt: any) => {
          console.error('Claude error:', evt.payload);
          setError(evt.payload);
        });

        const genericCompleteUnlisten = await listen('claude-complete', (evt: any) => {
          processComplete(evt.payload);
        });

        // Store the generic unlisteners for now; they may be replaced later.
        unlistenRefs.current = [genericOutputUnlisten, genericErrorUnlisten, genericCompleteUnlisten];

        // --------------------------------------------------------------------
        // 2️⃣  Auto-checkpoint logic moved after listener setup (unchanged)
        // --------------------------------------------------------------------

        // Add the user message immediately to the UI (after setting up listeners)
        const userMessage: ClaudeStreamMessage = {
          type: "user",
          message: {
            content: [
              {
                type: "text",
                text: prompt
              }
            ]
          }
        };
        setMessages(prev => [...prev, userMessage]);
        
        // Update session metrics
        sessionMetrics.current.promptsSent += 1;
        sessionMetrics.current.lastActivityTime = Date.now();
        if (!sessionMetrics.current.firstMessageTime) {
          sessionMetrics.current.firstMessageTime = Date.now();
        }
        
        // Track model changes
        const lastModel = sessionMetrics.current.modelChanges.length > 0 
          ? sessionMetrics.current.modelChanges[sessionMetrics.current.modelChanges.length - 1].to
          : (sessionMetrics.current.wasResumed ? 'sonnet' : model); // Default to sonnet if resumed
        
        if (lastModel !== model) {
          sessionMetrics.current.modelChanges.push({
            from: lastModel,
            to: model,
            timestamp: Date.now()
          });
        }
        
        // Track enhanced prompt submission
        const codeBlockMatches = prompt.match(/```[\s\S]*?```/g) || [];
        const hasCode = codeBlockMatches.length > 0;
        const conversationDepth = messages.filter(m => m.user_message).length;
        const sessionAge = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const wordCount = prompt.split(/\s+/).filter(word => word.length > 0).length;
        
        trackEvent.enhancedPromptSubmitted({
          prompt_length: prompt.length,
          model: model,
          has_attachments: false, // TODO: Add attachment support when implemented
          source: 'keyboard', // TODO: Track actual source (keyboard vs button)
          word_count: wordCount,
          conversation_depth: conversationDepth,
          prompt_complexity: wordCount < 20 ? 'simple' : wordCount < 100 ? 'moderate' : 'complex',
          contains_code: hasCode,
          language_detected: hasCode ? codeBlockMatches?.[0]?.match(/```(\w+)/)?.[1] : undefined,
          session_age_ms: sessionAge
        });

        // Extract sub-agent/team config from session config store
        const sessionConfig = useSessionConfig.getState();
        // Get selected remote environment (if any)
        const selectedEnv = getSelectedEnvironment();
        const environmentConfig = selectedEnv ? {
          type: selectedEnv.type,
          sshHost: selectedEnv.sshHost,
          sshPort: selectedEnv.sshPort,
          sshIdentityFile: selectedEnv.sshIdentityFile,
          startDirectory: selectedEnv.startDirectory,
          wslDistro: selectedEnv.wslDistro,
          dockerContainer: selectedEnv.dockerContainer,
        } : undefined;

        const agentConfig = {
          teamsEnabled: sessionConfig.teamsEnabled,
          subAgentDefaultModel: sessionConfig.subAgentDefaultModel,
          subAgentDefaultPermissionMode: sessionConfig.subAgentDefaultPermissionMode,
          subAgentProgressSummaries: sessionConfig.subAgentProgressSummaries,
          subAgentMaxTurns: sessionConfig.subAgentMaxTurns,
          teamMaxConcurrent: sessionConfig.teamMaxConcurrentAgents,
          teamDefaultModel: sessionConfig.teamDefaultModel,
          environment: environmentConfig,
        };

        // Execute the appropriate command
        if (connectionIdRef.current) {
          // Send follow-up through persistent connection
          console.log('[ClaudeCodeSession] Sending follow-up via persistent connection:', connectionIdRef.current);
          trackEvent.modelSelected(model);
          await api.executeClaudeCode(projectPath, prompt, model, thinkingMode, connectionIdRef.current, undefined, effort, undefined, permissionMode, agentConfig);
        } else {
          // First message — initialize persistent session
          const sessionId = effectiveSession?.id;
          if (sessionId) {
            console.log('[ClaudeCodeSession] Resuming session:', sessionId);
            trackEvent.sessionResumed(sessionId);
          } else {
            console.log('[ClaudeCodeSession] Starting new session');
          }
          trackEvent.modelSelected(model);
          if (!sessionId) {
            trackEvent.sessionCreated(model, 'prompt_input');
          }
          const resumeAt = resumeAtRef.current;
          resumeAtRef.current = null; // clear after use
          const result = await api.executeClaudeCode(projectPath, prompt, model, thinkingMode, undefined, sessionId, effort, resumeAt || undefined, permissionMode, agentConfig);
          // Store connectionId for subsequent messages
          if (result && typeof result === 'object' && 'connectionId' in result) {
            setConnectionId((result as any).connectionId);
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

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join('\n');
    await navigator.clipboard.writeText(jsonl);
  };

  const handleCopyAsMarkdown = async () => {
    let markdown = `# Claude Code Session\n\n`;
    markdown += `**Project:** ${projectPath}\n`;
    markdown += `**Date:** ${new Date().toISOString()}\n\n`;
    markdown += `---\n\n`;

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
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text || content));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_use") {
            markdown += `### Tool: ${content.name}\n\n`;
            markdown += `\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
          }
        }
        if (msg.message.usage) {
          markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
        }
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") {
            const textContent = typeof content.text === 'string' 
              ? content.text 
              : (content.text?.text || JSON.stringify(content.text));
            markdown += `${textContent}\n\n`;
          } else if (content.type === "tool_result") {
            markdown += `### Tool Result\n\n`;
            let contentText = '';
            if (typeof content.content === 'string') {
              contentText = content.content;
            } else if (content.content && typeof content.content === 'object') {
              if (content.content.text) {
                contentText = content.content.text;
              } else if (Array.isArray(content.content)) {
                contentText = content.content
                  .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                  .join('\n');
              } else {
                contentText = JSON.stringify(content.content, null, 2);
              }
            }
            markdown += `\`\`\`\n${contentText}\n\`\`\`\n\n`;
          }
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) {
          markdown += `${msg.result}\n\n`;
        }
        if (msg.error) {
          markdown += `**Error:** ${msg.error}\n\n`;
        }
      }
    }

    await navigator.clipboard.writeText(markdown);
  };

  const handleCancelExecution = async () => {
    if (!claudeSessionId || !isLoading) return;

    try {
      const sessionStartTime = messages.length > 0 ? messages[0].timestamp || Date.now() : Date.now();
      const duration = Date.now() - sessionStartTime;

      await api.cancelClaudeExecution(connectionIdRef.current || undefined, claudeSessionId);
      
      // Calculate metrics for enhanced analytics
      const metrics = sessionMetrics.current;
      const timeToFirstMessage = metrics.firstMessageTime 
        ? metrics.firstMessageTime - sessionStartTime.current 
        : undefined;
      const idleTime = Date.now() - metrics.lastActivityTime;
      const avgResponseTime = metrics.toolExecutionTimes.length > 0
        ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) / metrics.toolExecutionTimes.length
        : undefined;
      
      // Track enhanced session stopped
      trackEvent.enhancedSessionStopped({
        // Basic metrics
        duration_ms: duration,
        messages_count: messages.length,
        reason: 'user_stopped',
        
        // Timing metrics
        time_to_first_message_ms: timeToFirstMessage,
        average_response_time_ms: avgResponseTime,
        idle_time_ms: idleTime,
        
        // Interaction metrics
        prompts_sent: metrics.promptsSent,
        tools_executed: metrics.toolsExecuted,
        tools_failed: metrics.toolsFailed,
        files_created: metrics.filesCreated,
        files_modified: metrics.filesModified,
        files_deleted: metrics.filesDeleted,
        
        // Content metrics
        total_tokens_used: totalTokens,
        code_blocks_generated: metrics.codeBlocksGenerated,
        errors_encountered: metrics.errorsEncountered,
        
        // Session context
        model: metrics.modelChanges.length > 0 
          ? metrics.modelChanges[metrics.modelChanges.length - 1].to 
          : 'sonnet', // Default to sonnet
        has_checkpoints: metrics.checkpointCount > 0,
        checkpoint_count: metrics.checkpointCount,
        was_resumed: metrics.wasResumed,
        
        // Agent context (if applicable)
        agent_type: undefined, // TODO: Pass from agent execution
        agent_name: undefined, // TODO: Pass from agent execution
        agent_success: undefined, // TODO: Pass from agent execution
        
        // Stop context
        stop_source: 'user_button',
        final_state: 'cancelled',
        has_pending_prompts: queuedPrompts.length > 0,
        pending_prompts_count: queuedPrompts.length,
      });
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
      
      // Clear queued prompts
      setQueuedPrompts([]);
      
      // Add a message indicating the session was cancelled
      const cancelMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "info",
        result: "Session cancelled by user",
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, cancelMessage]);
    } catch (err) {
      console.error("Failed to cancel execution:", err);
      
      // Even if backend fails, we should update UI to reflect stopped state
      // Add error message but still stop the UI loading state
      const errorMessage: ClaudeStreamMessage = {
        type: "system",
        subtype: "error",
        result: `Failed to cancel execution: ${err instanceof Error ? err.message : 'Unknown error'}. The process may still be running in the background.`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
      
      // Clean up listeners anyway
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      
      // Reset states to allow user to continue
      setIsLoading(false);
      hasActiveSessionRef.current = false;
      isListeningRef.current = false;
      setError(null);
    }
  };

  const handleCompositionStart = () => {
    isIMEComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isIMEComposingRef.current = false;
    }, 0);
  };

  const handleConfirmFork = async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const newSessionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName
      );
      
      // Open the new forked session
      // You would need to implement navigation to the new session
      console.log("Forked to new session:", newSessionId);
      
      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      console.error("Failed to fork checkpoint:", err);
      setError("Failed to fork checkpoint");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle URL detection from terminal output
  // Build compact conversation context for AI autocomplete (last 5 messages, max 800 chars)
  const conversationContext = useMemo(() => {
    const recent = displayableMessages.slice(-5);
    const parts: string[] = [];
    for (const msg of recent) {
      if (msg.type === 'user' && msg.message?.content) {
        const text = Array.isArray(msg.message.content)
          ? msg.message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
          : String(msg.message.content);
        if (text.trim()) parts.push(`User: ${text.trim().slice(0, 150)}`);
      } else if (msg.type === 'assistant' && msg.message?.content) {
        const text = Array.isArray(msg.message.content)
          ? msg.message.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
          : '';
        if (text.trim()) parts.push(`Assistant: ${text.trim().slice(0, 150)}`);
      }
    }
    return parts.join('\n').slice(-800) || undefined;
  }, [displayableMessages]);

  const handleLinkDetected = useCallback((url: string) => {
    setPreviewUrl(prev => {
      if (!prev) { setShowPreviewPrompt(true); }
      return prev || url;
    });
  }, []);

  const handleClosePreview = () => {
    setShowPreview(false);
    setIsPreviewMaximized(false);
    // Keep the previewUrl so it can be restored when reopening
  };

  const handlePreviewUrlChange = (url: string) => {

    setPreviewUrl(url);
  };

  const handleTogglePreviewMaximize = () => {
    setIsPreviewMaximized(!isPreviewMaximized);
    // Reset split position when toggling maximize
    if (isPreviewMaximized) {
      setSplitPosition(50);
    }
  };

  // Cleanup event listeners and track mount state
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {

      isMountedRef.current = false;
      isListeningRef.current = false;
      
      // Track session completion with engagement metrics
      if (effectiveSession) {
        trackEvent.sessionCompleted();
        
        // Track session engagement
        const sessionDuration = sessionStartTime.current ? Date.now() - sessionStartTime.current : 0;
        const messageCount = messages.filter(m => m.user_message).length;
        const toolsUsed = new Set<string>();
        messages.forEach(msg => {
          if (msg.type === 'assistant' && msg.message?.content) {
            const tools = msg.message.content.filter((c: any) => c.type === 'tool_use');
            tools.forEach((tool: any) => toolsUsed.add(tool.name));
          }
        });
        
        // Calculate engagement score (0-100)
        const engagementScore = Math.min(100, 
          (messageCount * 10) + 
          (toolsUsed.size * 5) + 
          (sessionDuration > 300000 ? 20 : sessionDuration / 15000) // 5+ min session gets 20 points
        );
        
        trackEvent.sessionEngagement({
          session_duration_ms: sessionDuration,
          messages_sent: messageCount,
          tools_used: Array.from(toolsUsed),
          files_modified: 0, // TODO: Track file modifications
          engagement_score: Math.round(engagementScore)
        });
      }
      
      // Clean up listeners
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];

      // Close persistent session WebSocket on unmount
      if (connectionIdRef.current) {
        import('@/lib/apiAdapter').then(({ closeSessionSocket }) => {
          closeSessionSocket(connectionIdRef.current!);
        }).catch(() => { /* ignore cleanup errors */ });
      }

      // Clear checkpoint manager when session ends
      if (effectiveSession) {
        api.clearCheckpointManager(effectiveSession.id).catch(err => {
          console.error("Failed to clear checkpoint manager:", err);
        });
      }
    };
  }, [effectiveSession, projectPath]);

  const messagesList = (
    <div
      ref={parentRef}
      className={cn(
        "flex-1 overflow-y-auto relative scrollbar-autohide",
        isScrolling && "scrollbar-visible"
      )}
      onScroll={handleScroll}
      onMouseMove={() => {
        if (!isScrolling) {
          setIsScrolling(true);
          if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
          scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 2000);
        }
      }}
      onMouseLeave={() => {
        if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 800);
      }}
    >
      <div
        className="relative w-full max-w-6xl mx-auto px-4 pt-8 pb-4"
        style={{
          height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`,
          minHeight: '100px',
        }}
      >
        {/* Load more indicator */}
        {hasMoreMessages && (
          <div className="text-center py-3">
            <button
              onClick={() => setVisibleLimit(prev => prev + LOAD_MORE_COUNT)}
              className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              ↑ {allDisplayableMessages.length - visibleLimit} older messages · scroll up to load
            </button>
          </div>
        )}
        {/* No AnimatePresence — virtualizer handles item lifecycle; animation wrapper is too expensive */}
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const message = displayableMessages[virtualItem.index];
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={(el) => {
                  // Skip measurement during scroll restore — prevents the 400-675ms
                  // forced reflow cascade where measureElement reads offsetHeight on
                  // every item during the scroll-to-bottom animation.
                  if (el && !isRestoringScroll.current) rowVirtualizer.measureElement(el);
                }}
                className="absolute inset-x-4 pb-4"
                style={{
                  top: virtualItem.start,
                }}
              >
                <StreamMessage
                  message={message}
                  streamMessages={messagesRef.current}
                  onLinkDetected={handleLinkDetected}
                />
              </div>
            );
          })}
      </div>

      {/* Loading indicator under the latest message */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="flex items-center justify-center py-4 mb-20"
        >
          <RotatingRune size={20} className="text-primary" />
        </motion.div>
      )}

      {/* Error indicator */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-20 w-full max-w-6xl mx-auto"
        >
          {error}
        </motion.div>
      )}
    </div>
  );

  const projectPathInput = null; // Removed project path display

  // If preview is maximized, render only the WebviewPreview in full screen
  if (showPreview && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 z-50 bg-background"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <WebviewPreview
            initialUrl={previewUrl}
            onClose={handleClosePreview}
            isMaximized={isPreviewMaximized}
            onToggleMaximize={handleTogglePreviewMaximize}
            onUrlChange={handlePreviewUrlChange}
            className="h-full"
          />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col h-full bg-background", className)}>
        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden relative">
          {showPreview ? (
            // Split pane layout when preview is active
            <SplitPane
              left={
                <div className="h-full flex flex-col">
                  {projectPathInput}
                  {messagesList}
                </div>
              }
              right={
                <WebviewPreview
                  initialUrl={previewUrl}
                  onClose={handleClosePreview}
                  isMaximized={isPreviewMaximized}
                  onToggleMaximize={handleTogglePreviewMaximize}
                  onUrlChange={handlePreviewUrlChange}
                />
              }
              initialSplit={splitPosition}
              onSplitChange={setSplitPosition}
              minLeftWidth={400}
              minRightWidth={400}
              className="h-full"
            />
          ) : (
            // Original layout when no preview
            <div className="h-full flex flex-col max-w-6xl mx-auto px-6">
              {projectPathInput}
              {messagesList}
              
              {isLoading && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3">
                    <RotatingRune size={20} className="text-primary" />
                    <span className="text-sm text-muted-foreground">
                      {session ? "Loading session history..." : "Inscribing runes..."}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Scroll control — locked: small lock indicator; unlocked: arrow-down to jump back */}
          <AnimatePresence mode="wait">
            {displayableMessages.length > 0 && scrollLocked && (
              <motion.div
                key="locked"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="absolute bottom-3 right-3 z-30"
              >
                <button
                  onClick={() => { setScrollLocked(false); isAtBottomRef.current = false; }}
                  title="Auto-scroll on — click to unlock"
                  className="flex items-center gap-1 p-1.5 rounded-full text-primary/40 hover:text-primary/70 hover:bg-primary/10 transition-colors"
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
                className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5"
              >
                {newMessageCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-primary/15 text-primary border border-primary/20">
                    {newMessageCount} new
                  </span>
                )}
                <button
                  onClick={() => {
                    setScrollLocked(true);
                    setNewMessageCount(0);
                    setIsScrolledUp(false);
                    isAtBottomRef.current = true;
                    const el = parentRef.current;
                    if (el) {
                      rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
                      requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
                    }
                  }}
                  title="Scroll to bottom"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border shadow-lg backdrop-blur-sm transition-all bg-primary/15 text-primary border-primary/25 hover:bg-primary/25"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                  <span>Bottom</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating Prompt Input - Always visible */}
        <ErrorBoundary>
          {/* Queued Prompts Display */}
          <AnimatePresence>
            {queuedPrompts.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4"
              >
                <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      Queued Prompts ({queuedPrompts.length})
                    </div>
                    <TooltipSimple content={queuedPromptsCollapsed ? "Expand queue" : "Collapse queue"} side="top">
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(prev => !prev)}>
                          {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </motion.div>
                    </TooltipSimple>
                  </div>
                  {!queuedPromptsCollapsed && queuedPrompts.map((queuedPrompt, index) => (
                    <motion.div
                      key={queuedPrompt.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15, delay: index * 0.02 }}
                      className="flex items-start gap-2 bg-muted/50 rounded-md p-2"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                            {queuedPrompt.model === "opus" ? "Opus" : "Sonnet"}
                          </span>
                        </div>
                        <p className="text-sm line-clamp-2 break-words">{queuedPrompt.prompt}</p>
                      </div>
                      <motion.div
                        whileTap={{ scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                      >
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 flex-shrink-0"
                          onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== queuedPrompt.id))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Sub-agent tracker — live subagent lifecycle panel */}
          <SubAgentTracker />

          {/* Team dashboard — team coordination visibility */}
          <TeamDashboard />

          {/* Activity status bar — shows active tools, tasks, subagents */}
          <SessionActivityBar messages={messages} isLoading={isLoading} />

          {showFooter && (() => {
            const footerEl = document.getElementById("runecode-footer-portal");
            if (!footerEl) return null;
            return createPortal(
              <div className="shrink-0 w-full z-40">
                <FloatingPromptInput
                  ref={floatingPromptRef}
                  onSend={handleSendPrompt}
                  onCancel={handleCancelExecution}
                  isLoading={isLoading}
                  disabled={!projectPath}
                  projectPath={projectPath}
                  sessionId={effectiveSession?.id}
                  projectId={effectiveSession?.project_id}
                  onCopyMarkdown={() => handleCopyAsMarkdown()}
                  onCopyJsonl={() => handleCopyAsJsonl()}
                  conversationContext={conversationContext}
                />
              </div>,
              footerEl,
            );
          })()}

        </ErrorBoundary>

        {/* Rewind Sidebar */}
        <AnimatePresence>
          {(showTimeline || showRewindPanel) && (
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed right-0 w-full sm:w-96 bg-background border-l border-border shadow-2xl z-50 overflow-hidden"
              style={{ top: '40px', bottom: '0px' }}
            >
              <RewindPanel
                isOpen={true}
                onClose={() => { setShowTimeline(false); setShowRewindPanel(false); }}
                connectionId={connectionIdRef.current}
                sessionId={claudeSessionId}
                projectPath={projectPath}
                messages={messages}
                embedded
              />
            </motion.div>
          )}
        </AnimatePresence>

      {/* Fork Dialog */}
      <Dialog open={showForkDialog} onOpenChange={setShowForkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fork Session</DialogTitle>
            <DialogDescription>
              Create a new session branch from the selected checkpoint.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fork-name">New Session Name</Label>
              <Input
                id="fork-name"
                placeholder="e.g., Alternative approach"
                value={forkSessionName}
                onChange={(e) => setForkSessionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isLoading) {
                    if (e.nativeEvent.isComposing || isIMEComposingRef.current) {
                      return;
                    }
                    handleConfirmFork();
                  }
                }}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowForkDialog(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmFork}
              disabled={isLoading || !forkSessionName.trim()}
            >
              Create Fork
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      {showSettings && effectiveSession && (
        <Dialog open={showSettings} onOpenChange={setShowSettings}>
          <DialogContent className="max-w-2xl">
            <CheckpointSettings
              sessionId={effectiveSession.id}
              projectId={effectiveSession.project_id}
              projectPath={projectPath}
              onClose={() => setShowSettings(false)}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Slash Commands Settings Dialog */}
      {showSlashCommandsSettings && (
        <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle>Slash Commands</DialogTitle>
              <DialogDescription>
                Manage project-specific slash commands for {projectPath}
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto">
              <SlashCommandsManager projectPath={projectPath} />
            </div>
          </DialogContent>
        </Dialog>
      )}
      </div>
    </TooltipProvider>
  );
};
