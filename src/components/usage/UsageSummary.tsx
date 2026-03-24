import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { UsageStats } from "@/lib/api";

interface UsageSummaryProps {
  stats: UsageStats;
  formatCurrency: (amount: number) => string;
  formatNumber: (num: number) => string;
  formatTokens: (num: number) => string;
  getModelDisplayName: (model: string) => string;
}

/**
 * Summary cards and overview section for the usage dashboard.
 */
export const UsageSummary: React.FC<UsageSummaryProps> = ({
  stats,
  formatCurrency,
  formatNumber,
  formatTokens,
  getModelDisplayName,
}) => {
  const summaryCards = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card className="p-4 shimmer-hover">
        <div>
          <p className="text-caption text-muted-foreground">Total Cost</p>
          <p className="text-display-2 mt-1">
            {formatCurrency(stats.total_cost)}
          </p>
        </div>
      </Card>

      <Card className="p-4 shimmer-hover">
        <div>
          <p className="text-caption text-muted-foreground">Total Sessions</p>
          <p className="text-display-2 mt-1">
            {formatNumber(stats.total_sessions)}
          </p>
        </div>
      </Card>

      <Card className="p-4 shimmer-hover">
        <div>
          <p className="text-caption text-muted-foreground">Total Tokens</p>
          <p className="text-display-2 mt-1">
            {formatTokens(stats.total_tokens)}
          </p>
        </div>
      </Card>

      <Card className="p-4 shimmer-hover">
        <div>
          <p className="text-caption text-muted-foreground">Avg Cost/Session</p>
          <p className="text-display-2 mt-1">
            {formatCurrency(
              stats.total_sessions > 0
                ? stats.total_cost / stats.total_sessions
                : 0
            )}
          </p>
        </div>
      </Card>
    </div>
  ), [stats, formatCurrency, formatNumber, formatTokens]);

  const mostUsedModels = useMemo(() => {
    if (!stats?.by_model) return null;

    return stats.by_model.slice(0, 3).map((model) => (
      <div key={model.model} className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-caption">
            {getModelDisplayName(model.model)}
          </Badge>
          <span className="text-caption text-muted-foreground">
            {model.session_count} sessions
          </span>
        </div>
        <span className="text-body-small font-medium">
          {formatCurrency(model.total_cost)}
        </span>
      </div>
    ));
  }, [stats, formatCurrency, getModelDisplayName]);

  const topProjects = useMemo(() => {
    if (!stats?.by_project) return null;

    return stats.by_project.slice(0, 3).map((project) => (
      <div key={project.project_path} className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-body-small font-medium truncate max-w-[200px]" title={project.project_path}>
            {project.project_path}
          </span>
          <span className="text-caption text-muted-foreground">
            {project.session_count} sessions
          </span>
        </div>
        <span className="text-body-small font-medium">
          {formatCurrency(project.total_cost)}
        </span>
      </div>
    ));
  }, [stats, formatCurrency]);

  return (
    <>
      {summaryCards}

      {/* Token Breakdown */}
      <Card className="p-6">
        <h3 className="text-label mb-4">Token Breakdown</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-caption text-muted-foreground">Input Tokens</p>
            <p className="text-heading-4">{formatTokens(stats.total_input_tokens)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Output Tokens</p>
            <p className="text-heading-4">{formatTokens(stats.total_output_tokens)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Cache Write</p>
            <p className="text-heading-4">{formatTokens(stats.total_cache_creation_tokens)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Cache Read</p>
            <p className="text-heading-4">{formatTokens(stats.total_cache_read_tokens)}</p>
          </div>
        </div>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <h3 className="text-label mb-4">Most Used Models</h3>
          <div className="space-y-3">
            {mostUsedModels}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-label mb-4">Top Projects</h3>
          <div className="space-y-3">
            {topProjects}
          </div>
        </Card>
      </div>
    </>
  );
};
