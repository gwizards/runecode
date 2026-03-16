import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import {
  DollarSign,
  Zap,
  ChevronDown,
  ChevronRight,
  Layers,
  FolderOpen,
  Activity,
} from "lucide-react";
import { useSessionStore } from "../../stores/sessionStore";

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

interface UsageStatsSectionProps {
  projectPath?: string;
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

function GradientBar({
  value,
  max,
  gradient,
  label,
}: {
  value: number;
  max: number;
  gradient: string;
  label?: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="relative w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'color-mix(in oklch, var(--color-text-primary) 5%, transparent)' }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${gradient}`}
        style={{ width: `${pct}%` }}
      />
      {label && pct > 15 && (
        <span className="absolute inset-0 flex items-center justify-end pr-1 text-[8px] font-medium text-white/70">
          {Math.round(pct)}%
        </span>
      )}
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
            className="flex-1 rounded-t-sm bg-gradient-to-t from-purple-600 to-purple-400 hover:from-purple-500 hover:to-purple-300 transition-colors cursor-default"
            style={{ height: `${heightPct}%` }}
            title={`${d.label}: ${formatCost(d.value)}`}
          />
        );
      })}
    </div>
  );
}

function StatCard({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <div
      className="flex-1 rounded-lg border px-2.5 py-2 text-center min-w-0"
      style={{
        backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)',
        borderColor: 'color-mix(in oklch, var(--color-purple-500) 12%, transparent)',
      }}
    >
      <div className="flex items-center justify-center gap-1 mb-0.5">
        <span style={{ color: 'var(--color-text-muted)' }}>{icon}</span>
      </div>
      <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{value}</div>
      <div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
    </div>
  );
}

