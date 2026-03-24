/**
 * ToolResultBlock — renders a tool_result content block inside a user message.
 *
 * This is the heavy logic that checks for matching assistant tool_use widgets,
 * extracts content text, and renders the appropriate result widget.
 */

import React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ClaudeStreamMessage, ContentBlock } from "../AgentExecution";
import type { ToolResult } from "../widgets/types";
import {
  EditResultWidget,
  MultiEditResultWidget,
  SystemReminderWidget,
  LSResultWidget,
  ReadResultWidget,
} from "../ToolWidgets";
import { TaskNotificationWidget } from "../widgets/TaskNotificationWidget";

// ─── Helpers (duplicated from StreamMessage to keep this module independent) ──

function extractTag(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

function parseTaskNotifications(content: string) {
  const notifications: {
    taskId: string;
    status: string;
    summary: string;
    result?: string;
    usage?: { totalTokens?: number; toolUses?: number; durationMs?: number };
  }[] = [];
  const regex = /<task-notification>([\s\S]*?)<\/task-notification>/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const taskId = extractTag(block, "task-id") || "";
    const status = extractTag(block, "status") || "unknown";
    const summary = extractTag(block, "summary") || "Task notification";
    const result = extractTag(block, "result") || "";
    const usageBlock = extractTag(block, "usage") || "";
    const totalTokens = parseInt(extractTag(usageBlock, "total_tokens") || "0");
    const toolUses = parseInt(extractTag(usageBlock, "tool_uses") || "0");
    const durationMs = parseInt(extractTag(usageBlock, "duration_ms") || "0");
    notifications.push({
      taskId,
      status,
      summary,
      result: result || undefined,
      usage: totalTokens ? { totalTokens, toolUses, durationMs } : undefined,
    });
  }
  const cleanContent = content
    .replace(/<task-notification>[\s\S]*?<\/task-notification>/g, "")
    .replace(/Full transcript available at:.*$/gm, "")
    .trim();
  return { notifications, cleanContent };
}

function stripMetadataTags(content: string): string {
  return content
    .replace(/<output-file>[\s\S]*?<\/output-file>/g, "")
    .replace(/<tool-use-id>[\s\S]*?<\/tool-use-id>/g, "")
    .replace(/<usage>[\s\S]*?<\/usage>/g, "")
    .replace(/<result>[\s\S]*?<\/result>/g, "")
    .replace(/Full transcript available at:.*$/gm, "")
    .trim();
}

// ─── Exported Component ───────────────────────────────────────────────────────

interface ToolResultBlockProps {
  content: ToolResult & { tool_use_id?: string };
  idx: number;
  streamMessages: ClaudeStreamMessage[];
  onRendered: () => void;
}

const TOOLS_WITH_WIDGETS = [
  "task", "edit", "multiedit", "todowrite", "todoread",
  "ls", "read", "glob", "bash", "write", "grep",
  "websearch", "webfetch", "skill",
];

