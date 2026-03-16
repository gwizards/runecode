import React from 'react';
import { Zap } from 'lucide-react';
import { useSessionConfig, type ModelId, type ThinkingMode } from '@/hooks/useSessionConfig';

const MODEL_INFO: Record<ModelId, { name: string; iconColor: string }> = {
  sonnet: { name: 'Sonnet', iconColor: 'var(--color-gold-400)' },
  opus: { name: 'Opus', iconColor: 'var(--color-purple-400)' },
};

const THINKING_LABELS: Record<ThinkingMode, string> = {
  auto: 'Auto',
  think: 'Think',
  think_hard: 'Deep',
  think_harder: 'Hard',
  ultrathink: 'Ultra',
};

interface ConfigPillProps {
  onClick: () => void;
  isOpen: boolean;
  checkpointCount?: number;
}

export function ConfigPill({ onClick, isOpen, checkpointCount = 0 }: ConfigPillProps) {
  const { model, thinkingMode } = useSessionConfig();
  const modelInfo = MODEL_INFO[model];
  const thinkingLabel = THINKING_LABELS[thinkingMode];

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 h-8 shrink-0 transition-all cursor-pointer"
      style={{
        backgroundColor: 'color-mix(in oklch, var(--color-void-overlay) 60%, transparent)',
        border: `1px solid ${isOpen ? 'var(--color-border-purple)' : 'var(--color-border-subtle)'}`,
        ...(isOpen && { boxShadow: '0 0 12px var(--color-purple-glow)' }),
      }}
    >
      <Zap className="h-3 w-3" style={{ color: modelInfo.iconColor }} />
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {modelInfo.name}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>&middot;</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {thinkingLabel}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>&middot;</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-gold-400)' }}>
        ✓{checkpointCount}
      </span>
    </button>
  );
}
