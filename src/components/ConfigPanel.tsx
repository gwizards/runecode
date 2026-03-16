import { motion } from 'motion/react';
import { Zap } from 'lucide-react';
import { useSessionConfig, type ModelId } from '@/hooks/useSessionConfig';
import { ReasoningSelector } from '@/components/ReasoningSelector';

const MODELS: { id: ModelId; name: string; description: string; iconColor: string }[] = [
  { id: 'sonnet', name: 'Claude Sonnet', description: 'Fast & efficient', iconColor: 'var(--color-gold-400)' },
  { id: 'opus', name: 'Claude Opus', description: 'Most capable', iconColor: 'var(--color-purple-400)' },
];

interface ConfigPanelProps {
  onClose: () => void;
}

export function ConfigPanel({ onClose: _onClose }: ConfigPanelProps) {
  const { model, setModel } = useSessionConfig();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full mb-2 left-0 z-50 glass-elevated rounded-xl p-5 space-y-5"
      style={{ width: '420px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* MODEL SECTION */}
      <div>
        <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Model
        </span>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {MODELS.map((m) => {
            const isSelected = model === m.id;
            return (
              <button
                key={m.id}
                onClick={() => { setModel(m.id); }}
                className="rounded-lg p-3 text-left transition-all cursor-pointer"
                style={{
                  border: `1px solid ${isSelected ? 'var(--color-purple-500)' : 'var(--color-border-subtle)'}`,
                  backgroundColor: isSelected
                    ? 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)'
                    : 'transparent',
                  boxShadow: isSelected ? '0 0 12px var(--color-purple-glow)' : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 10%, transparent)' }}
                  >
                    <Zap className="h-4 w-4" style={{ color: m.iconColor }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {m.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {m.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* REASONING SECTION */}
      <div>
        <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Reasoning
        </span>
        <div className="mt-3">
          <ReasoningSelector />
        </div>
      </div>

      {/* CHECKPOINTS SECTION (empty state) */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
            Checkpoints
          </span>
          <button
            className="text-xs font-medium transition-colors opacity-50 cursor-not-allowed"
            style={{ color: 'var(--color-purple-400)' }}
            disabled
          >
            Rewind
          </button>
        </div>
        <div className="mt-3">
          <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
            Checkpoints coming soon
          </p>
        </div>
      </div>
    </motion.div>
  );
}
