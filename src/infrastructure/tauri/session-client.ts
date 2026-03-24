// Infrastructure client — Tauri IPC adapter for session domain

import { apiCall } from '@/lib/apiAdapter';
import { isWslMode, getWslDistro } from '@/lib/platformMode';
import type {
  Checkpoint,
  CheckpointDiff,
  CheckpointResult,
  CheckpointStrategy,
  ProjectUsage,
  SessionTimeline,
  UsageEntry,
  UsageStats,
} from './types';

/**
 * Convert a Windows-style path (e.g. C:\Users\foo) to a WSL mount path
 * (e.g. /mnt/c/Users/foo).  Non-Windows paths are returned unchanged.
 */
function windowsToWslPath(winPath: string): string {
  const normalized = winPath.replace(/\\/g, '/');
  if (normalized.length >= 2 && normalized[1] === ':') {
    const drive = normalized[0].toLowerCase();
    return `/mnt/${drive}${normalized.substring(2)}`;
  }
  return normalized;
}

/**
 * Opens a new Claude Code session
 * @param path - Optional path to open the session in
 * @returns Promise resolving when the session is opened
 */
export async function openNewSession(path?: string): Promise<string> {
  try {
    return await apiCall<string>('open_new_session', { path });
  } catch (error) {
    console.error('Failed to open new session:', error);
    throw error;
  }
}

/**
 * Get real-time output for a running session (with live output fallback)
 * @param runId - The run ID to get output for
 * @returns Promise resolving to the current session output (JSONL format)
 */
