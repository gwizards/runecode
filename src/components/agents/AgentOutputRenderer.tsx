import { useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw } from 'lucide-react';
import StreamMessage from '../StreamMessage';
import { ErrorBoundary } from '../ErrorBoundary';
import type { ClaudeStreamMessage } from '../AgentExecution';

interface AgentOutputRendererProps {
  messages: ClaudeStreamMessage[];
  loading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  endRef: React.RefObject<HTMLDivElement | null>;
  hasUserScrolled?: boolean;
  onUserScrolled: (scrolled: boolean) => void;
  className?: string;
  maxWidth?: string;
}

/**
 * Filters messages to only include displayable ones.
 */
export function useDisplayableMessages(messages: ClaudeStreamMessage[]) {
  return useMemo(() => {
    return messages.filter((message) => {
      if (message.isMeta && !message.leafUuid && !message.summary) return false;

      if (message.type === "user" && message.message) {
        if (message.isMeta) return false;

        const msg = message.message;
        if (!msg.content || (Array.isArray(msg.content) && msg.content.length === 0)) return false;

        if (Array.isArray(msg.content)) {
          let hasVisibleContent = false;
          for (const content of msg.content) {
            if (content.type === "text") { hasVisibleContent = true; break; }
            if (content.type === "tool_result") {
              let willBeSkipped = false;
              if (content.tool_use_id) {
                for (let i = messages.indexOf(message) - 1; i >= 0; i--) {
                  const prevMsg = messages[i];
                  if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                    const toolUse = prevMsg.message.content.find((c) => c.type === 'tool_use' && 'id' in c && c.id === content.tool_use_id);
                    if (toolUse && toolUse.type === 'tool_use') {
                      const toolName = toolUse.name?.toLowerCase() ?? '';
                      const toolsWithWidgets = ['task', 'edit', 'multiedit', 'todowrite', 'ls', 'read', 'glob', 'bash', 'write', 'grep'];
                      if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) {
                        willBeSkipped = true;
                      }
                      break;
                    }
                  }
                }
              }
              if (!willBeSkipped) { hasVisibleContent = true; break; }
            }
          }
          if (!hasVisibleContent) return false;
        }
      }
      return true;
    });
  }, [messages]);
}

/**
 * Renders the scrollable output area with stream messages.
 */
export function AgentOutputRenderer({
  messages,
  loading,
  scrollRef,
  endRef,
  onUserScrolled,
  className,
  maxWidth,
}: AgentOutputRendererProps) {
  const displayableMessages = useDisplayableMessages(messages);
  const scrollRafRef = useRef<number>(0);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      const { scrollTop, scrollHeight, clientHeight } = target;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      onUserScrolled(distanceFromBottom > 50);
    });
  }, [onUserScrolled]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Loading output...</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p>No output available yet</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={`h-full overflow-y-auto p-4 space-y-2 ${className || ''}`}
      onScroll={handleScroll}
    >
      {maxWidth ? (
        <div className={`${maxWidth} mx-auto space-y-2`}>
          <AnimatePresence>
            {displayableMessages.map((message: ClaudeStreamMessage, index: number) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ErrorBoundary>
                  <StreamMessage message={message} streamMessages={messages} />
                </ErrorBoundary>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      ) : (
        <>
          <AnimatePresence>
            {displayableMessages.map((message: ClaudeStreamMessage, index: number) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ErrorBoundary>
                  <StreamMessage message={message} streamMessages={messages} />
                </ErrorBoundary>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </>
      )}
    </div>
  );
}
