import { Zap, ChevronUp } from 'lucide-react';
import { useSessionConfig, type ThinkingMode } from '@/hooks/useSessionConfig';

function getModelInfo(model: string): { name: string; iconColor: string } {
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return { name: 'Opus', iconColor: 'var(--color-purple-400)' };
  if (lower.includes('haiku')) return { name: 'Haiku', iconColor: 'var(--color-blue-400)' };
  if (lower.includes('sonnet') || lower === 'default') return { name: 'Sonnet', iconColor: 'var(--color-gold-400)' };
  // For unknown models, use the raw name
  const displayName = model.split('-').pop() || model;
  return { name: displayName.charAt(0).toUpperCase() + displayName.slice(1), iconColor: 'var(--color-gold-400)' };
}

const THINKING_LABELS: Record<ThinkingMode, string> = {
  auto: 'Auto',
  think: 'Think',
  think_hard: 'Deep',
  think_harder: 'Hard',
  ultrathink: 'Ultra',
};

const THINKING_COLORS: Record<ThinkingMode, string> = {
  auto: 'var(--color-text-secondary)',
  think: 'var(--color-purple-400)',
  think_hard: 'var(--color-purple-400)',
  think_harder: 'var(--color-purple-400)',
  ultrathink: 'var(--color-gold-400)',
};

interface ConfigPillProps {
  onClick: () => void;
  isOpen: boolean;
  checkpointCount?: number;
}

export function ConfigPill({ onClick, isOpen, checkpointCount = 0 }: ConfigPillProps) {
  const { model, thinkingMode } = useSessionConfig();
  const modelInfo = getModelInfo(model);
  const thinkingLabel = THINKING_LABELS[thinkingMode];
  const thinkingColor = THINKING_COLORS[thinkingMode];

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-full px-3.5 h-9 shrink-0 transition-all cursor-pointer group"
      style={{
        backgroundColor: isOpen
          ? 'var(--color-void-elevated)'
          : 'var(--color-void-raised)',
        border: `1px solid ${isOpen ? 'var(--color-border-purple)' : 'var(--color-border-subtle)'}`,
        boxShadow: isOpen ? '0 0 15px var(--color-purple-glow)' : 'none',
      }}
    >
      {/* Model icon + name */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-5 h-5 rounded flex items-center justify-center"
          style={{
            backgroundColor: 'var(--color-void-overlay)',
          }}
        >
          <Zap className="h-3 w-3" style={{ color: modelInfo.iconColor }} />
        </div>
        <span
          className="text-[11px] font-semibold"
          style={{ color: 'var(--color-text-primary)', fontFamily: 'var(--font-heading)' }}
        >
          {modelInfo.name}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-3.5" style={{ backgroundColor: 'var(--color-border-subtle)' }} />

      {/* Thinking mode */}
      <span className="text-[11px] font-medium" style={{ color: thinkingColor }}>
        {thinkingLabel}
      </span>

      {/* Separator */}
      <div className="w-px h-3.5" style={{ backgroundColor: 'var(--color-border-subtle)' }} />

      {/* Checkpoint count */}
      <span className="text-[10px] font-mono" style={{ color: 'var(--color-gold-400)' }}>
        ✓{checkpointCount}
      </span>

      {/* Chevron */}
      <ChevronUp
        className="h-2.5 w-2.5 transition-transform"
        style={{
          color: 'var(--color-text-muted)',
          transform: isOpen ? 'rotate(0deg)' : 'rotate(180deg)',
        }}
      />
    </button>
  );
}
