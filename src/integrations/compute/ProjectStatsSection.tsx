import { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, FolderOpen, TerminalSquare, Globe, Cpu, MemoryStick } from 'lucide-react';
import { useTabContext } from '@/contexts/TabContext';
import { useQuery } from '@tanstack/react-query';

interface ProcessInfo {
  pid: number;
  cpu: number;
  mem: number;
  rss: number;
  command: string;
  cwd: string;
  project: string;
}

function fmtMem(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)}G`;
  return `${mb}M`;
}

function barColor(percent: number): string {
  if (percent > 80) return 'bg-red-500';
  if (percent > 50) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

interface ProjectStat {
  path: string;
  name: string;
  terminals: number;
  browsers: number;
  chats: number;
  runningCount: number;
  cpu: number;
  memMb: number;
  processes: ProcessInfo[];
}

export function ProjectStatsSection() {
  const [collapsed, setCollapsed] = useState(false);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const { tabs } = useTabContext();

  // Fetch process stats
  const { data: processData } = useQuery<{ processes: ProcessInfo[] }>({
    queryKey: ['project-processes'],
    queryFn: async () => {
      const res = await fetch('/api/resources/processes');
      return res.ok ? res.json() : { processes: [] };
    },
    refetchInterval: 3000,
    staleTime: 2000,
  });

  const gridTypes = useMemo(() => new Set(['chat', 'agent-execution', 'claude-terminal', 'browser']), []);


  const projectStats = useMemo(() => {
    const map = new Map<string, ProjectStat>();

    const ensureProject = (pp: string) => {
      if (!map.has(pp)) {
        map.set(pp, {
          path: pp,
          name: pp.split('/').pop() || pp,
          terminals: 0, browsers: 0, chats: 0, runningCount: 0,
          cpu: 0, memMb: 0, processes: [],
        });
      }
      return map.get(pp)!;
    };

    // Collect tabs per project — use initialProjectPath (real project) not projectPath (grid group key)
    for (const t of tabs) {
      if (!gridTypes.has(t.type)) continue;
      // Prefer initialProjectPath (real project) over projectPath (grid group key)
      // For browsers created via grid header button, projectPath IS the real project
      const pp = t.initialProjectPath || t.projectPath;
      if (!pp) continue;
      const stat = ensureProject(pp);
      if (t.type === 'claude-terminal') stat.terminals++;
      else if (t.type === 'browser') stat.browsers++;
      else if (t.type === 'chat') stat.chats++;
      if (t.status === 'running') stat.runningCount++;
    }

    // Match processes to projects by cwd — dynamically filter out MCP servers and infrastructure
    if (processData?.processes) {
      for (const proc of processData.processes) {
        if (!proc.cwd) continue;
        const cmd = proc.command.toLowerCase();
        // Dynamic MCP detection — any process matching common MCP patterns
        const isMcp =
          cmd.includes('mcp-server') ||
          cmd.includes('-mcp') ||
          cmd.includes('mcp_') ||
          /npm exec @\w+\/server-/.test(cmd) ||        // npm exec @scope/server-*
          /npx -y @\w+\/server-/.test(cmd) ||          // npx -y @scope/server-*
          /uvx \S+-mcp/.test(cmd) ||                    // uvx *-mcp
          cmd.includes('@modelcontextprotocol/') ||
          cmd.includes('context7') ||
          (cmd.includes('npm exec') && cmd.includes('server'));
        if (isMcp) continue;
        // Skip npm/node/cache/temp internals
        if (proc.cwd.includes('/.npm/') || proc.cwd.includes('/tmp/') || proc.cwd.includes('/.cache/') || proc.cwd.includes('/.local/')) continue;

        let matched = false;
        for (const [pp, stat] of map) {
          if (proc.cwd.startsWith(pp) || proc.cwd === pp) {
            stat.cpu += proc.cpu;
            stat.memMb += proc.rss;
            stat.processes.push(proc);
            matched = true;
            break;
          }
        }
        if (!matched && proc.project) {
          const pp = proc.cwd;
          const stat = ensureProject(pp);
          stat.cpu += proc.cpu;
          stat.memMb += proc.rss;
          stat.processes.push(proc);
        }
      }
    }

    // Sort by CPU descending (already normalized by core count from backend)
    return Array.from(map.values()).sort((a, b) => b.cpu - a.cpu);
  }, [tabs, gridTypes, processData]);

  if (projectStats.length === 0) return null;

  const totalCpu = projectStats.reduce((s, p) => s + p.cpu, 0);
  const totalMem = projectStats.reduce((s, p) => s + p.memMb, 0);

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
        {collapsed ? (
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground overflow-hidden">
            <span className="flex items-center gap-0.5 shrink-0">
              <FolderOpen className="h-2.5 w-2.5" />
              {projectStats.length}
            </span>
            {totalCpu > 0.5 && (
              <span className={`flex items-center gap-0.5 font-mono shrink-0 ${totalCpu > 80 ? 'text-red-400' : totalCpu > 30 ? 'text-yellow-400' : ''}`}>
                <Cpu className="h-2.5 w-2.5" />
                {totalCpu.toFixed(1)}%
              </span>
            )}
            {totalMem > 0 && (
              <span className="flex items-center gap-0.5 font-mono shrink-0">
                <MemoryStick className="h-2.5 w-2.5" />
                {fmtMem(totalMem)}
              </span>
            )}
          </span>
        ) : (
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Projects
          </h3>
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
            <div className="py-1.5 space-y-0.5">
              {projectStats.map(proj => {
                const isExpanded = expandedProject === proj.path;

                return (
                  <div key={proj.path}>
                    <button
                      onClick={() => setExpandedProject(isExpanded ? null : proj.path)}
                      className="flex items-center gap-1.5 w-full text-left py-1 px-1 rounded hover:bg-muted/30 transition-colors text-[10px]"
                    >
                      {isExpanded ? <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" /> : <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0" />}
                      <span className="font-medium text-foreground/80 truncate flex-1">{proj.name}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground/50 shrink-0 font-mono">
                        {proj.cpu > 0.1 && (
                          <span className={`${proj.cpu > 50 ? 'text-red-400' : proj.cpu > 20 ? 'text-yellow-400' : ''}`}>
                            {proj.cpu.toFixed(1)}%
                          </span>
                        )}
                        {proj.memMb > 0 && <span>{fmtMem(proj.memMb)}</span>}
                        {proj.terminals > 0 && <span className="flex items-center gap-0.5 text-muted-foreground/40"><TerminalSquare className="h-2.5 w-2.5" />{proj.terminals}</span>}
                        {proj.browsers > 0 && <span className="flex items-center gap-0.5 text-muted-foreground/40"><Globe className="h-2.5 w-2.5" />{proj.browsers}</span>}
                      </span>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="pl-5 pr-1 py-1.5 space-y-2">
                            {/* Resource bars */}
                            {proj.cpu > 0 && (
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[9px] text-muted-foreground/60">
                                  <span className="flex items-center gap-1"><Cpu className="h-2.5 w-2.5 text-blue-400/60" />CPU</span>
                                  <span className="font-mono">{proj.cpu.toFixed(1)}%</span>
                                </div>
                                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 ${barColor(proj.cpu)}`} style={{ width: `${Math.min(100, proj.cpu)}%` }} />
                                </div>
                              </div>
                            )}
                            {proj.memMb > 0 && (
                              <div className="space-y-0.5">
                                <div className="flex items-center justify-between text-[9px] text-muted-foreground/60">
                                  <span className="flex items-center gap-1"><MemoryStick className="h-2.5 w-2.5 text-purple-400/60" />RAM</span>
                                  <span className="font-mono">{fmtMem(proj.memMb)}</span>
                                </div>
                                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-500 bg-purple-500/60`} style={{ width: `${Math.min(100, (proj.memMb / 4096) * 100)}%` }} />
                                </div>
                              </div>
                            )}

                            {/* Top processes */}
                            {proj.processes.length > 0 && (
                              <div className="space-y-0.5 pt-1">
                                <span className="text-[8px] uppercase tracking-wider font-semibold text-muted-foreground/30">Processes</span>
                                {proj.processes.slice(0, 5).map(p => (
                                  <div key={p.pid} className="flex items-center justify-between text-[9px] text-muted-foreground/50">
                                    <span className="truncate flex-1 font-mono" title={p.command}>{p.command.slice(0, 40)}</span>
                                    <span className="flex gap-2 shrink-0 font-mono">
                                      <span className={p.cpu > 20 ? 'text-yellow-400' : ''}>{p.cpu.toFixed(1)}%</span>
                                      <span>{fmtMem(p.rss)}</span>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Path */}
                            <div className="text-[8px] text-muted-foreground/30 font-mono truncate pt-0.5" title={proj.path}>{proj.path}</div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
