import { useEffect } from "react";
import { useSessionStore } from "@/domain/session";
import type { ClaudeStreamMessage } from "@/components/AgentExecution";

/**
 * Computes cumulative token usage and estimated cost from the message stream.
 * Pushes live usage into the global session store for the sidebar display.
 *
 * Returns { totalTokens, sessionCostUsd } derived from messages; callers
 * must hold the corresponding state themselves and pass the setters in.
 */
export function useSessionCost(
  messages: ClaudeStreamMessage[],
  setTotalTokens: React.Dispatch<React.SetStateAction<number>>,
  setSessionCostUsd: React.Dispatch<React.SetStateAction<number>>,
): void {
  useEffect(() => {
    let totalIn = 0;
    let totalOut = 0;
    let totalCacheWrite = 0;
    let totalCacheRead = 0;
    let actualCost = 0;
    let hasActualCost = false;

    for (const msg of messages) {
      // Use actual cost from SDK result messages when available
      if (msg.type === 'result' && !msg.is_error && msg.total_cost_usd) {
        actualCost += msg.total_cost_usd;
        hasActualCost = true;
      }
      const usage = msg.message?.usage ?? msg.usage;
      if (usage) {
        totalIn += usage.input_tokens;
        totalOut += usage.output_tokens;
        const usageAny = usage as Record<string, number>;
        totalCacheWrite += usageAny.cache_creation_input_tokens || 0;
        totalCacheRead += usageAny.cache_read_input_tokens || 0;
      }
    }

    // Suppress unused-variable warnings for cache counters retained for future use
    void totalCacheWrite;
    void totalCacheRead;

    const totalTok = totalIn + totalOut;
    // Use actual SDK cost if available, otherwise estimate from tokens
    const cost = hasActualCost
      ? actualCost
      : (totalIn * 3) / 1_000_000 + (totalOut * 15) / 1_000_000;

    setTotalTokens(totalTok);
    setSessionCostUsd(cost);

    // Push to global store for sidebar usage display
    useSessionStore.getState().updateLiveUsage({
      inputTokens: totalIn,
      outputTokens: totalOut,
      costUsd: cost,
    });
  }, [messages, setTotalTokens, setSessionCostUsd]);
}
