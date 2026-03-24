import React from "react";
import { motion } from "motion/react";
import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { TodoStatusConfig, TodoStats } from "./types";

interface TodoStatsViewProps {
  stats: TodoStats;
  statusConfig: Record<string, TodoStatusConfig>;
}

export const TodoStatsView: React.FC<TodoStatsViewProps> = ({ stats, statusConfig }) => (
  <div className="space-y-4">
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium">Overall Progress</h4>
        <span className="text-2xl font-bold text-primary">{stats.completionRate}%</span>
      </div>
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${stats.completionRate}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-primary to-primary/80"
        />
      </div>
    </Card>

    <div className="grid grid-cols-2 gap-3">
      {Object.entries(statusConfig).map(([status, config]) => {
        const count = stats[status as keyof typeof stats] || 0;
        const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

        return (
          <Card key={status} className={cn("p-4", config.bgColor)}>
            <div className="flex items-center gap-3">
              <div className={config.color}>{config.icon}</div>
              <div className="flex-1">
                <p className="text-xs text-muted-foreground">{config.label}</p>
                <p className="text-lg font-semibold">{count}</p>
                <p className="text-xs text-muted-foreground">{percentage}%</p>
              </div>
            </div>
          </Card>
        );
      })}
    </div>

    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-medium">Activity Overview</h4>
      </div>
      <div className="space-y-2">
        {Object.entries(statusConfig).map(([status, config]) => {
          const count = stats[status as keyof typeof stats] || 0;
          const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;

          return (
            <div key={status} className="flex items-center gap-3">
              <span className="text-xs w-20 text-right">{config.label}</span>
              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.5, delay: 0.1 }}
                  className={cn("h-full", config.bgColor)}
                />
              </div>
              <span className="text-xs w-12 text-left">{count}</span>
            </div>
          );
        })}
      </div>
    </Card>
  </div>
);
