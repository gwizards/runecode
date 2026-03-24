import { useState, useCallback } from "react";
import { api, type Session } from "@/lib/api";

export interface CheckpointState {
  showSettings: boolean;
  setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;
  showForkDialog: boolean;
  setShowForkDialog: React.Dispatch<React.SetStateAction<boolean>>;
  forkCheckpointId: string | null;
  setForkCheckpointId: React.Dispatch<React.SetStateAction<string | null>>;
  forkSessionName: string;
  setForkSessionName: React.Dispatch<React.SetStateAction<string>>;
  /** Whether a fork operation is in progress. */
  isForkLoading: boolean;
  /** Error from the most recent fork operation, if any. */
  forkError: string | null;
  handleConfirmFork: () => Promise<void>;
  checkAutoCheckpoint: (prompt: string) => Promise<void>;
}

/**
 * Manages checkpoint UI state (settings dialog, fork dialog) and the
 * auto-checkpoint side-effect that runs after a session completes.
 */
export function useCheckpoint(
  effectiveSession: Session | null,
  projectPath: string,
  setTimelineVersion: React.Dispatch<React.SetStateAction<number>>,
): CheckpointState {
  const [showSettings, setShowSettings] = useState(false);
  const [showForkDialog, setShowForkDialog] = useState(false);
  const [forkCheckpointId, setForkCheckpointId] = useState<string | null>(null);
  const [forkSessionName, setForkSessionName] = useState("");
  const [isForkLoading, setIsForkLoading] = useState(false);
  const [forkError, setForkError] = useState<string | null>(null);

  const handleConfirmFork = useCallback(async () => {
    if (!forkCheckpointId || !forkSessionName.trim() || !effectiveSession) return;

    try {
      setIsForkLoading(true);
      setForkError(null);

      const newSessionId = crypto.randomUUID();
      await api.forkFromCheckpoint(
        forkCheckpointId,
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
        newSessionId,
        forkSessionName,
      );

      setShowForkDialog(false);
      setForkCheckpointId(null);
      setForkSessionName("");
    } catch (err) {
      console.error("Failed to fork checkpoint:", err);
      setForkError("Failed to fork checkpoint");
    } finally {
      setIsForkLoading(false);
    }
  }, [forkCheckpointId, forkSessionName, effectiveSession, projectPath]);

  /**
   * Called after a session completes successfully. Queries checkpoint settings
   * and triggers an auto-checkpoint if enabled.
   */
  const checkAutoCheckpoint = useCallback(async (prompt: string) => {
    if (!effectiveSession) return;

    try {
      const settings = await api.getCheckpointSettings(
        effectiveSession.id,
        effectiveSession.project_id,
        projectPath,
      );

      if (settings.auto_checkpoint_enabled) {
        await api.checkAutoCheckpoint(
          effectiveSession.id,
          effectiveSession.project_id,
          projectPath,
          prompt,
        );
        // Reload timeline to show the new checkpoint
        setTimelineVersion((v) => v + 1);
      }
    } catch (err) {
      console.error("Failed to check auto checkpoint:", err);
    }
  }, [effectiveSession, projectPath, setTimelineVersion]);

  return {
    showSettings,
    setShowSettings,
    showForkDialog,
    setShowForkDialog,
    forkCheckpointId,
    setForkCheckpointId,
    forkSessionName,
    setForkSessionName,
    isForkLoading,
    forkError,
    handleConfirmFork,
    checkAutoCheckpoint,
  };
}
