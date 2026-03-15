import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Cpu, MemoryStick } from 'lucide-react';
import { useResourceMonitor } from './ResourceMonitor';

export function ResourcesSection() {
  const [collapsed, setCollapsed] = useState(false);
  const resources = useResourceMonitor();

  return (
    <div className="space-y-2">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 w-full text-left">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Resources</h3>
      </button>

      {!collapsed && (
        <div className="space-y-2">
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
      )}
    </div>
  );
}

function ResourceBar({ icon, label, percent, detail }: {
  icon: React.ReactNode;
  label: string;
  percent: number;
  detail?: string;
}) {
  const color = percent > 85 ? 'bg-red-500' : percent > 60 ? 'bg-yellow-500' : 'bg-green-500';

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
