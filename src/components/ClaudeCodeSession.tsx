import React, { useState, useEffect, useRef, useMemo, useCallback, startTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowDown, ChevronDown, ChevronUp, Lock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RotatingRune } from "./RuneCodeLogo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/domain/session";
import { StreamMessage } from "./StreamMessage";
import { FloatingPromptInput, type FloatingPromptInputRef } from "./FloatingPromptInput";
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
import { useComponentMetrics } from "@/hooks";
import { useClaudeSession } from "@/hooks/useClaudeSession";
import { useSessionCost } from "@/hooks/useSessionCost";
import { useCheckpoint } from "@/hooks/useCheckpoint";
import { useDisplayableMessages } from "@/hooks/useDisplayableMessages";
import { copySessionAsMarkdown } from "@/lib/sessionExport";

interface ClaudeCodeSessionProps {
  /** Optional session to resume (when clicking from SessionList) */
  session?: Session;
  /** Initial project path (for new sessions) */
  initialProjectPath?: string;
  /** Callback to go back */
  onBack: () => void;
  /** Callback to open hooks configuration */
  onProjectSettings?: (projectPath: string) => void;
  /** Optional className for styling */
  className?: string;
  /** Callback when streaming state changes */
  onStreamingChange?: (isStreaming: boolean, sessionId: string | null) => void;
  /** Callback when project path changes */
  onProjectPathChange?: (path: string) => void;
  /** Whether this session's tab is visible and should auto-scroll */
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
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Reset live usage when session changes
  useEffect(() => {
    useSessionStore.getState().resetLiveUsage();
    return () => { useSessionStore.getState().resetLiveUsage(); };
  }, [session?.id]);

