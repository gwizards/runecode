import React, { useState, useEffect, useMemo } from "react";
import { User, AlertCircle, CheckCircle2 } from "lucide-react";
import { RuneCodeLogo } from "./RuneCodeLogo";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShikiCodeBlock } from "./ShikiCodeBlock";
import type { ClaudeStreamMessage } from "./AgentExecution";
import {
  CommandWidget,
  CommandOutputWidget,
  SummaryWidget,
  SystemInitializedWidget,
} from "./ToolWidgets";
import { TaskNotificationWidget } from "./widgets/TaskNotificationWidget";
import { useSessionStore } from "../domain/session";
import { CollapsibleToolOutput, ToolUseBlock } from "./stream/ToolUseBlock";
import { ThinkingBlock } from "./stream/ThinkingBlock";
import { ToolResultBlock } from "./stream/ToolResultBlock";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
      taskId, status, summary,
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

// ─── Markdown renderer helper ─────────────────────────────────────────────────

function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-all [&_pre_code]:break-normal [&_a]:break-all [&_table]:text-xs [&_table]:block [&_table]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ node, inline, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return !inline && match ? (
              <ShikiCodeBlock
                code={String(children).replace(/\n$/, "")}
                language={match[1]}
              />
            ) : (
              <code
                className={cn(className, "text-[0.85em] px-1 py-0.5 rounded bg-muted/50")}
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface StreamMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  streamMessages: ClaudeStreamMessage[];
  onLinkDetected?: (url: string) => void;
}

// ─── StreamMessageComponent ───────────────────────────────────────────────────

