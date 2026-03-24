import { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  Copy,
  RotateCcw,
  ChevronDown,
  StopCircle
} from 'lucide-react';
import { RuneSpinner } from './RuneCodeLogo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Toast, ToastContainer } from '@/components/ui/toast';
import { Popover } from '@/components/ui/popover';
import { api, type AgentRunWithMetrics } from '@/lib/api';
import { useOutputCache } from '@/lib/outputCache';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { AgentRunMetricsHeader, AgentRunFullscreenHeader } from '@/components/agents/AgentRunMetrics';
import { AgentOutputRenderer } from '@/components/agents/AgentOutputRenderer';
import { formatISOTimestamp } from '@/lib/date-utils';
import type { ClaudeStreamMessage } from './AgentExecution';
import { useTabState } from '@/hooks/useTabState';

interface AgentRunOutputViewerProps {
  agentRunId: string;
  tabId: string;
  className?: string;
}

export function AgentRunOutputViewer({
  agentRunId,
  tabId,
  className
}: AgentRunOutputViewerProps) {
  const { updateTabTitle, updateTabStatus } = useTabState();
  const [run, setRun] = useState<AgentRunWithMetrics | null>(null);
  const [messages, setMessages] = useState<ClaudeStreamMessage[]>([]);
  const [rawJsonlOutput, setRawJsonlOutput] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [copyPopoverOpen, setCopyPopoverOpen] = useState(false);
  const [hasUserScrolled, setHasUserScrolled] = useState(false);

  const isInitialLoadRef = useRef(true);
  const hasSetupListenersRef = useRef(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const outputEndRef = useRef<HTMLDivElement>(null);
  const fullscreenScrollRef = useRef<HTMLDivElement>(null);
  const fullscreenMessagesEndRef = useRef<HTMLDivElement>(null);
  const unlistenRefs = useRef<UnlistenFn[]>([]);
  const { getCachedOutput, setCachedOutput } = useOutputCache();

  // Auto-scroll logic
  const scrollToBottom = () => {
    if (!hasUserScrolled) {
      const endRef = isFullscreen ? fullscreenMessagesEndRef.current : outputEndRef.current;
      if (endRef) {
        endRef.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  // Load agent run on mount
  useEffect(() => {
    const loadAgentRun = async () => {
      try {
        setLoading(true);
        const agentRun = await api.getAgent(agentRunId) as unknown as AgentRunWithMetrics;
        setRun(agentRun);
        updateTabTitle(tabId, `Agent: ${agentRun.agent_name || 'Unknown'}`);
        updateTabStatus(tabId, agentRun.status === 'running' ? 'running' : agentRun.status === 'failed' ? 'error' : 'complete');
      } catch (error) {
        console.error('Failed to load agent run:', error);
        updateTabStatus(tabId, 'error');
      } finally {
        setLoading(false);
      }
    };
    if (agentRunId) { loadAgentRun(); }
  }, [agentRunId, tabId, updateTabTitle, updateTabStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      hasSetupListenersRef.current = false;
    };
  }, []);

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, hasUserScrolled, isFullscreen]);

  const loadOutput = async (skipCache = false) => {
    if (!run?.id) return;

    try {
      if (!skipCache) {
        const cached = getCachedOutput(run.id);
        if (cached) {
          const cachedJsonlLines = cached.output.split('\n').filter(line => line.trim());
          setRawJsonlOutput(cachedJsonlLines);
          setMessages(cached.messages);
          if (Date.now() - cached.lastUpdated < 5000 && run.status !== 'running') { return; }
        }
      }

      setLoading(true);

      if (run.session_id && run.session_id !== '') {
        try {
          const history = await api.loadAgentSessionHistory(run.session_id);
          const loadedMessages: ClaudeStreamMessage[] = history.map(entry => ({ ...entry, type: entry.type || "assistant" }));
          setMessages(loadedMessages);
          setRawJsonlOutput(history.map(h => JSON.stringify(h)));
          setCachedOutput(run.id, { output: history.map(h => JSON.stringify(h)).join('\n'), messages: loadedMessages, lastUpdated: Date.now(), status: run.status });
          if (run.status === 'running') {
            setupLiveEventListeners();
            try { await api.streamSessionOutput(run.id); } catch (streamError) {
              console.warn('[AgentRunOutputViewer] Failed to start streaming, will poll instead:', streamError);
            }
          }
          return;
        } catch (err) {
          console.warn('[AgentRunOutputViewer] Failed to load from JSONL:', err);
        }
      }

      const rawOutput = await api.getSessionOutput(run.id);
      const jsonlLines = rawOutput.split('\n').filter(line => line.trim());
      setRawJsonlOutput(jsonlLines);
      const parsedMessages: ClaudeStreamMessage[] = [];
      for (const line of jsonlLines) {
        try { parsedMessages.push(JSON.parse(line) as ClaudeStreamMessage); }
        catch (err) { console.error("[AgentRunOutputViewer] Failed to parse message:", err, line); }
      }
      setMessages(parsedMessages);
      setCachedOutput(run.id, { output: rawOutput, messages: parsedMessages, lastUpdated: Date.now(), status: run.status });
      if (run.status === 'running') {
        setupLiveEventListeners();
        try { await api.streamSessionOutput(run.id); } catch (streamError) {
          console.warn('[AgentRunOutputViewer] Failed to start streaming (fallback), will poll instead:', streamError);
        }
      }
    } catch (error) {
      console.error('Failed to load agent output:', error);
      setToast({ message: 'Failed to load agent output', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const setupLiveEventListeners = async () => {
    if (!run?.id || hasSetupListenersRef.current) return;
    const runId = run.id;
    try {
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      hasSetupListenersRef.current = true;
      setTimeout(() => { isInitialLoadRef.current = false; }, 100);

      const outputUnlisten = await listen<string>(`agent-output:${runId}`, (event) => {
        try {
          if (isInitialLoadRef.current) return;
          setRawJsonlOutput(prev => [...prev, event.payload]);
          const message = JSON.parse(event.payload) as ClaudeStreamMessage;
          setMessages(prev => [...prev, message]);
        } catch (err) { console.error("[AgentRunOutputViewer] Failed to parse message:", err, event.payload); }
      });
      const errorUnlisten = await listen<string>(`agent-error:${runId}`, (event) => {
        console.error("[AgentRunOutputViewer] Agent error:", event.payload);
        setToast({ message: event.payload, type: 'error' });
      });
      const completeUnlisten = await listen<boolean>(`agent-complete:${runId}`, () => {
        setToast({ message: 'Agent execution completed', type: 'success' });
      });
      const cancelUnlisten = await listen<boolean>(`agent-cancelled:${runId}`, () => {
        setToast({ message: 'Agent execution was cancelled', type: 'error' });
      });
      unlistenRefs.current = [outputUnlisten, errorUnlisten, completeUnlisten, cancelUnlisten];
    } catch (error) {
      console.error('[AgentRunOutputViewer] Failed to set up live event listeners:', error);
    }
  };

  const handleCopyAsJsonl = async () => {
    const jsonl = rawJsonlOutput.join('\n');
    await navigator.clipboard.writeText(jsonl);
    setCopyPopoverOpen(false);
    setToast({ message: 'Output copied as JSONL', type: 'success' });
  };

  const handleCopyAsMarkdown = async () => {
    if (!run) return;
    let markdown = `# Agent Execution: ${run.agent_name}\n\n`;
    markdown += `**Task:** ${run.task}\n`;
    markdown += `**Model:** ${run.model === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}\n`;
    markdown += `**Date:** ${formatISOTimestamp(run.created_at)}\n`;
    if (run.metrics?.duration_ms) markdown += `**Duration:** ${(run.metrics.duration_ms / 1000).toFixed(2)}s\n`;
    if (run.metrics?.total_tokens) markdown += `**Total Tokens:** ${run.metrics.total_tokens}\n`;
    if (run.metrics?.cost_usd) markdown += `**Cost:** $${run.metrics.cost_usd.toFixed(4)} USD\n`;
    markdown += `\n---\n\n`;
    for (const msg of messages) {
      if (msg.type === "system" && msg.subtype === "init") {
        markdown += `## System Initialization\n\n- Session ID: \`${msg.session_id || 'N/A'}\`\n- Model: \`${msg.model || 'default'}\`\n`;
        if (msg.cwd) markdown += `- Working Directory: \`${msg.cwd}\`\n`;
        if (msg.tools?.length) markdown += `- Tools: ${msg.tools.join(', ')}\n`;
        markdown += `\n`;
      } else if (msg.type === "assistant" && msg.message) {
        markdown += `## Assistant\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") markdown += `${content.text}\n\n`;
          else if (content.type === "tool_use") markdown += `### Tool: ${content.name}\n\n\`\`\`json\n${JSON.stringify(content.input, null, 2)}\n\`\`\`\n\n`;
        }
        if (msg.message.usage) markdown += `*Tokens: ${msg.message.usage.input_tokens} in, ${msg.message.usage.output_tokens} out*\n\n`;
      } else if (msg.type === "user" && msg.message) {
        markdown += `## User\n\n`;
        for (const content of msg.message.content || []) {
          if (content.type === "text") markdown += `${content.text}\n\n`;
          else if (content.type === "tool_result") markdown += `### Tool Result\n\n\`\`\`\n${content.content}\n\`\`\`\n\n`;
        }
      } else if (msg.type === "result") {
        markdown += `## Execution Result\n\n`;
        if (msg.result) markdown += `${msg.result}\n\n`;
        if (msg.error) markdown += `**Error:** ${msg.error}\n\n`;
      }
    }
    await navigator.clipboard.writeText(markdown);
    setCopyPopoverOpen(false);
    setToast({ message: 'Output copied as Markdown', type: 'success' });
  };

  const handleRefresh = async () => { setRefreshing(true); await loadOutput(); setRefreshing(false); };

  const handleStop = async () => {
    if (!run?.id) return;
    try {
      console.warn('[AgentRunOutputViewer] killAgentSession is no longer available');
      unlistenRefs.current.forEach(unlisten => unlisten());
      unlistenRefs.current = [];
      hasSetupListenersRef.current = false;
      const stopMessage: ClaudeStreamMessage = { type: "result", subtype: "error", is_error: true, result: "Execution stopped by user", duration_ms: 0, usage: { input_tokens: 0, output_tokens: 0 } };
      setMessages(prev => [...prev, stopMessage]);
      updateTabStatus(tabId, 'idle');
      await loadOutput(true);
    } catch (err) {
      console.error('[AgentRunOutputViewer] Failed to stop agent:', err);
      setToast({ message: `Failed to stop execution: ${err instanceof Error ? err.message : 'Unknown error'}`, type: 'error' });
    }
  };

  // Load output on mount
  useEffect(() => {
    if (!run?.id) return;
    const cached = getCachedOutput(run.id);
    if (cached) {
      const cachedJsonlLines = cached.output.split('\n').filter(line => line.trim());
      setRawJsonlOutput(cachedJsonlLines);
      setMessages(cached.messages);
    }
    loadOutput();
  }, [run?.id]);

  const copyPopoverTrigger = (
    <Button variant="ghost" size="sm" className="h-8 px-2">
      <Copy className="h-4 w-4 mr-1" />Copy<ChevronDown className="h-3 w-3 ml-1" />
    </Button>
  );

  const copyPopoverContent = (
    <div className="w-44 p-1">
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCopyAsJsonl}>Copy as JSONL</Button>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleCopyAsMarkdown}>Copy as Markdown</Button>
    </div>
  );

  if (!run) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <RuneSpinner size={32} label="Loading agent run..." />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`h-full flex flex-col ${className || ''}`}>
        <Card className="h-full flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-4">
              <AgentRunMetricsHeader run={run} />
              <div className="flex items-center gap-1">
                <Popover trigger={copyPopoverTrigger} content={copyPopoverContent} open={copyPopoverOpen} onOpenChange={setCopyPopoverOpen} align="end" />
                <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"} className="h-8 px-2">
                  {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={refreshing} title="Refresh output" className="h-8 px-2">
                  <RotateCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                </Button>
                {run.status === 'running' && (
                  <Button variant="ghost" size="sm" onClick={handleStop} disabled={refreshing} title="Stop execution" className="h-8 px-2 text-destructive hover:text-destructive">
                    <StopCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className={`${isFullscreen ? 'h-[calc(100vh-120px)]' : 'flex-1'} p-0 overflow-hidden`}>
            <AgentOutputRenderer
              messages={messages}
              loading={loading}
              scrollRef={scrollAreaRef}
              endRef={outputEndRef}
              hasUserScrolled={hasUserScrolled}
              onUserScrolled={setHasUserScrolled}
            />
          </CardContent>
        </Card>
      </div>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 bg-background z-[60] flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <AgentRunFullscreenHeader run={run} />
            <div className="flex items-center gap-2">
              <Popover
                trigger={<Button variant="outline" size="sm"><Copy className="h-4 w-4 mr-2" />Copy Output<ChevronDown className="h-3 w-3 ml-2" /></Button>}
                content={copyPopoverContent}
                align="end"
              />
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RotateCcw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              {run.status === 'running' && (
                <Button variant="outline" size="sm" onClick={handleStop} disabled={refreshing}>
                  <StopCircle className="h-4 w-4 mr-2" />Stop
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
                <Minimize2 className="h-4 w-4 mr-2" />Exit Fullscreen
              </Button>
            </div>
          </div>
          <AgentOutputRenderer
            messages={messages}
            loading={false}
            scrollRef={fullscreenScrollRef}
            endRef={fullscreenMessagesEndRef}
            hasUserScrolled={hasUserScrolled}
            onUserScrolled={setHasUserScrolled}
            className="flex-1 p-6"
            maxWidth="max-w-4xl"
          />
        </div>
      )}

      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />
        )}
      </ToastContainer>
    </>
  );
}

export default AgentRunOutputViewer;