function PlanBadge({ type, compact = false }: { type: string; compact?: boolean }) {
  const planConfig: Record<string, { label: string; color: string; included: boolean }> = {
    max: { label: 'Max', color: 'bg-purple-500/10 text-purple-400', included: true },
    pro: { label: 'Pro', color: 'bg-blue-500/10 text-blue-400', included: true },
    free: { label: 'Free', color: 'bg-muted text-muted-foreground', included: false },
    api: { label: 'API Key', color: 'bg-orange-500/10 text-orange-400', included: false },
    unknown: { label: 'Unknown', color: 'bg-muted text-muted-foreground', included: false },
  };

  const plan = planConfig[type] || planConfig.unknown;

  return (
    <div className="flex items-center gap-1">
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${plan.color}`}>
        {plan.label}
      </span>
      {plan.included && !compact && (
        <span className="text-[10px] text-green-400">Included</span>
      )}
    </div>
  );
}

export function UsageStatsSection({ projectPath }: UsageStatsSectionProps) {
  const [collapsed, setCollapsed] = useState(false); // OPEN by default
  const [isExpanded, setIsExpanded] = useState(false);

  const { data: usage } = useQuery<UsageStats>({
    queryKey: ["usage-stats", projectPath],
    queryFn: fetchUsageStats,
    staleTime: 30000,
    refetchInterval: 30000,
  });

  const { data: authStatus } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => {
      const res = await fetch('/api/auth/status');
      if (!res.ok) return null;
      const json = await res.json();
      return json.data || null;
    },
    staleTime: 300000, // 5 min cache - plan doesn't change often
  });

  const { data: windowData } = useQuery({
    queryKey: ['usage-window'],
    queryFn: async () => {
      const res = await fetch('/api/usage/window');
      if (!res.ok) return null;
      return await res.json();
    },
    refetchInterval: 15000, // refresh every 15s for responsive updates
  });

  const { data: costData } = useQuery({
    queryKey: ['usage-cost'],
    queryFn: async () => {
      const res = await fetch('/api/usage/cost');
      if (!res.ok) return null;
      return await res.json();
    },
    staleTime: 120000, // 2 min cache - this runs a Claude subprocess
    refetchInterval: 300000, // refresh every 5 min
  });

  const liveUsage = useSessionStore(state => state.liveUsage);

  if (!usage) return null;

  // Filter by_project to find the active project's usage
  const projectUsage = projectPath
    ? usage.by_project?.find(
        (p) => p.project_path === projectPath || p.project_path.endsWith(`/${projectPath.split('/').pop()}`)
      )
    : undefined;
  const projectCost = projectUsage?.total_cost || 0;
  const projectTokens = projectUsage?.total_tokens || 0;
  const projectSessions = projectUsage?.session_count || 0;

  // Combine historical + live session data (use project-scoped if available)
  const baseCost = projectPath ? projectCost : usage.total_cost;
  const baseTokens = projectPath ? projectTokens : usage.total_tokens;
  const baseSessions = projectPath ? projectSessions : usage.total_sessions;

  const combinedCost = baseCost + liveUsage.costUsd;
  const combinedTokens = baseTokens + liveUsage.inputTokens + liveUsage.outputTokens;
  const combinedSessions = baseSessions + (liveUsage.messageCount > 0 ? 1 : 0);

  // All-projects totals for comparison
  const allCost = usage.total_cost + liveUsage.costUsd;

  const isIncludedPlan = authStatus?.subscriptionType === 'max' || authStatus?.subscriptionType === 'pro';
  const isIncluded = isIncludedPlan;
  const hasData = combinedTokens > 0 || combinedCost > 0;

  // 5-hour rolling window for Max/Pro plans
  // Use server-calculated effective tokens (weighted by rate limit impact)
  // Cache reads are free, input at 0.2x, cache creation at 0.25x, output at 1x
  // Window data available for display (no limit estimation)

  // Get last 7 days for sparkline
  const last7Days = (usage.by_date || [])
    .slice(0, 7)
    .reverse()
    .map((d) => ({
      value: d.total_cost,
      label: d.date,
    }));

  // Top 5 projects by cost
  const topProjects = (usage.by_project || []).slice(0, 5);
  const maxProjectCost = topProjects.length > 0 ? topProjects[0].total_cost : 1;

  // Token breakdown
  const tokenBreakdown = [
    { label: "Input", value: usage.total_input_tokens, gradient: "bg-gradient-to-r from-blue-600 to-blue-400" },
    { label: "Output", value: usage.total_output_tokens, gradient: "bg-gradient-to-r from-emerald-600 to-emerald-400" },
    {
      label: "Cache Write",
      value: usage.total_cache_creation_tokens,
      gradient: "bg-gradient-to-r from-amber-600 to-amber-400",
    },
    {
      label: "Cache Read",
      value: usage.total_cache_read_tokens,
      gradient: "bg-gradient-to-r from-purple-600 to-purple-400",
    },
  ];
  const maxTokenType = Math.max(...tokenBreakdown.map((t) => t.value), 1);

  // Model cost max
  const models = usage.by_model || [];
  const maxModelCost =
    models.length > 0
      ? Math.max(...models.map((m) => m.total_cost), 0.01)
      : 1;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Usage
        </h3>
        {/* Rich collapsed summary */}
        {collapsed && hasData ? (
          <div className="ml-auto flex items-center gap-1.5 text-[10px]">
            {isIncludedPlan && <PlanBadge type={authStatus?.subscriptionType} compact />}
            <span className="font-mono text-primary">{formatCost(combinedCost)}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{formatTokens(combinedTokens)} tok</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{combinedSessions} sess</span>
          </div>
        ) : hasData ? (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {formatCost(combinedCost)}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-2">
              {/* Project vs All cost labels */}
              {projectPath && projectUsage && (
                <div className="flex items-center justify-between text-[10px] px-0.5">
                  <span className="text-muted-foreground">
                    Project: <span className="text-foreground font-medium">{formatCost(projectCost + liveUsage.costUsd)}</span>
                  </span>
                  <span className="text-muted-foreground">
                    All: <span className="text-foreground/70">{formatCost(allCost)}</span>
                  </span>
                </div>
              )}

              {/* Plan badge */}
              {authStatus && (
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">Plan:</span>
                    <PlanBadge type={authStatus.subscriptionType} />
                  </div>
                  {authStatus.email && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[120px]" title={authStatus.email}>
                      {authStatus.email}
                    </span>
                  )}
                </div>
              )}

              {/* Cost endpoint data: subscription status + service tier */}
              {costData?.result && (
                <p className="text-[10px] text-muted-foreground/60 italic">
                  {costData.result}
                </p>
              )}
              {costData?.usage?.service_tier && (
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span>Tier: {costData.usage.service_tier}</span>
                  <span>·</span>
                  <span>Speed: {costData.usage.speed || 'standard'}</span>
                </div>
              )}

              {/* Stat cards */}
              <div className="flex gap-1.5">
                <StatCard
                  value={formatCost(combinedCost)}
                  label={isIncluded ? "value (included)" : projectPath ? "project cost" : "cost"}
                  icon={<DollarSign className="h-3 w-3" />}
                />
                <StatCard
                  value={formatTokens(combinedTokens)}
                  label="tokens"
                  icon={<Zap className="h-3 w-3" />}
                />
                <StatCard
                  value={combinedSessions.toLocaleString()}
                  label="sessions"
                  icon={<Layers className="h-3 w-3" />}
                />
              </div>

              {/* Included plan note */}
              {isIncluded && (
                <p className="text-[10px] text-muted-foreground/60 italic">
                  Usage included in your {authStatus?.subscriptionType} plan — no extra charges
                </p>
              )}

              {/* Live session stats — shown whenever a session exists */}
              <div className="space-y-1 mt-2 pt-2 border-t border-border/20">
                <div className="flex items-center gap-1">
                  <Activity className={`h-2.5 w-2.5 ${liveUsage.messageCount > 0 ? 'text-emerald-400 animate-pulse' : 'text-muted-foreground/40'}`} />
                  <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>This Session</span>
                </div>
                <div className="space-y-0.5 text-[10px]">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Output</span><span className="font-mono">{formatTokens(liveUsage.outputTokens)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Input</span><span className="font-mono">{formatTokens(liveUsage.inputTokens)}</span>
                  </div>
                  {liveUsage.cacheCreationTokens > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Cache writes</span><span className="font-mono">{formatTokens(liveUsage.cacheCreationTokens)}</span>
                    </div>
                  )}
                  {liveUsage.cacheReadTokens > 0 && (
                    <div className="flex justify-between text-muted-foreground/60">
                      <span>Cache reads</span><span className="font-mono">{formatTokens(liveUsage.cacheReadTokens)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-muted-foreground">
                    <span>Value</span><span className="font-mono">${liveUsage.costUsd.toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground/60">
                    <span>{liveUsage.messageCount} messages</span>
                  </div>
                </div>
              </div>

              {/* 5-hour rolling window data — combines API + live session */}
              {windowData && isIncludedPlan && (
                <div className="space-y-1.5 mt-2 pt-2 border-t border-border/20">
                  <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>Last 5 Hours</span>

                  <div className="space-y-1 text-[10px]">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Output tokens</span>
                      <span className="font-mono">{formatTokens((windowData.outputTokens || 0) + liveUsage.outputTokens)}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Input tokens</span>
                      <span className="font-mono">{formatTokens((windowData.inputTokens || 0) + liveUsage.inputTokens)}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Cache writes</span>
                      <span className="font-mono">{formatTokens(windowData.cacheCreationTokens || 0)}</span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground/40">
                      <span>Cache reads (free)</span>
                      <span className="font-mono">{formatTokens(windowData.cacheReadTokens || 0)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <span>{(windowData.messageCount || 0) + liveUsage.messageCount} messages</span>
                    <span>&middot;</span>
                    <span>Rolling window</span>
                  </div>
                </div>
              )}

              {hasData && (
                <button
                  onClick={() => setIsExpanded((prev) => !prev)}
                  className="text-[11px] text-purple-400 hover:text-purple-300 transition-colors cursor-pointer"
                >
                  {isExpanded ? "Hide details" : "View details"}
                </button>
              )}

              {/* Expanded details */}
              <AnimatePresence>
                {isExpanded && hasData && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-3 pt-1">
                      {/* Cost by Model */}
                      {models.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
                            Cost by Model
                          </span>
                          {models.map((m) => (
                            <div key={m.model} className="space-y-0.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-foreground/70 truncate max-w-[60%]">
                                  {shortModelName(m.model)}
                                </span>
                                <span className="text-foreground/90 font-medium">
                                  {formatCost(m.total_cost)}
                                </span>
                              </div>
                              <GradientBar
                                value={m.total_cost}
                                max={maxModelCost}
                                gradient={
                                  m.model.includes("opus")
                                    ? "bg-gradient-to-r from-purple-600 to-purple-400"
                                    : m.model.includes("sonnet")
                                      ? "bg-gradient-to-r from-blue-600 to-blue-400"
                                      : "bg-gradient-to-r from-gray-600 to-gray-400"
                                }
                                label={`${Math.round((m.total_cost / usage.total_cost) * 100)}%`}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Token Breakdown */}
                      <div className="space-y-1.5">
                        <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
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
                              <GradientBar
                                value={t.value}
                                max={maxTokenType}
                                gradient={t.gradient}
                                label=""
                              />
                            </div>
                          ))}
                      </div>

                      {/* Cost by Project (top 5) */}
                      {topProjects.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
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
                              <GradientBar
                                value={p.total_cost}
                                max={maxProjectCost}
                                gradient="bg-gradient-to-r from-emerald-600 to-emerald-400"
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* 7-day cost trend */}
                      {last7Days.length > 1 && (
                        <div className="space-y-1.5">
                          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
