/**
 * ToolUseBlock — renders a single tool_use content block from an assistant message.
 *
 * Includes:
 *  - CollapsibleToolOutput wrapper
 *  - renderToolWidget — selects the right ToolWidget based on tool name
 */

import React, { useState } from "react";
import {
  Terminal,
  ChevronRight,
  ChevronDown,
  Bot,
  MessageSquare,
} from "lucide-react";
import {
  TodoWidget,
  TodoReadWidget,
  LSWidget,
  ReadWidget,
  GlobWidget,
  BashWidget,
  WriteWidget,
  GrepWidget,
  EditWidget,
  MCPWidget,
  TaskWidget,
  MultiEditWidget,
  WebSearchWidget,
  WebFetchWidget,
} from "../ToolWidgets";
import { SkillBadgeWidget } from "../widgets/SkillBadgeWidget";
import type { ToolResult, TodoItem } from "../widgets/types";

// ─── CollapsibleToolOutput ────────────────────────────────────────────────────

export const CollapsibleToolOutput: React.FC<{
  toolName: string;
  summary?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}> = ({ toolName, summary, children, defaultExpanded = false }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="rounded-lg border border-muted-foreground/15 overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <span className="text-xs font-medium text-muted-foreground">
          {toolName}
        </span>
        {summary && !isExpanded && (
          <span className="text-xs text-muted-foreground/70 truncate">
            — {summary}
          </span>
        )}
      </button>
      {isExpanded && (
        <div className="border-t border-muted-foreground/10 overflow-x-auto">
          {children}
        </div>
      )}
    </div>
  );
};

// ─── ToolUseBlock ─────────────────────────────────────────────────────────────

