import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Container, ExternalLink, ArrowUpDown } from 'lucide-react';
import { useDockerMonitor } from './ResourceMonitor';

const fmtMem = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;

type SortBy = 'cpu' | 'memory';

export function DockerSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [hideStopped, setHideStopped] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('cpu');
  const docker = useDockerMonitor();

  const visibleContainers = useMemo(() => {
    const filtered = hideStopped
      ? docker.containers.filter(c => c.status.startsWith('Up'))
      : docker.containers;
    return [...filtered].sort((a, b) => {
      if (sortBy === 'cpu') return b.cpu - a.cpu;
      return b.memMb - a.memMb;
    });
  }, [docker.containers, hideStopped, sortBy]);

  if (!docker.available) return null;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        {!collapsed ? (
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Docker
          </h3>
        ) : (
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground overflow-hidden">
            <span className="flex items-center gap-0.5 shrink-0 text-cyan-400/70">
              <Container className="h-2.5 w-2.5" />
              {docker.running}/{docker.total}
            </span>
            {docker.totalCpu > 0 && (
              <span className="font-mono">{docker.totalCpu.toFixed(1)}% CPU</span>
            )}
            {docker.totalMemMb > 0 && (
              <span className="font-mono">{fmtMem(docker.totalMemMb)}</span>
            )}
          </span>
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-1.5">
              {/* Summary */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{docker.running} running / {docker.total} total</span>
                <div className="flex items-center gap-2">
                  {docker.totalCpu > 0 && <span className="font-mono">{docker.totalCpu.toFixed(1)}% CPU</span>}
                  {docker.totalMemMb > 0 && <span className="font-mono">{fmtMem(docker.totalMemMb)}</span>}
                </div>
              </div>

              {/* Sort toggle + hide stopped */}
              <div className="flex items-center justify-between text-[9px]">
                <div className="flex items-center gap-1">
                  <ArrowUpDown className="h-2.5 w-2.5 text-muted-foreground/40" />
                  {(['cpu', 'memory'] as SortBy[]).map(s => (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                        sortBy === s
                          ? 'bg-primary/15 text-primary'
                          : 'text-muted-foreground/40 hover:text-muted-foreground'
                      }`}
                    >
                      {s === 'cpu' ? 'CPU' : 'Memory'}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-1 text-muted-foreground/60 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideStopped}
                    onChange={(e) => setHideStopped(e.target.checked)}
                    className="h-2.5 w-2.5 rounded border-border/50 bg-transparent accent-primary cursor-pointer"
                  />
                  Hide stopped
                </label>
              </div>

              {/* Container list */}
              <div className="space-y-0.5">
                {visibleContainers.map((c) => {
                  const isRunning = c.status.startsWith('Up');
                  return (
                    <div key={c.id} className="flex items-center justify-between text-[10px] py-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isRunning ? 'bg-green-400' : 'bg-muted-foreground/30'}`} />
                        <span className="text-foreground/70 truncate" title={`${c.name} (${c.image})`}>
                          {c.name}
                        </span>
                      </div>
                      {isRunning ? (
                        <div className="flex items-center gap-2 shrink-0 text-muted-foreground font-mono">
                          <span className={c.cpu > 50 ? 'text-red-400' : c.cpu > 20 ? 'text-yellow-400' : ''}>
                            {c.cpu.toFixed(1)}%
                          </span>
                          <span>{fmtMem(c.memMb)}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground/40 shrink-0">stopped</span>
                      )}
                    </div>
                  );
                })}
                {visibleContainers.length === 0 && (
                  <div className="text-[10px] text-muted-foreground/40 py-1">No running containers</div>
                )}
              </div>

              {/* View details link */}
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-resource-details'))}
                className="flex items-center gap-1 text-[10px] text-primary/70 hover:text-primary transition-colors"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                View details
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
