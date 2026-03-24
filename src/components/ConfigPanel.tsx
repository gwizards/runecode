import { motion } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import { useSessionConfig, type ThinkingMode, type EffortLevel, type PermissionMode } from '@/hooks/useSessionConfig';
import { cn } from '@/lib/utils';
import { applyStartupToken } from '@/lib/startupToken';

interface ConfigPanelProps {
  onClose: () => void;
  sessionId?: string;
  projectId?: string;
  projectPath?: string;
}

export function ConfigPanel({ onClose: _onClose }: ConfigPanelProps) {
  const { model, setModel, thinkingMode, setThinkingMode, effort, setEffort, permissionMode, setPermissionMode, teamsEnabled, setTeamsEnabled } = useSessionConfig();

  const { data: sdkModels } = useQuery({
    queryKey: ['sdk-models'],
    queryFn: async () => {
      const res = await fetch('/api/models', { headers: applyStartupToken({}) });
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300_000,
  });

  const models: { id: string; name: string; desc: string }[] = (sdkModels && sdkModels.length > 0)
    ? sdkModels.map((m: any) => ({
        id: m.value || m.name,
        name: m.displayName || m.name || '?',
        desc: m.description || '',
      }))
    : [
        { id: 'sonnet', name: 'Sonnet', desc: 'Fast, capable' },
        { id: 'opus', name: 'Opus', desc: 'Most powerful' },
      ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: 6 }}
      transition={{ duration: 0.12 }}
      className="absolute bottom-full mb-2 right-0 z-50 rounded-lg overflow-hidden shadow-xl"
      style={{ width: '300px', backgroundColor: 'var(--color-void-elevated)', border: '1px solid var(--color-border-subtle)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="p-2.5 space-y-1.5">

        {/* MODEL — horizontal pills with description tooltip */}
        <Row label="Model">
          {models.map((m) => (
            <Pill key={m.id} active={model === m.id} onClick={() => setModel(m.id)} title={m.desc}>
              {m.name}
            </Pill>
          ))}
        </Row>

        {/* THINKING */}
        <Row label="Think">
          {([
            ['auto', 'Auto'], ['think', 'Think'], ['think_hard', 'Deep'],
            ['think_harder', 'Hard'], ['ultrathink', 'Ultra'],
          ] as [ThinkingMode, string][]).map(([id, label]) => (
            <Pill key={id} active={thinkingMode === id} onClick={() => setThinkingMode(id)}>
              {label}
            </Pill>
          ))}
        </Row>

        {/* EFFORT */}
        <Row label="Effort">
          {([
            ['auto', 'Auto'], ['low', 'Low'], ['medium', 'Med'], ['high', 'High'], ['max', 'Max'],
          ] as [EffortLevel, string][]).map(([id, label]) => (
            <Pill key={id} active={effort === id} onClick={() => setEffort(id)}>
              {label}
            </Pill>
          ))}
        </Row>

        {/* PERMISSIONS */}
        <Row label="Perms">
          {([
            ['bypassPermissions', 'Auto'], ['acceptEdits', 'Edits'], ['default', 'Ask'], ['plan', 'Plan'],
          ] as [PermissionMode, string][]).map(([id, label]) => (
            <Pill key={id} active={permissionMode === id} onClick={() => setPermissionMode(id)}>
              {label}
            </Pill>
          ))}
        </Row>

        {/* TEAMS */}
        <Row label="Teams">
          <Pill active={teamsEnabled} onClick={() => setTeamsEnabled(!teamsEnabled)}>
            {teamsEnabled ? 'On' : 'Off'}
          </Pill>
        </Row>

        {/* REWIND — SDK native checkpoint system */}
        <Row label="Rewind">
          <button
            onClick={() => { window.dispatchEvent(new CustomEvent('runecode:open-timeline')); _onClose(); }}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Browse & restore →
          </button>
        </Row>

      </div>

      {/* SHORTCUTS */}
      <div className="px-2.5 py-1 flex items-center justify-center gap-3 border-t border-border/15 text-[8px] font-mono text-muted-foreground/30">
        <span><kbd className="px-0.5 rounded bg-white/5">⌘M</kbd> model</span>
        <span><kbd className="px-0.5 rounded bg-white/5">⌘T</kbd> think</span>
        <span><kbd className="px-0.5 rounded bg-white/5">Esc</kbd> close</span>
      </div>
    </motion.div>
  );
}

/** Compact row: label on left, children (pills) on right */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/40 w-[42px] shrink-0">{label}</span>
      <div className="flex gap-0.5 flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** Individual pill button */
function Pill({ active, onClick, title, children }: { active: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "flex-1 px-1 py-[3px] rounded text-[10px] font-medium transition-all truncate",
        active
          ? "bg-primary/15 text-primary border border-primary/25"
          : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-white/5"
      )}
    >
      {children}
    </button>
  );
}
