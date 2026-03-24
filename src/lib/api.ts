/**
 * api.ts — backward-compatible facade.
 *
 * All domain logic lives in the focused client modules under ./clients/.
 * This file re-exports everything so that existing
 *   import { api } from '@/lib/api'
 * and
 *   import type { Session } from '@/lib/api'
 * calls continue to work without change.
 */

// ── Type re-exports ────────────────────────────────────────────────────────
export type {
  ProcessType,
  ProcessInfo,
  Project,
  Session,
  ClaudeSettings,
  ClaudeVersionStatus,
  ClaudeMdFile,
  FileEntry,
  ClaudeInstallation,
  Agent,
  AgentExport,
  GitHubAgentFile,
  AgentRun,
  AgentRunMetrics,
  AgentRunWithMetrics,
  UsageEntry,
  ModelUsage,
  DailyUsage,
  ProjectUsage,
  UsageStats,
  Checkpoint,
  CheckpointMetadata,
  FileSnapshot,
  TimelineNode,
  SessionTimeline,
  CheckpointStrategy,
  CheckpointResult,
  CheckpointDiff,
  FileDiff,
  MCPServer,
  ServerStatus,
  MCPProjectConfig,
  MCPServerConfig,
  SlashCommand,
  AddServerResult,
  ImportResult,
  ImportServerResult,
  RuFloStatus,
  RuFloProjectStatus,
  RuFloAgent,
  RuFloSwarmStatus,
} from './clients/types';

// ── Named function re-exports ──────────────────────────────────────────────
export * from './clients/session-client';
export * from './clients/project-client';
export * from './clients/checkpoint-client';
export * from './clients/settings-client';
export * from './clients/storage-client';
export * from './clients/mcp-client';
export * from './clients/ruflo-client';

// ── The `api` object (object-style consumers) ─────────────────────────────
import * as sessionClient from './clients/session-client';
import * as projectClient from './clients/project-client';
import * as checkpointClient from './clients/checkpoint-client';
import * as settingsClient from './clients/settings-client';
import * as storageClient from './clients/storage-client';
import * as mcpClient from './clients/mcp-client';
import * as rufloClient from './clients/ruflo-client';

