/**
 * PromptAttachments — image attachment utilities, drag-drop setup, and shared
 * orchestration constants for FloatingPromptInput.
 *
 * Exports:
 *  - isImageFile(path): boolean
 *  - extractImagePaths(text, projectPath?): string[]
 *  - useDragDropAttachment(options): { dragActive }
 */

import { useEffect, useRef, useState } from "react";
import { isRealTauri } from "@/lib/tauri-env";

// Conditional import for Tauri webview window
let tauriGetCurrentWebviewWindow: any;
try {
  if (isRealTauri()) {
    tauriGetCurrentWebviewWindow =
      require("@tauri-apps/api/webviewWindow").getCurrentWebviewWindow;
  }
} catch (_e) {
  // Web mode — Tauri webview API not available
}

const getCurrentWebviewWindow =
  tauriGetCurrentWebviewWindow ||
  (() => ({ listen: () => Promise.resolve(() => {}) }));

// ─── Orchestration constants ──────────────────────────────────────────────────

export type OrchestrationMode = "normal" | "subagents" | "team";

export const ORCHESTRATION_PREFIXES: Record<Exclude<OrchestrationMode, "normal">, string> = {
  subagents: `IMPORTANT: For this request, aggressively parallelize using the Agent tool. Break the work into as many independent sub-agents as possible — each handling a focused subtask. Spawn agents for research, implementation, testing, and review in parallel rather than doing things sequentially. Use background agents where appropriate.\n\n`,
  team: `IMPORTANT: For this request, create a coordinated Agent Team. Assign each teammate a clear role and name using the Agent tool with team_name and name parameters. Teammates should communicate via SendMessage to coordinate. Structure the team with specialized roles (e.g., researcher, implementer, reviewer, tester) and have them work in parallel. Synthesize all results at the end.\n\n`,
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

import type { RemoteEnvironment } from "@/components/settings/EnvironmentsSettings";

/** Read the currently selected remote environment from localStorage. */
export function getSelectedEnvironment(): RemoteEnvironment | null {
  try {
    const id = localStorage.getItem("runecode-selected-env-id");
    if (!id) return null;
    const stored = localStorage.getItem("runecode-remote-environments");
    const envs: RemoteEnvironment[] = stored ? JSON.parse(stored) : [];
    return envs.find((e) => e.id === id) || null;
  } catch { return null; }
}

// ─── Image helpers ────────────────────────────────────────────────────────────

/** Returns true if the given path (or data URL) looks like an image file. */
export function isImageFile(path: string): boolean {
  if (path.startsWith("data:image/")) return true;
  const ext = path.split(".").pop()?.toLowerCase();
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"].includes(
    ext || ""
  );
}

/**
 * Extracts image paths (file paths and data URLs) from a prompt string.
 * Handles both quoted (@"path") and unquoted (@path) mentions.
 */
export function extractImagePaths(
  text: string,
  projectPath?: string
): string[] {
  const quotedRegex = /@"([^"]+)"/g;
  const unquotedRegex = /@([^@\n\s]+)/g;
  const pathsSet = new Set<string>();

  // Extract quoted paths (including data URLs)
  for (const match of Array.from(text.matchAll(quotedRegex))) {
    const path = match[1];
    const fullPath = path.startsWith("data:")
      ? path
      : path.startsWith("/")
      ? path
      : projectPath
      ? `${projectPath}/${path}`
      : path;
    if (isImageFile(fullPath)) pathsSet.add(fullPath);
  }

  // Remove quoted mentions from text to avoid double-matching
  const textWithoutQuoted = text.replace(quotedRegex, "");

  // Extract unquoted paths
  for (const match of Array.from(textWithoutQuoted.matchAll(unquotedRegex))) {
    const path = match[1].trim();
    if (path.includes("data:")) continue;
    const fullPath = path.startsWith("/")
      ? path
      : projectPath
      ? `${projectPath}/${path}`
      : path;
    if (isImageFile(fullPath)) pathsSet.add(fullPath);
  }

  return Array.from(pathsSet);
}

interface UseDragDropAttachmentOptions {
  isExpanded: boolean;
  projectPath?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onDropImages: (paths: string[]) => void;
}

/**
 * Hook that sets up Tauri drag-drop events for image attachment.
 * Returns `dragActive` state for visual feedback.
 */
export function useDragDropAttachment({
  isExpanded,
  onDropImages,
}: UseDragDropAttachmentOptions): { dragActive: boolean } {
  const [dragActive, setDragActive] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!tauriGetCurrentWebviewWindow) return;

    let lastDropTime = 0;

    const setupListener = async () => {
      if (unlistenRef.current) unlistenRef.current();
      try {
        const webview = getCurrentWebviewWindow();
        unlistenRef.current = await webview.onDragDropEvent((event: any) => {
          const { type, paths } = event.payload;
          if (type === "enter" || type === "over") {
            setDragActive(true);
          } else if (type === "leave") {
            setDragActive(false);
          } else if (type === "drop" && paths) {
            setDragActive(false);
            const now = Date.now();
            if (now - lastDropTime < 200) return;
            lastDropTime = now;

            const imagePaths = (paths as string[]).filter(isImageFile);
            if (imagePaths.length > 0) onDropImages(imagePaths);
          }
        });
      } catch (error) {
        console.debug(
          "Tauri drag-drop listener not available (expected in web mode):",
          error
        );
      }
    };

    setupListener();

    return () => {
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep `isExpanded` available to the drop handler via a ref so the closure
  // stays stable without re-subscribing Tauri events on every expansion toggle.
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;

  return { dragActive };
}
