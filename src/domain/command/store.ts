/**
 * Command bounded context — Zustand UI store.
 *
 * Thin adapter: translates UI actions into CommandApplicationService calls
 * and keeps a flat snapshot list for rendering.
 *
 * Does NOT import from src/stores/ or src/lib/api.ts.
 */

import { create } from 'zustand';
import { globalEventBus } from '../shared/event-bus';
import type { SlashCommandEntry } from './types';
import type { CommandScope, RawCommand, SelectionMethod } from './types';
import { InMemoryCommandRepository } from './repository';
import { CommandApplicationService } from './service';
import type { ListCommandsQuery } from './service';

// ─── Service singleton ─────────────────────────────────────────────────────

const _repo = new InMemoryCommandRepository();
const _service = new CommandApplicationService(_repo, globalEventBus);

// ─── Store shape ───────────────────────────────────────────────────────────

interface CommandDomainState {
  commands: SlashCommandEntry[];
  loading: boolean;
  error: string | null;

  registerCommand(raw: RawCommand): Promise<void>;
  selectCommand(id: string, method: SelectionMethod): Promise<void>;
  executeCommand(id: string, durationMs: number, success: boolean): Promise<void>;
  deleteCommand(id: string): Promise<void>;
  loadCommands(scope?: CommandScope): Promise<void>;
  clearError(): void;
}

// ─── Store implementation ──────────────────────────────────────────────────

export const useCommandDomainStore = create<CommandDomainState>((set, get) => ({
  commands: [],
  loading: false,
  error: null,

  async registerCommand(raw) {
    set({ loading: true, error: null });
    const result = await _service.registerCommand(raw);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listCommands({});
    const commands = allResult.ok ? allResult.value : get().commands;
    set({ loading: false, commands });
  },

  async selectCommand(id, method) {
    set({ loading: true, error: null });
    const result = await _service.selectCommand(id, method);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listCommands({});
    const commands = allResult.ok ? allResult.value : get().commands;
    set({ loading: false, commands });
  },

  async executeCommand(id, durationMs, success) {
    set({ loading: true, error: null });
    const result = await _service.executeCommand(id, durationMs, success);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listCommands({});
    const commands = allResult.ok ? allResult.value : get().commands;
    set({ loading: false, commands });
  },

  async deleteCommand(id) {
    set({ loading: true, error: null });
    const result = await _service.deleteCommand(id);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    const allResult = await _service.listCommands({});
    const commands = allResult.ok ? allResult.value : get().commands;
    set({ loading: false, commands });
  },

  async loadCommands(scope) {
    set({ loading: true, error: null });
    const query: ListCommandsQuery = scope !== undefined ? { scope } : {};
    const result = await _service.listCommands(query);
    if (!result.ok) {
      set({ loading: false, error: result.error });
      return;
    }
    set({ loading: false, commands: result.value });
  },

  clearError() {
    set({ error: null });
  },
}));
