import { create } from 'zustand';

export type ModelId = string;
export type ThinkingMode = 'auto' | 'think' | 'think_hard' | 'think_harder' | 'ultrathink';
export type EffortLevel = 'auto' | 'low' | 'medium' | 'high' | 'max';
export type PermissionMode = 'default' | 'acceptEdits' | 'plan';

interface SessionConfigState {
  model: ModelId;
  thinkingMode: ThinkingMode;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  teamsEnabled: boolean;
  setModel: (model: ModelId) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setEffort: (effort: EffortLevel) => void;
  setPermissionMode: (mode: PermissionMode) => void;
  setTeamsEnabled: (enabled: boolean) => void;
  cycleModel: () => void;
  cycleThinkingMode: () => void;
}

const STORAGE_KEY = 'runecode-session-config';
const FALLBACK_MODELS: ModelId[] = ['default', 'sonnet', 'haiku'];

/** Load persisted config from localStorage */
function loadPersistedConfig(): Partial<SessionConfigState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

/** Save config to localStorage */
function persistConfig(state: { model: string; thinkingMode: string; effort: string; permissionMode: string; teamsEnabled: boolean }) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      model: state.model,
      thinkingMode: state.thinkingMode,
      effort: state.effort,
      permissionMode: state.permissionMode,
      teamsEnabled: state.teamsEnabled,
    }));
  } catch { /* ignore */ }
}

const persisted = loadPersistedConfig();

export const useSessionConfig = create<SessionConfigState>((set) => ({
  model: (persisted.model as string) || 'default',
  thinkingMode: (persisted.thinkingMode as ThinkingMode) || 'auto',
  effort: (persisted.effort as EffortLevel) || 'auto',
  permissionMode: (persisted.permissionMode as PermissionMode) || 'acceptEdits',
  teamsEnabled: (persisted.teamsEnabled as boolean) ?? true,
  setModel: (model) => set((s) => {
    const next = { ...s, model };
    persistConfig(next);
    return { model };
  }),
  setThinkingMode: (mode) => set((s) => {
    const next = { ...s, thinkingMode: mode };
    persistConfig(next);
    return { thinkingMode: mode };
  }),
  setEffort: (effort) => set((s) => {
    const next = { ...s, effort };
    persistConfig(next);
    return { effort };
  }),
  setPermissionMode: (mode) => set((s) => {
    const next = { ...s, permissionMode: mode };
    persistConfig(next);
    return { permissionMode: mode };
  }),
  setTeamsEnabled: (enabled) => set((s) => {
    const next = { ...s, teamsEnabled: enabled };
    persistConfig(next);
    return { teamsEnabled: enabled };
  }),
  cycleModel: () => set((s) => {
    const idx = FALLBACK_MODELS.indexOf(s.model);
    const nextIdx = idx === -1 ? 0 : (idx + 1) % FALLBACK_MODELS.length;
    const model = FALLBACK_MODELS[nextIdx];
    persistConfig({ ...s, model });
    return { model };
  }),
  cycleThinkingMode: () => set((s) => {
    const modes: ThinkingMode[] = ['auto', 'think', 'think_hard', 'think_harder', 'ultrathink'];
    const idx = modes.indexOf(s.thinkingMode);
    const thinkingMode = modes[(idx + 1) % modes.length];
    persistConfig({ ...s, thinkingMode });
    return { thinkingMode };
  }),
}));