const StreamMessageComponent: React.FC<StreamMessageProps> = ({
  message,
  className,
  streamMessages,
  onLinkDetected,
}) => {
  const addActiveSkill = useSessionStore((s) => s.addActiveSkill);
  const removeActiveSkill = useSessionStore((s) => s.removeActiveSkill);

  const skillName = useMemo(() => {
    if (
      message.type !== "assistant" ||
      !message.message?.content ||
      !Array.isArray(message.message.content)
    )
      return null;
    const sc = message.message.content.find(
      (c: any) => c.type === "tool_use" && c.name?.toLowerCase() === "skill"
    );
    return sc?.input?.skill || null;
  }, [message]);

  useEffect(() => {
    if (!skillName) return;
    addActiveSkill(skillName);
    return () => removeActiveSkill(skillName);
  }, [skillName, addActiveSkill, removeActiveSkill]);

  const [toolResults, setToolResults] = useState<Map<string, any>>(new Map());

  useEffect(() => {
    const results = new Map<string, any>();
    streamMessages.forEach((msg) => {
      if (msg.type === "user" && msg.message?.content && Array.isArray(msg.message.content)) {
        msg.message.content.forEach((c: any) => {
          if (c.type === "tool_result" && c.tool_use_id)
            results.set(c.tool_use_id, c);
        });
      }
    });
    setToolResults(results);
  }, [streamMessages]);

  const getToolResult = (toolId?: string) =>
    toolId ? toolResults.get(toolId) || null : null;

  try {
    if (message.isMeta && !message.leafUuid && !message.summary) return null;

    if (message.leafUuid && message.summary && message.type === "summary")
      return <SummaryWidget summary={message.summary} leafUuid={message.leafUuid} />;

    if (message.type === "system" && message.subtype === "init")
      return (
        <div className="border-l-2 border-l-gray-400/40 pl-3 opacity-75">
          <SystemInitializedWidget
            sessionId={message.session_id}
            model={message.model}
            cwd={message.cwd}
            tools={message.tools}
          />
        </div>
      );

    if (message.type === "system" && message.subtype === "task_notification")
      return (
        <div className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-muted-foreground">
              Sub-agent {message.status === "completed" ? "completed" : "finished"}
            </span>
            {message.task_id && (
              <span className="text-muted-foreground/40 font-mono text-[9px]">
                {message.task_id.slice(0, 8)}
              </span>
            )}
          </div>
          {message.summary && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/70 pl-5.5">
              {message.summary}
            </p>
          )}
        </div>
      );

    if (message.type === "system" && message.subtype === "info" && message.content)
      return (
        <div className="border-l-2 border-l-blue-400/60 pl-3 py-1 text-sm text-muted-foreground opacity-80">
          {message.content}
        </div>
      );

    // ── Assistant ──────────────────────────────────────────────────────────

    if (message.type === "assistant" && message.message) {
      const msg = message.message;
      let renderedSomething = false;

      const renderedCard = (
        <Card className={cn("border-l-2 border-l-emerald-500/50 border-emerald-500/15 bg-emerald-500/[0.03] overflow-hidden", className)}>
          <CardContent className="px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="flex items-start gap-2.5">
              <RuneCodeLogo size={18} className="mt-[3px] flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0 overflow-hidden">
                {msg.content && Array.isArray(msg.content) &&
                  msg.content.map((content: any, idx: number) => {
                    if (content.type === "text") {
                      const raw = typeof content.text === "string"
                        ? content.text
                        : content.text?.text || JSON.stringify(content.text || content);
                      const { notifications, cleanContent } = parseTaskNotifications(raw);
                      const textContent = stripMetadataTags(cleanContent);
                      if (!textContent && notifications.length === 0) return null;
                      renderedSomething = true;
                      return (
                        <div key={idx}>
                          {notifications.map((n, i) => (
                            <TaskNotificationWidget key={`notif-${i}`} {...n} />
                          ))}
                          {textContent && <MarkdownContent text={textContent} />}
                        </div>
                      );
                    }

                    if (content.type === "thinking") {
                      renderedSomething = true;
                      return (
                        <ThinkingBlock key={idx} idx={idx} thinking={content.thinking || ""} signature={content.signature} />
                      );
                    }

                    if (content.type === "tool_use") {
                      return (
                        <ToolUseBlock
                          key={idx}
                          idx={idx}
                          content={content}
                          toolResult={getToolResult(content.id)}
                          onRendered={() => { renderedSomething = true; }}
                        />
                      );
                    }

                    return null;
                  })}
              </div>
            </div>
          </CardContent>
        </Card>
      );

      if (!renderedSomething) return null;
      return renderedCard;
    }

    // ── User ───────────────────────────────────────────────────────────────

    if (message.type === "user") {
      if (message.isMeta) return null;
      const msg = message.message || message;
      let renderedSomething = false;

      const renderedCard = (
        <Card className={cn("border-l-2 border-l-blue-500/50 border-blue-500/15 bg-blue-500/[0.03] overflow-hidden", className)}>
          <CardContent className="px-3 py-3 sm:px-4 sm:py-3.5">
            <div className="flex items-start gap-2.5">
              <User className="h-[18px] w-[18px] text-blue-600 dark:text-blue-400 mt-[3px] flex-shrink-0" />
              <div className="flex-1 space-y-2 min-w-0 overflow-hidden break-words">
                {/* String content */}
                {(typeof msg.content === "string" || (msg.content && !Array.isArray(msg.content))) &&
                  (() => {
                    const contentStr = typeof msg.content === "string" ? msg.content : String(msg.content);
                    if (!contentStr.trim()) return null;
                    renderedSomething = true;

                    const commandMatch = contentStr.match(
                      /<command-name>(.+?)<\/command-name>[\s\S]*?<command-message>(.+?)<\/command-message>[\s\S]*?<command-args>(.*?)<\/command-args>/
                    );
                    if (commandMatch) {
                      const [, commandName, commandMessage, commandArgs] = commandMatch;
                      return (
                        <CommandWidget
                          commandName={commandName.trim()}
                          commandMessage={commandMessage.trim()}
                          commandArgs={commandArgs?.trim()}
                        />
                      );
                    }

                    const stdoutMatch = contentStr.match(
                      /<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/
                    );
                    if (stdoutMatch)
                      return <CommandOutputWidget output={stdoutMatch[1]} onLinkDetected={onLinkDetected} />;

                    const { notifications, cleanContent } = parseTaskNotifications(contentStr);
                    const displayContent = stripMetadataTags(cleanContent);
                    if (notifications.length > 0 || displayContent) {
                      return (
                        <div>
                          {notifications.map((n, i) => (
                            <TaskNotificationWidget key={`user-notif-${i}`} {...n} />
                          ))}
                          {displayContent && <div className="text-sm break-words">{displayContent}</div>}
                        </div>
                      );
                    }
                    return <div className="text-sm break-words">{contentStr}</div>;
                  })()}

                {/* Array content */}
                {Array.isArray(msg.content) &&
                  msg.content.map((content: any, idx: number) => {
                    if (content.type === "tool_result") {
                      return (
                        <ToolResultBlock
                          key={idx}
                          content={content}
                          idx={idx}
                          streamMessages={streamMessages}
                          onRendered={() => { renderedSomething = true; }}
                        />
                      );
                    }

                    if (content.type === "text") {
                      const textContent = typeof content.text === "string"
                        ? content.text
                        : content.text?.text || JSON.stringify(content.text);
                      renderedSomething = true;
                      return <div key={idx} className="text-sm break-words">{textContent}</div>;
                    }

                    return null;
                  })}
              </div>
            </div>
          </CardContent>
        </Card>
      );

      if (!renderedSomething) return null;
      return renderedCard;
    }

    // ── Result ─────────────────────────────────────────────────────────────

    if (message.type === "result") {
      const isError = message.is_error || message.subtype?.includes("error");
      return (
        <Card className={cn(isError ? "border-destructive/20 bg-destructive/5" : "border-green-500/20 bg-green-500/5", className)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              {isError ? (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5" />
              )}
              <div className="flex-1 space-y-2">
                <h4 className="font-semibold text-sm">
                  {isError ? "Execution Failed" : "Execution Complete"}
                </h4>
                {message.result && (() => {
                  const { notifications, cleanContent } = parseTaskNotifications(message.result);
                  const displayContent = stripMetadataTags(cleanContent);
                  return (
                    <>
                      {notifications.map((n, i) => (
                        <TaskNotificationWidget key={`result-notif-${i}`} {...n} />
                      ))}
                      {displayContent && (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || "");
                                return !inline && match ? (
                                  <ShikiCodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />
                                ) : (
                                  <code className={className} {...props}>{children}</code>
                                );
                              },
                            }}
                          >
                            {displayContent}
                          </ReactMarkdown>
                        </div>
                      )}
                    </>
                  );
                })()}
                {message.error && <div className="text-sm text-destructive">{message.error}</div>}
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {(message.cost_usd !== undefined || message.total_cost_usd !== undefined) && (
                    <div>Cost: ${((message.cost_usd || message.total_cost_usd)!).toFixed(4)} USD</div>
                  )}
                  {message.duration_ms !== undefined && (
                    <div>Duration: {(message.duration_ms / 1000).toFixed(2)}s</div>
                  )}
                  {message.num_turns !== undefined && <div>Turns: {message.num_turns}</div>}
                  {message.usage && (
                    <div>
                      Total tokens: {message.usage.input_tokens + message.usage.output_tokens}{" "}
                      ({message.usage.input_tokens} in, {message.usage.output_tokens} out)
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      );
    }

    return null;
  } catch (error) {
    console.error("Error rendering stream message:", error, message);
    return (
      <Card className={cn("border-destructive/20 bg-destructive/5", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Error rendering message</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
};

export { CollapsibleToolOutput };
export default StreamMessageComponent;
export { StreamMessageComponent };
// Named alias for backwards compatibility
export { StreamMessageComponent as StreamMessage };
