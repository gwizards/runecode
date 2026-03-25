import React, { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Send, Square } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TooltipProvider, TooltipSimple } from "@/components/ui/tooltip-modern";
import { FilePicker } from "./FilePicker";
import { SlashCommandPicker } from "./SlashCommandPicker";
import { ImagePreview } from "./ImagePreview";
import { api, type FileEntry, type SlashCommand } from "@/lib/api";
import {
  useSessionConfig,
  type ModelId,
  type ThinkingMode,
  type PermissionMode,
} from "@/hooks/useSessionConfig";
import type { RemoteEnvironment } from "@/components/settings/EnvironmentsSettings";
import {
  extractImagePaths,
  useDragDropAttachment,
  type OrchestrationMode,
  ORCHESTRATION_PREFIXES,
} from "./prompt/PromptAttachments";
import {
  resolveSlashCommandState,
  resolveFilePickerState,
} from "./prompt/PromptSuggestions";
import { ExpandedPromptModal } from "./prompt/ExpandedPromptModal";
import { PromptToolbar } from "./prompt/PromptToolbar";

export type { OrchestrationMode };
export { getSelectedEnvironment } from "./prompt/PromptAttachments";
interface FloatingPromptInputProps {
  onSend: (prompt: string, model: ModelId, thinkingMode: ThinkingMode, effort?: string, permissionMode?: PermissionMode) => void;
  isLoading?: boolean;
  disabled?: boolean;
  defaultModel?: "sonnet" | "opus";
  projectPath?: string;
  sessionId?: string;
  projectId?: string;
  className?: string;
  onCancel?: () => void;
  onCopyMarkdown?: () => void;
  onCopyJsonl?: () => void;
}

