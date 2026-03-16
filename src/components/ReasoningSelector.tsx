import { useSessionConfig, type ThinkingMode } from '@/hooks/useSessionConfig';

const LEVELS: { id: ThinkingMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'think', label: 'Think' },
  { id: 'think_hard', label: 'Deep' },
  { id: 'think_harder', label: 'Hard' },
  { id: 'ultrathink', label: 'Ultra' },
];

export function ReasoningSelector() {
  const { thinkingMode, setThinkingMode } = useSessionConfig();

  return (
    <div className="flex gap-1">
      {LEVELS.map((level) => {
        const isSelected = thinkingMode === level.id;
        const isUltra = level.id === 'ultrathink' && isSelected;
        return (
          <button
            key={level.id}
            onClick={() => setThinkingMode(level.id)}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer"
            style={{
              backgroundColor: isSelected
                ? isUltra ? 'var(--color-gold-400)' : 'var(--color-purple-500)'
                : 'transparent',
              color: isSelected
                ? isUltra ? 'var(--color-text-on-gold)' : 'var(--color-text-on-purple)'
                : 'var(--color-text-secondary)',
              border: `1px solid ${isSelected ? 'transparent' : 'var(--color-border-subtle)'}`,
              boxShadow: isSelected
                ? isUltra ? '0 0 8px var(--color-gold-glow)' : '0 0 8px var(--color-purple-glow)'
                : 'none',
            }}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