export const api = {
  // session
  getHomeDirectory: sessionClient.getHomeDirectory,
  listDirectoryContents: sessionClient.listDirectoryContents,
  searchFiles: sessionClient.searchFiles,
  checkClaudeVersion: sessionClient.checkClaudeVersion,
  checkNodeInstalled: sessionClient.checkNodeInstalled,
  installNode: sessionClient.installNode,
  installClaudeCode: sessionClient.installClaudeCode,
  getClaudeBinaryPath: sessionClient.getClaudeBinaryPath,
  setClaudeBinaryPath: sessionClient.setClaudeBinaryPath,
  listClaudeInstallations: sessionClient.listClaudeInstallations,
  openNewSession: sessionClient.openNewSession,
  getSessionOutput: sessionClient.getSessionOutput,
  getLiveSessionOutput: sessionClient.getLiveSessionOutput,
  streamSessionOutput: sessionClient.streamSessionOutput,
  loadSessionHistory: sessionClient.loadSessionHistory,
  loadAgentSessionHistory: sessionClient.loadAgentSessionHistory,
  executeClaudeCode: sessionClient.executeClaudeCode,
  cancelClaudeExecution: sessionClient.cancelClaudeExecution,
  listRunningClaudeSessions: sessionClient.listRunningClaudeSessions,
  getClaudeSessionOutput: sessionClient.getClaudeSessionOutput,

  // project
  listProjects: projectClient.listProjects,
  createProject: projectClient.createProject,
  initializeProject: projectClient.initializeProject,
  getProjectSessions: projectClient.getProjectSessions,
  fetchGitHubAgents: projectClient.fetchGitHubAgents,
  fetchGitHubAgentContent: projectClient.fetchGitHubAgentContent,
  importAgentFromGitHub: projectClient.importAgentFromGitHub,
  listAgents: projectClient.listAgents,
  createAgent: projectClient.createAgent,
  updateAgent: projectClient.updateAgent,
  deleteAgent: projectClient.deleteAgent,
  getAgent: projectClient.getAgent,
  exportAgent: projectClient.exportAgent,
  importAgent: projectClient.importAgent,
  getUsageStats: projectClient.getUsageStats,
  getUsageByDateRange: projectClient.getUsageByDateRange,
  getSessionStats: projectClient.getSessionStats,
  getUsageDetails: projectClient.getUsageDetails,
  findClaudeMdFiles: projectClient.findClaudeMdFiles,
  readClaudeMdFile: projectClient.readClaudeMdFile,
  saveClaudeMdFile: projectClient.saveClaudeMdFile,

  // checkpoint
  createCheckpoint: checkpointClient.createCheckpoint,
  restoreCheckpoint: checkpointClient.restoreCheckpoint,
  listCheckpoints: checkpointClient.listCheckpoints,
  forkFromCheckpoint: checkpointClient.forkFromCheckpoint,
  getSessionTimeline: checkpointClient.getSessionTimeline,
  updateCheckpointSettings: checkpointClient.updateCheckpointSettings,
  getCheckpointDiff: checkpointClient.getCheckpointDiff,
  trackCheckpointMessage: checkpointClient.trackCheckpointMessage,
  checkAutoCheckpoint: checkpointClient.checkAutoCheckpoint,
  cleanupOldCheckpoints: checkpointClient.cleanupOldCheckpoints,
  getCheckpointSettings: checkpointClient.getCheckpointSettings,
  clearCheckpointManager: checkpointClient.clearCheckpointManager,
  trackSessionMessages: checkpointClient.trackSessionMessages,

  // settings
  getClaudeSettings: settingsClient.getClaudeSettings,
  saveClaudeSettings: settingsClient.saveClaudeSettings,
  getSystemPrompt: settingsClient.getSystemPrompt,
  saveSystemPrompt: settingsClient.saveSystemPrompt,
  getHooksConfig: settingsClient.getHooksConfig,
  updateHooksConfig: settingsClient.updateHooksConfig,
  validateHookCommand: settingsClient.validateHookCommand,
  getMergedHooksConfig: settingsClient.getMergedHooksConfig,
  slashCommandsList: settingsClient.slashCommandsList,
  slashCommandGet: settingsClient.slashCommandGet,
  slashCommandSave: settingsClient.slashCommandSave,
  slashCommandDelete: settingsClient.slashCommandDelete,

  // storage
  storageListTables: storageClient.storageListTables,
  storageReadTable: storageClient.storageReadTable,
  storageUpdateRow: storageClient.storageUpdateRow,
  storageDeleteRow: storageClient.storageDeleteRow,
  storageInsertRow: storageClient.storageInsertRow,
  storageExecuteSql: storageClient.storageExecuteSql,
  storageResetDatabase: storageClient.storageResetDatabase,
  getSetting: storageClient.getSetting,
  saveSetting: storageClient.saveSetting,

  // mcp
  mcpAdd: mcpClient.mcpAdd,
  mcpList: mcpClient.mcpList,
  mcpGet: mcpClient.mcpGet,
  mcpRemove: mcpClient.mcpRemove,
  mcpAddJson: mcpClient.mcpAddJson,
  mcpAddFromClaudeDesktop: mcpClient.mcpAddFromClaudeDesktop,
  mcpServe: mcpClient.mcpServe,
  mcpTestConnection: mcpClient.mcpTestConnection,
  mcpResetProjectChoices: mcpClient.mcpResetProjectChoices,
  mcpGetServerStatus: mcpClient.mcpGetServerStatus,
  mcpReadProjectConfig: mcpClient.mcpReadProjectConfig,
  mcpSaveProjectConfig: mcpClient.mcpSaveProjectConfig,

  // ruflo
  checkRufloInstalled: rufloClient.checkRufloInstalled,
  installRuflo: rufloClient.installRuflo,
  activateRufloMcp: rufloClient.activateRufloMcp,
  deactivateRufloMcp: rufloClient.deactivateRufloMcp,
  createRufloSlashCommand: rufloClient.createRufloSlashCommand,
  createDddOptimizationCommand: rufloClient.createDddOptimizationCommand,
  initRufloProject: rufloClient.initRufloProject,
  getRufloProjectStatus: rufloClient.getRufloProjectStatus,
  getRufloSwarmStatus: rufloClient.getRufloSwarmStatus,
  uninstallRuflo: rufloClient.uninstallRuflo,
  getRufloMemoryStats: rufloClient.getRufloMemoryStats,
  syncRufloMemoryLocal: rufloClient.syncRufloMemoryLocal,
  consolidateRufloMemory: rufloClient.consolidateRufloMemory,
  setRufloMemoryBackend: rufloClient.setRufloMemoryBackend,
};
