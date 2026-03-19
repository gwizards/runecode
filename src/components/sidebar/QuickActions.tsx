import { TerminalSquare, Settings, Plus } from 'lucide-react';
import { useTabState } from '@/hooks/useTabState';

export function QuickActions() {
  const { createTerminalTab, createProjectsTab, createSettingsTab } = useTabState();

  const actions = [
    { icon: Plus, label: 'New Project', action: () => createProjectsTab(), color: 'text-primary' },
    { icon: TerminalSquare, label: 'Shell', action: () => createTerminalTab(undefined, undefined, ['--shell']), color: 'text-amber-400/70' },
    { icon: Settings, label: 'Settings', action: () => createSettingsTab(), color: 'text-muted-foreground/70' },
  ];

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1">
        {actions.map(({ icon: Icon, label, action, color }) => (
          <button
            key={label}
            onClick={action}
            title={label}
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded hover:bg-muted/50 transition-colors text-[9px] text-muted-foreground hover:text-foreground"
          >
            <Icon className={`h-3 w-3 ${color}`} />
            <span className="hidden xl:inline">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
