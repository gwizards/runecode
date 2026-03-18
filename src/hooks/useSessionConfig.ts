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

  // Sub-Agent Defaults
  subAgentDefaultModel: string;
  subAgentDefaultPermissionMode: string;
  subAgentProgressSummaries: boolean;
  subAgentMaxTurns: number;
  subAgentDefaultIsolation: boolean;
  subAgentAutoCollapse: boolean;

  // Team Defaults
  teamMaxConcurrentAgents: number;
  teamDefaultModel: string;
  teamShowMessageLog: boolean;
  teamAutoExpandDashboard: boolean;

  setModel: (model: ModelId) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  setEffort: (effort: EffortLevel) => void;
  setPermissionMode: (mode: PermissionMode) => void;
  setTeamsEnabled: (enabled: boolean) => void;
  setSubAgentDefaultModel: (model: string) => void;
  setSubAgentDefaultPermissionMode: (mode: string) => void;
  setSubAgentProgressSummaries: (enabled: boolean) => void;
  setSubAgentMaxTurns: (turns: number) => void;
  setSubAgentDefaultIsolation: (enabled: boolean) => void;
  setSubAgentAutoCollapse: (enabled: boolean) => void;
  setTeamMaxConcurrentAgents: (max: number) => void;
  setTeamDefaultModel: (model: string) => void;
  setTeamShowMessageLog: (enabled: boolean) => void;
  setTeamAutoExpandDashboard: (enabled: boolean) => void;
  cycleModel: () => void;
  cycleThinkingMode: () => void;
}

/** Value-only fields from SessionConfigState (excludes setters and cyclers) */
type ConfigValues = Omit<SessionConfigState, `set${string}` | `cycle${string}`>;

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

/** Extract only serializable value fields from the state */
function getConfigValues(state: SessionConfigState): ConfigValues {
  const {
    model, thinkingMode, effort, permissionMode, teamsEnabled,
    subAgentDefaultModel, subAgentDefaultPermissionMode, subAgentProgressSummaries,
    subAgentMaxTurns, subAgentDefaultIsolation, subAgentAutoCollapse,
    teamMaxConcurrentAgents, teamDefaultModel, teamShowMessageLog, teamAutoExpandDashboard,
  } = state;
  return {
    model, thinkingMode, effort, permissionMode, teamsEnabled,
    subAgentDefaultModel, subAgentDefaultPermissionMode, subAgentProgressSummaries,
    subAgentMaxTurns, subAgentDefaultIsolation, subAgentAutoCollapse,
    teamMaxConcurrentAgents, teamDefaultModel, teamShowMessageLog, teamAutoExpandDashboard,
  };
}

/** Save config to localStorage */
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
  permissionMode: (persisted.permissionMode as PermissionMode) || 'acceptEdits',
  teamsEnabled: (persisted.teamsEnabled as boolean) ?? true,

  // Sub-Agent Defaults
  subAgentDefaultModel: (persisted.subAgentDefaultModel as string) || 'inherit',
  subAgentDefaultPermissionMode: (persisted.subAgentDefaultPermissionMode as string) || 'inherit',
  subAgentProgressSummaries: (persisted.subAgentProgressSummaries as boolean) ?? true,
  subAgentMaxTurns: (persisted.subAgentMaxTurns as number) ?? 0,
  subAgentDefaultIsolation: (persisted.subAgentDefaultIsolation as boolean) ?? false,
  subAgentAutoCollapse: (persisted.subAgentAutoCollapse as boolean) ?? true,

  // Team Defaults
  teamMaxConcurrentAgents: (persisted.teamMaxConcurrentAgents as number) ?? 0,
  teamDefaultModel: (persisted.teamDefaultModel as string) || 'inherit',
  teamShowMessageLog: (persisted.teamShowMessageLog as boolean) ?? true,
  teamAutoExpandDashboard: (persisted.teamAutoExpandDashboard as boolean) ?? true,

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
  setSubAgentDefaultModel: (model) => set((s) => {
    const next = { ...s, subAgentDefaultModel: model };
    persistConfig(next);
    return { subAgentDefaultModel: model };
  }),
  setSubAgentDefaultPermissionMode: (mode) => set((s) => {
    const next = { ...s, subAgentDefaultPermissionMode: mode };
    persistConfig(next);
    return { subAgentDefaultPermissionMode: mode };
  }),
  setSubAgentProgressSummaries: (enabled) => set((s) => {
    const next = { ...s, subAgentProgressSummaries: enabled };
    persistConfig(next);
    return { subAgentProgressSummaries: enabled };
  }),
  setSubAgentMaxTurns: (turns) => set((s) => {
    const next = { ...s, subAgentMaxTurns: turns };
    persistConfig(next);
    return { subAgentMaxTurns: turns };
  }),
  setSubAgentDefaultIsolation: (enabled) => set((s) => {
    const next = { ...s, subAgentDefaultIsolation: enabled };
    persistConfig(next);
    return { subAgentDefaultIsolation: enabled };
  }),
  setSubAgentAutoCollapse: (enabled) => set((s) => {
    const next = { ...s, subAgentAutoCollapse: enabled };
    persistConfig(next);
    return { subAgentAutoCollapse: enabled };
  }),
  setTeamMaxConcurrentAgents: (max) => set((s) => {
    const next = { ...s, teamMaxConcurrentAgents: max };
    persistConfig(next);
    return { teamMaxConcurrentAgents: max };
  }),
  setTeamDefaultModel: (model) => set((s) => {
    const next = { ...s, teamDefaultModel: model };
    persistConfig(next);
    return { teamDefaultModel: model };
  }),
  setTeamShowMessageLog: (enabled) => set((s) => {
    const next = { ...s, teamShowMessageLog: enabled };
    persistConfig(next);
    return { teamShowMessageLog: enabled };
  }),
  setTeamAutoExpandDashboard: (enabled) => set((s) => {
    const next = { ...s, teamAutoExpandDashboard: enabled };
    persistConfig(next);
    return { teamAutoExpandDashboard: enabled };
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
