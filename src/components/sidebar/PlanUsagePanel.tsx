import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Zap, Clock, BarChart3, ArrowDown, ArrowUp, AlertTriangle, XCircle } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";

interface RateLimitInfo {
  status: "allowed" | "allowed_warning" | "rejected";
  resetsAt?: number;
  rateLimitType?: string;
  utilization?: number;          // 0.0-1.0 exact usage %
  surpassedThreshold?: number;   // threshold that triggered warning (e.g. 0.75)
  overageStatus?: string;
  overageResetsAt?: number;
  overageDisabledReason?: string;
  isUsingOverage?: boolean;
}

interface ModelUsageInfo {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  costUSD: number;
  contextWindow?: number;
  maxOutputTokens?: number;
  webSearchRequests?: number;
}

interface UsageData {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  totalTurns: number;
  totalDurationMs: number;
  sessionCount: number;
  modelUsage?: Record<string, ModelUsageInfo>;
}

interface PlanWindowData {
  subscriptionType?: string;
  email?: string;
  organization?: string;
  rateLimitInfo?: RateLimitInfo | null;
  usage?: UsageData;
}

function fmtTokens(n: number): string {
  if (n === 0) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function windowLabel(type?: string): string {
  if (!type) return '';
  if (type === 'five_hour') return '5h window';
  if (type === 'seven_day') return '7-day window';
  if (type === 'seven_day_opus') return '7-day Opus';
  if (type === 'seven_day_sonnet') return '7-day Sonnet';
  if (type === 'overage') return 'overage';
  return type.replace(/_/g, ' ');
}

export function PlanUsagePanel() {
  const liveUsage = useSessionStore((state) => state.liveUsage);
  const [countdown, setCountdown] = useState("");

  const { data } = useQuery<PlanWindowData>({
    queryKey: ["plan-usage-panel"],
    queryFn: async () => {
      const res = await fetch("/api/usage/window");
      if (!res.ok) return {} as PlanWindowData;
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const plan = data?.subscriptionType || "—";
  const rl = data?.rateLimitInfo;
  const resetsAt = rl?.resetsAt;
  const status = rl?.status;
  const isWarning = status === "allowed_warning";
  const isLimited = status === "rejected";
  const utilization = rl?.utilization;
  const hasUtilization = utilization !== undefined && utilization !== null;
  const wLabel = windowLabel(rl?.rateLimitType);
  const u = data?.usage;

  // Live countdown — clears when expired
  useEffect(() => {
    if (!resetsAt) { setCountdown(""); return; }
    const tick = () => {
      const diff = resetsAt - Date.now() / 1000;
      if (diff <= 0) { setCountdown(""); return; }
      const d = Math.floor(diff / 86400);
      const h = Math.floor((diff % 86400) / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = Math.floor(diff % 60);
      if (d > 0) setCountdown(`${d}d ${h}h ${m}m`);
      else if (h > 0) setCountdown(`${h}h ${m}m ${s}s`);
      else setCountdown(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [resetsAt]);

  const inTokens = (u?.totalInputTokens || 0) + liveUsage.inputTokens;
  const outTokens = (u?.totalOutputTokens || 0) + liveUsage.outputTokens;
  const cacheRead = (u?.totalCacheReadTokens || 0) + liveUsage.cacheReadTokens;
  const cacheWrite = (u?.totalCacheCreationTokens || 0) + liveUsage.cacheCreationTokens;
  const totalCost = (u?.totalCostUsd || 0) + liveUsage.costUsd;
  const turns = u?.totalTurns || 0;

  // Bar color based on utilization
  const barColor = isLimited ? "bg-red-400/70"
    : isWarning ? "bg-yellow-400/60"
    : hasUtilization && utilization > 0.5 ? "bg-yellow-400/40"
    : "bg-green-400/40";

  return (
    <div className="shrink-0 border-b border-border/30 bg-background/50 px-3 py-2 space-y-1.5">
      {/* Plan + Status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-primary" />
          <span className="text-[11px] font-semibold text-foreground">{plan}</span>
        </div>
        <div className="flex items-center gap-1">
          {isLimited ? (
            <><XCircle className="h-2.5 w-2.5 text-red-400" /><span className="text-[9px] text-red-400">Limited</span></>
          ) : isWarning ? (
            <><AlertTriangle className="h-2.5 w-2.5 text-yellow-400" /><span className="text-[9px] text-yellow-400">{hasUtilization ? `${Math.round(utilization * 100)}%` : 'Warning'}</span></>
          ) : rl ? (
            <><span className="h-1.5 w-1.5 rounded-full bg-green-400" /><span className="text-[9px] text-muted-foreground">{hasUtilization ? `${Math.round(utilization * 100)}%` : 'Active'}</span></>
          ) : null}
        </div>
      </div>

      {/* Utilization bar — always show when we have data */}
      {hasUtilization && (
        <div className="w-full h-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(utilization * 100, 100)}%` }} />
        </div>
      )}

      {/* Warning text */}
      {isWarning && (
        <div className="text-[9px] text-yellow-300/80">
          Approaching {wLabel} limit{countdown && <span className="text-yellow-400/40"> · resets in {countdown}</span>}
        </div>
      )}

      {/* Limited text */}
      {isLimited && (
        <div className="text-[9px] text-red-300/80">
          {wLabel} limit reached{countdown && <span className="text-red-400/40"> · resets in {countdown}</span>}
        </div>
      )}

      {/* Countdown (normal state only) */}
      {countdown && !isWarning && !isLimited && (
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            <span className="font-mono text-foreground/60">{countdown}</span>
          </div>
          <span className="text-muted-foreground/40">{wLabel}</span>
        </div>
      )}

      {/* Overage info */}
      {rl?.isUsingOverage && (
        <div className="text-[9px] text-orange-300/70">Using overage billing</div>
      )}

      {/* Session stats */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0 text-[9px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <ArrowDown className="h-2 w-2 text-blue-400/60" />
          <span>In {fmtTokens(inTokens)}</span>
        </div>
        <div className="flex items-center gap-1">
          <ArrowUp className="h-2 w-2 text-green-400/60" />
          <span>Out {fmtTokens(outTokens)}</span>
        </div>
        {(cacheRead > 0 || cacheWrite > 0) && (
          <>
            <div className="text-muted-foreground/40 pl-3">Cache R {fmtTokens(cacheRead)}</div>
            <div className="text-muted-foreground/40 pl-3">Cache W {fmtTokens(cacheWrite)}</div>
          </>
        )}
      </div>

      {/* Cost + messages */}
      <div className="flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-1 text-muted-foreground">
          <BarChart3 className="h-2.5 w-2.5" />
          <span className="font-mono text-foreground/60">{fmtCost(totalCost)}</span>
          {liveUsage.messageCount > 0 && <span className="text-muted-foreground/40">· {liveUsage.messageCount} msgs</span>}
          {turns > 0 && <span className="text-muted-foreground/40">· {turns} turns</span>}
        </div>
        {data?.email && (
          <span className="text-[8px] text-muted-foreground/30 truncate max-w-[80px]">
            {data.email.split("@")[0]}
          </span>
        )}
      </div>

      {/* Per-model breakdown (if multiple models used) */}
      {u?.modelUsage && Object.keys(u.modelUsage).length > 0 && (
        <div className="text-[8px] text-muted-foreground/30 space-y-0">
          {Object.entries(u.modelUsage).map(([model, mu]) => {
            const name = model.replace(/claude-/g, '').replace(/-\d+[km]?$/g, '').replace(/-/g, ' ');
            return (
              <div key={model} className="flex items-center justify-between">
                <span>{name}</span>
                <span>
                  {fmtCost(mu.costUSD)}
                  {mu.contextWindow ? ` · ${(mu.contextWindow / 1000).toFixed(0)}K ctx` : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
