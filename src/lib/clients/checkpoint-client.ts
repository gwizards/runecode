/**
 * Checkpoint client — session timeline management, checkpoint create/restore/list,
 * diff, auto-checkpoint, and cleanup.
 */
import { apiCall } from '../apiAdapter';
import type {
  Checkpoint,
  CheckpointResult,
  CheckpointDiff,
  CheckpointStrategy,
  SessionTimeline,
} from './types';

export type {
  Checkpoint,
  CheckpointResult,
  CheckpointDiff,
  CheckpointStrategy,
  SessionTimeline,
};

/**
 * Creates a checkpoint for the current session state
 */
export function createCheckpoint(
  sessionId: string,
  projectId: string,
  projectPath: string,
  messageIndex?: number,
  description?: string
): Promise<CheckpointResult> {
  return apiCall('create_checkpoint', {
    sessionId,
    projectId,
    projectPath,
    messageIndex,
    description,
  });
}

/**
 * Restores a session to a specific checkpoint
 */
export function restoreCheckpoint(
  checkpointId: string,
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<CheckpointResult> {
  return apiCall('restore_checkpoint', {
    checkpointId,
    sessionId,
    projectId,
    projectPath,
  });
}

/**
 * Lists all checkpoints for a session
 */
export function listCheckpoints(
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<Checkpoint[]> {
  return apiCall('list_checkpoints', { sessionId, projectId, projectPath });
}

/**
 * Forks a new timeline branch from a checkpoint
 */
export function forkFromCheckpoint(
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
export function getSessionTimeline(
  sessionId: string,
  projectId: string,
  projectPath: string
): Promise<SessionTimeline> {
  return apiCall('get_session_timeline', { sessionId, projectId, projectPath });
}

/**
 * Updates checkpoint settings for a session
 */
export function updateCheckpointSettings(
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
    await apiCall('track_checkpoint_message', {
      sessionId,
      projectId,
      projectPath,
      message,
    });
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
    return await apiCall<boolean>('check_auto_checkpoint', {
      sessionId,
      projectId,
      projectPath,
      message,
    });
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
    return await apiCall('get_checkpoint_settings', {
      sessionId,
      projectId,
      projectPath,
    });
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
