/**
 * ExpandedPromptModal — the full-screen compose modal for FloatingPromptInput.
 */

import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Minimize2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TooltipSimple } from "@/components/ui/tooltip-modern";
import { RotatingRune } from "../RuneCodeLogo";
import { ImagePreview } from "../ImagePreview";

interface ExpandedPromptModalProps {
  isExpanded: boolean;
  onClose: () => void;
  prompt: string;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
  onPaste: (e: React.ClipboardEvent) => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onSend: () => void;
  disabled: boolean;
  isLoading: boolean;
  embeddedImages: string[];
  onRemoveImage: (index: number) => void;
  expandedTextareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const ExpandedPromptModal: React.FC<ExpandedPromptModalProps> = ({
  isExpanded,
  onClose,
  prompt,
  onTextChange,
  onCompositionStart,
  onCompositionEnd,
  onPaste,
  onDrag,
  onDrop,
  onSend,
  disabled,
  isLoading,
  embeddedImages,
  onRemoveImage,
  expandedTextareaRef,
}) => (
  <AnimatePresence>
    {isExpanded && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
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
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </motion.div>
            </TooltipSimple>
          </div>

          {embeddedImages.length > 0 && (
            <ImagePreview
              images={embeddedImages}
              onRemove={onRemoveImage}
              className="border-t border-border pt-2"
            />
          )}

          <Textarea
            ref={expandedTextareaRef}
            value={prompt}
            onChange={onTextChange}
            onCompositionStart={onCompositionStart}
            onCompositionEnd={onCompositionEnd}
            onPaste={onPaste}
            placeholder="Cast a rune..."
            className="min-h-[200px] resize-none"
            disabled={disabled}
            onDragEnter={onDrag}
            onDragLeave={onDrag}
            onDragOver={onDrag}
            onDrop={onDrop}
          />

          <div className="flex items-center justify-end">
            <TooltipSimple content="Send message" side="top">
              <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
                <Button
                  onClick={onSend}
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
);
