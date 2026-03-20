import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Reusable setting row — label + description on the left, control on the right */
export function SettingRow({ label, description, children }: {
  label: React.ReactNode;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

/** Card wrapper for grouped settings with icon + title + description */
export function SettingsCard({ icon: Icon, iconColor, title, description, children }: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/30 bg-muted/5">
      <div className="flex items-start gap-3">
        <Icon className={cn('w-4.5 h-4.5 mt-0.5 flex-shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

/** Toggle switch with colored active state */
export function ToggleSwitch({ enabled, onChange, color = 'purple' }: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-500/60',
    cyan: 'bg-cyan-500/60',
    emerald: 'bg-emerald-500/60',
    pink: 'bg-pink-500/60',
    amber: 'bg-amber-500/60',
    orange: 'bg-orange-500/60',
    blue: 'bg-blue-400/60',
  };
  const bg = colorMap[color] || colorMap.purple;

  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
        enabled ? bg : 'bg-muted-foreground/20'
      )}
    >
      <span className={cn(
        'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
        enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
      )} />
    </button>
  );
}
