// RuFlo domain service — wraps raw API calls with domain type mapping
import { api } from '@/lib/api';
import {
  toRuFloInstallation,
  toRuFloSwarm,
  toRuFloProjectStatus,
  type RuFloInstallation,
  type RuFloSwarm,
  type RuFloProjectStatus,
} from './types';

export const ruFloService = {
  async getInstallation(): Promise<RuFloInstallation> {
    const raw = await api.checkRufloInstalled();
    return toRuFloInstallation(raw);
  },

  async getSwarmStatus(): Promise<RuFloSwarm> {
    const raw = await api.getRufloSwarmStatus();
    return toRuFloSwarm(raw);
  },

  async getProjectStatus(path: string): Promise<RuFloProjectStatus> {
    const raw = await api.getRufloProjectStatus(path);
    return toRuFloProjectStatus(raw);
  },

  async install(): Promise<string> {
    return api.installRuflo();
  },

  async uninstall(): Promise<string> {
    return api.uninstallRuflo();
  },

  async activateMcp(): Promise<string> {
    return api.activateRufloMcp();
  },

  async deactivateMcp(): Promise<string> {
    return api.deactivateRufloMcp();
  },

  async createSlashCommand(): Promise<string> {
    return api.createRufloSlashCommand();
  },

  async initProject(path: string): Promise<string> {
    return api.initRufloProject(path);
  },
};
