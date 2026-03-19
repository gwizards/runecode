import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import {
  ChevronDown, ChevronRight, Play, Square, Trash2,
  Loader2, CheckCircle2, XCircle, Pause, RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface LoopState {
  id: string;
  projectPath: string;
  status: 'running' | 'paused' | 'completed' | 'failed' | 'stopped';
  iterations: number;
  maxIterations: number;
  prompt: string;
  lastOutput: string;
  startTime: number;
  elapsedMs: number;
  error?: string;
}

export function LoopsSection({ projectPath }: { projectPath?: string }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [maxIterations, setMaxIterations] = useState(25);
  const [expandedLoop, setExpandedLoop] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: loops = [] } = useQuery<LoopState[]>({
    queryKey: ['loops-status'],
    queryFn: async () => {
      const res = await fetch('/api/loops/status');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/loops/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath, prompt: prompt || undefined, maxIterations }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loops-status'] });
      setShowNew(false);
      setPrompt('');
    },
  });

  const stopMutation = useMutation({
    mutationFn: async (loopId: string) => {
      await fetch('/api/loops/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loopId }),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loops-status'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (loopId: string) => {
      await fetch(`/api/loops/${encodeURIComponent(loopId)}`, { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['loops-status'] }),
  });

  const runningCount = loops.filter(l => l.status === 'running').length;
  const projectLoops = projectPath
    ? loops.filter(l => l.projectPath === projectPath || !projectPath)
    : loops;

  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />;
      case 'completed': return <CheckCircle2 className="h-3 w-3 text-emerald-400" />;
      case 'failed': return <XCircle className="h-3 w-3 text-red-400" />;
      case 'stopped': return <Square className="h-3 w-3 text-muted-foreground/50" />;
      default: return <Pause className="h-3 w-3 text-yellow-400" />;
    }
  };

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        <RotateCcw className="h-3 w-3 text-muted-foreground/60" />
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Loops</h3>
        {runningCount > 0 && (
          <span className="ml-auto text-[9px] text-cyan-400">{runningCount} running</span>
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-1.5">
              {/* Active loops */}
              {projectLoops.map(loop => (
                <div key={loop.id} className="rounded-md border border-border/20 bg-muted/5 overflow-hidden">
                  <button
                    onClick={() => setExpandedLoop(expandedLoop === loop.id ? null : loop.id)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-[10px] hover:bg-muted/10 transition-colors"
                  >
                    {statusIcon(loop.status)}
                    <span className="truncate flex-1 text-left font-medium">
                      {loop.projectPath.split('/').pop()}
                    </span>
                    <span className="text-muted-foreground/40 font-mono flex-shrink-0">
                      {loop.iterations}/{loop.maxIterations}
                    </span>
                    <span className="text-muted-foreground/30 font-mono flex-shrink-0">
                      {formatTime(loop.elapsedMs)}
                    </span>
                  </button>

                  <AnimatePresence>
                    {expandedLoop === loop.id && (
                      <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                        <div className="px-2 pb-2 pt-1 border-t border-border/10 space-y-1.5">
                          {loop.lastOutput && (
                            <div className="text-[9px] text-muted-foreground/50 max-h-20 overflow-y-auto font-mono whitespace-pre-wrap break-words bg-background/50 rounded p-1.5">
                              {loop.lastOutput.slice(-500)}
                            </div>
                          )}
                          {loop.error && (
                            <div className="text-[9px] text-red-400/70">{loop.error}</div>
                          )}
                          <div className="flex items-center gap-1">
                            {loop.status === 'running' && (
                              <Button variant="ghost" size="sm" onClick={() => stopMutation.mutate(loop.id)} className="text-[9px] h-5 px-1.5 text-red-400/60 hover:text-red-400">
                                <Square className="h-2.5 w-2.5 mr-0.5" /> Stop
                              </Button>
                            )}
                            {loop.status !== 'running' && (
                              <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(loop.id)} className="text-[9px] h-5 px-1.5 text-muted-foreground/40">
                                <Trash2 className="h-2.5 w-2.5 mr-0.5" /> Remove
                              </Button>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}

              {/* New loop form */}
              {showNew ? (
                <div className="rounded-md border border-primary/20 bg-primary/[0.03] p-2 space-y-2">
                  <Input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Custom prompt (optional)"
                    className="h-7 text-[10px]"
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-[9px] text-muted-foreground/50">Max iterations:</label>
                    <Input
                      type="number"
                      value={maxIterations}
                      onChange={(e) => setMaxIterations(parseInt(e.target.value) || 25)}
                      className="h-6 w-14 text-[10px] font-mono"
                      min={1}
                      max={100}
                    />
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" onClick={() => startMutation.mutate()} disabled={!projectPath || startMutation.isPending} className="text-[9px] h-6 px-2">
                      {startMutation.isPending ? <Loader2 className="h-2.5 w-2.5 animate-spin mr-0.5" /> : <Play className="h-2.5 w-2.5 mr-0.5" />}
                      Start Loop
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowNew(false)} className="text-[9px] h-6 px-2 text-muted-foreground">Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowNew(true)}
                  disabled={!projectPath}
                  className="w-full flex items-center justify-center gap-1 py-1.5 rounded border border-dashed border-border/30 text-[10px] text-muted-foreground/40 hover:text-muted-foreground hover:border-border/50 transition-colors disabled:opacity-30"
                >
                  <Play className="h-3 w-3" /> New Loop
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
