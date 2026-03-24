/**
 * Pure functions for parsing and categorising Claude stream messages.
 * Extracted from useSessionCommands to keep the hook under 500 lines.
 */

import type { ClaudeStreamMessage } from "@/components/AgentExecution";
import type { SessionMetrics } from "@/hooks/useClaudeSession";

// ─── Tool-use classification ─────────────────────────────────────────────────

/**
 * Inspect an assistant message's content blocks and update sessionMetrics
 * for every tool_use block found.
 */
export function trackToolUses(
  message: ClaudeStreamMessage,
  metrics: SessionMetrics,
): string[] {
  if (message.type !== "assistant" || !message.message?.content) return [];

  const toolUses = message.message.content.filter(
    (c: any) => c.type === "tool_use",
  );

  const names: string[] = [];

  toolUses.forEach((toolUse: any) => {
    metrics.toolsExecuted += 1;
    metrics.lastActivityTime = Date.now();
    names.push(toolUse.name);

    const toolName = toolUse.name?.toLowerCase() || "";
    if (toolName.includes("create") || toolName.includes("write")) {
      metrics.filesCreated += 1;
    } else if (
      toolName.includes("edit") ||
      toolName.includes("multiedit") ||
      toolName.includes("search_replace")
    ) {
      metrics.filesModified += 1;
    } else if (toolName.includes("delete")) {
      metrics.filesDeleted += 1;
    }
  });

  return names;
}

/**
 * Inspect a user message's content blocks for tool_result entries and
 * update sessionMetrics for failures.
 *
 * Returns the list of failed tool-result contents (for error tracking).
 */
export function trackToolResults(
  message: ClaudeStreamMessage,
  metrics: SessionMetrics,
): string[] {
  if (message.type !== "user" || !message.message?.content) return [];

  const toolResults = message.message.content.filter(
    (c: any) => c.type === "tool_result",
  );

  const errors: string[] = [];
  toolResults.forEach((result: any) => {
    if (result.is_error) {
      metrics.toolsFailed += 1;
      metrics.errorsEncountered += 1;
      errors.push(result.content);
    }
  });
  return errors;
}

/**
 * Count code-block pairs (``` ... ```) in an assistant message.
 */
export function countCodeBlocks(message: ClaudeStreamMessage): number {
  if (message.type !== "assistant" || !message.message?.content) return 0;

  let total = 0;
  const codeBlocks = message.message.content.filter(
    (c: any) => c.type === "text" && c.text?.includes("```"),
  );
  codeBlocks.forEach((block: any) => {
    const matches = (block.text.match(/```/g) || []).length;
    total += Math.floor(matches / 2);
  });
  return total;
}

/**
 * Returns true when the message represents a system-level error.
 */
export function isSystemError(message: ClaudeStreamMessage): boolean {
  return (
    message.type === "system" &&
    (message.subtype === "error" || !!message.error)
  );
}

// ─── Session-stopped analytics payload builder ───────────────────────────────

export interface SessionStoppedPayload {
  duration_ms: number;
  messages_count: number;
  reason: 'user_stopped' | 'error' | 'completed';
  time_to_first_message_ms: number | undefined;
  average_response_time_ms: number | undefined;
  idle_time_ms: number;
  prompts_sent: number;
  tools_executed: number;
  tools_failed: number;
  files_created: number;
  files_modified: number;
  files_deleted: number;
  total_tokens_used: number;
  code_blocks_generated: number;
  errors_encountered: number;
  model: string;
  has_checkpoints: boolean;
  checkpoint_count: number;
  was_resumed: boolean;
  agent_type: undefined;
  agent_name: undefined;
  agent_success: boolean | undefined;
  stop_source: 'user_button' | 'keyboard_shortcut' | 'timeout' | 'error' | 'completed';
  final_state: 'success' | 'partial' | 'failed' | 'cancelled';
  has_pending_prompts: boolean;
  pending_prompts_count: number;
}

export function buildSessionStoppedPayload(
  metrics: SessionMetrics,
  opts: {
    messages: ClaudeStreamMessage[];
    sessionStartTime: number;
    totalTokens: number;
    pendingCount: number;
    reason: 'user_stopped' | 'error' | 'completed';
    stopSource: 'user_button' | 'keyboard_shortcut' | 'timeout' | 'error' | 'completed';
    finalState: 'success' | 'partial' | 'failed' | 'cancelled';
    agentSuccess: boolean | undefined;
  },
): SessionStoppedPayload {
  const sessionStartTimeValue =
    opts.messages.length > 0
      ? (opts.messages[0] as any).timestamp || Date.now()
      : Date.now();
  const duration = Date.now() - sessionStartTimeValue;
  const timeToFirstMessage = metrics.firstMessageTime
    ? metrics.firstMessageTime - opts.sessionStartTime
    : undefined;
  const idleTime = Date.now() - metrics.lastActivityTime;
  const avgResponseTime =
    metrics.toolExecutionTimes.length > 0
      ? metrics.toolExecutionTimes.reduce((a, b) => a + b, 0) /
        metrics.toolExecutionTimes.length
      : undefined;

  return {
    duration_ms: duration,
    messages_count: opts.messages.length,
    reason: opts.reason,
    time_to_first_message_ms: timeToFirstMessage,
    average_response_time_ms: avgResponseTime,
    idle_time_ms: idleTime,
    prompts_sent: metrics.promptsSent,
    tools_executed: metrics.toolsExecuted,
    tools_failed: metrics.toolsFailed,
    files_created: metrics.filesCreated,
    files_modified: metrics.filesModified,
    files_deleted: metrics.filesDeleted,
    total_tokens_used: opts.totalTokens,
    code_blocks_generated: metrics.codeBlocksGenerated,
    errors_encountered: metrics.errorsEncountered,
    model:
      metrics.modelChanges.length > 0
        ? metrics.modelChanges[metrics.modelChanges.length - 1].to
        : "sonnet",
    has_checkpoints: metrics.checkpointCount > 0,
    checkpoint_count: metrics.checkpointCount,
    was_resumed: metrics.wasResumed,
    agent_type: undefined,
    agent_name: undefined,
    agent_success: opts.agentSuccess,
    stop_source: opts.stopSource,
    final_state: opts.finalState,
    has_pending_prompts: opts.pendingCount > 0,
    pending_prompts_count: opts.pendingCount,
  };
}