export interface FloatingPromptInputRef {
  addImage: (imagePath: string) => void;
}

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
  ref: React.Ref<FloatingPromptInputRef>
) => {
  const { data: checkpointCount = 0 } = useQuery({
    queryKey: ["checkpoint-count", sessionId, projectId],
    queryFn: async () => {
      const timeline = await api.getSessionTimeline(sessionId!, projectId!, projectPath || "");
      return timeline?.totalCheckpoints || 0;
    },
    staleTime: 120000,
    enabled: !!sessionId && !!projectId,
  });

  const [prompt, setPrompt] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const [orchestrationMode, setOrchestrationMode] = useState<OrchestrationMode>("normal");
  const [remoteEnvironments, setRemoteEnvironments] = useState<RemoteEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(() => {
    try { return localStorage.getItem("runecode-selected-env-id"); } catch { return null; }
  });
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerQuery, setFilePickerQuery] = useState("");
  const [showSlashCommandPicker, setShowSlashCommandPicker] = useState(false);
  const [slashCommandQuery, setSlashCommandQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const [embeddedImages, setEmbeddedImages] = useState<string[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [textareaHeight, setTextareaHeight] = useState<number>(48);
  const isIMEComposingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const expandedTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { dragActive } = useDragDropAttachment({
    isExpanded, projectPath, textareaRef, expandedTextareaRef,
    onDropImages: (paths) => {
      setPrompt((cur) => {
        const existing = extractImagePaths(cur, projectPath);
        const newPaths = paths.filter((p) => !existing.includes(p));
        if (!newPaths.length) return cur;
        const mentions = newPaths.map((p) => (p.includes(" ") ? `@"${p}"` : `@${p}`)).join(" ");
        const sep = cur.endsWith(" ") || cur === "" ? "" : " ";
        const next = cur + sep + mentions + " ";
        requestAnimationFrame(() => {
          const t = isExpanded ? expandedTextareaRef.current : textareaRef.current;
          t?.focus(); t?.setSelectionRange(next.length, next.length);
        });
        return next;
      });
    },
  });

  React.useImperativeHandle(ref, () => ({
    addImage: (imagePath: string) => {
      setPrompt((cur) => {
        const existing = extractImagePaths(cur, projectPath);
        if (existing.includes(imagePath)) return cur;
        const mention = imagePath.includes(" ") ? `@"${imagePath}"` : `@${imagePath}`;
        const sep = cur.endsWith(" ") || cur === "" ? "" : " ";
        const next = cur + sep + mention + " ";
        requestAnimationFrame(() => {
          const t = isExpanded ? expandedTextareaRef.current : textareaRef.current;
          t?.focus(); t?.setSelectionRange(next.length, next.length);
        });
        return next;
      });
    },
  }), [isExpanded, projectPath]);

  useEffect(() => {
    try {
      if (selectedEnvId) localStorage.setItem("runecode-selected-env-id", selectedEnvId);
      else localStorage.removeItem("runecode-selected-env-id");
    } catch (e) { console.warn('[FloatingPromptInput] failed to persist env selection', e); }
  }, [selectedEnvId]);

  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem("runecode-remote-environments");
        setRemoteEnvironments((stored ? JSON.parse(stored) : []).filter((e: RemoteEnvironment) => e.enabled));
      } catch { setRemoteEnvironments([]); }
    };
    load();
    window.addEventListener("runecode:environments-changed", load);
    return () => window.removeEventListener("runecode:environments-changed", load);
  }, []);

  const selectedEnv = remoteEnvironments.find((e) => e.id === selectedEnvId) || null;

  useEffect(() => {
    setEmbeddedImages(extractImagePaths(prompt, projectPath));
    if (textareaRef.current && !isExpanded) {
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        const h = Math.min(Math.max(textareaRef.current.scrollHeight, 48), 240);
        setTextareaHeight(h);
        textareaRef.current.style.height = `${h}px`;
      });
    }
  }, [prompt, projectPath, isExpanded]);

  useEffect(() => {
    if (isExpanded) expandedTextareaRef.current?.focus();
    else textareaRef.current?.focus();
  }, [isExpanded]);

  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => {
        (isExpanded ? expandedTextareaRef : textareaRef).current?.focus();
      });
    };
    window.addEventListener("runecode:focus-prompt", handler);
    return () => window.removeEventListener("runecode:focus-prompt", handler);
  }, [isExpanded]);

  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.text) {
        setPrompt((p) => p ? p + "\n" + e.detail.text : e.detail.text);
        requestAnimationFrame(() => (isExpanded ? expandedTextareaRef : textareaRef).current?.focus());
      }
    };
    window.addEventListener("runecode:insert-to-conversation", handler as EventListener);
    return () => window.removeEventListener("runecode:insert-to-conversation", handler as EventListener);
  }, [isExpanded]);

  useEffect(() => {
    if (!configPanelOpen) return;
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".config-panel-container")) setConfigPanelOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [configPanelOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "m") { e.preventDefault(); useSessionConfig.getState().cycleModel(); }
      if (e.ctrlKey && e.key === "t" && !e.shiftKey) { e.preventDefault(); useSessionConfig.getState().cycleThinkingMode(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const resizeTextarea = () => {
    if (textareaRef.current && !isExpanded) {
      requestAnimationFrame(() => {
        if (!textareaRef.current) return;
        textareaRef.current.style.height = "auto";
        const h = Math.min(Math.max(textareaRef.current.scrollHeight, 48), 240);
        setTextareaHeight(h);
        textareaRef.current.style.height = `${h}px`;
      });
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart || 0;
    resizeTextarea();

    const slashState = resolveSlashCommandState(newValue, newCursorPos, prompt, showSlashCommandPicker);
    if (slashState.show !== showSlashCommandPicker) { setShowSlashCommandPicker(slashState.show); if (slashState.show) setConfigPanelOpen(false); }
    setSlashCommandQuery(slashState.query);

    const fileState = resolveFilePickerState(newValue, newCursorPos, prompt, cursorPosition, showFilePicker, projectPath);
    if (fileState.show !== showFilePicker) { setShowFilePicker(fileState.show); if (fileState.show) setConfigPanelOpen(false); }
    setFilePickerQuery(fileState.query);

    setPrompt(newValue);
    setCursorPosition(newCursorPos);
  };

  const handleFileSelect = (entry: FileEntry) => {
    if (!textareaRef.current) return;
    let atPos = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (prompt[i] === "@") { atPos = i; break; }
      if (prompt[i] === " " || prompt[i] === "\n") break;
    }
    if (atPos === -1) return;
    const before = prompt.substring(0, atPos);
    const after = prompt.substring(cursorPosition);
    const rel = entry.path.startsWith(projectPath || "") ? entry.path.slice((projectPath || "").length + 1) : entry.path;
    const next = `${before}@${rel} ${after}`;
    setPrompt(next); setShowFilePicker(false); setFilePickerQuery("");
    requestAnimationFrame(() => {
      textareaRef.current!.focus();
      const pos = before.length + rel.length + 2;
      textareaRef.current!.setSelectionRange(pos, pos);
    });
  };

  const handleSlashCommandSelect = (command: SlashCommand) => {
    const textarea = isExpanded ? expandedTextareaRef.current : textareaRef.current;
    if (!textarea) return;
    let slashPos = -1;
    for (let i = cursorPosition - 1; i >= 0; i--) {
      if (prompt[i] === "/") { slashPos = i; break; }
      if (prompt[i] === " " || prompt[i] === "\n") break;
    }
    if (slashPos === -1) return;
    const before = prompt.substring(0, slashPos);
    const after = command.accepts_arguments ? "" : prompt.substring(cursorPosition);
    const next = command.accepts_arguments
      ? `${before}${command.full_command} `
      : `${before}${command.full_command} ${after}`;
    setPrompt(next); setShowSlashCommandPicker(false); setSlashCommandQuery("");
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = before.length + command.full_command.length + 1;
      textarea.setSelectionRange(pos, pos);
    });
  };

  const handleCompositionStart = () => { isIMEComposingRef.current = true; };
  const handleCompositionEnd = () => { setTimeout(() => { isIMEComposingRef.current = false; }, 0); };

  const isIMEInteraction = (event?: React.KeyboardEvent) => {
    if (isIMEComposingRef.current) return true;
    if (!event) return false;
    const ne = event.nativeEvent;
    if (ne.isComposing) return true;
    const key = ne.key;
    if (key === "Process" || key === "Unidentified") return true;
    // keyCode/which are deprecated but needed for IME detection on some browsers
    const kc = (ne as unknown as { keyCode?: number; which?: number }).keyCode ?? (ne as unknown as { which?: number }).which;
    return kc === 229;
  };

  const handleSend = () => {
    if (isIMEInteraction()) return;
    if (prompt.trim() && !disabled) {
      let final = prompt.trim();
      if (orchestrationMode !== "normal") final = ORCHESTRATION_PREFIXES[orchestrationMode] + final;
      const { model, thinkingMode, effort, permissionMode } = useSessionConfig.getState();
      onSend(final, model, thinkingMode, effort, permissionMode);
      setPrompt(""); setEmbeddedImages([]); setTextareaHeight(48); setOrchestrationMode("normal");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showFilePicker && e.key === "Escape") { e.preventDefault(); setShowFilePicker(false); setFilePickerQuery(""); return; }
    if (showSlashCommandPicker && e.key === "Escape") { e.preventDefault(); setShowSlashCommandPicker(false); setSlashCommandQuery(""); return; }
    if (e.key === "e" && (e.ctrlKey || e.metaKey) && e.shiftKey) { e.preventDefault(); setIsExpanded(true); return; }
    if (e.key === "Enter" && !e.shiftKey && !isExpanded && !showFilePicker && !showSlashCommandPicker) {
      if (isIMEInteraction(e)) return;
      e.preventDefault(); handleSend();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const b64 = reader.result as string;
            setPrompt((cur) => {
              const mention = `@"${b64}"`;
              const sep = cur.endsWith(" ") || cur === "" ? "" : " ";
              const next = cur + sep + mention + " ";
              requestAnimationFrame(() => {
                const t = isExpanded ? expandedTextareaRef.current : textareaRef.current;
                t?.focus(); t?.setSelectionRange(next.length, next.length);
              });
              return next;
            });
          };
          reader.readAsDataURL(blob);
        } catch (err) { console.error("Failed to paste image:", err); }
      }
    }
  };

  const handleDrag = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };

  const handleRemoveImage = (index: number) => {
    const imagePath = embeddedImages[index];
    if (imagePath.startsWith("data:")) { setPrompt(prompt.replace(`@"${imagePath}"`, "").trim()); return; }
    const esc = imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escRel = imagePath.replace((projectPath || "") + "/", "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`@"${esc}"\\s?`, "g"), new RegExp(`@${esc}\\s?`, "g"),
      new RegExp(`@"${escRel}"\\s?`, "g"), new RegExp(`@${escRel}\\s?`, "g"),
    ];
    let next = prompt;
    for (const p of patterns) next = next.replace(p, "");
    setPrompt(next.trim());
  };

  return (
    <TooltipProvider>
      <>
        <ExpandedPromptModal
          isExpanded={isExpanded}
          onClose={() => setIsExpanded(false)}
          prompt={prompt}
          onTextChange={handleTextChange}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          onPaste={handlePaste}
          onDrag={handleDrag}
          onDrop={handleDrop}
          onSend={handleSend}
          disabled={disabled}
          isLoading={isLoading}
          embeddedImages={embeddedImages}
          onRemoveImage={handleRemoveImage}
          expandedTextareaRef={expandedTextareaRef}
        />

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
            {embeddedImages.length > 0 && (
              <ImagePreview
                images={embeddedImages}
                onRemove={handleRemoveImage}
                className="border-b border-border"
              />
            )}

            <div className="p-3">
              <div className="flex items-center gap-2">
                {/* Textarea */}
                <div className="flex-1 relative">
                  <Textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onPaste={handlePaste}
                    placeholder={dragActive ? "Drop images here..." : "Cast a rune... (@ for files, / for commands)"}
                    disabled={disabled}
                    className={cn(
                      "resize-none pr-12 pl-3 py-2.5 transition-all duration-150 relative z-[2]",
                      dragActive && "border-primary",
                      textareaHeight >= 240 && "overflow-y-auto scrollbar-thin"
                    )}
                    style={{ height: `${textareaHeight}px`, overflowY: textareaHeight >= 240 ? "auto" : "hidden" }}
                  />

                  <div className="absolute right-1.5 bottom-1.5">
                    <TooltipSimple content={isLoading ? "Stop generation" : "Send message (Enter)"} side="top">
                      <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                        <Button
                          onClick={isLoading ? onCancel : handleSend}
                          disabled={isLoading ? false : !prompt.trim() || disabled}
                          variant={isLoading ? "destructive" : prompt.trim() ? "default" : "ghost"}
                          size="icon"
                          className={cn("h-8 w-8 transition-all", prompt.trim() && !isLoading && "shadow-sm")}
                        >
                          {isLoading ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </motion.div>
                    </TooltipSimple>
                  </div>

                  <AnimatePresence>
                    {showFilePicker && projectPath?.trim() && (
                      <FilePicker
                        basePath={projectPath.trim()}
                        onSelect={handleFileSelect}
                        onClose={() => { setShowFilePicker(false); setFilePickerQuery(""); requestAnimationFrame(() => textareaRef.current?.focus()); }}
                        initialQuery={filePickerQuery}
                      />
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {showSlashCommandPicker && (
                      <SlashCommandPicker
                        projectPath={projectPath}
                        onSelect={handleSlashCommandSelect}
                        onClose={() => {
                          setShowSlashCommandPicker(false); setSlashCommandQuery("");
                          requestAnimationFrame(() => (isExpanded ? expandedTextareaRef : textareaRef).current?.focus());
                        }}
                        initialQuery={slashCommandQuery}
                      />
                    )}
                  </AnimatePresence>
                </div>

                <PromptToolbar
                  orchestrationMode={orchestrationMode}
                  setOrchestrationMode={setOrchestrationMode}
                  remoteEnvironments={remoteEnvironments}
                  selectedEnvId={selectedEnvId}
                  setSelectedEnvId={setSelectedEnvId}
                  selectedEnv={selectedEnv}
                  configPanelOpen={configPanelOpen}
                  setConfigPanelOpen={setConfigPanelOpen}
                  checkpointCount={checkpointCount}
                  sessionId={sessionId}
                  projectId={projectId}
                  projectPath={projectPath}
                />
              </div>
            </div>
          </div>
        </div>
      </>
    </TooltipProvider>
  );
};

export const FloatingPromptInput = React.forwardRef<FloatingPromptInputRef, FloatingPromptInputProps>(FloatingPromptInputInner);
