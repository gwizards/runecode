import { useMemo, useRef, useState, useEffect } from "react";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";

const TOOLS_WITH_WIDGETS = new Set([
  'task', 'edit', 'multiedit', 'todowrite', 'ls', 'read',
  'glob', 'bash', 'write', 'grep',
]);

const NON_DISPLAYABLE_TYPES = new Set([
  'progress', 'file-history-snapshot', 'queue-operation', 'last-prompt',
  'rate_limit_event', 'system', 'start', 'partial', 'session_info',
  'content_block_start', 'content_block_delta', 'content_block_stop',
  'message_start', 'message_delta', 'message_stop', 'stream_event',
  'result', 'control_request', 'control_response', 'control_cancel',
  'keep_alive',
]);

export interface DisplayableMessagesResult {
  /** All messages that should be rendered (no virtual windowing). */
  allDisplayableMessages: ClaudeStreamMessage[];
  /** Windowed slice shown in the virtualizer (last `visibleLimit` items). */
  displayableMessages: ClaudeStreamMessage[];
  hasMoreMessages: boolean;
  visibleLimit: number;
  setVisibleLimit: React.Dispatch<React.SetStateAction<number>>;
  /** Total count ref — updated synchronously for use in scroll handlers. */
  allDisplayableRef: React.MutableRefObject<number>;
}

const INITIAL_VISIBLE = 12;

/**
 * Filters messages to only those that should be rendered, and applies a
 * sliding-window for virtualised rendering.
 */
export function useDisplayableMessages(
  messages: ClaudeStreamMessage[],
  isScrolledUp: boolean,
): DisplayableMessagesResult {
  const [visibleLimit, setVisibleLimit] = useState(INITIAL_VISIBLE);
  const allDisplayableRef = useRef(0);
  const prevMsgCount = useRef(0);

  // Reset visible limit on session change; auto-expand for new messages
  useEffect(() => {
    if (messages.length < prevMsgCount.current) {
      setVisibleLimit(INITIAL_VISIBLE);
    } else if (messages.length > prevMsgCount.current && !isScrolledUp) {
      setVisibleLimit(prev => Math.max(prev, INITIAL_VISIBLE));
    }
    prevMsgCount.current = messages.length;
  }, [messages.length, isScrolledUp]);

  // Pre-build a map of tool_use_id → tool name for O(1) lookup
  const toolUseNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const msg of messages) {
      if (msg.type === 'assistant' && Array.isArray(msg.message?.content)) {
        for (const c of msg.message.content) {
          if (c.type === 'tool_use' && c.id) map.set(c.id, c.name || '');
        }
      }
    }
    return map;
  }, [messages]);

  const allDisplayableMessages = useMemo(() => {
    return messages.filter((message) => {
      if (NON_DISPLAYABLE_TYPES.has(message.type)) return false;

      if (message.type === 'assistant') {
        const content = message.message?.content;
        if (!content) return false;
        if (Array.isArray(content) && content.length === 0) return false;
        if (Array.isArray(content) && content.every((b: any) =>
          b.type === 'text' && (!b.text || b.text.trim() === '')
        )) return false;
      }

      if (message.isMeta && !message.leafUuid && !message.summary) return false;

      if (message.type === 'user' && message.message) {
        if (message.isMeta) return false;
        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) return false;
        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === 'text') { hasVisibleContent = true; break; }
            if (content.type === 'tool_result') {
              const toolName = content.tool_use_id
                ? toolUseNameMap.get(content.tool_use_id)
                : undefined;
              const willBeSkipped =
                toolName &&
                (TOOLS_WITH_WIDGETS.has(toolName.toLowerCase()) || toolName.startsWith('mcp__'));
              if (!willBeSkipped) { hasVisibleContent = true; break; }
            }
          }
          if (!hasVisibleContent) return false;
        }
      }

      return true;
    });
  }, [messages, toolUseNameMap]);

  const displayableMessages = useMemo(() => {
    if (allDisplayableMessages.length <= visibleLimit) return allDisplayableMessages;
    return allDisplayableMessages.slice(-visibleLimit);
  }, [allDisplayableMessages, visibleLimit]);

  allDisplayableRef.current = allDisplayableMessages.length;

  return {
    allDisplayableMessages,
    displayableMessages,
    hasMoreMessages: allDisplayableMessages.length > visibleLimit,
    visibleLimit,
    setVisibleLimit,
    allDisplayableRef,
  };
}