export async function getSessionOutput(runId: number): Promise<string> {
  try {
    return await apiCall<string>('get_session_output', { runId });
  } catch (error) {
    console.error('Failed to get session output:', error);
    throw new Error(`Failed to get session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get live output directly from process stdout buffer
 * @param runId - The run ID to get live output for
 * @returns Promise resolving to the current live output
 */
export async function getLiveSessionOutput(runId: number): Promise<string> {
  try {
    return await apiCall<string>('get_live_session_output', { runId });
  } catch (error) {
    console.error('Failed to get live session output:', error);
    throw new Error(`Failed to get live session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Start streaming real-time output for a running session
 * @param runId - The run ID to stream output for
 * @returns Promise that resolves when streaming starts
 */
export async function streamSessionOutput(runId: number): Promise<void> {
  try {
    return await apiCall<void>('stream_session_output', { runId });
  } catch (error) {
    console.error('Failed to start streaming session output:', error);
    throw new Error(`Failed to start streaming session output: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Loads the JSONL history for a specific session
 */
export async function loadSessionHistory(sessionId: string, projectId: string): Promise<any[]> {
  try {
    const wslDistro = isWslMode() ? getWslDistro() : null;
    const result = await apiCall<any[]>('load_session_history', {
      sessionId,
      projectId,
      ...(wslDistro ? { wslDistro } : {}),
    });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to load session history:', error);
    return [];
  }
}

/**
 * Loads the JSONL history for a specific agent session
 * Similar to loadSessionHistory but searches across all project directories
 * @param sessionId - The session ID (UUID)
 * @returns Promise resolving to array of session messages
 */
export async function loadAgentSessionHistory(sessionId: string): Promise<any[]> {
  try {
    const result = await apiCall<any[]>('load_agent_session_history', { sessionId });
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error('Failed to load agent session history:', error);
    return [];
  }
}

/**
 * Executes a new interactive Claude Code session with streaming output.
 * If connectionId is provided, sends through an existing persistent WebSocket.
 * If sessionId is provided (without connectionId), resumes that session.
 */
export async function executeClaudeCode(
  projectPath: string,
  prompt: string,
  model: string,
  thinkingMode?: string,
  connectionId?: string,
  sessionId?: string,
  effort?: string,
  resumeAt?: string,
  permissionMode?: string,
  agentConfig?: {
    teamsEnabled?: boolean;
    environment?: {
      type: string;
      sshHost?: string;
      sshPort?: number;
      sshIdentityFile?: string;
      startDirectory?: string;
      wslDistro?: string;
      dockerContainer?: string;
    };
  }
): Promise<any> {
  // When WSL mode is active, convert Windows project path and inject distro
  let effectivePath = projectPath;
  let effectiveAgentConfig = agentConfig;
  if (isWslMode()) {
    const wslDistro = getWslDistro();
    effectivePath = windowsToWslPath(projectPath);
    if (wslDistro) {
      effectiveAgentConfig = {
        ...agentConfig,
        environment: {
          type: 'wsl',
          ...agentConfig?.environment,
          wslDistro,
        },
      };
    }
  }

  return apiCall('execute_claude_code', {
    projectPath: effectivePath,
    prompt,
    model,
    thinkingMode,
    connectionId,
    sessionId,
    effort,
    resumeAt,
    permissionMode,
    ...effectiveAgentConfig,
  });
}

/**
 * Cancels the currently running Claude Code execution
 * @param connectionId - Primary identifier for the connection to cancel
 * @param sessionId - Fallback session ID to cancel a specific session
 */
export async function cancelClaudeExecution(connectionId?: string, sessionId?: string): Promise<void> {
  return apiCall('cancel_claude_execution', { connectionId, sessionId });
}

/**
 * Lists all currently running Claude sessions
 * @returns Promise resolving to list of running Claude sessions
 */
export async function listRunningClaudeSessions(): Promise<any[]> {
  try {
    const result = await apiCall<any[]>('list_running_claude_sessions');
    return Array.isArray(result) ? result : [];
  } catch {
    return [];
  }
}

/**
 * Gets live output from a Claude session
 * @param sessionId - The session ID to get output for
 * @returns Promise resolving to the current live output
 */
export async function getClaudeSessionOutput(sessionId: string): Promise<string> {
  return apiCall('get_claude_session_output', { sessionId });
}

/**
 * Gets overall usage statistics
 * @returns Promise resolving to usage statistics
 */
export async function getUsageStats(): Promise<UsageStats> {
  try {
    return await apiCall<UsageStats>('get_usage_stats');
  } catch (error) {
    console.error('Failed to get usage stats:', error);
    throw error;
  }
}

/**
 * Gets usage statistics filtered by date range
 * @param startDate - Start date (ISO format)
 * @param endDate - End date (ISO format)
 * @returns Promise resolving to usage statistics
 */
export async function getUsageByDateRange(startDate: string, endDate: string): Promise<UsageStats> {
  try {
    return await apiCall<UsageStats>('get_usage_by_date_range', { startDate, endDate });
  } catch (error) {
    console.error('Failed to get usage by date range:', error);
    throw error;
  }
}

/**
 * Gets usage statistics grouped by session
 * @param since - Optional start date (YYYYMMDD)
 * @param until - Optional end date (YYYYMMDD)
 * @param order - Optional sort order ('asc' or 'desc')
 * @returns Promise resolving to an array of session usage data
 */
export async function getSessionStats(
  since?: string,
  until?: string,
  order?: 'asc' | 'desc'
): Promise<ProjectUsage[]> {
  try {
    return await apiCall<ProjectUsage[]>('get_session_stats', { since, until, order });
  } catch (error) {
    console.error('Failed to get session stats:', error);
    throw error;
  }
}

/**
 * Gets detailed usage entries with optional filtering
 * @param limit - Optional limit for number of entries
 * @returns Promise resolving to array of usage entries
 */
export async function getUsageDetails(limit?: number): Promise<UsageEntry[]> {
  try {
    return await apiCall<UsageEntry[]>('get_usage_details', { limit });
  } catch (error) {
    console.error('Failed to get usage details:', error);
    throw error;
  }
}

/**
 * Creates a checkpoint for the current session state
 */
export async function createCheckpoint(
  sessionId: string,
  projectId: string,
  projectPath: string,
  messageIndex?: number,
  description?: string
): Promise<CheckpointResult> {
  return apiCall('create_checkpoint', { sessionId, projectId, projectPath, messageIndex, description });
}

/**
 * Restores a session to a specific checkpoint
 */
export async function restoreCheckpoint(
  checkpointId: string,
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<CheckpointResult> {
  return apiCall('restore_checkpoint', { checkpointId, sessionId, projectId, projectPath });
}

/**
 * Lists all checkpoints for a session
 */
export async function listCheckpoints(
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<Checkpoint[]> {
  return apiCall('list_checkpoints', { sessionId, projectId, projectPath });
}

/**
 * Forks a new timeline branch from a checkpoint
 */
export async function forkFromCheckpoint(
  checkpointId: string,
  sessionId: string,
  projectId: string,
  projectPath: string,
  newSessionId: string,
  description?: string
): Promise<CheckpointResult> {
  return apiCall('fork_from_checkpoint', {
    checkpointId,
    sessionId,
    projectId,
    projectPath,
    newSessionId,
    description,
  });
}

/**
 * Gets the timeline for a session
 */
export async function getSessionTimeline(
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<SessionTimeline> {
  return apiCall('get_session_timeline', { sessionId, projectId, projectPath });
}

/**
 * Updates checkpoint settings for a session
 */
export async function updateCheckpointSettings(
  sessionId: string,
  projectId: string,
  projectPath: string,
  autoCheckpointEnabled: boolean,
  checkpointStrategy: CheckpointStrategy
): Promise<void> {
  return apiCall('update_checkpoint_settings', {
    sessionId,
    projectId,
    projectPath,
    autoCheckpointEnabled,
    checkpointStrategy,
  });
}

/**
 * Gets diff between two checkpoints
 */
export async function getCheckpointDiff(
  fromCheckpointId: string,
  toCheckpointId: string,
  sessionId: string,
  projectId: string
): Promise<CheckpointDiff> {
  try {
    return await apiCall<CheckpointDiff>('get_checkpoint_diff', {
      fromCheckpointId,
      toCheckpointId,
      sessionId,
      projectId,
    });
  } catch (error) {
    console.error('Failed to get checkpoint diff:', error);
    throw error;
  }
}

/**
 * Tracks a message for checkpointing
 */
export async function trackCheckpointMessage(
  sessionId: string,
  projectId: string,
  projectPath: string,
  message: string
): Promise<void> {
  try {
    await apiCall('track_checkpoint_message', { sessionId, projectId, projectPath, message });
  } catch (error) {
    console.error('Failed to track checkpoint message:', error);
    throw error;
  }
}

/**
 * Checks if auto-checkpoint should be triggered
 */
export async function checkAutoCheckpoint(
  sessionId: string,
  projectId: string,
  projectPath: string,
  message: string
): Promise<boolean> {
  try {
    return await apiCall<boolean>('check_auto_checkpoint', { sessionId, projectId, projectPath, message });
  } catch (error) {
    console.error('Failed to check auto checkpoint:', error);
    throw error;
  }
}

/**
 * Triggers cleanup of old checkpoints
 */
export async function cleanupOldCheckpoints(
  sessionId: string,
  projectId: string,
  projectPath: string,
  keepCount: number
): Promise<number> {
  try {
    return await apiCall<number>('cleanup_old_checkpoints', {
      sessionId,
      projectId,
      projectPath,
      keepCount,
    });
  } catch (error) {
    console.error('Failed to cleanup old checkpoints:', error);
    throw error;
  }
}

/**
 * Gets checkpoint settings for a session
 */
export async function getCheckpointSettings(
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<{
  auto_checkpoint_enabled: boolean;
  checkpoint_strategy: CheckpointStrategy;
  total_checkpoints: number;
  current_checkpoint_id?: string;
}> {
  try {
    return await apiCall('get_checkpoint_settings', { sessionId, projectId, projectPath });
  } catch (error) {
    console.error('Failed to get checkpoint settings:', error);
    throw error;
  }
}

/**
 * Clears checkpoint manager for a session (cleanup on session end)
 */
export async function clearCheckpointManager(sessionId: string): Promise<void> {
  try {
    await apiCall('clear_checkpoint_manager', { sessionId });
  } catch (error) {
    console.error('Failed to clear checkpoint manager:', error);
    throw error;
  }
}

/**
 * Tracks a batch of messages for a session for checkpointing
 */
export const trackSessionMessages = (
  sessionId: string,
  projectId: string,
  projectPath: string,
  messages: string[]
): Promise<void> =>
  apiCall('track_session_messages', { sessionId, projectId, projectPath, messages });