  const [totalTokens, setTotalTokens] = useState(0);
  const [_sessionCostUsd, setSessionCostUsd] = useState(0);
  const [, setTimelineVersion] = useState(0);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showSlashCommandsSettings, setShowSlashCommandsSettings] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [, setShowPreviewPrompt] = useState(false);
  const [showRewindPanel, setShowRewindPanel] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [splitPosition, setSplitPosition] = useState(50);
  const [isPreviewMaximized, setIsPreviewMaximized] = useState(false);
  const [queuedPromptsCollapsed, setQueuedPromptsCollapsed] = useState(false);

  // Message batching — buffer incoming stream messages and flush in rAF
  const msgBufferRef = useRef<ClaudeStreamMessage[]>([]);
  const flushRafRef = useRef(0);
  const flushMessageBuffer = useCallback(() => {
    flushRafRef.current = 0;
    const msgs = msgBufferRef.current;
    if (msgs.length === 0) return;
    msgBufferRef.current = [];
    startTransition(() => { setMessages(prev => [...prev, ...msgs]); });
  }, []);
  const bufferMessage = useCallback((message: ClaudeStreamMessage) => {
    msgBufferRef.current.push(message);
    if (!flushRafRef.current) flushRafRef.current = requestAnimationFrame(flushMessageBuffer);
  }, [flushMessageBuffer]);
  useEffect(() => () => { if (flushRafRef.current) cancelAnimationFrame(flushRafRef.current); }, []);

  // Auto-scroll system
  const parentRef = useRef<HTMLDivElement>(null);
  const floatingPromptRef = useRef<FloatingPromptInputRef>(null);
  const isIMEComposingRef = useRef(false);
  const historyLoadedRef = useRef<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(true);
  const scrollLockedRef = useRef(true);
  useEffect(() => { scrollLockedRef.current = scrollLocked; }, [scrollLocked]);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const isAtBottomRef = useRef(true);
  const isRestoringScroll = useRef(false);
  const loadMoreCooldown = useRef(false);
  const shrinkCooldown = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isScrolling, setIsScrolling] = useState(false);

  // Effective session (from prop or extracted from stream)
  const [extractedSessionInfo] = useState<{ sessionId: string; projectId: string } | null>(null);
  const effectiveSession = useMemo(() => {
    if (session) return session;
    if (extractedSessionInfo) {
      return { id: extractedSessionInfo.sessionId, project_id: extractedSessionInfo.projectId, project_path: projectPath, created_at: Date.now() } as Session;
    }
    return null;
  }, [session, extractedSessionInfo, projectPath]);

  // ── Hooks ──────────────────────────────────────────────────────────────────

  const checkpoint = useCheckpoint(effectiveSession, projectPath, setTimelineVersion);

  const claudeSession = useClaudeSession({
    projectPath,
    session,
    effectiveSession,
    messages,
    messagesRef,
    setMessages,
    totalTokens,
    onSessionComplete: checkpoint.checkAutoCheckpoint,
    bufferMessage: (msg, _raw) => bufferMessage(msg),
  });

  const {
    isLoading, error, claudeSessionId, rawJsonlOutput,
    queuedPrompts, setQueuedPrompts,
    connectionIdRef, resumeAtRef,
    handleSendPrompt, handleCancelExecution, initializeFromSession, resetConnection,
  } = claudeSession;

  useSessionCost(messages, setTotalTokens, setSessionCostUsd);
  useComponentMetrics('ClaudeCodeSession');

  const {
    allDisplayableMessages, displayableMessages, hasMoreMessages,
    visibleLimit, setVisibleLimit, allDisplayableRef,
  } = useDisplayableMessages(messages, isScrolledUp);

  const LOAD_MORE_COUNT = 20;

  const rowVirtualizer = useVirtualizer({
    count: displayableMessages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 150,
    overscan: 2,
  });

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { if (onProjectPathChange && projectPath) onProjectPathChange(projectPath); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onStreamingChange?.(isLoading, claudeSessionId); }, [isLoading, claudeSessionId, onStreamingChange]);

  const sessionId = session?.id;
  useEffect(() => {
    if (sessionId && sessionId !== historyLoadedRef.current) {
      historyLoadedRef.current = sessionId;
      initializeFromSession(session!);
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!showFooter) { setShowRewindPanel(false); setShowTimeline(false); } }, [showFooter]);

  useEffect(() => {
    if (!isActive) return;
    const t = setTimeout(() => {
      const el = parentRef.current;
      if (el) { el.scrollTop = el.scrollHeight; isAtBottomRef.current = true; if (!scrollLockedRef.current) { setScrollLocked(true); setIsScrolledUp(false); setNewMessageCount(0); } }
    }, 16);
    return () => clearTimeout(t);
  }, [isActive]);

  useEffect(() => {
    if (!showFooter) return;
    const toggle = () => { setShowRewindPanel(p => !p); setShowTimeline(false); };
    window.addEventListener('runecode:open-timeline', toggle);
    return () => window.removeEventListener('runecode:open-timeline', toggle);
  }, [showFooter]);

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
          const idx = messagesRef.current.findIndex(m => m.uuid === userMessageId);
          if (idx >= 0) setMessages(prev => prev.slice(0, idx + 1));
          resetConnection();
          resumeAtRef.current = userMessageId;
        }
        setShowRewindPanel(false);
      } catch (err) { console.error('Rewind failed:', err); }
    };
    window.addEventListener('runecode:rewind', handleRewind as unknown as EventListener);
    return () => window.removeEventListener('runecode:rewind', handleRewind as unknown as EventListener);
  }, [showFooter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll listener
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        if (isRestoringScroll.current) return;
        const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = dist < 80;
        isAtBottomRef.current = atBottom;
        if (atBottom && !scrollLockedRef.current) { setScrollLocked(true); setNewMessageCount(0); setIsScrolledUp(false); }
        if (!atBottom && scrollLockedRef.current) { setScrollLocked(false); setIsScrolledUp(true); }
        if (!scrollTimeoutRef.current) setIsScrolling(true);
        else clearTimeout(scrollTimeoutRef.current);
        scrollTimeoutRef.current = setTimeout(() => { scrollTimeoutRef.current = null; setIsScrolling(false); }, 2000);
        if (el.scrollTop < 100 && !loadMoreCooldown.current) {
          loadMoreCooldown.current = true;
          setVisibleLimit(prev => Math.min(prev + LOAD_MORE_COUNT, allDisplayableRef.current));
          setTimeout(() => { loadMoreCooldown.current = false; }, 300);
        }
        if (atBottom && !shrinkCooldown.current) {
          shrinkCooldown.current = true;
          setVisibleLimit(12);
          setTimeout(() => { shrinkCooldown.current = false; }, 500);
        }
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    let resizeRaf = 0;
    const ro = new ResizeObserver(() => {
      if (!scrollLockedRef.current) return;
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { if (scrollLockedRef.current && el.scrollHeight > el.clientHeight) { el.scrollTop = el.scrollHeight; isAtBottomRef.current = true; } });
    });
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(resizeRaf); cancelAnimationFrame(scrollRaf); if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll on new messages
  const prevScrollMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length === 0 || messages.length === prevScrollMsgCount.current) return;
    const newCount = messages.length - prevScrollMsgCount.current;
    prevScrollMsgCount.current = messages.length;
    if (!scrollLocked) { if (newCount > 0) setNewMessageCount(p => p + newCount); return; }
    isRestoringScroll.current = true;
    let attempts = 0;
    const doScroll = () => {
      const el = parentRef.current;
      if (!el) { isRestoringScroll.current = false; return; }
      if (displayableMessages.length > 0) rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
      el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
      if (attempts++ < 3) requestAnimationFrame(doScroll);
      else requestAnimationFrame(() => { isRestoringScroll.current = false; });
    };
    requestAnimationFrame(doScroll);
  }, [messages.length, scrollLocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleCopyAsJsonl = async () => { await navigator.clipboard.writeText(rawJsonlOutput.join('\n')); };
  const handleCopyAsMarkdown = async () => { await copySessionAsMarkdown(projectPath, messages); };
  const handleLinkDetected = useCallback((url: string) => { setPreviewUrl(prev => { if (!prev) setShowPreviewPrompt(true); return prev || url; }); }, []);
  const handleClosePreview = () => { setShowPreview(false); setIsPreviewMaximized(false); };
  const handlePreviewUrlChange = (url: string) => { setPreviewUrl(url); };
  const handleTogglePreviewMaximize = () => { setIsPreviewMaximized(p => !p); if (isPreviewMaximized) setSplitPosition(50); };
  const handleCompositionStart = () => { isIMEComposingRef.current = true; };
  const handleCompositionEnd = () => { setTimeout(() => { isIMEComposingRef.current = false; }, 0); };

  // ── Render ─────────────────────────────────────────────────────────────────

  const messagesList = (
    <div
      ref={parentRef}
      className={cn("flex-1 overflow-y-auto relative scrollbar-autohide", isScrolling && "scrollbar-visible")}
      onMouseMove={() => { if (!isScrolling) { setIsScrolling(true); if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 2000); } }}
      onMouseLeave={() => { if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current); scrollTimeoutRef.current = setTimeout(() => setIsScrolling(false), 800); }}
    >
      <div className="relative w-full max-w-6xl mx-auto px-4 pt-8 pb-4" style={{ height: `${Math.max(rowVirtualizer.getTotalSize(), 100)}px`, minHeight: '100px' }}>
        {hasMoreMessages && (
          <div className="text-center py-3">
            <button onClick={() => setVisibleLimit(p => p + LOAD_MORE_COUNT)} className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors">
              ↑ {allDisplayableMessages.length - visibleLimit} older messages · scroll up to load
            </button>
          </div>
        )}
        {rowVirtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={(el) => { if (el && !isRestoringScroll.current) rowVirtualizer.measureElement(el); }}
            className="absolute inset-x-4 pb-4"
            style={{ top: virtualItem.start }}
          >
            <StreamMessage message={displayableMessages[virtualItem.index]} streamMessages={messagesRef.current} onLinkDetected={handleLinkDetected} />
          </div>
        ))}
      </div>
      {isLoading && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="flex items-center justify-center py-4 mb-20"><RotatingRune size={20} className="text-primary" /></motion.div>}
      {error && <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive mb-20 w-full max-w-6xl mx-auto">{error}</motion.div>}
    </div>
  );

  if (showPreview && isPreviewMaximized) {
    return (
      <AnimatePresence>
        <motion.div className="fixed inset-0 z-50 bg-background" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <WebviewPreview initialUrl={previewUrl} onClose={handleClosePreview} isMaximized={isPreviewMaximized} onToggleMaximize={handleTogglePreviewMaximize} onUrlChange={handlePreviewUrlChange} className="h-full" />
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col h-full bg-background", className)}>
        <div className="flex-1 overflow-hidden relative">
          {showPreview ? (
            <SplitPane
              left={<div className="h-full flex flex-col">{messagesList}</div>}
              right={<WebviewPreview initialUrl={previewUrl} onClose={handleClosePreview} isMaximized={isPreviewMaximized} onToggleMaximize={handleTogglePreviewMaximize} onUrlChange={handlePreviewUrlChange} />}
              initialSplit={splitPosition} onSplitChange={setSplitPosition} minLeftWidth={400} minRightWidth={400} className="h-full"
            />
          ) : (
            <div className="h-full flex flex-col max-w-6xl mx-auto px-6">
              {messagesList}
              {isLoading && messages.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-3"><RotatingRune size={20} className="text-primary" /><span className="text-sm text-muted-foreground">{session ? "Loading session history..." : "Inscribing runes..."}</span></div>
                </div>
              )}
            </div>
          )}

          {/* Scroll control */}
          <AnimatePresence mode="wait">
            {displayableMessages.length > 0 && scrollLocked && (
              <motion.div key="locked" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.12 }} className="absolute bottom-3 right-3 z-30">
                <button onClick={() => { setScrollLocked(false); isAtBottomRef.current = false; }} title="Auto-scroll on — click to unlock" className="flex items-center gap-1 p-1.5 rounded-full text-primary/40 hover:text-primary/70 hover:bg-primary/10 transition-colors">
                  <Lock className="h-3 w-3" />
                </button>
              </motion.div>
            )}
            {displayableMessages.length > 0 && !scrollLocked && (
              <motion.div key="unlocked" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }} className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5">
                {newMessageCount > 0 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-primary/15 text-primary border border-primary/20">{newMessageCount} new</span>}
                <button
                  onClick={() => { setScrollLocked(true); setNewMessageCount(0); setIsScrolledUp(false); isAtBottomRef.current = true; const el = parentRef.current; if (el) { rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' }); requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })); } }}
                  title="Scroll to bottom" className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-medium border shadow-lg backdrop-blur-sm transition-all bg-primary/15 text-primary border-primary/25 hover:bg-primary/25"
                >
                  <ArrowDown className="h-3.5 w-3.5" /><span>Bottom</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <ErrorBoundary>
          {/* Queued Prompts */}
          <AnimatePresence>
            {queuedPrompts.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 w-full max-w-3xl px-4">
                <div className="bg-background/95 backdrop-blur-md border rounded-lg shadow-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-muted-foreground mb-1">Queued Prompts ({queuedPrompts.length})</div>
                    <TooltipSimple content={queuedPromptsCollapsed ? "Expand queue" : "Collapse queue"} side="top">
                      <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                        <Button variant="ghost" size="icon" onClick={() => setQueuedPromptsCollapsed(p => !p)}>
                          {queuedPromptsCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                      </motion.div>
                    </TooltipSimple>
                  </div>
                  {!queuedPromptsCollapsed && queuedPrompts.map((qp, i) => (
                    <motion.div key={qp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.15, delay: i * 0.02 }} className="flex items-start gap-2 bg-muted/50 rounded-md p-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                          <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">{qp.model === "opus" ? "Opus" : "Sonnet"}</span>
                        </div>
                        <p className="text-sm line-clamp-2 break-words">{qp.prompt}</p>
                      </div>
                      <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                        <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={() => setQueuedPrompts(prev => prev.filter(p => p.id !== qp.id))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <SubAgentTracker />
          <TeamDashboard />
          <SessionActivityBar messages={messages} isLoading={isLoading} />

          {showFooter && (() => {
            const footerEl = document.getElementById("runecode-footer-portal");
            if (!footerEl) return null;
            return createPortal(
              <div className="shrink-0 w-full z-40">
                <FloatingPromptInput ref={floatingPromptRef} onSend={handleSendPrompt} onCancel={handleCancelExecution} isLoading={isLoading} disabled={!projectPath} projectPath={projectPath} sessionId={effectiveSession?.id} projectId={effectiveSession?.project_id} onCopyMarkdown={handleCopyAsMarkdown} onCopyJsonl={handleCopyAsJsonl} />
              </div>,
              footerEl,
            );
          })()}
        </ErrorBoundary>

        {/* Rewind Sidebar */}
        <AnimatePresence>
          {(showTimeline || showRewindPanel) && (
            <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 0.2, ease: "easeOut" }} className="fixed right-0 w-full sm:w-96 bg-background border-l border-border shadow-2xl z-50 overflow-hidden" style={{ top: '40px', bottom: '0px' }}>
              <RewindPanel isOpen={true} onClose={() => { setShowTimeline(false); setShowRewindPanel(false); }} connectionId={connectionIdRef.current} sessionId={claudeSessionId} projectPath={projectPath} messages={messages} embedded />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Fork Dialog */}
        <Dialog open={checkpoint.showForkDialog} onOpenChange={checkpoint.setShowForkDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Fork Session</DialogTitle><DialogDescription>Create a new session branch from the selected checkpoint.</DialogDescription></DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="fork-name">New Session Name</Label>
                <Input id="fork-name" placeholder="e.g., Alternative approach" value={checkpoint.forkSessionName} onChange={(e) => checkpoint.setForkSessionName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !checkpoint.isForkLoading) { if (e.nativeEvent.isComposing || isIMEComposingRef.current) return; checkpoint.handleConfirmFork(); } }}
                  onCompositionStart={handleCompositionStart} onCompositionEnd={handleCompositionEnd}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => checkpoint.setShowForkDialog(false)} disabled={checkpoint.isForkLoading}>Cancel</Button>
              <Button onClick={checkpoint.handleConfirmFork} disabled={checkpoint.isForkLoading || !checkpoint.forkSessionName.trim()}>Create Fork</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Settings Dialog */}
        {checkpoint.showSettings && effectiveSession && (
          <Dialog open={checkpoint.showSettings} onOpenChange={checkpoint.setShowSettings}>
            <DialogContent className="max-w-2xl">
              <CheckpointSettings sessionId={effectiveSession.id} projectId={effectiveSession.project_id} projectPath={projectPath} onClose={() => checkpoint.setShowSettings(false)} />
            </DialogContent>
          </Dialog>
        )}

        {/* Slash Commands Settings Dialog */}
        {showSlashCommandsSettings && (
          <Dialog open={showSlashCommandsSettings} onOpenChange={setShowSlashCommandsSettings}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden">
              <DialogHeader><DialogTitle>Slash Commands</DialogTitle><DialogDescription>Manage project-specific slash commands for {projectPath}</DialogDescription></DialogHeader>
              <div className="flex-1 overflow-y-auto"><SlashCommandsManager projectPath={projectPath} /></div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
};