interface ToolUseBlockProps {
  content: {
    type: "tool_use";
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
  toolResult: ToolResult | null;
  idx: number;
  onRendered: () => void;
}

/**
 * Renders a single tool_use content block.
 * Calls `onRendered()` when it actually produces a widget (so the parent can
 * track `renderedSomething`).
 */
export const ToolUseBlock: React.FC<ToolUseBlockProps> = ({
  content,
  toolResult,
  idx,
  onRendered,
}) => {
  const toolName = content.name?.toLowerCase();
  const input = content.input;

  const widget = renderToolWidget({
    toolName: toolName ?? "",
    contentName: content.name ?? "",
    input,
    toolResult,
    onRendered,
  });

  if (!widget) return null;

  onRendered();

  const toolDisplayName = content.name || "Tool";
  const toolSummary = input?.command
    ? String(input.command).substring(0, 80)
    : input?.file_path
    ? String(input.file_path)
    : input?.pattern
    ? `pattern: ${String(input.pattern)}`
    : input?.query
    ? String(input.query)
    : undefined;

  return (
    <div key={idx}>
      <CollapsibleToolOutput
        toolName={toolDisplayName}
        summary={toolSummary}
        defaultExpanded={true}
      >
        {widget}
      </CollapsibleToolOutput>
    </div>
  );
};

// ─── renderToolWidget (pure function) ────────────────────────────────────────

function renderToolWidget({
  toolName,
  contentName,
  input,
  toolResult,
  onRendered,
}: {
  toolName: string;
  contentName: string;
  input: Record<string, unknown> | undefined;
  toolResult: ToolResult | null;
  onRendered: () => void;
}): React.ReactNode {
  // Task tool — sub-agent tasks
  if (toolName === "task" && input) {
    onRendered();
    return (
      <TaskWidget
        description={input.description as string | undefined}
        prompt={input.prompt as string | undefined}
        result={toolResult ?? undefined}
      />
    );
  }

  // Edit tool
  if (toolName === "edit" && input?.file_path) {
    onRendered();
    return (
      <EditWidget
        file_path={input.file_path as string}
        old_string={input.old_string as string}
        new_string={input.new_string as string}
        result={toolResult ?? undefined}
      />
    );
  }

  // MultiEdit tool
  if (toolName === "multiedit" && input?.file_path && input?.edits) {
    onRendered();
    return (
      <MultiEditWidget
        file_path={input.file_path as string}
        edits={input.edits as Array<{ old_string: string; new_string: string }>}
        result={toolResult ?? undefined}
      />
    );
  }

  // MCP tools
  if (contentName?.startsWith("mcp__")) {
    onRendered();
    return <MCPWidget toolName={contentName} input={input} result={toolResult ?? undefined} />;
  }

  // TodoWrite
  if (toolName === "todowrite" && input?.todos) {
    onRendered();
    return <TodoWidget todos={input.todos as TodoItem[]} result={toolResult ?? undefined} />;
  }

  // TodoRead
  if (toolName === "todoread") {
    onRendered();
    return <TodoReadWidget todos={input?.todos as TodoItem[] | undefined} result={toolResult ?? undefined} />;
  }

  // LS
  if (toolName === "ls" && input?.path) {
    onRendered();
    return <LSWidget path={input.path as string} result={toolResult ?? undefined} />;
  }

  // Read
  if (toolName === "read" && input?.file_path) {
    onRendered();
    return <ReadWidget filePath={input.file_path as string} result={toolResult ?? undefined} />;
  }

  // Glob
  if (toolName === "glob" && input?.pattern) {
    onRendered();
    return <GlobWidget pattern={input.pattern as string} result={toolResult ?? undefined} />;
  }

  // Bash
  if (toolName === "bash" && input?.command) {
    onRendered();
    return (
      <BashWidget
        command={input.command as string}
        description={input.description as string | undefined}
        result={toolResult ?? undefined}
      />
    );
  }

  // Write
  if (toolName === "write" && input?.file_path && input?.content) {
    onRendered();
    return (
      <WriteWidget
        filePath={input.file_path as string}
        content={input.content as string}
        result={toolResult ?? undefined}
      />
    );
  }

  // Grep
  if (toolName === "grep" && input?.pattern) {
    onRendered();
    return (
      <GrepWidget
        pattern={input.pattern as string}
        include={input.include as string | undefined}
        path={input.path as string | undefined}
        exclude={input.exclude as string | undefined}
        result={toolResult ?? undefined}
      />
    );
  }

  // WebSearch
  if (toolName === "websearch" && input?.query) {
    onRendered();
    return <WebSearchWidget query={input.query as string} result={toolResult ?? undefined} />;
  }

  // WebFetch
  if (toolName === "webfetch" && input?.url) {
    onRendered();
    return <WebFetchWidget url={input.url as string} prompt={input.prompt as string | undefined} result={toolResult ?? undefined} />;
  }

  // Agent tool — sub-agent/team spawning
  if (toolName === "agent" && input) {
    onRendered();
    return (
      <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-1.5">
        <div className="flex items-center gap-2 text-xs">
          <Bot className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-medium text-cyan-300/90">
            {input.team_name ? "Spawning Teammate" : "Spawning Sub-Agent"}
          </span>
          {input.name ? (
            <span className="text-muted-foreground/60 font-mono">
              {String(input.name)}
            </span>
          ) : null}
          {input.team_name ? (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-purple-500/15 text-purple-400 font-mono">
              team: {String(input.team_name)}
            </span>
          ) : null}
        </div>
        {input.description ? (
          <p className="text-[11px] text-muted-foreground/70 pl-5.5">
            {String(input.description)}
          </p>
        ) : null}
        {input.model ? (
          <span className="text-[9px] text-muted-foreground/40 pl-5.5 font-mono">
            model: {String(input.model)}
          </span>
        ) : null}
      </div>
    );
  }

  // SendMessage tool — inter-agent communication
  if (toolName === "sendmessage" && input) {
    onRendered();
    return (
      <div className="rounded-md border border-purple-500/20 bg-purple-500/[0.03] p-3 space-y-1">
        <div className="flex items-center gap-2 text-xs">
          <MessageSquare className="w-3.5 h-3.5 text-purple-400" />
          <span className="font-medium text-purple-300/90">Agent Message</span>
          {input.to ? (
            <>
              <span className="text-muted-foreground/30">→</span>
              <span className="font-mono text-purple-400/70">{String(input.to)}</span>
            </>
          ) : null}
        </div>
        {input.content ? (
          <p className="text-[11px] text-muted-foreground/70 pl-5.5 whitespace-pre-wrap">
            {typeof input.content === "string"
              ? (input.content as string).slice(0, 300)
              : JSON.stringify(input.content).slice(0, 300)}
          </p>
        ) : null}
      </div>
    );
  }

  // Skill tool
  if (toolName === "skill") {
    onRendered();
    return <SkillBadgeWidget skillName={(input?.skill as string) || "unknown"} />;
  }

  // Fallback — raw JSON display
  onRendered();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Terminal className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          Using tool: <code className="font-mono">{contentName}</code>
        </span>
      </div>
      {input && (
        <div className="ml-6 p-2 bg-background rounded-md border">
          <pre className="text-xs font-mono overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
