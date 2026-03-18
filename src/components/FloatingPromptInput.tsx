import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Send,
  Minimize2,
  Square,
  GitBranch,
  Bot,
  Users,
} from "lucide-react";
import { useQuery } from '@tanstack/react-query';
import { cn } from "@/lib/utils";
import { RotatingRune } from "./RuneCodeLogo";
import { Button } from "@/components/ui/button";
// Popover removed — copy button moved to context menu
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider, TooltipSimple } from "@/components/ui/tooltip-modern";
import { FilePicker } from "./FilePicker";
import { SlashCommandPicker } from "./SlashCommandPicker";
import { ImagePreview } from "./ImagePreview";
import { api, type FileEntry, type SlashCommand } from "@/lib/api";
import { ConfigPill } from '@/components/ConfigPill';
import { ConfigPanel } from '@/components/ConfigPanel';
import { useSessionConfig, type ModelId, type ThinkingMode, type PermissionMode } from '@/hooks/useSessionConfig';
import { useAiAutocomplete } from '@/hooks/useAiAutocomplete';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';

// Read the selected environment atomically from localStorage
export function getSelectedEnvironment(): RemoteEnvironment | null {
  try {
    const id = localStorage.getItem('runecode-selected-env-id');
    if (!id) return null;
    const stored = localStorage.getItem('runecode-remote-environments');
    const envs: RemoteEnvironment[] = stored ? JSON.parse(stored) : [];
    return envs.find(e => e.id === id) || null;
  } catch { return null; }
}

/** Orchestration mode — controls how Claude delegates work */
export type OrchestrationMode = 'normal' | 'subagents' | 'team';

const ORCHESTRATION_PREFIXES: Record<Exclude<OrchestrationMode, 'normal'>, string> = {
  subagents: `IMPORTANT: For this request, aggressively parallelize using the Agent tool. Break the work into as many independent sub-agents as possible — each handling a focused subtask. Spawn agents for research, implementation, testing, and review in parallel rather than doing things sequentially. Use background agents where appropriate.\n\n`,
  team: `IMPORTANT: For this request, create a coordinated Agent Team. Assign each teammate a clear role and name using the Agent tool with team_name and name parameters. Teammates should communicate via SendMessage to coordinate. Structure the team with specialized roles (e.g., researcher, implementer, reviewer, tester) and have them work in parallel. Synthesize all results at the end.\n\n`,
};

// Conditional import for Tauri webview window
let tauriGetCurrentWebviewWindow: any;
try {
  // Only use real Tauri APIs if we're in a genuine Tauri environment,
  // not our web-mode mock (which sets __WEB_MODE_MOCK__ on __TAURI_INTERNALS__)
  const isRealTauri = typeof window !== 'undefined' && window.__TAURI__ &&
    !(window.__TAURI_INTERNALS__?.__WEB_MODE_MOCK__);
  if (isRealTauri) {
    tauriGetCurrentWebviewWindow = require("@tauri-apps/api/webviewWindow").getCurrentWebviewWindow;
  }
} catch (e) {
  console.log('[FloatingPromptInput] Tauri webview API not available, using web mode');
}

// Web-compatible replacement
const getCurrentWebviewWindow = tauriGetCurrentWebviewWindow || (() => ({ listen: () => Promise.resolve(() => {}) }));

interface FloatingPromptInputProps {
  /**
   * Callback when prompt is sent
   */
  onSend: (prompt: string, model: ModelId, thinkingMode: ThinkingMode, effort?: string, permissionMode?: PermissionMode) => void;
  /**
   * Whether the input is loading
   */
  isLoading?: boolean;
  /**
   * Whether the input is disabled
   */
  disabled?: boolean;
  /**
   * Default model to select
   */
  defaultModel?: "sonnet" | "opus";
  /**
   * Project path for file picker
   */
  projectPath?: string;
  /**
   * Session ID for checkpoint queries
   */
  sessionId?: string;
  /**
   * Project ID for checkpoint queries
   */
  projectId?: string;
  /**
   * Optional className for styling
   */
  className?: string;
  /**
   * Callback when cancel is clicked (only during loading)
   */
  onCancel?: () => void;
  /**
   * Callback to copy conversation as Markdown
   */
  onCopyMarkdown?: () => void;
  /**
   * Callback to copy conversation as JSONL
   */
  onCopyJsonl?: () => void;
}

