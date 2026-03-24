import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { applyStartupToken } from "@/lib/startupToken";
import { Zap, Clock, AlertTriangle, XCircle } from "lucide-react";

interface RateLimitInfo {
  status: "allowed" | "allowed_warning" | "rejected";
  resetsAt?: number;
  rateLimitType?: string;
  utilization?: number;
  isUsingOverage?: boolean;
}

interface PlanWindowData {
  subscriptionType?: string;
  email?: string;
  organization?: string;
  rateLimitInfo?: RateLimitInfo | null;
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
  const [countdown, setCountdown] = useState("");

  const { data } = useQuery<PlanWindowData>({
    queryKey: ["plan-usage-panel"],
    queryFn: async () => {
      const res = await fetch("/api/usage/window", { headers: applyStartupToken({}) });
      if (!res.ok) return {} as PlanWindowData;
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
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

  // Live countdown
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

  const barColor = isLimited ? "bg-red-400/70"
    : isWarning ? "bg-yellow-400/60"
    : hasUtilization && utilization > 0.5 ? "bg-yellow-400/40"
    : "bg-green-400/40";

  return (
    <div className="shrink-0 border-b border-border/30 bg-background/50 px-3 py-2 space-y-1.5">
      {/* Account + Plan */}
      {data?.email && (
        <div className="text-[10px] text-muted-foreground/60 truncate">
          {data.organization ? `${data.organization} · ` : ''}{data.email}
        </div>
      )}
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
          ) : (
            <><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span className="text-[9px] text-muted-foreground/50">Ready</span></>
          )}
        </div>
      </div>

      {/* Utilization bar */}
      {hasUtilization && (
        <div className="w-full h-1 rounded-full bg-white/[0.04] overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${Math.min(utilization * 100, 100)}%` }} />
        </div>
      )}

      {/* Warning */}
      {isWarning && (
        <div className="text-[9px] text-yellow-300/80">
          Approaching {wLabel} limit{countdown && <span className="text-yellow-400/40"> · resets in {countdown}</span>}
        </div>
      )}

      {/* Limited */}
      {isLimited && (
        <div className="text-[9px] text-red-300/80">
          {wLabel} limit reached{countdown && <span className="text-red-400/40"> · resets in {countdown}</span>}
        </div>
      )}

      {/* Countdown (normal) */}
      {countdown && !isWarning && !isLimited && (
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            <span className="font-mono text-foreground/60">{countdown}</span>
          </div>
          <span className="text-muted-foreground/40">{wLabel}</span>
        </div>
      )}

      {/* Overage */}
      {rl?.isUsingOverage && (
        <div className="text-[9px] text-orange-300/70">Using overage billing</div>
      )}
    </div>
  );
}
