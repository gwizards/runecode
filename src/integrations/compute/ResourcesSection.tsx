import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Cpu, MemoryStick } from 'lucide-react';
import { useResourceMonitor } from './ResourceMonitor';

function barColor(percent: number): string {
  if (percent > 85) return 'bg-red-500';
  if (percent > 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function InlineBar({ percent }: { percent: number }) {
  const color = barColor(percent);
  return (
    <div className="w-12 h-1.5 rounded-full bg-white/5 overflow-hidden flex-shrink-0">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${Math.min(100, percent)}%` }}
      />
    </div>
  );
}

export function ResourcesSection() {
  const [collapsed, setCollapsed] = useState(true);
  const resources = useResourceMonitor();

  const cpuCritical = resources.cpuPercent > 80;
  const ramCritical = resources.ramPercent > 80;
  const anyCritical = cpuCritical || ramCritical;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Resources
        </h3>
        {/* Inline compact preview when collapsed */}
        {collapsed && (
          <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <Cpu className={`h-2.5 w-2.5 ${cpuCritical ? 'text-red-400' : ''}`} />
              {Math.round(resources.cpuPercent)}%
            </span>
            <InlineBar percent={resources.cpuPercent} />
            <span className="flex items-center gap-1">
              <MemoryStick className={`h-2.5 w-2.5 ${ramCritical ? 'text-red-400' : ''}`} />
              {Math.round(resources.ramPercent)}%
            </span>
            <InlineBar percent={resources.ramPercent} />
          </span>
        )}
        {anyCritical && collapsed && (
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse ml-1 flex-shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-2">
              <ResourceBar
                icon={<Cpu className="h-3 w-3 text-blue-400" />}
                label="CPU"
                percent={resources.cpuPercent}
              />
              <ResourceBar
                icon={<MemoryStick className="h-3 w-3 text-purple-400" />}
                label="RAM"
                percent={resources.ramPercent}
                detail={`${resources.ramUsedGb.toFixed(1)}/${resources.ramTotalGb.toFixed(1)} GB`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResourceBar({ icon, label, percent, detail }: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  detail?: string;
}) {
  const color = barColor(percent);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5">
          {icon}
          <span>{label}</span>
        </div>
        <span className="text-muted-foreground">
          {Math.round(percent)}%{detail ? ` (${detail})` : ''}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
    </div>
  );
}
