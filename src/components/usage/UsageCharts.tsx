import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import type { UsageStats } from "@/lib/api";

interface UsageChartsProps {
  stats: UsageStats;
  formatCurrency: (amount: number) => string;
  formatTokens: (num: number) => string;
}

/**
 * Timeline chart displaying daily usage data as a bar chart.
 */
export const UsageCharts: React.FC<UsageChartsProps> = ({
  stats,
  formatCurrency,
  formatTokens,
}) => {
  const timelineChartData = useMemo(() => {
    if (!stats?.by_date || stats.by_date.length === 0) return null;

    const maxCost = Math.max(...stats.by_date.map(d => d.total_cost), 0);
    const halfMaxCost = maxCost / 2;
    const reversedData = stats.by_date.slice().reverse();

    return {
      maxCost,
      halfMaxCost,
      reversedData,
      bars: reversedData.map(day => ({
        ...day,
        heightPercent: maxCost > 0 ? (day.total_cost / maxCost) * 100 : 0,
        date: new Date(day.date.replace(/-/g, '/')),
      }))
    };
  }, [stats?.by_date]);

  return (
    <Card className="p-6">
      <h3 className="text-sm font-semibold mb-6 flex items-center space-x-2">
        <Calendar className="h-4 w-4" />
        <span>Daily Usage</span>
      </h3>
      {timelineChartData ? (
        <div className="relative pl-8 pr-4">
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-muted-foreground">
            <span>{formatCurrency(timelineChartData.maxCost)}</span>
            <span>{formatCurrency(timelineChartData.halfMaxCost)}</span>
            <span>{formatCurrency(0)}</span>
          </div>

          {/* Chart container */}
          <div className="flex items-end space-x-2 h-64 border-l border-b border-border pl-4">
            {timelineChartData.bars.map((day) => {
              const formattedDate = day.date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });

              return (
                <div key={day.date.toISOString()} className="flex-1 h-full flex flex-col items-center justify-end group relative">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none z-10">
                    <div className="bg-background border border-border rounded-lg shadow-lg p-3 whitespace-nowrap">
                      <p className="text-sm font-semibold">{formattedDate}</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Cost: {formatCurrency(day.total_cost)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTokens(day.total_tokens)} tokens
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {day.models_used.length} model{day.models_used.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                      <div className="border-4 border-transparent border-t-border"></div>
                    </div>
                  </div>

                  {/* Bar */}
                  <div
                    className="w-full bg-primary hover:opacity-80 transition-opacity rounded-t cursor-pointer"
                    style={{ height: `${day.heightPercent}%` }}
                  />

                  {/* X-axis label */}
                  <div
                    className="absolute left-1/2 top-full mt-2 -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap pointer-events-none"
                  >
                    {day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* X-axis label */}
          <div className="mt-10 text-center text-xs text-muted-foreground">
            Daily Usage Over Time
          </div>
        </div>
      ) : (
        <div className="text-center py-8 text-sm text-muted-foreground">
          No usage data available for the selected period
        </div>
      )}
    </Card>
  );
};
