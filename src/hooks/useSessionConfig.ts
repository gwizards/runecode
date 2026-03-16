import { create } from 'zustand';

export type ModelId = 'sonnet' | 'opus';
export type ThinkingMode = 'auto' | 'think' | 'think_hard' | 'think_harder' | 'ultrathink';

interface SessionConfigState {
  model: ModelId;
  thinkingMode: ThinkingMode;
  setModel: (model: ModelId) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  cycleModel: () => void;
  cycleThinkingMode: () => void;
}

export const useSessionConfig = create<SessionConfigState>((set) => ({
  model: 'sonnet',
  thinkingMode: 'auto',
  setModel: (model) => set({ model }),
  setThinkingMode: (mode) => set({ thinkingMode: mode }),
  cycleModel: () => set((s) => ({ model: s.model === 'sonnet' ? 'opus' : 'sonnet' })),
  cycleThinkingMode: () => set((s) => {
    const modes: ThinkingMode[] = ['auto', 'think', 'think_hard', 'think_harder', 'ultrathink'];
    const idx = modes.indexOf(s.thinkingMode);
    return { thinkingMode: modes[(idx + 1) % modes.length] };
  }),
}));
