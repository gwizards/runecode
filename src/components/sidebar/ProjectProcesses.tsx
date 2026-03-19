import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, TerminalSquare, Cpu } from 'lucide-react';

interface ProcessInfo {
  pid: number;
  cpu: number;
  mem: number;
  command: string;
  project: string;
  cwd: string;
}

export function ProjectProcesses() {
  const [collapsed, setCollapsed] = useState(false);

  const { data: processes = [] } = useQuery<ProcessInfo[]>({
    queryKey: ['project-processes'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/resources/processes');
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      } catch { return []; }
    },
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Group by project, sum CPU/MEM per project
  const byProject = new Map<string, { cpu: number; mem: number; count: number; pids: number[] }>();
  for (const p of processes) {
    const name = p.project || 'system';
    const existing = byProject.get(name) || { cpu: 0, mem: 0, count: 0, pids: [] };
    existing.cpu += p.cpu;
    existing.mem += p.mem;
    existing.count += 1;
    existing.pids.push(p.pid);
    byProject.set(name, existing);
  }

  // Sort by CPU usage descending
  const sorted = Array.from(byProject.entries())
    .filter(([name]) => name !== 'system')
    .sort(([, a], [, b]) => b.cpu - a.cpu);

  if (sorted.length === 0) return null;

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
        <TerminalSquare className="h-3 w-3 text-muted-foreground/60" />
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Processes
        </h3>
        <span className="ml-auto text-[9px] text-muted-foreground/40">
          {sorted.length} projects
        </span>
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
            <div className="py-1.5 space-y-1">
              {sorted.map(([name, info]) => (
                <div key={name} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px]">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${info.cpu > 50 ? 'bg-red-400' : info.cpu > 20 ? 'bg-yellow-400' : 'bg-green-400'}`} />
                  <span className="truncate flex-1 text-muted-foreground" style={{ color: 'var(--color-text-secondary)' }}>
                    {name}
                  </span>
                  <span className="flex items-center gap-0.5 text-muted-foreground/50 flex-shrink-0 font-mono">
                    <Cpu className="w-2.5 h-2.5" />
                    {info.cpu.toFixed(0)}%
                  </span>
                  <span className="text-muted-foreground/30 flex-shrink-0 font-mono">
                    {info.count}p
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
