import { create } from 'zustand';

export type ModelId = string;
export type ThinkingMode = 'auto' | 'think' | 'think_hard' | 'think_harder' | 'ultrathink';
export type EffortLevel = 'auto' | 'low' | 'medium' | 'high' | 'max';
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

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

type ConfigValues = Omit<SessionConfigState, `set${string}` | `cycle${string}`>;

const STORAGE_KEY = 'runecode-session-config';
const FALLBACK_MODELS: ModelId[] = ['default', 'sonnet', 'haiku'];

function loadPersistedConfig(): Partial<SessionConfigState> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return {};
}

function getConfigValues(state: SessionConfigState): ConfigValues {
  const { model, thinkingMode, effort, permissionMode, teamsEnabled } = state;
  return { model, thinkingMode, effort, permissionMode, teamsEnabled };
}

function persistConfig(state: SessionConfigState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getConfigValues(state)));
  } catch { /* ignore */ }
}

const persisted = loadPersistedConfig();

export const useSessionConfig = create<SessionConfigState>((set) => ({
  model: (persisted.model as string) || 'default',
  thinkingMode: (persisted.thinkingMode as ThinkingMode) || 'auto',
  effort: (persisted.effort as EffortLevel) || 'auto',
  permissionMode: (persisted.permissionMode as PermissionMode) || 'default',
  teamsEnabled: (persisted.teamsEnabled as boolean) ?? true,

  setModel: (model) => set((s) => { persistConfig({ ...s, model }); return { model }; }),
  setThinkingMode: (mode) => set((s) => { persistConfig({ ...s, thinkingMode: mode }); return { thinkingMode: mode }; }),
  setEffort: (effort) => set((s) => { persistConfig({ ...s, effort }); return { effort }; }),
  setPermissionMode: (mode) => set((s) => { persistConfig({ ...s, permissionMode: mode }); return { permissionMode: mode }; }),
  setTeamsEnabled: (enabled) => set((s) => { persistConfig({ ...s, teamsEnabled: enabled }); return { teamsEnabled: enabled }; }),
  cycleModel: () => set((s) => {
    const idx = FALLBACK_MODELS.indexOf(s.model);
    const model = FALLBACK_MODELS[(idx === -1 ? 0 : idx + 1) % FALLBACK_MODELS.length];
    persistConfig({ ...s, model });
    return { model };
  }),
  cycleThinkingMode: () => set((s) => {
    const modes: ThinkingMode[] = ['auto', 'think', 'think_hard', 'think_harder', 'ultrathink'];
    const thinkingMode = modes[(modes.indexOf(s.thinkingMode) + 1) % modes.length];
    persistConfig({ ...s, thinkingMode });
    return { thinkingMode };
  }),
}));
