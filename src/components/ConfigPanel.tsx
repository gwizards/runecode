import { useState } from 'react';
import { motion } from 'motion/react';
import { Zap, Sparkles, Lightbulb, Brain, Cpu, Rocket, GitBranch, Save, Clock } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessionConfig, type ModelId, type ThinkingMode } from '@/hooks/useSessionConfig';
import { api } from '@/lib/api';

const MODELS: {
  id: ModelId;
  name: string;
  fullName: string;
  description: string;
  iconColor: string;
  badge?: string;
  specs: string;
}[] = [
  {
    id: 'sonnet',
    name: 'Sonnet',
    fullName: 'Claude 4 Sonnet',
    description: 'Fast responses, great for most tasks',
    iconColor: 'var(--color-gold-400)',
    specs: '200K context · Fast',
  },
  {
    id: 'opus',
    name: 'Opus',
    fullName: 'Claude 4 Opus',
    description: 'Maximum capability for complex work',
    iconColor: 'var(--color-purple-400)',
    badge: 'PRO',
    specs: '200K context · Powerful',
  },
];

const THINKING_LEVELS: {
  id: ThinkingMode;
  label: string;
  description: string;
  icon: React.ReactNode;
  iconColor: string;
}[] = [
  {
    id: 'auto',
    label: 'Auto',
    description: 'Let Claude decide',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    iconColor: 'var(--color-text-muted)',
  },
  {
    id: 'think',
    label: 'Think',
    description: 'Basic reasoning',
    icon: <Lightbulb className="h-3.5 w-3.5" />,
    iconColor: 'var(--color-purple-400)',
  },
  {
    id: 'think_hard',
    label: 'Deep',
    description: 'Deeper analysis',
    icon: <Brain className="h-3.5 w-3.5" />,
    iconColor: 'var(--color-purple-400)',
  },
  {
    id: 'think_harder',
    label: 'Hard',
    description: 'Extensive reasoning',
    icon: <Cpu className="h-3.5 w-3.5" />,
    iconColor: 'var(--color-purple-400)',
  },
  {
    id: 'ultrathink',
    label: 'Ultra',
    description: 'Maximum computation',
    icon: <Rocket className="h-3.5 w-3.5" />,
    iconColor: 'var(--color-gold-400)',
  },
];

interface ConfigPanelProps {
  onClose: () => void;
  sessionId?: string;
  projectId?: string;
  projectPath?: string;
}

