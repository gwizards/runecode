/**
 * ResourceDetails — top-level system resources view.
 *
 * Sub-views (ByProjectView, LocalView, DockerView) and shared components
 * have been extracted to ResourceCharts.tsx.
 */

import { useQuery } from "@tanstack/react-query";
import React, { useState, useMemo } from "react";
import { applyStartupToken } from "@/lib/startupToken";
import { isRealTauri } from "@/lib/tauri-env";
import { ArrowLeft, Cpu, MemoryStick, RefreshCw, FolderOpen, Container, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDockerMonitor } from "./ResourceMonitor";
import {
  type ProcessInfo,
  type CombinedProjectGroup,
  type SortKey,
  fmtMem,
  Stat,
  ByProjectView,
  LocalView,
  DockerView,
} from "./ResourceCharts";

type TabId = "by-project" | "local" | "docker";

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
      try {
        if (isRealTauri()) {
          const { invoke } = await import('@tauri-apps/api/core');
          const mode = localStorage.getItem('runecode-platform-mode');
          const wslDistro = mode === 'wsl' ? localStorage.getItem('runecode-wsl-distro') : null;
          return await invoke('get_running_processes', { wslDistro }) as { processes: ProcessInfo[] };
        }
        const res = await fetch("/api/resources/processes", { headers: applyStartupToken({}) });
        if (!res.ok) return { processes: [] };
        return res.json();
      } catch {
        return { processes: [] };
      }
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

  const combinedGroups = useMemo(() => {
    const map = new Map<string, { procs: ProcessInfo[]; containers: any[] }>();
    for (const p of processes) {
      const key = p.project || "system";
      if (!map.has(key)) map.set(key, { procs: [], containers: [] });
      map.get(key)!.procs.push(p);
    }
    for (const c of docker.containers) {
      if (hideStopped && !c.status.startsWith("Up")) continue;
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
        name, processes: procs, containers,
        totalCpu: procs.reduce((s, p) => s + p.cpu, 0),
        totalRss: procs.reduce((s, p) => s + p.rss, 0),
        totalDockerCpu: containers.reduce((s, c) => s + c.cpu, 0),
        totalDockerMem: containers.reduce((s, c) => s + c.memMb, 0),
      });
    }
    return result.sort((a, b) => (b.totalCpu + b.totalDockerCpu) - (a.totalCpu + a.totalDockerCpu));
  }, [processes, docker.containers, hideStopped]);

  const processGroups = useMemo(() => {
    const groups = new Map<string, ProcessInfo[]>();
    for (const p of processes) {
      const key = p.project || "system";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(p);
    }
    return [...groups.entries()]
      .map(([name, procs]) => ({
        name, totalCpu: procs.reduce((s, p) => s + p.cpu, 0),
        totalRss: procs.reduce((s, p) => s + p.rss, 0), processes: procs,
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
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={cn("px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors flex items-center gap-1.5",
              activeTab === t.id ? "bg-background text-foreground shadow-sm border border-border/30" : "text-muted-foreground hover:text-foreground hover:bg-muted/30")}>
            {t.icon}{t.label}
            {t.id === "docker" && docker.available && docker.running > 0 && (
              <span className="px-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px]">{docker.running}</span>
            )}
          </button>
        ))}
      </div>

      {/* Summary bar */}
      <SummaryBar activeTab={activeTab} totalCpu={totalCpu} totalRss={totalRss}
        processCount={processes.length} docker={docker} hideStopped={hideStopped}
        onToggleHideStopped={() => setHideStopped(!hideStopped)} />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">Loading...</div>
        ) : activeTab === "by-project" ? (
          <ByProjectView groups={combinedGroups} expanded={expanded} toggle={toggle} totalCpu={totalCpu + docker.totalCpu} />
        ) : activeTab === "local" ? (
          <LocalView processes={processes} groups={processGroups} expanded={expanded}
            toggle={toggle} totalCpu={totalCpu} sortBy={sortBy} toggleSort={toggleSort} />
        ) : (
          <DockerView docker={docker} hideStopped={hideStopped} />
        )}
      </div>
    </div>
  );
}

/* ─── Summary Bar ─── */
function SummaryBar({ activeTab, totalCpu, totalRss, processCount, docker, hideStopped, onToggleHideStopped }: {
  activeTab: TabId; totalCpu: number; totalRss: number; processCount: number;
  docker: ReturnType<typeof useDockerMonitor>; hideStopped: boolean; onToggleHideStopped: () => void;
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
