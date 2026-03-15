import { useState } from "react";
import {
  Zap,
  Clock,
  DollarSign,
  FileEdit,
  Wrench,
  BarChart3,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

export interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  filesModified: number;
  toolsCalled: number;
}

interface SessionStatsSectionProps {
  stats: SessionStats;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remaining}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function SessionStatsSection({ stats }: SessionStatsSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const items = [
    {
      icon: <Zap className="h-3 w-3" />,
      label: "Tokens In",
      value: formatTokens(stats.inputTokens),
    },
    {
      icon: <Zap className="h-3 w-3" />,
      label: "Tokens Out",
      value: formatTokens(stats.outputTokens),
    },
    {
      icon: <DollarSign className="h-3 w-3" />,
      label: "Est. Cost",
      value: formatCost(stats.estimatedCostUsd),
    },
    {
      icon: <Clock className="h-3 w-3" />,
      label: "Elapsed",
      value: formatElapsed(stats.elapsedMs),
    },
    {
      icon: <FileEdit className="h-3 w-3" />,
      label: "Files Modified",
      value: String(stats.filesModified),
    },
    {
      icon: <Wrench className="h-3 w-3" />,
      label: "Tools Called",
      value: String(stats.toolsCalled),
    },
  ];

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
        <BarChart3 className="h-3.5 w-3.5 flex-shrink-0" />
        Session Stats
      </button>

      {isOpen && (
        <div className="px-4 pb-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {items.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-1.5"
              >
                <span className="text-muted-foreground">{item.icon}</span>
                <span className="text-xs text-muted-foreground">
                  {item.label}
                </span>
                <span className="text-sm text-foreground ml-auto">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