export function ConfigPanel({ onClose: _onClose, sessionId, projectId, projectPath }: ConfigPanelProps) {
  const { model, setModel, thinkingMode, setThinkingMode } = useSessionConfig();
  const queryClient = useQueryClient();
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState(false);

  const { data: checkpointSettings } = useQuery({
    queryKey: ['checkpoint-settings', sessionId, projectId],
    queryFn: async () => {
      return api.getCheckpointSettings(sessionId!, projectId!, projectPath || '');
    },
    staleTime: 30000,
    enabled: !!sessionId && !!projectId,
  });

  const handleCreateCheckpoint = async () => {
    if (!sessionId || !projectId) return;
    setIsCreatingCheckpoint(true);
    try {
      await api.createCheckpoint(sessionId, projectId, projectPath || '', undefined, 'Manual checkpoint');
      queryClient.invalidateQueries({ queryKey: ['checkpoint-count', sessionId, projectId] });
      queryClient.invalidateQueries({ queryKey: ['checkpoint-settings', sessionId, projectId] });
    } catch (err) {
      console.error('Failed to create checkpoint:', err);
    } finally {
      setIsCreatingCheckpoint(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 8 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className="absolute bottom-full mb-2 right-0 z-50 rounded-xl overflow-hidden"
      style={{ width: '440px', backgroundColor: 'var(--color-void-elevated)', border: '1px solid var(--color-border-subtle)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* MODEL SECTION */}
      <div className="p-4 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-3 w-3" style={{ color: 'var(--color-gold-300)' }} />
          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
            Model
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {MODELS.map((m) => {
            const isSelected = model === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className="rounded-xl p-3.5 text-left transition-all cursor-pointer group"
                style={{
                  border: `1px solid ${isSelected ? 'var(--color-purple-500)' : 'var(--color-border-subtle)'}`,
                  backgroundColor: isSelected
                    ? 'color-mix(in oklch, var(--color-purple-500) 8%, var(--color-void-elevated))'
                    : 'var(--color-void-raised)',
                  boxShadow: isSelected ? '0 0 20px var(--color-purple-glow)' : 'none',
                }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all"
                    style={{
                      backgroundColor: isSelected
                        ? 'color-mix(in oklch, var(--color-purple-500) 15%, var(--color-void-elevated))'
                        : 'var(--color-void-overlay)',
                      border: `1px solid ${isSelected ? 'color-mix(in oklch, var(--color-purple-500) 20%, var(--color-void-elevated))' : 'transparent'}`,
                    }}
                  >
                    <Zap className="h-4 w-4" style={{ color: m.iconColor }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[13px] font-semibold"
                        style={{
                          color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                          fontFamily: 'var(--font-heading)',
                        }}
                      >
                        {m.name}
                      </span>
                      {m.badge && (
                        <span
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: 'color-mix(in oklch, var(--color-gold-400) 15%, var(--color-void-elevated))',
                            color: 'var(--color-gold-400)',
                            letterSpacing: '0.05em',
                          }}
                        >
                          {m.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                      {m.description}
                    </p>
                    <p
                      className="text-[10px] mt-1.5 font-mono"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      {m.specs}
                    </p>
                  </div>
                </div>
                {/* Selection indicator */}
                {isSelected && (
                  <div
                    className="mt-3 h-0.5 rounded-full"
                    style={{
                      background: 'linear-gradient(90deg, var(--color-purple-500), var(--color-purple-400), transparent)',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="mx-4 my-3 h-px" style={{
        background: 'linear-gradient(90deg, transparent, var(--color-border-subtle), transparent)',
      }} />

      {/* REASONING SECTION */}
      <div className="px-4 pb-0">
        <div className="flex items-center gap-2 mb-3">
          <Brain className="h-3 w-3" style={{ color: 'var(--color-gold-300)' }} />
          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
            Reasoning
          </span>
        </div>
        <div className="flex flex-col gap-1">
          {THINKING_LEVELS.map((level) => {
            const isSelected = thinkingMode === level.id;
            const isUltra = level.id === 'ultrathink';
            const activeColor = isUltra ? 'var(--color-gold-400)' : 'var(--color-purple-500)';
            const activeGlow = isUltra ? 'var(--color-gold-glow)' : 'var(--color-purple-glow)';

            return (
              <button
                key={level.id}
                onClick={() => setThinkingMode(level.id)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 transition-all cursor-pointer text-left"
                style={{
                  backgroundColor: isSelected
                    ? `color-mix(in oklch, ${activeColor} 10%, var(--color-void-elevated))`
                    : 'transparent',
                  border: `1px solid ${isSelected ? activeColor : 'transparent'}`,
                  boxShadow: isSelected ? `0 0 12px ${activeGlow}` : 'none',
                }}
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: isSelected
                      ? `color-mix(in oklch, ${activeColor} 15%, var(--color-void-elevated))`
                      : 'var(--color-void-overlay)',
                    color: isSelected ? level.iconColor : 'var(--color-text-muted)',
                  }}
                >
                  {level.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <span
                    className="text-[12px] font-medium"
                    style={{
                      color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {level.label}
                  </span>
                  <span
                    className="text-[10px] ml-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    {level.description}
                  </span>
                </div>
                {/* Level indicator bars */}
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4].map((i) => {
                    const levelNum = THINKING_LEVELS.findIndex((l) => l.id === level.id);
                    const filled = i <= levelNum;
                    return (
                      <div
                        key={i}
                        className="w-1 rounded-full transition-all"
                        style={{
                          height: `${8 + i * 2}px`,
                          backgroundColor: filled
                            ? isSelected
                              ? isUltra ? 'var(--color-gold-400)' : 'var(--color-purple-500)'
                              : 'var(--color-text-muted)'
                            : 'var(--color-void-overlay)',
                        }}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* DIVIDER */}
      <div className="mx-4 my-3 h-px" style={{
        background: 'linear-gradient(90deg, transparent, var(--color-border-subtle), transparent)',
      }} />

      {/* CHECKPOINTS SECTION */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-3 w-3" style={{ color: 'var(--color-gold-300)' }} />
            <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
              Checkpoints
            </span>
          </div>
          {checkpointSettings && (
            <span
              className="text-[10px] font-mono"
              style={{ color: 'var(--color-text-muted)' }}
            >
              {checkpointSettings.total_checkpoints} saved
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <button
            onClick={handleCreateCheckpoint}
            disabled={!sessionId || !projectId || isCreatingCheckpoint}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-void-raised)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--color-void-overlay)' }}
            >
              <Save className="h-3.5 w-3.5" style={{ color: 'var(--color-purple-400)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {isCreatingCheckpoint ? 'Creating...' : 'Create Checkpoint'}
              </span>
              <span className="text-[10px] ml-2" style={{ color: 'var(--color-text-muted)' }}>
                Save current state
              </span>
            </div>
          </button>

          <button
            onClick={() => {
              // Dispatch a custom event to open the timeline navigator
              window.dispatchEvent(new CustomEvent('opcode:open-timeline'));
              _onClose();
            }}
            disabled={!sessionId || !projectId}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-all cursor-pointer text-left disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--color-void-raised)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--color-void-overlay)' }}
            >
              <Clock className="h-3.5 w-3.5" style={{ color: 'var(--color-purple-400)' }} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[12px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                View Timeline
              </span>
              <span className="text-[10px] ml-2" style={{ color: 'var(--color-text-muted)' }}>
                Browse & restore
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* KEYBOARD SHORTCUTS FOOTER */}
      <div
        className="px-4 py-2.5 flex items-center justify-center gap-4"
        style={{
          backgroundColor: 'var(--color-void-deep)',
          borderTop: '1px solid var(--color-border-subtle)',
        }}
      >
        <span className="text-[9px] font-mono flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <kbd className="px-1 py-0.5 rounded" style={{
            backgroundColor: 'var(--color-void-overlay)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '9px',
          }}>⌘M</kbd>
          model
        </span>
        <span className="text-[9px] font-mono flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <kbd className="px-1 py-0.5 rounded" style={{
            backgroundColor: 'var(--color-void-overlay)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '9px',
          }}>⌘T</kbd>
          reasoning
        </span>
        <span className="text-[9px] font-mono flex items-center gap-1" style={{ color: 'var(--color-text-muted)' }}>
          <kbd className="px-1 py-0.5 rounded" style={{
            backgroundColor: 'var(--color-void-overlay)',
            border: '1px solid var(--color-border-subtle)',
            fontSize: '9px',
          }}>Esc</kbd>
          close
        </span>
      </div>
    </motion.div>
  );
}