export const ToolResultBlock: React.FC<ToolResultBlockProps> = ({
  content,
  idx,
  streamMessages,
  onRendered,
}) => {
  // Check if a dedicated widget is already present for this tool call
  if (content.tool_use_id && streamMessages) {
    for (let i = streamMessages.length - 1; i >= 0; i--) {
      const prevMsg = streamMessages[i];
      if (
        prevMsg.type === "assistant" &&
        prevMsg.message?.content &&
        Array.isArray(prevMsg.message.content)
      ) {
        const toolUse = prevMsg.message.content.find(
          (c: ContentBlock) => c.type === "tool_use" && "id" in c && c.id === content.tool_use_id
        );
        if (toolUse && toolUse.type === "tool_use") {
          const tn = toolUse.name?.toLowerCase() ?? "";
          if (TOOLS_WITH_WIDGETS.includes(tn) || toolUse.name?.startsWith("mcp__")) {
            return null; // dedicated widget handles this
          }
          break;
        }
      }
    }
  }

  // Extract content text
  let contentText = "";
  if (typeof content.content === "string") {
    contentText = content.content;
  } else if (content.content && typeof content.content === "object") {
    if (Array.isArray(content.content)) {
      contentText = content.content
        .map((c: string | { text?: string }) => (typeof c === "string" ? c : c.text || JSON.stringify(c)))
        .join("\n");
    } else if (content.content.text) {
      contentText = content.content.text;
    } else {
      contentText = JSON.stringify(content.content, null, 2);
    }
  }

  onRendered();

  // System reminder inside tool result
  const reminderMatch = contentText.match(/<system-reminder>(.*?)<\/system-reminder>/s);
  if (reminderMatch) {
    const reminderMessage = reminderMatch[1].trim();
    const beforeReminder = contentText.substring(0, reminderMatch.index || 0).trim();
    const afterReminder = contentText.substring((reminderMatch.index || 0) + reminderMatch[0].length).trim();
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Tool Result</span>
        </div>
        {beforeReminder && (
          <div className="ml-6 p-2 bg-background rounded-md border">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{beforeReminder}</pre>
          </div>
        )}
        <div className="ml-6">
          <SystemReminderWidget message={reminderMessage} />
        </div>
        {afterReminder && (
          <div className="ml-6 p-2 bg-background rounded-md border">
            <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">{afterReminder}</pre>
          </div>
        )}
      </div>
    );
  }

  // Edit result
  if (contentText.includes("has been updated. Here's the result of running `cat -n`")) {
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Edit Result</span>
        </div>
        <EditResultWidget content={contentText} />
      </div>
    );
  }

  // MultiEdit result
  if (
    contentText.includes("has been updated with multiple edits") ||
    contentText.includes("MultiEdit completed successfully") ||
    contentText.includes("Applied multiple edits to")
  ) {
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">MultiEdit Result</span>
        </div>
        <MultiEditResultWidget content={contentText} />
      </div>
    );
  }

  // LS result
  const isLSResult = (() => {
    if (!content.tool_use_id || typeof contentText !== "string") return false;
    let isFromLSTool = false;
    if (streamMessages) {
      for (let i = streamMessages.length - 1; i >= 0; i--) {
        const prevMsg = streamMessages[i];
        if (
          prevMsg.type === "assistant" &&
          prevMsg.message?.content &&
          Array.isArray(prevMsg.message.content)
        ) {
          const toolUse = prevMsg.message.content.find(
            (c: ContentBlock) =>
              c.type === "tool_use" &&
              "id" in c && c.id === content.tool_use_id &&
              c.name?.toLowerCase() === "ls"
          );
          if (toolUse) { isFromLSTool = true; break; }
        }
      }
    }
    if (!isFromLSTool) return false;
    const lines = contentText.split("\n");
    return (
      lines.some((line) => /^\s*-\s+/.test(line)) ||
      lines.some((line) => line.trim().startsWith("NOTE: do any of the files"))
    );
  })();

  if (isLSResult) {
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Directory Contents</span>
        </div>
        <LSResultWidget content={contentText} />
      </div>
    );
  }

  // Read result
  const isReadResult =
    content.tool_use_id &&
    typeof contentText === "string" &&
    /^\s*\d+→/.test(contentText);

  if (isReadResult) {
    let filePath: string | undefined;
    if (streamMessages) {
      for (let i = streamMessages.length - 1; i >= 0; i--) {
        const prevMsg = streamMessages[i];
        if (
          prevMsg.type === "assistant" &&
          prevMsg.message?.content &&
          Array.isArray(prevMsg.message.content)
        ) {
          const toolUse = prevMsg.message.content.find(
            (c: ContentBlock) =>
              c.type === "tool_use" &&
              "id" in c && c.id === content.tool_use_id &&
              c.name?.toLowerCase() === "read"
          );
          if (toolUse && toolUse.type === "tool_use" && toolUse.input?.file_path) {
            filePath = toolUse.input.file_path as string;
            break;
          }
        }
      }
    }
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Read Result</span>
        </div>
        <ReadResultWidget content={contentText} filePath={filePath} />
      </div>
    );
  }

  // Empty tool result
  if (!contentText || contentText.trim() === "") {
    return (
      <div key={idx} className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium">Tool Result</span>
        </div>
        <div className="ml-6 p-3 bg-muted/50 rounded-md border text-sm text-muted-foreground italic">
          Tool did not return any output
        </div>
      </div>
    );
  }

  // Generic tool result
  const { notifications: toolNotifications, cleanContent: afterToolNotifications } =
    parseTaskNotifications(contentText);
  const toolDisplayText = stripMetadataTags(afterToolNotifications);

  return (
    <div key={idx} className="space-y-2">
      <div className="flex items-center gap-2">
        {content.is_error ? (
          <AlertCircle className="h-4 w-4 text-destructive" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        <span className="text-sm font-medium">Tool Result</span>
      </div>
      {toolNotifications.map((n, i) => (
        <div key={`tool-notif-${i}`} className="ml-6">
          <TaskNotificationWidget {...n} />
        </div>
      ))}
      {toolDisplayText && (
        <div className="ml-6 p-2 bg-background rounded-md border">
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
            {toolDisplayText}
          </pre>
        </div>
      )}
    </div>
  );
};
