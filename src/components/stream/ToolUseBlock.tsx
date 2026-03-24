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
    input?: any;
  };
  toolResult: any;
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
    ? input.command.substring(0, 80)
    : input?.file_path
    ? input.file_path
    : input?.pattern
    ? `pattern: ${input.pattern}`
    : input?.query
    ? input.query
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
  input: any;
  toolResult: any;
  onRendered: () => void;
}): React.ReactNode {
  // Task tool — sub-agent tasks
  if (toolName === "task" && input) {
    onRendered();
    return (
      <TaskWidget
        description={input.description}
        prompt={input.prompt}
        result={toolResult}
      />
    );
  }

  // Edit tool
  if (toolName === "edit" && input?.file_path) {
    onRendered();
    return <EditWidget {...input} result={toolResult} />;
  }

  // MultiEdit tool
  if (toolName === "multiedit" && input?.file_path && input?.edits) {
    onRendered();
    return <MultiEditWidget {...input} result={toolResult} />;
  }

  // MCP tools
  if (contentName?.startsWith("mcp__")) {
    onRendered();
    return <MCPWidget toolName={contentName} input={input} result={toolResult} />;
  }

  // TodoWrite
  if (toolName === "todowrite" && input?.todos) {
    onRendered();
    return <TodoWidget todos={input.todos} result={toolResult} />;
  }

  // TodoRead
  if (toolName === "todoread") {
    onRendered();
    return <TodoReadWidget todos={input?.todos} result={toolResult} />;
  }

  // LS
  if (toolName === "ls" && input?.path) {
    onRendered();
    return <LSWidget path={input.path} result={toolResult} />;
  }

  // Read
  if (toolName === "read" && input?.file_path) {
    onRendered();
    return <ReadWidget filePath={input.file_path} result={toolResult} />;
  }

  // Glob
  if (toolName === "glob" && input?.pattern) {
    onRendered();
    return <GlobWidget pattern={input.pattern} result={toolResult} />;
  }

  // Bash
  if (toolName === "bash" && input?.command) {
    onRendered();
    return (
      <BashWidget
        command={input.command}
        description={input.description}
        result={toolResult}
      />
    );
  }

  // Write
  if (toolName === "write" && input?.file_path && input?.content) {
    onRendered();
    return (
      <WriteWidget
        filePath={input.file_path}
        content={input.content}
        result={toolResult}
      />
    );
  }

  // Grep
  if (toolName === "grep" && input?.pattern) {
    onRendered();
    return (
      <GrepWidget
        pattern={input.pattern}
        include={input.include}
        path={input.path}
        exclude={input.exclude}
        result={toolResult}
      />
    );
  }

  // WebSearch
  if (toolName === "websearch" && input?.query) {
    onRendered();
    return <WebSearchWidget query={input.query} result={toolResult} />;
  }

  // WebFetch
  if (toolName === "webfetch" && input?.url) {
    onRendered();
    return <WebFetchWidget url={input.url} prompt={input.prompt} result={toolResult} />;
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
          {input.name && (
            <span className="text-muted-foreground/60 font-mono">
              {input.name}
            </span>
          )}
          {input.team_name && (
            <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-purple-500/15 text-purple-400 font-mono">
              team: {input.team_name}
            </span>
          )}
        </div>
        {input.description && (
          <p className="text-[11px] text-muted-foreground/70 pl-5.5">
            {input.description}
          </p>
        )}
        {input.model && (
          <span className="text-[9px] text-muted-foreground/40 pl-5.5 font-mono">
            model: {input.model}
          </span>
        )}
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
          {input.to && (
            <>
              <span className="text-muted-foreground/30">→</span>
              <span className="font-mono text-purple-400/70">{input.to}</span>
            </>
          )}
        </div>
        {input.content && (
          <p className="text-[11px] text-muted-foreground/70 pl-5.5 whitespace-pre-wrap">
            {typeof input.content === "string"
              ? input.content.slice(0, 300)
              : JSON.stringify(input.content).slice(0, 300)}
          </p>
        )}
      </div>
    );
  }

  // Skill tool
  if (toolName === "skill") {
    onRendered();
    return <SkillBadgeWidget skillName={input?.skill || "unknown"} />;
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
