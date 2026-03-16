import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign,
  Zap,
  Activity,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Layers,
  FolderOpen,
} from "lucide-react";

interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}

interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

async function fetchUsageStats(): Promise<UsageStats> {
  try {
    if ((window as any).__TAURI__) {
      const { invoke } = await import("@tauri-apps/api/core");
      return (await invoke("get_usage_stats", {})) as UsageStats;
    }
    const res = await fetch("/api/usage");
    if (!res.ok) throw new Error("Failed to fetch usage");
    const json = await res.json();
    return json.data;
  } catch {
    return {
      total_cost: 0,
      total_tokens: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_creation_tokens: 0,
      total_cache_read_tokens: 0,
      total_sessions: 0,
      by_model: [],
      by_date: [],
      by_project: [],
    };
  }
}

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function shortModelName(model: string): string {
  if (model.includes("opus")) return "Opus 4";
  if (model.includes("sonnet")) return "Sonnet 4";
  if (model.includes("haiku")) return "Haiku";
  // Trim long model IDs
  const parts = model.split("-");
  if (parts.length > 2) return parts.slice(0, 2).join("-");
  return model;
}

function ProgressBar({
  value,
  max,
  color = "bg-purple-500",
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
      <div
        className={`h-full rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function SparklineBar({ data }: { data: { value: number; label: string }[] }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map((d) => d.value), 0.01);
  return (
    <div className="flex items-end gap-[2px] h-8">
      {data.map((d, i) => {
        const heightPct = Math.max((d.value / maxVal) * 100, 2);
        return (
          <div
            key={i}
            className="flex-1 rounded-t-sm bg-purple-500/70 hover:bg-purple-400/90 transition-colors cursor-default"
            style={{ height: `${heightPct}%` }}
            title={`${d.label}: ${formatCost(d.value)}`}
          />
        );
      })}
    </div>
  );
}

export function UsageStatsSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: usage } = useQuery<UsageStats>({
    queryKey: ["usage-stats"],
    queryFn: fetchUsageStats,
    staleTime: 60000,
  });

  if (!usage) return null;

  const hasData = usage.total_tokens > 0 || usage.total_cost > 0;

  // Get last 7 days for sparkline
  const last7Days = (usage.by_date || [])
    .slice(0, 7)
    .reverse()
    .map((d) => ({
      value: d.total_cost,
      label: d.date,
    }));

  const avgCostPerSession =
    usage.total_sessions > 0 ? usage.total_cost / usage.total_sessions : 0;

  // Top 5 projects by cost
  const topProjects = (usage.by_project || []).slice(0, 5);
  const maxProjectCost = topProjects.length > 0 ? topProjects[0].total_cost : 1;

  // Token breakdown
  const tokenBreakdown = [
    { label: "Input", value: usage.total_input_tokens, color: "bg-blue-500" },
    { label: "Output", value: usage.total_output_tokens, color: "bg-emerald-500" },
    {
      label: "Cache Write",
      value: usage.total_cache_creation_tokens,
      color: "bg-amber-500",
    },
    {
      label: "Cache Read",
      value: usage.total_cache_read_tokens,
      color: "bg-purple-500",
    },
  ];
  const maxTokenType = Math.max(...tokenBreakdown.map((t) => t.value), 1);

  // Model cost max
  const maxModelCost =
    usage.by_model.length > 0
      ? Math.max(...usage.by_model.map((m) => m.total_cost), 0.01)
      : 1;

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <Activity className="h-3.5 w-3.5 flex-shrink-0" />
        Usage Stats
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {/* Collapsed summary */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            <div className="flex items-center gap-1.5">
              <DollarSign className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Cost</span>
              <span className="text-sm text-foreground ml-auto font-medium">
                {formatCost(usage.total_cost)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Tokens</span>
              <span className="text-sm text-foreground ml-auto">
                {formatTokens(usage.total_tokens)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Layers className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Sessions</span>
              <span className="text-sm text-foreground ml-auto">
                {usage.total_sessions.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg/Sess</span>
              <span className="text-sm text-foreground ml-auto">
                {formatCost(avgCostPerSession)}
              </span>
            </div>
          </div>

          {hasData && (
            <button
              onClick={() => setIsExpanded((prev) => !prev)}
              className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
            >
              {isExpanded ? "Hide details" : "View details"}
            </button>
          )}

          {/* Expanded details */}
          {isExpanded && hasData && (
            <div className="space-y-3 pt-1">
              {/* Cost by Model */}
              {usage.by_model.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Cost by Model
                  </span>
                  {usage.by_model.map((m) => (
                    <div key={m.model} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/70 truncate max-w-[60%]">
                          {shortModelName(m.model)}
                        </span>
                        <span className="text-foreground/90 font-medium">
                          {formatCost(m.total_cost)}
                        </span>
                      </div>
                      <ProgressBar
                        value={m.total_cost}
                        max={maxModelCost}
                        color={
                          m.model.includes("opus")
                            ? "bg-purple-500"
                            : m.model.includes("sonnet")
                              ? "bg-blue-500"
                              : "bg-gray-500"
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Token Breakdown */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                  Token Breakdown
                </span>
                {tokenBreakdown
                  .filter((t) => t.value > 0)
                  .map((t) => (
                    <div key={t.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/70">{t.label}</span>
                        <span className="text-foreground/90">
                          {formatTokens(t.value)}
                        </span>
                      </div>
                      <ProgressBar
                        value={t.value}
                        max={maxTokenType}
                        color={t.color}
                      />
                    </div>
                  ))}
              </div>

              {/* Cost by Project (top 5) */}
              {topProjects.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Top Projects
                  </span>
                  {topProjects.map((p) => (
                    <div key={p.project_path} className="space-y-0.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-foreground/70 truncate max-w-[60%] flex items-center gap-1">
                          <FolderOpen className="h-2.5 w-2.5 flex-shrink-0" />
                          {p.project_name}
                        </span>
                        <span className="text-foreground/90 font-medium">
                          {formatCost(p.total_cost)}
                        </span>
                      </div>
                      <ProgressBar
                        value={p.total_cost}
                        max={maxProjectCost}
                        color="bg-emerald-500"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* 7-day cost trend */}
              {last7Days.length > 1 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Last 7 Days
                  </span>
                  <SparklineBar data={last7Days} />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{last7Days[0]?.label?.slice(5)}</span>
                    <span>{last7Days[last7Days.length - 1]?.label?.slice(5)}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
