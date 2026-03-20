import { useQuery } from "@tanstack/react-query";
import React, { useState, useMemo } from "react";
import { ArrowLeft, Cpu, MemoryStick, RefreshCw, ArrowUpDown, FolderOpen, Layers, Container, Network, HardDrive, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDockerMonitor } from "./ResourceMonitor";

/* ─── Types ─── */
interface ProcessInfo {
  user: string;
  pid: number;
  cpu: number;
  mem: number;
  rss: number;
  command: string;
  cwd?: string;
  project?: string;
}

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  cpu: number;
  mem: number;
  memMb: number;
  memLimitMb: number;
  netIO: string;
  blockIO: string;
  pids: number;
}

interface CombinedProjectGroup {
  name: string;
  processes: ProcessInfo[];
  containers: DockerContainer[];
  totalCpu: number;
  totalRss: number;
  totalDockerCpu: number;
  totalDockerMem: number;
}

type SortKey = "cpu" | "mem" | "rss" | "pid";
type TabId = "by-project" | "local" | "docker";

const fmtMem = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;

/* ─── Main Component ─── */
export function ResourceDetails({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<TabId>("by-project");
  const [sortBy, setSortBy] = useState<SortKey>("cpu");
  const [sortAsc, setSortAsc] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hideStopped, setHideStopped] = useState(true);

  const docker = useDockerMonitor();

  const { data, isLoading, refetch, isFetching } = useQuery<{ processes: ProcessInfo[] }>({
    queryKey: ["resource-processes"],
    queryFn: async () => {
      const res = await fetch("/api/resources/processes");
      if (!res.ok) return { processes: [] };
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const processes = useMemo(() =>
    [...(data?.processes || [])].sort((a, b) =>
      sortAsc ? a[sortBy] - b[sortBy] : b[sortBy] - a[sortBy]
    ), [data, sortBy, sortAsc]);

  const totalCpu = processes.reduce((s, p) => s + p.cpu, 0);
  const totalRss = processes.reduce((s, p) => s + p.rss, 0);

  // Combined project groups (processes + docker merged by project name)
  const combinedGroups = useMemo(() => {
    const map = new Map<string, { procs: ProcessInfo[]; containers: DockerContainer[] }>();
    for (const p of processes) {
      const key = p.project || "system";
      if (!map.has(key)) map.set(key, { procs: [], containers: [] });
      map.get(key)!.procs.push(p);
    }
    // Match containers to projects by image/name heuristic
    for (const c of docker.containers) {
      if (hideStopped && !c.status.startsWith("Up")) continue;
      // Try to match container name to a project group, else put in "docker"
      const matchedProject = [...map.keys()].find(k =>
        k !== "system" && (c.name.toLowerCase().includes(k.toLowerCase()) || c.image.toLowerCase().includes(k.toLowerCase()))
      );
      const key = matchedProject || "docker";
      if (!map.has(key)) map.set(key, { procs: [], containers: [] });
      map.get(key)!.containers.push(c);
    }
    const result: CombinedProjectGroup[] = [];
    for (const [name, { procs, containers }] of map) {
      result.push({
        name,
        processes: procs,
        containers,
        totalCpu: procs.reduce((s, p) => s + p.cpu, 0),
        totalRss: procs.reduce((s, p) => s + p.rss, 0),
        totalDockerCpu: containers.reduce((s, c) => s + c.cpu, 0),
        totalDockerMem: containers.reduce((s, c) => s + c.memMb, 0),
      });
    }
    return result.sort((a, b) => (b.totalCpu + b.totalDockerCpu) - (a.totalCpu + a.totalDockerCpu));
  }, [processes, docker.containers, hideStopped]);

  // Process-only project groups for Local tab
  const processGroups = useMemo(() => {
    const groups = new Map<string, ProcessInfo[]>();
    for (const p of processes) {
      const key = p.project || "system";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return [...groups.entries()]
      .map(([name, procs]) => ({
        name,
        totalCpu: procs.reduce((s, p) => s + p.cpu, 0),
        totalRss: procs.reduce((s, p) => s + p.rss, 0),
        processes: procs,
      }))
      .sort((a, b) => b.totalCpu - a.totalCpu);
  }, [processes]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(false); }
  };

  const toggle = (name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: "by-project", label: "By Project", icon: <FolderOpen className="h-3 w-3" /> },
    { id: "local", label: "Local Machine", icon: <Monitor className="h-3 w-3" /> },
    { id: "docker", label: "Docker", icon: <Container className="h-3 w-3" /> },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border/30">
        <button onClick={onBack} className="p-1 rounded hover:bg-muted/50 transition-colors">
          <ArrowLeft className="h-4 w-4 text-muted-foreground" />
        </button>
        <h2 className="text-sm font-semibold">System Resources</h2>
        <div className="flex-1" />
        <button onClick={() => refetch()} className="p-1 rounded hover:bg-muted/50 transition-colors" title="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Sub tabs */}
      <div className="shrink-0 flex items-center gap-1 px-4 py-2 border-b border-border/20 bg-muted/10">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
              activeTab === t.id
                ? "bg-background text-foreground shadow-sm border border-border/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            {t.icon}
            {t.label}
            {t.id === "docker" && docker.available && docker.running > 0 && (
              <span className="px-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px]">{docker.running}</span>
            )}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <SummaryBar
        activeTab={activeTab}
        totalCpu={totalCpu}
        totalRss={totalRss}
        processCount={processes.length}
        docker={docker}
        hideStopped={hideStopped}
        onToggleHideStopped={() => setHideStopped(!hideStopped)}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : activeTab === "by-project" ? (
          <ByProjectView
            groups={combinedGroups}
            expanded={expanded}
            toggle={toggle}
            totalCpu={totalCpu + docker.totalCpu}
          />
        ) : activeTab === "local" ? (
          <LocalView
            processes={processes}
            groups={processGroups}
            expanded={expanded}
            toggle={toggle}
            totalCpu={totalCpu}
            sortBy={sortBy}
            toggleSort={toggleSort}
          />
        ) : (
          <DockerView docker={docker} hideStopped={hideStopped} />
        )}
      </div>
    </div>
  );
}

/* ─── Summary Bar ─── */
function SummaryBar({ activeTab, totalCpu, totalRss, processCount, docker, hideStopped, onToggleHideStopped }: {
  activeTab: TabId;
  totalCpu: number;
  totalRss: number;
  processCount: number;
  docker: ReturnType<typeof useDockerMonitor>;
  hideStopped: boolean;
  onToggleHideStopped: () => void;
}) {
  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-b border-border/20 bg-muted/5 flex-wrap">
      {(activeTab === "by-project" || activeTab === "local") && (
        <>
          <Stat icon={<Cpu className="h-3 w-3 text-blue-400" />} label="CPU" value={`${totalCpu.toFixed(1)}%`} />
          <Stat icon={<MemoryStick className="h-3 w-3 text-purple-400" />} label="RSS" value={fmtMem(totalRss)} />
          <span className="text-[10px] text-muted-foreground/40">{processCount} procs</span>
        </>
      )}
      {(activeTab === "by-project" || activeTab === "docker") && docker.available && (
        <>
          <span className="text-border/30">|</span>
          <Stat icon={<Container className="h-3 w-3 text-cyan-400" />} label="" value={`${docker.running} containers`} />
          {docker.totalCpu > 0 && <Stat icon={<Cpu className="h-3 w-3 text-cyan-400/50" />} label="" value={`${docker.totalCpu.toFixed(1)}%`} />}
        </>
      )}
      {(activeTab === "by-project" || activeTab === "docker") && (
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground/50 cursor-pointer select-none ml-auto">
          <input type="checkbox" checked={hideStopped} onChange={onToggleHideStopped} className="h-3 w-3 rounded accent-primary cursor-pointer" />
          Hide stopped
        </label>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {icon}
      {label && <span className="text-muted-foreground">{label}:</span>}
      <span className="font-mono text-foreground/80">{value}</span>
    </div>
  );
}

/* ─── By Project View (combined) ─── */
function ByProjectView({ groups, expanded, toggle, totalCpu }: {
  groups: CombinedProjectGroup[];
  expanded: Set<string>;
  toggle: (name: string) => void;
  totalCpu: number;
}) {
  if (groups.length === 0) return <Empty text="No active processes or containers" />;

  return (
    <div className="divide-y divide-border/10">
      {groups.map(g => {
        const isOpen = expanded.has(g.name);
        const combinedCpu = g.totalCpu + g.totalDockerCpu;
        const hasDocker = g.containers.length > 0;
        const hasProcs = g.processes.length > 0;

        return (
          <div key={g.name}>
            <button onClick={() => toggle(g.name)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
              <FolderOpen className="h-3.5 w-3.5 text-primary/60 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-foreground/90 truncate">
                      {g.name === "system" ? "System / Other" : g.name === "docker" ? "Docker (unmatched)" : g.name}
                    </span>
                    {hasProcs && <span className="text-[9px] px-1 rounded bg-blue-500/10 text-blue-400">{g.processes.length} proc</span>}
                    {hasDocker && <span className="text-[9px] px-1 rounded bg-cyan-500/10 text-cyan-400">{g.containers.length} ctr</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                    {/* Stacked bar: blue for processes, cyan for docker */}
                    <div className="h-full flex">
                      {g.totalCpu > 0 && (
                        <div
                          className={cn("h-full transition-all duration-500", g.totalCpu > 50 ? "bg-red-400/70" : g.totalCpu > 20 ? "bg-yellow-400/60" : "bg-blue-400/50")}
                          style={{ width: `${(g.totalCpu / Math.max(totalCpu, 1)) * 100}%` }}
                        />
                      )}
                      {g.totalDockerCpu > 0 && (
                        <div
                          className="h-full bg-cyan-400/50 transition-all duration-500"
                          style={{ width: `${(g.totalDockerCpu / Math.max(totalCpu, 1)) * 100}%` }}
                        />
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">{combinedCpu.toFixed(1)}%</span>
                  <span className="text-[10px] font-mono text-muted-foreground/50 w-12 text-right">{fmtMem(g.totalRss + g.totalDockerMem)}</span>
                </div>
              </div>
            </button>

            {isOpen && (
              <div className="bg-muted/10 px-4 py-2 space-y-2">
                {/* Processes */}
                {hasProcs && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1 flex items-center gap-1">
                      <Monitor className="h-2.5 w-2.5" /> Processes
                    </div>
                    {g.processes.map(p => (
                      <div key={p.pid} className="flex items-center justify-between text-[10px] py-0.5">
                        <span className="font-mono text-foreground/70 truncate flex-1 mr-2" title={p.cwd || p.command}>{p.command}</span>
                        <div className="flex items-center gap-3 shrink-0 font-mono">
                          <span className={p.cpu > 50 ? "text-red-400" : p.cpu > 20 ? "text-yellow-400" : "text-foreground/50"}>{p.cpu.toFixed(1)}%</span>
                          <span className="text-foreground/40 w-10 text-right">{fmtMem(p.rss)}</span>
                          <span className="text-muted-foreground/30 w-12 text-right">{p.pid}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Containers */}
                {hasDocker && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1 flex items-center gap-1">
                      <Container className="h-2.5 w-2.5" /> Containers
                    </div>
                    {g.containers.map(c => {
                      const isRunning = c.status.startsWith("Up");
                      return (
                        <div key={c.id} className="flex items-center justify-between text-[10px] py-0.5">
                          <div className="flex items-center gap-1.5 flex-1 min-w-0 mr-2">
                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${isRunning ? "bg-green-400" : "bg-muted-foreground/30"}`} />
                            <span className="text-foreground/70 truncate" title={c.image}>{c.name}</span>
                          </div>
                          {isRunning ? (
                            <div className="flex items-center gap-3 shrink-0 font-mono">
                              <span className={c.cpu > 50 ? "text-red-400" : c.cpu > 20 ? "text-yellow-400" : "text-foreground/50"}>{c.cpu.toFixed(1)}%</span>
                              <span className="text-foreground/40 w-10 text-right">{fmtMem(c.memMb)}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/30 shrink-0">stopped</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Local Machine View ─── */
function LocalView({ processes, groups, expanded, toggle, totalCpu, sortBy, toggleSort }: {
  processes: ProcessInfo[];
  groups: { name: string; totalCpu: number; totalRss: number; processes: ProcessInfo[] }[];
  expanded: Set<string>;
  toggle: (name: string) => void;
  totalCpu: number;
  sortBy: SortKey;
  toggleSort: (key: SortKey) => void;
}) {
  const [viewMode, setViewMode] = useState<"by-project" | "all">("by-project");

  if (processes.length === 0) return <Empty text="No active processes" />;

  return (
    <div>
      {/* View toggle */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/10">
        <button onClick={() => setViewMode("by-project")} className={cn("px-2 py-0.5 rounded text-[10px] transition-colors", viewMode === "by-project" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <FolderOpen className="h-3 w-3 inline mr-1" />By Project
        </button>
        <button onClick={() => setViewMode("all")} className={cn("px-2 py-0.5 rounded text-[10px] transition-colors", viewMode === "all" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}>
          <Layers className="h-3 w-3 inline mr-1" />All
        </button>
      </div>

      {viewMode === "all" ? (
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border/20 z-10">
            <tr className="text-muted-foreground text-[10px] uppercase tracking-wider">
              <th className="text-left px-4 py-2 font-medium">Command</th>
              <th className="text-right px-2 py-2 font-medium w-16"><SortBtn label="CPU%" active={sortBy === "cpu"} onClick={() => toggleSort("cpu")} /></th>
              <th className="text-right px-2 py-2 font-medium w-16"><SortBtn label="MEM%" active={sortBy === "mem"} onClick={() => toggleSort("mem")} /></th>
              <th className="text-right px-2 py-2 font-medium w-20"><SortBtn label="RSS" active={sortBy === "rss"} onClick={() => toggleSort("rss")} /></th>
              <th className="text-right px-4 py-2 font-medium w-16"><SortBtn label="PID" active={sortBy === "pid"} onClick={() => toggleSort("pid")} /></th>
            </tr>
          </thead>
          <tbody>
            {processes.map(p => (
              <tr key={p.pid} className="border-b border-border/10 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-1.5 font-mono text-foreground/80 truncate max-w-[300px]" title={p.cwd || p.command}>{p.command}</td>
                <td className="text-right px-2 py-1.5 font-mono"><CpuVal v={p.cpu} /></td>
                <td className="text-right px-2 py-1.5 font-mono"><CpuVal v={p.mem} /></td>
                <td className="text-right px-2 py-1.5 font-mono text-foreground/60">{fmtMem(p.rss)}</td>
                <td className="text-right px-4 py-1.5 font-mono text-muted-foreground/50">{p.pid}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="divide-y divide-border/10">
          {groups.map(g => {
            const isOpen = expanded.has(g.name);
            const barWidth = Math.min(100, (g.totalCpu / Math.max(totalCpu, 1)) * 100);
            return (
              <div key={g.name}>
                <button onClick={() => toggle(g.name)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
                  <FolderOpen className="h-3.5 w-3.5 text-primary/60 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground/90 truncate">{g.name === "system" ? "System / Other" : g.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{g.processes.length} proc{g.processes.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-500", g.totalCpu > 50 ? "bg-red-400/70" : g.totalCpu > 20 ? "bg-yellow-400/60" : "bg-blue-400/50")} style={{ width: `${barWidth}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground w-16 text-right">{g.totalCpu.toFixed(1)}% CPU</span>
                      <span className="text-[10px] font-mono text-muted-foreground/50 w-12 text-right">{fmtMem(g.totalRss)}</span>
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="bg-muted/10">
                    <table className="w-full text-xs">
                      <tbody>
                        {g.processes.map(p => (
                          <tr key={p.pid} className="border-b border-border/10 hover:bg-muted/20">
                            <td className="px-4 py-1.5 font-mono text-foreground/80 truncate max-w-[300px]" title={p.cwd || p.command}>{p.command}</td>
                            <td className="text-right px-2 py-1.5 font-mono w-16"><CpuVal v={p.cpu} /></td>
                            <td className="text-right px-2 py-1.5 font-mono w-16"><CpuVal v={p.mem} /></td>
                            <td className="text-right px-2 py-1.5 font-mono text-foreground/60 w-20">{fmtMem(p.rss)}</td>
                            <td className="text-right px-4 py-1.5 font-mono text-muted-foreground/50 w-16">{p.pid}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Docker View ─── */
function DockerView({ docker, hideStopped }: { docker: ReturnType<typeof useDockerMonitor>; hideStopped: boolean }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (!docker.available) {
    return <Empty text="Docker is not running" sub="Start the Docker daemon to monitor containers" icon={<Container className="h-8 w-8 text-muted-foreground/30" />} />;
  }

  const sorted = [...docker.containers]
    .filter(c => !hideStopped || c.status.startsWith("Up"))
    .sort((a, b) => {
      const aUp = a.status.startsWith("Up") ? 1 : 0;
      const bUp = b.status.startsWith("Up") ? 1 : 0;
      return aUp !== bUp ? bUp - aUp : b.cpu - a.cpu;
    });

  if (sorted.length === 0) return <Empty text="No containers to show" />;

  return (
    <div className="divide-y divide-border/10">
      {sorted.map(c => {
        const isRunning = c.status.startsWith("Up");
        const isOpen = expandedId === c.id;
        const memPct = c.memLimitMb > 0 ? (c.memMb / c.memLimitMb) * 100 : c.mem;

        return (
          <div key={c.id}>
            <button onClick={() => setExpandedId(isOpen ? null : c.id)} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors text-left">
              <span className={cn("h-2 w-2 rounded-full shrink-0", isRunning ? "bg-green-400" : "bg-muted-foreground/30")} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs font-medium text-foreground/90 truncate">{c.name}</span>
                  <span className="text-[10px] text-muted-foreground/50 shrink-0 ml-2 font-mono">{c.id}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground truncate">{c.image}</span>
                  {isRunning ? (
                    <div className="flex items-center gap-3 shrink-0 ml-2 text-[10px] font-mono">
                      <CpuVal v={c.cpu} suffix=" CPU" />
                      <span className="text-foreground/60">{fmtMem(c.memMb)}</span>
                    </div>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 shrink-0 ml-2">{c.status}</span>
                  )}
                </div>
                {isRunning && (
                  <div className="mt-1 h-1 rounded-full bg-white/[0.04] overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", memPct > 80 ? "bg-red-400/70" : memPct > 50 ? "bg-yellow-400/60" : "bg-cyan-400/50")} style={{ width: `${Math.min(memPct, 100)}%` }} />
                  </div>
                )}
              </div>
            </button>
            {isOpen && (
              <div className="px-4 pb-3 pt-1 bg-muted/10 grid grid-cols-2 gap-x-6 gap-y-1.5 text-[10px]">
                <DetailRow icon={<Cpu className="h-2.5 w-2.5 text-blue-400" />} label="CPU" value={`${c.cpu.toFixed(2)}%`} />
                <DetailRow icon={<MemoryStick className="h-2.5 w-2.5 text-purple-400" />} label="Memory" value={`${fmtMem(c.memMb)} / ${fmtMem(c.memLimitMb)} (${c.mem.toFixed(1)}%)`} />
                <DetailRow icon={<Network className="h-2.5 w-2.5 text-green-400" />} label="Network I/O" value={c.netIO || "—"} />
                <DetailRow icon={<HardDrive className="h-2.5 w-2.5 text-orange-400" />} label="Block I/O" value={c.blockIO || "—"} />
                <DetailRow icon={<Container className="h-2.5 w-2.5 text-cyan-400" />} label="PIDs" value={String(c.pids)} />
                <DetailRow icon={<Layers className="h-2.5 w-2.5 text-muted-foreground" />} label="Status" value={c.status} />
                {c.ports && <div className="col-span-2"><DetailRow icon={<Network className="h-2.5 w-2.5 text-emerald-400" />} label="Ports" value={c.ports} /></div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Shared small components ─── */
function CpuVal({ v, suffix = "" }: { v: number; suffix?: string }) {
  return <span className={v > 50 ? "text-red-400" : v > 20 ? "text-yellow-400" : "text-foreground/60"}>{v.toFixed(1)}{suffix}</span>;
}

function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-0.5 hover:text-foreground transition-colors justify-end ml-auto">
      {label}
      {active && <ArrowUpDown className="h-2.5 w-2.5 text-primary" />}
    </button>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-mono text-foreground/70 truncate">{value}</span>
    </div>
  );
}

function Empty({ text, sub, icon }: { text: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      {icon}
      <p className="text-sm">{text}</p>
      {sub && <p className="text-[11px] text-muted-foreground/50">{sub}</p>}
    </div>
  );
}
