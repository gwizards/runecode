import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, CheckCircle2, XCircle, Square, Pause, Play,
  RotateCcw, Clock, AlertTriangle, ChevronDown, ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoopIteration {
  index: number;
  startTime: number;
  endTime: number;
  outputPreview: string;
  exitCode: number;
}

interface LoopState {
  id: string;
  projectPath: string;
  status: string;
  iterations: number;
  maxIterations: number;
  prompt: string;
  lastOutput: string;
  startTime: number;
  elapsedMs: number;
  error?: string;
  model?: string;
  history: LoopIteration[];
  rateLimitWaitsCount: number;
  noProgressCount: number;
}

export function LoopDetailView({ loopId }: { loopId: string }) {
  const [expandedIter, setExpandedIter] = useState<number | null>(null);

  const { data: loops = [] } = useQuery<LoopState[]>({
    queryKey: ['loops-status'],
    queryFn: async () => {
      const res = await fetch('/api/loops/status');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 2000,
    staleTime: 1000,
  });

  const loop = loops.find(l => l.id === loopId);

  const handleStop = async () => {
    await fetch('/api/loops/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loopId }),
    });
  };

  const handlePause = async () => {
    await fetch('/api/loops/pause', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loopId }),
    });
  };

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleTimeString();

  if (!loop) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <RotateCcw className="h-8 w-8 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm">Loop not found or has been removed</p>
        </div>
      </div>
    );
  }

  const isActive = loop.status === 'running' || loop.status === 'paused' || loop.status === 'rate_limited';
  const progress = loop.maxIterations > 0 ? (loop.iterations / loop.maxIterations) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border/30 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-cyan-400" />
              Loop: {loop.projectPath.split('/').pop()}
            </h1>
            <p className="text-xs text-muted-foreground font-mono mt-1">{loop.projectPath}</p>
          </div>
          <div className="flex items-center gap-2">
            {isActive && (
              <>
                <Button variant="outline" size="sm" onClick={handlePause}>
                  {loop.status === 'paused' ? <><Play className="h-3 w-3 mr-1" /> Resume</> : <><Pause className="h-3 w-3 mr-1" /> Pause</>}
                </Button>
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <Square className="h-3 w-3 mr-1" /> Stop
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-3 flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            {loop.status === 'running' && <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />}
            {loop.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
            {loop.status === 'failed' && <XCircle className="h-3.5 w-3.5 text-red-400" />}
            {loop.status === 'stopped' && <Square className="h-3.5 w-3.5 text-muted-foreground" />}
            {loop.status === 'paused' && <Pause className="h-3.5 w-3.5 text-yellow-400" />}
            {loop.status === 'rate_limited' && <AlertTriangle className="h-3.5 w-3.5 text-orange-400 animate-pulse" />}
            <span className="font-medium capitalize">{loop.status.replace('_', ' ')}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTime(loop.elapsedMs)}
          </div>
          <div className="text-muted-foreground">
            Iteration {loop.iterations}/{loop.maxIterations}
          </div>
          {loop.model && <div className="font-mono text-muted-foreground/50">{loop.model}</div>}
          {loop.rateLimitWaitsCount > 0 && (
            <div className="text-orange-400/70">{loop.rateLimitWaitsCount} rate limit waits</div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mt-2 w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              loop.status === 'completed' ? 'bg-emerald-400' :
              loop.status === 'failed' ? 'bg-red-400' :
              loop.status === 'rate_limited' ? 'bg-orange-400' :
              'bg-cyan-400'
            )}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Content -- scrollable */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Error */}
        {loop.error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
            {loop.error}
          </div>
        )}

        {/* Prompt */}
        {loop.prompt && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">PROMPT</h3>
            <div className="rounded-lg border border-border/20 bg-muted/5 p-3 text-sm whitespace-pre-wrap break-words">
              {loop.prompt}
            </div>
          </div>
        )}

        {/* Last Output */}
        {loop.lastOutput && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">LATEST OUTPUT</h3>
            <div className="rounded-lg border border-border/20 bg-background p-3 text-xs font-mono whitespace-pre-wrap break-words max-h-[300px] overflow-y-auto">
              {loop.lastOutput}
            </div>
          </div>
        )}

        {/* Iteration History */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-1.5">
            ITERATIONS ({loop.history?.length || 0})
          </h3>
          <div className="space-y-1">
            {(loop.history || []).slice().reverse().map(iter => {
              const isExpanded = expandedIter === iter.index;
              const duration = iter.endTime - iter.startTime;
              return (
                <div key={iter.index} className="rounded-md border border-border/15 bg-muted/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedIter(isExpanded ? null : iter.index)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted/10 transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                    <span className="font-mono text-muted-foreground/50 w-6">#{iter.index}</span>
                    <span className={cn(
                      'text-[10px] px-1.5 py-0.5 rounded font-mono',
                      iter.exitCode === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                    )}>
                      exit:{iter.exitCode}
                    </span>
                    <span className="text-muted-foreground/40">{formatTime(duration)}</span>
                    <span className="text-muted-foreground/30 ml-auto">{formatDate(iter.startTime)}</span>
                  </button>
                  {isExpanded && iter.outputPreview && (
                    <div className="px-3 pb-2 border-t border-border/10">
                      <pre className="text-[10px] font-mono text-muted-foreground/60 whitespace-pre-wrap break-words mt-1.5 max-h-32 overflow-y-auto">
                        {iter.outputPreview}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
            {(!loop.history || loop.history.length === 0) && (
              <p className="text-xs text-muted-foreground/30 py-4 text-center">No iterations yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
