/**
 * Resource monitoring sub-views extracted from ResourceDetails.
 * Contains ByProjectView, LocalView, DockerView, and shared small components.
 */

import React, { useState } from "react";
import {
  Cpu, MemoryStick, ArrowUpDown, FolderOpen, Layers,
  Container, Network, HardDrive, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { useDockerMonitor } from "./ResourceMonitor";

/* ─── Shared Types ─── */

export interface ProcessInfo {
  user: string; pid: number; cpu: number; mem: number;
  rss: number; command: string; cwd?: string; project?: string;
}

export interface DockerContainer {
  id: string; name: string; image: string; status: string;
  ports: string; cpu: number; mem: number; memMb: number;
  memLimitMb: number; netIO: string; blockIO: string; pids: number;
}

export interface CombinedProjectGroup {
  name: string; processes: ProcessInfo[]; containers: DockerContainer[];
  totalCpu: number; totalRss: number; totalDockerCpu: number; totalDockerMem: number;
}

export type SortKey = "cpu" | "mem" | "rss" | "pid";

export const fmtMem = (mb: number) => mb >= 1024 ? `${(mb / 1024).toFixed(1)}G` : `${mb}M`;

/* ─── Shared small components ─── */

export function CpuVal({ v, suffix = "" }: { v: number; suffix?: string }) {
  return <span className={v > 50 ? "text-red-400" : v > 20 ? "text-yellow-400" : "text-foreground/60"}>{v.toFixed(1)}{suffix}</span>;
}

export function SortBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
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

export function Empty({ text, sub, icon }: { text: string; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
      {icon}
      <p className="text-sm">{text}</p>
      {sub && <p className="text-[11px] text-muted-foreground/50">{sub}</p>}
    </div>
  );
}

export function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1 text-xs">
      {icon}
      {label && <span className="text-muted-foreground">{label}:</span>}
      <span className="font-mono text-foreground/80">{value}</span>
    </div>
  );
}

/* ─── By Project View (combined) ─── */

export function ByProjectView({ groups, expanded, toggle, totalCpu }: {
  groups: CombinedProjectGroup[]; expanded: Set<string>;
  toggle: (name: string) => void; totalCpu: number;
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
                    <div className="h-full flex">
                      {g.totalCpu > 0 && (
                        <div className={cn("h-full transition-all duration-500", g.totalCpu > 50 ? "bg-red-400/70" : g.totalCpu > 20 ? "bg-yellow-400/60" : "bg-blue-400/50")}
                          style={{ width: `${(g.totalCpu / Math.max(totalCpu, 1)) * 100}%` }} />
                      )}
                      {g.totalDockerCpu > 0 && (
                        <div className="h-full bg-cyan-400/50 transition-all duration-500"
                          style={{ width: `${(g.totalDockerCpu / Math.max(totalCpu, 1)) * 100}%` }} />
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
                {hasProcs && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1 flex items-center gap-1"><Monitor className="h-2.5 w-2.5" /> Processes</div>
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
                {hasDocker && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 mb-1 flex items-center gap-1"><Container className="h-2.5 w-2.5" /> Containers</div>
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

export function LocalView({ processes, groups, expanded, toggle, totalCpu, sortBy, toggleSort }: {
  processes: ProcessInfo[];
  groups: { name: string; totalCpu: number; totalRss: number; processes: ProcessInfo[] }[];
  expanded: Set<string>; toggle: (name: string) => void;
  totalCpu: number; sortBy: SortKey; toggleSort: (key: SortKey) => void;
}) {
  const [viewMode, setViewMode] = useState<"by-project" | "all">("by-project");
  if (processes.length === 0) return <Empty text="No active processes" />;

  return (
    <div>
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
                    <table className="w-full text-xs"><tbody>
                      {g.processes.map(p => (
                        <tr key={p.pid} className="border-b border-border/10 hover:bg-muted/20">
                          <td className="px-4 py-1.5 font-mono text-foreground/80 truncate max-w-[300px]" title={p.cwd || p.command}>{p.command}</td>
                          <td className="text-right px-2 py-1.5 font-mono w-16"><CpuVal v={p.cpu} /></td>
                          <td className="text-right px-2 py-1.5 font-mono w-16"><CpuVal v={p.mem} /></td>
                          <td className="text-right px-2 py-1.5 font-mono text-foreground/60 w-20">{fmtMem(p.rss)}</td>
                          <td className="text-right px-4 py-1.5 font-mono text-muted-foreground/50 w-16">{p.pid}</td>
                        </tr>
                      ))}
                    </tbody></table>
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

export function DockerView({ docker, hideStopped }: { docker: ReturnType<typeof useDockerMonitor>; hideStopped: boolean }) {
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
                <DetailRow icon={<Network className="h-2.5 w-2.5 text-green-400" />} label="Network I/O" value={c.netIO || "\u2014"} />
                <DetailRow icon={<HardDrive className="h-2.5 w-2.5 text-orange-400" />} label="Block I/O" value={c.blockIO || "\u2014"} />
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