export interface FloatingPromptInputRef {
  addImage: (imagePath: string) => void;
}

/**
 * FloatingPromptInput component - Fixed position prompt input with model picker
 * 
 * @example
 * const promptRef = useRef<FloatingPromptInputRef>(null);
 * <FloatingPromptInput
 *   ref={promptRef}
 *   onSend={(prompt, model) => console.log('Send:', prompt, model)}
 *   isLoading={false}
 * />
 */
const FloatingPromptInputInner = (
  {
    onSend,
    isLoading = false,
    disabled = false,
    defaultModel: _defaultModel = "sonnet",
    projectPath,
    sessionId,
    projectId,
    className,
    onCancel,
    onCopyMarkdown: _onCopyMarkdown,
    onCopyJsonl: _onCopyJsonl,
  }: FloatingPromptInputProps,
  ref: React.Ref<FloatingPromptInputRef>,
) => {
  // Model and thinking mode are read from the store at send time
  // via useSessionConfig.getState()

  // Fetch checkpoint count from session timeline
  const { data: checkpointCount = 0 } = useQuery({
    queryKey: ['checkpoint-count', sessionId, projectId],
    queryFn: async () => {
      const timeline = await api.getSessionTimeline(sessionId!, projectId!, projectPath || '');
      return timeline?.totalCheckpoints || 0;
    },
    staleTime: 30000,
    enabled: !!sessionId && !!projectId,
  });

  const [prompt, setPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [orchestrationMode, setOrchestrationMode] = useState<OrchestrationMode>('normal');
  const [remoteEnvironments, setRemoteEnvironments] = useState<RemoteEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(() => {
    try { return localStorage.getItem('runecode-selected-env-id'); } catch { return null; }
  });
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [showSlashCommandPicker, setShowSlashCommandPicker] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [embeddedImages, setEmbeddedImages] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // AI autocomplete ghost text
  const autocomplete = useAiAutocomplete({
    text: prompt,
    cursorPos: cursorPosition,
    projectPath,
  });

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);
  const unlistenDragDropRef = useRef<(() => void) | null>(null);
  const [textareaHeight, setTextareaHeight] = useState<number>(48);
  const isIMEComposingRef = useRef(false);

  // Expose a method to add images programmatically
  React.useImperativeHandle(
    ref,
    () => ({
      addImage: (imagePath: string) => {
        setPrompt(currentPrompt => {
          const existingPaths = extractImagePaths(currentPrompt);
          if (existingPaths.includes(imagePath)) {
            return currentPrompt; // Image already added
          }

          // Wrap path in quotes if it contains spaces
          const mention = imagePath.includes(' ') ? `@"${imagePath}"` : `@${imagePath}`;
          const newPrompt = currentPrompt + (currentPrompt.endsWith(' ') || currentPrompt === '' ? '' : ' ') + mention + ' ';

          // Focus the textarea
          requestAnimationFrame(() => {
            const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
            target?.focus();
            target?.setSelectionRange(newPrompt.length, newPrompt.length);
          });

          return newPrompt;
        });
      }
    }),
    [isExpanded]
  );

  // Helper function to check if a file is an image
  const isImageFile = (path: string): boolean => {
    // Check if it's a data URL
    if (path.startsWith('data:image/')) {
      return true;
    }
    // Otherwise check file extension
    const ext = path.split('.').pop()?.toLowerCase();
    return ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext || '');
  };

  // Extract image paths from prompt text
  const extractImagePaths = (text: string): string[] => {
    // Updated regex to handle both quoted and unquoted paths
    // Pattern 1: @"path with spaces or data URLs" - quoted paths
    // Pattern 2: @path - unquoted paths (continues until @ or end)
    const quotedRegex = /@"([^"]+)"/g;
    const unquotedRegex = /@([^@\n\s]+)/g;
    
    const pathsSet = new Set<string>(); // Use Set to ensure uniqueness
    
    // First, extract quoted paths (including data URLs)
    let matches = Array.from(text.matchAll(quotedRegex));
    for (const match of matches) {
      const path = match[1]; // No need to trim, quotes preserve exact path
      
      // For data URLs, use as-is; for file paths, convert to absolute
      const fullPath = path.startsWith('data:') 
        ? path 
        : (path.startsWith('/') ? path : (projectPath ? `${projectPath}/${path}` : path));
      
      if (isImageFile(fullPath)) {
        pathsSet.add(fullPath);
      }
    }
    
    // Remove quoted mentions from text to avoid double-matching
    let textWithoutQuoted = text.replace(quotedRegex, '');
    
    // Then extract unquoted paths (typically file paths)
    matches = Array.from(textWithoutQuoted.matchAll(unquotedRegex));

    for (const match of matches) {
      const path = match[1].trim();
      // Skip if it looks like a data URL fragment (shouldn't happen with proper quoting)
      if (path.includes('data:')) continue;
      
      // Convert relative path to absolute if needed
      const fullPath = path.startsWith('/') ? path : (projectPath ? `${projectPath}/${path}` : path);
      
      if (isImageFile(fullPath)) {
        pathsSet.add(fullPath);
      }
    }

    const uniquePaths = Array.from(pathsSet);
    return uniquePaths;
  };

  // Sync selectedEnvId to localStorage so getSelectedEnvironment() can read it atomically
  useEffect(() => {
    try {
      if (selectedEnvId) localStorage.setItem('runecode-selected-env-id', selectedEnvId);
      else localStorage.removeItem('runecode-selected-env-id');
    } catch {}
  }, [selectedEnvId]);

  // Load remote environments from localStorage and listen for changes
  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem('runecode-remote-environments');
        const envs: RemoteEnvironment[] = stored ? JSON.parse(stored) : [];
        setRemoteEnvironments(envs.filter(e => e.enabled));
      } catch { setRemoteEnvironments([]); }
    };
    load();
    const handler = () => load();
    window.addEventListener('runecode:environments-changed', handler);
    return () => window.removeEventListener('runecode:environments-changed', handler);
  }, []);

  const selectedEnv = remoteEnvironments.find(e => e.id === selectedEnvId) || null;

  // Update embedded images when prompt changes
  useEffect(() => {
    const imagePaths = extractImagePaths(prompt);
    setEmbeddedImages(imagePaths);
    
    // Auto-resize on prompt change (handles paste, programmatic changes, etc.)
    // Use rAF to batch the read/write and avoid forced reflow
    if (textareaRef.current && !isExpanded) {
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        const scrollHeight = textareaRef.current.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, 48), 240);
        setTextareaHeight(newHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      });
    }
  }, [prompt, projectPath, isExpanded]);

  // Set up Tauri drag-drop event listener
  useEffect(() => {
    // Skip entirely in web mode — no Tauri webview APIs available, avoids
    // a noisy error on every mount and the cost of the dynamic import attempt.
    if (!tauriGetCurrentWebviewWindow) return;

    // This effect runs only once on component mount to set up the listener.
    let lastDropTime = 0;

    const setupListener = async () => {
      try {
        // If a listener from a previous mount/render is still around, clean it up.
        if (unlistenDragDropRef.current) {
          unlistenDragDropRef.current();
        }

        const webview = getCurrentWebviewWindow();
        unlistenDragDropRef.current = await webview.onDragDropEvent((event: any) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setDragActive(true);
          } else if (event.payload.type === 'leave') {
            setDragActive(false);
          } else if (event.payload.type === 'drop' && event.payload.paths) {
            setDragActive(false);

            const currentTime = Date.now();
            if (currentTime - lastDropTime < 200) {
              // This debounce is crucial to handle the storm of drop events
              // that Tauri/OS can fire for a single user action.
              return;
            }
            lastDropTime = currentTime;

            const droppedPaths = event.payload.paths as string[];
            const imagePaths = droppedPaths.filter(isImageFile);

            if (imagePaths.length > 0) {
              setPrompt(currentPrompt => {
                const existingPaths = extractImagePaths(currentPrompt);
                const newPaths = imagePaths.filter(p => !existingPaths.includes(p));

                if (newPaths.length === 0) {
                  return currentPrompt; // All dropped images are already in the prompt
                }

                // Wrap paths with spaces in quotes for clarity
                const mentionsToAdd = newPaths.map(p => {
                  // If path contains spaces, wrap in quotes
                  if (p.includes(' ')) {
                    return `@"${p}"`;
                  }
                  return `@${p}`;
                }).join(' ');
                const newPrompt = currentPrompt + (currentPrompt.endsWith(' ') || currentPrompt === '' ? '' : ' ') + mentionsToAdd + ' ';

                requestAnimationFrame(() => {
                  const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
                  target?.focus();
                  target?.setSelectionRange(newPrompt.length, newPrompt.length);
                });

                return newPrompt;
              });
            }
          }
        });
      } catch (error) {
        // Silently ignore in web mode — drag-drop via Tauri is not available
        console.debug('Tauri drag-drop listener not available (expected in web mode):', error);
      }
    };

    setupListener();

    return () => {
      // On unmount, ensure we clean up the listener.
      if (unlistenDragDropRef.current) {
        unlistenDragDropRef.current();
        unlistenDragDropRef.current = null;
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount/unmount.

  useEffect(() => {
    // Focus the appropriate textarea when expanded state changes
    if (isExpanded && expandedTextareaRef.current) {
      expandedTextareaRef.current.focus();
    } else if (!isExpanded && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isExpanded]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart || 0;
    
    // Auto-resize textarea based on content
    // Use rAF to batch the read/write and avoid forced reflow
    if (textareaRef.current && !isExpanded) {
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = 'auto';
        const scrollHeight = textareaRef.current.scrollHeight;
        const newHeight = Math.min(Math.max(scrollHeight, 48), 240);
        setTextareaHeight(newHeight);
        textareaRef.current.style.height = `${newHeight}px`;
      });
    }

    // Check if / was just typed as the very first character
    if (newValue.length > prompt.length && newValue[newCursorPosition - 1] === '/' && newCursorPosition === 1) {
      setShowSlashCommandPicker(true);
      setSlashCommandQuery("");
      setConfigPanelOpen(false);
      setCursorPosition(newCursorPosition);
    }

    // Check if @ was just typed
    if (projectPath?.trim() && newValue.length > prompt.length && newValue[newCursorPosition - 1] === '@') {
      setShowFilePicker(true);
      setFilePickerQuery("");
      setConfigPanelOpen(false);
      setCursorPosition(newCursorPosition);
    }

    // Check if we're typing after / (for slash command search)
    if (showSlashCommandPicker) {
      // Close picker if the text no longer starts with /
      if (!newValue.startsWith('/')) {
        setShowSlashCommandPicker(false);
        setSlashCommandQuery("");
      } else {
        // Update search query from text after /
        const query = newValue.substring(1, newCursorPosition);
        setSlashCommandQuery(query.split(/\s/)[0] || "");
      }
    }

    // Check if we're typing after @ (for search query)
    if (showFilePicker && newCursorPosition >= cursorPosition) {
      // Find the @ position before cursor
      let atPosition = -1;
      for (let i = newCursorPosition - 1; i >= 0; i--) {
        if (newValue[i] === '@') {
          atPosition = i;
          break;
        }
        // Stop if we hit whitespace (new word)
        if (newValue[i] === ' ' || newValue[i] === '\n') {
          break;
        }
      }

      if (atPosition !== -1) {
        const query = newValue.substring(atPosition + 1, newCursorPosition);
        setFilePickerQuery(query);
      } else {
        // @ was removed or cursor moved away
        setShowFilePicker(false);
        setFilePickerQuery("");
      }
    }

    setPrompt(newValue);
    setCursorPosition(newCursorPosition);
  };

  const handleFileSelect = (entry: FileEntry) => {
    if (textareaRef.current) {
      // Find the @ position before cursor
      let atPosition = -1;
      for (let i = cursorPosition - 1; i >= 0; i--) {
        if (prompt[i] === '@') {
          atPosition = i;
          break;
        }
        // Stop if we hit whitespace (new word)
        if (prompt[i] === ' ' || prompt[i] === '\n') {
          break;
        }
      }

      if (atPosition === -1) {
        // @ not found, this shouldn't happen but handle gracefully
        console.error('[FloatingPromptInput] @ position not found');
        return;
      }

      // Replace the @ and partial query with the selected path (file or directory)
      const textarea = textareaRef.current;
      const beforeAt = prompt.substring(0, atPosition);
      const afterCursor = prompt.substring(cursorPosition);
      const relativePath = entry.path.startsWith(projectPath || '')
        ? entry.path.slice((projectPath || '').length + 1)
        : entry.path;

      const newPrompt = `${beforeAt}@${relativePath} ${afterCursor}`;
      setPrompt(newPrompt);
      setShowFilePicker(false);
      setFilePickerQuery("");

      // Focus back on textarea and set cursor position after the inserted path
      requestAnimationFrame(() => {
        textarea.focus();
        const newCursorPos = beforeAt.length + relativePath.length + 2; // +2 for @ and space
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    }
  };

  const handleFilePickerClose = () => {
    setShowFilePicker(false);
    setFilePickerQuery("");
    // Return focus to textarea
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  };

  const handleSlashCommandSelect = (command: SlashCommand) => {
    const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
    if (!textarea) return;

    // Find the / position before cursor
    let slashPosition = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (prompt[i] === '/') {
        slashPosition = i;
        break;
      }
      // Stop if we hit whitespace (new word)
      if (prompt[i] === ' ' || prompt[i] === '\n') {
        break;
      }
    }

    if (slashPosition === -1) {
      console.error('[FloatingPromptInput] / position not found');
      return;
    }

    // Simply insert the command syntax
    const beforeSlash = prompt.substring(0, slashPosition);
    const afterCursor = prompt.substring(cursorPosition);
    
    if (command.accepts_arguments) {
      // Insert command with placeholder for arguments
      const newPrompt = `${beforeSlash}${command.full_command} `;
      setPrompt(newPrompt);
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");

      // Focus and position cursor after the command
      requestAnimationFrame(() => {
        textarea.focus();
        const newCursorPos = beforeSlash.length + command.full_command.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    } else {
      // Insert command and close picker
      const newPrompt = `${beforeSlash}${command.full_command} ${afterCursor}`;
      setPrompt(newPrompt);
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");

      // Focus and position cursor after the command
      requestAnimationFrame(() => {
        textarea.focus();
        const newCursorPos = beforeSlash.length + command.full_command.length + 1;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      });
    }
  };

  const handleSlashCommandPickerClose = () => {
    setShowSlashCommandPicker(false);
    setSlashCommandQuery("");
    // Return focus to textarea
    requestAnimationFrame(() => {
      const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
      textarea?.focus();
    });
  };

  const handleCompositionStart = () => {
    isIMEComposingRef.current = true;
  };

  const handleCompositionEnd = () => {
    setTimeout(() => {
      isIMEComposingRef.current = false;
    }, 0);
  };

  const isIMEInteraction = (event?: React.KeyboardEvent) => {
    if (isIMEComposingRef.current) {
      return true;
    }

    if (!event) {
      return false;
    }

    const nativeEvent = event.nativeEvent;

    if (nativeEvent.isComposing) {
      return true;
    }

    const key = nativeEvent.key;
    if (key === 'Process' || key === 'Unidentified') {
      return true;
    }

    const keyboardEvent = nativeEvent as unknown as KeyboardEvent;
    const keyCode = keyboardEvent.keyCode ?? (keyboardEvent as unknown as { which?: number }).which;
    if (keyCode === 229) {
      return true;
    }

    return false;
  };

  const handleSend = () => {
    if (isIMEInteraction()) {
      return;
    }

    if (prompt.trim() && !disabled) {
      let finalPrompt = prompt.trim();

      // Prepend orchestration instruction if a mode is active
      if (orchestrationMode !== 'normal') {
        finalPrompt = ORCHESTRATION_PREFIXES[orchestrationMode] + finalPrompt;
      }

      const { model, thinkingMode, effort, permissionMode } = useSessionConfig.getState();

      onSend(finalPrompt, model, thinkingMode, effort, permissionMode);
      setPrompt("");
      setEmbeddedImages([]);
      setTextareaHeight(48);
      // Reset mode after sending — it's per-prompt, not sticky
      setOrchestrationMode('normal');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Tab accepts ghost text autocomplete
    if (e.key === 'Tab' && !e.shiftKey && !showFilePicker && !showSlashCommandPicker && autocomplete.ghostText) {
      e.preventDefault();
      const accepted = autocomplete.acceptGhostText();
      if (accepted) {
        const before = prompt.slice(0, cursorPosition);
        const after = prompt.slice(cursorPosition);
        const newText = before + accepted + after;
        setPrompt(newText);
        const newPos = cursorPosition + accepted.length;
        setCursorPosition(newPos);
        // Move cursor in textarea
        requestAnimationFrame(() => {
          const ta = textareaRef.current;
          if (ta) { ta.selectionStart = ta.selectionEnd = newPos; }
        });
      }
      return;
    }

    if (showFilePicker && e.key === 'Escape') {
      e.preventDefault();
      setShowFilePicker(false);
      setFilePickerQuery("");
      return;
    }

    if (showSlashCommandPicker && e.key === 'Escape') {
      e.preventDefault();
      setShowSlashCommandPicker(false);
      setSlashCommandQuery("");
      return;
    }

    // Add keyboard shortcut for expanding
    if (e.key === 'e' && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      setIsExpanded(true);
      return;
    }

    if (
      e.key === "Enter" &&
      !e.shiftKey &&
      !isExpanded &&
      !showFilePicker &&
      !showSlashCommandPicker
    ) {
      if (isIMEInteraction(e)) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        
        // Get the image blob
        const blob = item.getAsFile();
        if (!blob) continue;

        try {
          // Convert blob to base64
          const reader = new FileReader();
          reader.onload = () => {
            const base64Data = reader.result as string;
            
            // Add the base64 data URL directly to the prompt
            setPrompt(currentPrompt => {
              // Use the data URL directly as the image reference
              const mention = `@"${base64Data}"`;
              const newPrompt = currentPrompt + (currentPrompt.endsWith(' ') || currentPrompt === '' ? '' : ' ') + mention + ' ';
              
              // Focus the textarea and move cursor to end
              requestAnimationFrame(() => {
                const target = isExpanded ? expandedTextareaRef.current : textareaRef.current;
                target?.focus();
                target?.setSelectionRange(newPrompt.length, newPrompt.length);
              });

              return newPrompt;
            });
          };
          
          reader.readAsDataURL(blob);
        } catch (error) {
          console.error('Failed to paste image:', error);
        }
      }
    }
  };

  // Browser drag and drop handlers - just prevent default behavior
  // Actual file handling is done via Tauri's window-level drag-drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Visual feedback is handled by Tauri events
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // File processing is handled by Tauri's onDragDropEvent
  };

  const handleRemoveImage = (index: number) => {
    // Remove the corresponding @mention from the prompt
    const imagePath = embeddedImages[index];
    
    // For data URLs, we need to handle them specially since they're always quoted
    if (imagePath.startsWith('data:')) {
      // Simply remove the exact quoted data URL
      const quotedPath = `@"${imagePath}"`;
      const newPrompt = prompt.replace(quotedPath, '').trim();
      setPrompt(newPrompt);
      return;
    }
    
    // For file paths, use the original logic
    const escapedPath = imagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedRelativePath = imagePath.replace(projectPath + '/', '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Create patterns for both quoted and unquoted mentions
    const patterns = [
      // Quoted full path
      new RegExp(`@"${escapedPath}"\\s?`, 'g'),
      // Unquoted full path
      new RegExp(`@${escapedPath}\\s?`, 'g'),
      // Quoted relative path
      new RegExp(`@"${escapedRelativePath}"\\s?`, 'g'),
      // Unquoted relative path
      new RegExp(`@${escapedRelativePath}\\s?`, 'g')
    ];

    let newPrompt = prompt;
    for (const pattern of patterns) {
      newPrompt = newPrompt.replace(pattern, '');
    }

    setPrompt(newPrompt.trim());
  };

  // Click-outside handler for config panel
  useEffect(() => {
    if (!configPanelOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.config-panel-container')) {
        setConfigPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [configPanelOpen]);

  // Keyboard shortcuts for model and thinking mode cycling
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        useSessionConfig.getState().cycleModel();
      }
      if (e.ctrlKey && e.key === 't' && !e.shiftKey) {
        e.preventDefault();
        useSessionConfig.getState().cycleThinkingMode();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <TooltipProvider>
    <>
      {/* Expanded Modal */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
            onClick={() => setIsExpanded(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl p-4 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Compose your prompt</h3>
                <TooltipSimple content="Minimize" side="bottom">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setIsExpanded(false)}
                      className="h-8 w-8"
                    >
                      <Minimize2 className="h-4 w-4" />
                    </Button>
                  </motion.div>
                </TooltipSimple>
              </div>

              {/* Image previews in expanded mode */}
              {embeddedImages.length > 0 && (
                <ImagePreview
                  images={embeddedImages}
                  onRemove={handleRemoveImage}
                  className="border-t border-border pt-2"
                />
              )}

              <Textarea
                ref={expandedTextareaRef}
                value={prompt}
                onChange={handleTextChange}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onPaste={handlePaste}
                placeholder="Cast a rune..."
                className="min-h-[200px] resize-none"
                disabled={disabled}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              />

              <div className="flex items-center justify-end">
                <TooltipSimple content="Send message" side="top">
                  <motion.div
                    whileTap={{ scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Button
                      onClick={handleSend}
                      disabled={!prompt.trim() || disabled}
                      size="default"
                      className="min-w-[60px]"
                    >
                      {isLoading ? (
                        <RotatingRune size={16} className="text-primary-foreground" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </motion.div>
                </TooltipSimple>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed Position Input Bar */}
      <div
        className={cn(
          "w-full z-40 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg transition-shadow duration-300",
          dragActive && "ring-2 ring-primary ring-offset-2",
          isFocused && "rune-glow-sm",
          className
        )}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="container mx-auto">
          {/* Image previews */}
          {embeddedImages.length > 0 && (
            <ImagePreview
              images={embeddedImages}
              onRemove={handleRemoveImage}
              className="border-b border-border"
            />
          )}

          <div className="p-3">
            <div className="flex items-center gap-2">
              {/* Input area — takes most space */}
              <div className="flex-1 relative">
                {/* Ghost text overlay for AI autocomplete */}
                {autocomplete.ghostText && (
                  <div
                    aria-hidden
                    className="absolute inset-0 pl-3 pr-12 py-2.5 pointer-events-none overflow-hidden whitespace-pre-wrap break-words text-sm leading-[1.5]"
                    style={{ fontFamily: 'inherit', zIndex: 1 }}
                  >
                    <span className="invisible">{prompt.slice(0, cursorPosition)}</span>
                    <span className="text-muted-foreground/40">{autocomplete.ghostText}</span>
                  </div>
                )}
                {/* Loading indicator for autocomplete */}
                {autocomplete.isLoading && !autocomplete.ghostText && autocomplete.enabled && prompt.trim().length >= 5 && (
                  <div className="absolute right-14 top-1/2 -translate-y-1/2 z-[3] pointer-events-none">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-pulse" />
                  </div>
                )}
                <Textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={handleTextChange}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={handleCompositionStart}
                  onCompositionEnd={handleCompositionEnd}
                  onPaste={handlePaste}
                  placeholder={
                    dragActive
                      ? "Drop images here..."
                      : "Cast a rune... (@ for files, / for commands)"
                  }
                  disabled={disabled}
                  className={cn(
                    "resize-none pr-12 pl-3 py-2.5 transition-all duration-150 relative z-[2]",
                    dragActive && "border-primary",
                    textareaHeight >= 240 && "overflow-y-auto scrollbar-thin"
                  )}
                  style={{
                    height: `${textareaHeight}px`,
                    overflowY: textareaHeight >= 240 ? 'auto' : 'hidden',
                    ...(autocomplete.ghostText ? { backgroundColor: 'transparent' } : {}),
                  }}
                />

                {/* Only Send/Stop button inside */}
                <div className="absolute right-1.5 bottom-1.5">
                  <TooltipSimple content={isLoading ? "Stop generation" : "Send message (Enter)"} side="top">
                    <motion.div
                      whileTap={{ scale: 0.97 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Button
                        onClick={isLoading ? onCancel : handleSend}
                        disabled={isLoading ? false : (!prompt.trim() || disabled)}
                        variant={isLoading ? "destructive" : prompt.trim() ? "default" : "ghost"}
                        size="icon"
                        className={cn(
                          "h-8 w-8 transition-all",
                          prompt.trim() && !isLoading && "shadow-sm"
                        )}
                      >
                        {isLoading ? (
                          <Square className="h-4 w-4" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </motion.div>
                  </TooltipSimple>
                </div>

                {/* File Picker */}
                <AnimatePresence>
                  {showFilePicker && projectPath && projectPath.trim() && (
                    <FilePicker
                      basePath={projectPath.trim()}
                      onSelect={handleFileSelect}
                      onClose={handleFilePickerClose}
                      initialQuery={filePickerQuery}
                    />
                  )}
                </AnimatePresence>

                {/* Slash Command Picker */}
                <AnimatePresence>
                  {showSlashCommandPicker && (
                    <SlashCommandPicker
                      projectPath={projectPath}
                      onSelect={handleSlashCommandSelect}
                      onClose={handleSlashCommandPickerClose}
                      initialQuery={slashCommandQuery}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Orchestration mode buttons — between input and config */}
              <div className="flex items-center gap-0.5 shrink-0">
                <TooltipSimple content="Sub-Agents — parallel execution (~3-5x tokens)" side="top">
                  <button
                    onClick={() => setOrchestrationMode(orchestrationMode === 'subagents' ? 'normal' : 'subagents')}
                    className={cn(
                      'p-1.5 rounded-md transition-all',
                      orchestrationMode === 'subagents'
                        ? 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/30'
                        : 'text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30'
                    )}
                  >
                    <Bot className="h-3.5 w-3.5" />
                  </button>
                </TooltipSimple>
                <TooltipSimple content="Team — coordinated agents (~5-10x tokens)" side="top">
                  <button
                    onClick={() => setOrchestrationMode(orchestrationMode === 'team' ? 'normal' : 'team')}
                    className={cn(
                      'p-1.5 rounded-md transition-all',
                      orchestrationMode === 'team'
                        ? 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/30'
                        : 'text-muted-foreground/40 hover:text-muted-foreground/70 hover:bg-muted/30'
                    )}
                  >
                    <Users className="h-3.5 w-3.5" />
                  </button>
                </TooltipSimple>
              </div>

              {/* Environment selector — only if remote envs configured */}
              {remoteEnvironments.length > 0 && (
                <TooltipSimple content={selectedEnv ? `Running on: ${selectedEnv.name}` : 'Running locally'} side="top">
                  <select
                    value={selectedEnvId || ''}
                    onChange={(e) => setSelectedEnvId(e.target.value || null)}
                    className={cn(
                      'h-8 px-2 rounded-md border text-[10px] font-medium bg-transparent transition-all appearance-none cursor-pointer',
                      selectedEnvId
                        ? 'border-purple-500/30 text-purple-400 bg-purple-500/5'
                        : 'border-border/30 text-muted-foreground/50'
                    )}
                    style={{ minWidth: '70px' }}
                  >
                    <option value="">Local</option>
                    {remoteEnvironments.map(env => (
                      <option key={env.id} value={env.id}>
                        [{env.type.toUpperCase()}] {env.name}
                      </option>
                    ))}
                  </select>
                </TooltipSimple>
              )}

              {/* Config Pill — right of input, centered vertically */}
              <div className="relative config-panel-container shrink-0">
                <ConfigPill
                  onClick={() => setConfigPanelOpen(!configPanelOpen)}
                  isOpen={configPanelOpen}
                  checkpointCount={checkpointCount}
                />
                <AnimatePresence>
                  {configPanelOpen && (
                    <ConfigPanel
                      onClose={() => setConfigPanelOpen(false)}
                      sessionId={sessionId}
                      projectId={projectId}
                      projectPath={projectPath}
                    />
                  )}
                </AnimatePresence>
              </div>

              {/* Timeline button — right of ConfigPill */}
              <TooltipSimple content="Rewind Timeline" side="top">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.dispatchEvent(new Event('runecode:open-timeline'))}
                  className="h-9 w-9 shrink-0"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  <GitBranch className="h-4 w-4" />
                </Button>
              </TooltipSimple>
            </div>
          </div>
        </div>
      </div>
    </>
    </TooltipProvider>
  );
};

export const FloatingPromptInput = React.forwardRef<
  FloatingPromptInputRef,
  FloatingPromptInputProps
>(FloatingPromptInputInner);

FloatingPromptInput.displayName = 'FloatingPromptInput';
