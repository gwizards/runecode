import React, { useState, useEffect, useMemo } from "react";
import {
  Terminal,
  User,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  Bot,
  MessageSquare
} from "lucide-react";
import { RuneCodeLogo } from './RuneCodeLogo';
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ShikiCodeBlock } from "./ShikiCodeBlock";
import type { ClaudeStreamMessage } from "./AgentExecution";
import {
  TodoWidget,
  TodoReadWidget,
  LSWidget,
  ReadWidget,
  ReadResultWidget,
  GlobWidget,
  BashWidget,
  WriteWidget,
  GrepWidget,
  EditWidget,
  EditResultWidget,
  MCPWidget,
  CommandWidget,
  CommandOutputWidget,
  SummaryWidget,
  MultiEditWidget,
  MultiEditResultWidget,
  SystemReminderWidget,
  SystemInitializedWidget,
  TaskWidget,
  LSResultWidget,
  ThinkingWidget,
  WebSearchWidget,
  WebFetchWidget
} from "./ToolWidgets";
import { SkillBadgeWidget } from "./widgets/SkillBadgeWidget";
import { TaskNotificationWidget } from "./widgets/TaskNotificationWidget";
import { useSessionStore } from "../stores/sessionStore";

/**
 * Collapsible wrapper for tool outputs
 */
const CollapsibleToolOutput: React.FC<{
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
        <div className="border-t border-muted-foreground/10">
          {children}
        </div>
      )}
    </div>
  );
};

/** Extract text content of an XML tag from a string */
function extractTag(content: string, tagName: string): string | null {
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`);
  const match = content.match(regex);
  return match ? match[1].trim() : null;
}

/** Parse <task-notification> blocks out of content, returning parsed objects and cleaned content */
function parseTaskNotifications(content: string): { notifications: { taskId: string; status: string; summary: string; result?: string; usage?: { totalTokens?: number; toolUses?: number; durationMs?: number } }[]; cleanContent: string } {
  const notifications: { taskId: string; status: string; summary: string; result?: string; usage?: { totalTokens?: number; toolUses?: number; durationMs?: number } }[] = [];
  const regex = /<task-notification>([\s\S]*?)<\/task-notification>/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    const block = match[1];
    const taskId = extractTag(block, 'task-id') || '';
    const status = extractTag(block, 'status') || 'unknown';
    const summary = extractTag(block, 'summary') || 'Task notification';
    const result = extractTag(block, 'result') || '';

    const usageBlock = extractTag(block, 'usage') || '';
    const totalTokens = parseInt(extractTag(usageBlock, 'total_tokens') || '0');
    const toolUses = parseInt(extractTag(usageBlock, 'tool_uses') || '0');
    const durationMs = parseInt(extractTag(usageBlock, 'duration_ms') || '0');

    notifications.push({
      taskId, status, summary, result: result || undefined,
      usage: totalTokens ? { totalTokens, toolUses, durationMs } : undefined,
    });
  }

  const cleanContent = content.replace(/<task-notification>[\s\S]*?<\/task-notification>/g, '').trim();
  const finalContent = cleanContent.replace(/Full transcript available at:.*$/gm, '').trim();

  return { notifications, cleanContent: finalContent };
}

/** Strip metadata XML tags that should not be rendered in chat */
function stripMetadataTags(content: string): string {
  return content
    .replace(/<output-file>[\s\S]*?<\/output-file>/g, '')
    .replace(/<tool-use-id>[\s\S]*?<\/tool-use-id>/g, '')
    .replace(/<usage>[\s\S]*?<\/usage>/g, '')
    .replace(/<result>[\s\S]*?<\/result>/g, '')
    .replace(/Full transcript available at:.*$/gm, '')
    .trim();
}

interface StreamMessageProps {
  message: ClaudeStreamMessage;
  className?: string;
  streamMessages: ClaudeStreamMessage[];
  onLinkDetected?: (url: string) => void;
}

/**
 * Component to render a single Claude Code stream message
 */
const StreamMessageComponent: React.FC<StreamMessageProps> = ({ message, className, streamMessages, onLinkDetected }) => {
  // Active skill tracking (hooks must be unconditional)
  const addActiveSkill = useSessionStore(state => state.addActiveSkill);
  const removeActiveSkill = useSessionStore(state => state.removeActiveSkill);

  // Detect if this message contains a Skill tool call
  const skillName = useMemo(() => {
    if (message.type !== 'assistant' || !message.message?.content || !Array.isArray(message.message.content)) return null;
    const skillContent = message.message.content.find(
      (c: any) => c.type === 'tool_use' && c.name?.toLowerCase() === 'skill'
    );
    return skillContent?.input?.skill || null;
  }, [message]);

  useEffect(() => {
    if (!skillName) return;
    addActiveSkill(skillName);
    return () => removeActiveSkill(skillName);
  }, [skillName, addActiveSkill, removeActiveSkill]);

  // State to track tool results mapped by tool call ID
  const [toolResults, setToolResults] = useState<Map<string, any>>(new Map());
  
  // Extract all tool results from stream messages
  useEffect(() => {
    const results = new Map<string, any>();
    
    // Iterate through all messages to find tool results
    streamMessages.forEach(msg => {
      if (msg.type === "user" && msg.message?.content && Array.isArray(msg.message.content)) {
        msg.message.content.forEach((content: any) => {
          if (content.type === "tool_result" && content.tool_use_id) {
            results.set(content.tool_use_id, content);
          }
        });
      }
    });
    
    setToolResults(results);
  }, [streamMessages]);
  
  // Helper to get tool result for a specific tool call ID
  const getToolResult = (toolId: string | undefined): any => {
    if (!toolId) return null;
    return toolResults.get(toolId) || null;
  };
  
  try {
    // Skip rendering for meta messages that don't have meaningful content
    if (message.isMeta && !message.leafUuid && !message.summary) {
      return null;
    }

    // Handle summary messages
    if (message.leafUuid && message.summary && message.type === "summary") {
      return <SummaryWidget summary={message.summary} leafUuid={message.leafUuid} />;
    }

    // System initialization message
    if (message.type === "system" && message.subtype === "init") {
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
    }

    // Task notification system messages (sub-agent completion)
    if (message.type === "system" && message.subtype === "task_notification") {
      return (
        <div className="rounded-md border border-cyan-500/15 bg-cyan-500/[0.03] p-3">
          <div className="flex items-center gap-2 text-xs">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium text-muted-foreground">
              Sub-agent {message.status === 'completed' ? 'completed' : 'finished'}
            </span>
            {message.task_id && (
              <span className="text-muted-foreground/40 font-mono text-[9px]">{message.task_id.slice(0, 8)}</span>
            )}
          </div>
          {message.summary && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/70 pl-5.5">{message.summary}</p>
          )}
        </div>
      );
    }

    // System info message (e.g. unsupported CLI command feedback)
    if (message.type === "system" && message.subtype === "info" && message.content) {
      return (
        <div className="border-l-2 border-l-blue-400/60 pl-3 py-1 text-sm text-muted-foreground opacity-80">
          {message.content}
        </div>
      );
    }

    // Assistant message
    if (message.type === "assistant" && message.message) {
      const msg = message.message;
      
      let renderedSomething = false;
      
      const renderedCard = (
        <Card className={cn("border-l-2 border-l-emerald-500/50 border-emerald-500/15 bg-emerald-500/[0.03]", className)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <RuneCodeLogo size={20} className="mt-0.5" />
              <div className="flex-1 space-y-2 min-w-0">
                {msg.content && Array.isArray(msg.content) && msg.content.map((content: any, idx: number) => {
                  // Text content - render as markdown
                  if (content.type === "text") {
                    // Ensure we have a string to render
                    const rawTextContent = typeof content.text === 'string'
                      ? content.text
                      : (content.text?.text || JSON.stringify(content.text || content));

                    // Parse task notifications and strip metadata tags
                    const { notifications, cleanContent: afterNotifications } = parseTaskNotifications(rawTextContent);
                    const textContent = stripMetadataTags(afterNotifications);

                    if (!textContent && notifications.length === 0) return null;
                    renderedSomething = true;
                    return (
                      <div key={idx}>
                        {notifications.map((n, i) => (
                          <TaskNotificationWidget key={`notif-${i}`} {...n} />
                        ))}
                        {textContent && (
                          <div className="prose prose-sm dark:prose-invert max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                code({ node, inline, className, children, ...props }: any) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return !inline && match ? (
                                    <ShikiCodeBlock
                                      code={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                    />
                                  ) : (
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  );
                                }
                              }}
                            >
                              {textContent}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  // Thinking content - render with ThinkingWidget
                  if (content.type === "thinking") {
                    renderedSomething = true;
                    return (
                      <div key={idx}>
                        <ThinkingWidget 
                          thinking={content.thinking || ''} 
                          signature={content.signature}
                        />
                      </div>
                    );
                  }
                  
                  // Tool use - render custom widgets based on tool name
                  if (content.type === "tool_use") {
                    const toolName = content.name?.toLowerCase();
                    const input = content.input;
                    const toolId = content.id;
                    
                    // Get the tool result if available
                    const toolResult = getToolResult(toolId);
                    
                    // Function to render the appropriate tool widget
                    const renderToolWidget = () => {
                      // Task tool - for sub-agent tasks
                      if (toolName === "task" && input) {
                        renderedSomething = true;
                        return <TaskWidget description={input.description} prompt={input.prompt} result={toolResult} />;
                      }
                      
                      // Edit tool
                      if (toolName === "edit" && input?.file_path) {
                        renderedSomething = true;
                        return <EditWidget {...input} result={toolResult} />;
                      }
                      
                      // MultiEdit tool
                      if (toolName === "multiedit" && input?.file_path && input?.edits) {
                        renderedSomething = true;
                        return <MultiEditWidget {...input} result={toolResult} />;
                      }
                      
                      // MCP tools (starting with mcp__)
                      if (content.name?.startsWith("mcp__")) {
                        renderedSomething = true;
                        return <MCPWidget toolName={content.name} input={input} result={toolResult} />;
                      }
                      
                      // TodoWrite tool
                      if (toolName === "todowrite" && input?.todos) {
                        renderedSomething = true;
                        return <TodoWidget todos={input.todos} result={toolResult} />;
                      }
                      
                      // TodoRead tool
                      if (toolName === "todoread") {
                        renderedSomething = true;
                        return <TodoReadWidget todos={input?.todos} result={toolResult} />;
                      }
                      
                      // LS tool
                      if (toolName === "ls" && input?.path) {
                        renderedSomething = true;
                        return <LSWidget path={input.path} result={toolResult} />;
                      }
                      
                      // Read tool
                      if (toolName === "read" && input?.file_path) {
                        renderedSomething = true;
                        return <ReadWidget filePath={input.file_path} result={toolResult} />;
                      }
                      
                      // Glob tool
                      if (toolName === "glob" && input?.pattern) {
                        renderedSomething = true;
                        return <GlobWidget pattern={input.pattern} result={toolResult} />;
                      }
                      
                      // Bash tool
                      if (toolName === "bash" && input?.command) {
                        renderedSomething = true;
                        return <BashWidget command={input.command} description={input.description} result={toolResult} />;
                      }
                      
                      // Write tool
                      if (toolName === "write" && input?.file_path && input?.content) {
                        renderedSomething = true;
                        return <WriteWidget filePath={input.file_path} content={input.content} result={toolResult} />;
                      }
                      
                      // Grep tool
                      if (toolName === "grep" && input?.pattern) {
                        renderedSomething = true;
                        return <GrepWidget pattern={input.pattern} include={input.include} path={input.path} exclude={input.exclude} result={toolResult} />;
                      }
                      
                      // WebSearch tool
                      if (toolName === "websearch" && input?.query) {
                        renderedSomething = true;
                        return <WebSearchWidget query={input.query} result={toolResult} />;
                      }
                      
                      // WebFetch tool
                      if (toolName === "webfetch" && input?.url) {
                        renderedSomething = true;
                        return <WebFetchWidget url={input.url} prompt={input.prompt} result={toolResult} />;
                      }

                      // Agent tool — sub-agent/team spawning
                      if (toolName === "agent" && input) {
                        renderedSomething = true;
                        return (
                          <div className="rounded-md border border-cyan-500/20 bg-cyan-500/[0.03] p-3 space-y-1.5">
                            <div className="flex items-center gap-2 text-xs">
                              <Bot className="w-3.5 h-3.5 text-cyan-400" />
                              <span className="font-medium text-cyan-300/90">
                                {input.team_name ? 'Spawning Teammate' : 'Spawning Sub-Agent'}
                              </span>
                              {input.name && (
                                <span className="text-muted-foreground/60 font-mono">{input.name}</span>
                              )}
                              {input.team_name && (
                                <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-purple-500/15 text-purple-400 font-mono">
                                  team: {input.team_name}
                                </span>
                              )}
                            </div>
                            {input.description && (
                              <p className="text-[11px] text-muted-foreground/70 pl-5.5">{input.description}</p>
                            )}
                            {input.model && (
                              <span className="text-[9px] text-muted-foreground/40 pl-5.5 font-mono">model: {input.model}</span>
                            )}
                          </div>
                        );
                      }

                      // SendMessage tool — inter-agent communication
                      if (toolName === "sendmessage" && input) {
                        renderedSomething = true;
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
                              <p className="text-[11px] text-muted-foreground/70 pl-5.5 whitespace-pre-wrap">{typeof input.content === 'string' ? input.content.slice(0, 300) : JSON.stringify(input.content).slice(0, 300)}</p>
                            )}
                          </div>
                        );
                      }

                      // Skill tool
                      if (toolName === "skill") {
                        renderedSomething = true;
                        return <SkillBadgeWidget skillName={input?.skill || 'unknown'} />;
                      }

                      // Default - return null
                      return null;
                    };
                    
                    // Render the tool widget
                    const widget = renderToolWidget();
                    if (widget) {
                      renderedSomething = true;
                      const toolDisplayName = content.name || 'Tool';
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
                    }
                    
                    // Fallback to basic tool display
                    renderedSomething = true;
                    return (
                      <div key={idx} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Terminal className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">
                            Using tool: <code className="font-mono">{content.name}</code>
                          </span>
                        </div>
                        {content.input && (
                          <div className="ml-6 p-2 bg-background rounded-md border">
                            <pre className="text-xs font-mono overflow-x-auto">
                              {JSON.stringify(content.input, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
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

    // User message - handle both nested and direct content structures
    if (message.type === "user") {
      // Don't render meta messages, which are for system use
      if (message.isMeta) return null;

      // Handle different message structures
      const msg = message.message || message;
      
      let renderedSomething = false;
      
      const renderedCard = (
        <Card className={cn("border-l-2 border-l-blue-500/50 border-blue-500/15 bg-blue-500/[0.03]", className)}>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="flex-1 space-y-2 min-w-0">
                {/* Handle content that is a simple string (e.g. from user commands) */}
                {(typeof msg.content === 'string' || (msg.content && !Array.isArray(msg.content))) && (
                  (() => {
                    const contentStr = typeof msg.content === 'string' ? msg.content : String(msg.content);
                    if (contentStr.trim() === '') return null;
                    renderedSomething = true;
                    
                    // Check if it's a command message
                    const commandMatch = contentStr.match(/<command-name>(.+?)<\/command-name>[\s\S]*?<command-message>(.+?)<\/command-message>[\s\S]*?<command-args>(.*?)<\/command-args>/);
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
                    
                    // Check if it's command output
                    const stdoutMatch = contentStr.match(/<local-command-stdout>([\s\S]*?)<\/local-command-stdout>/);
                    if (stdoutMatch) {
                      const [, output] = stdoutMatch;
                      return <CommandOutputWidget output={output} onLinkDetected={onLinkDetected} />;
                    }
                    
                    // Parse task notifications and strip metadata tags
                    const { notifications: userNotifications, cleanContent: afterUserNotifications } = parseTaskNotifications(contentStr);
                    const userDisplayContent = stripMetadataTags(afterUserNotifications);

                    if (userNotifications.length > 0 || userDisplayContent) {
                      return (
                        <div>
                          {userNotifications.map((n, i) => (
                            <TaskNotificationWidget key={`user-notif-${i}`} {...n} />
                          ))}
                          {userDisplayContent && (
                            <div className="text-sm">
                              {userDisplayContent}
                            </div>
                          )}
                        </div>
                      );
                    }

                    // Otherwise render as plain text
                    return (
                      <div className="text-sm">
                        {contentStr}
                      </div>
                    );
                  })()
                )}

                {/* Handle content that is an array of parts */}
                {Array.isArray(msg.content) && msg.content.map((content: any, idx: number) => {
                  // Tool result
                  if (content.type === "tool_result") {
                    // Skip duplicate tool_result if a dedicated widget is present
                    let hasCorrespondingWidget = false;
                    if (content.tool_use_id && streamMessages) {
                      for (let i = streamMessages.length - 1; i >= 0; i--) {
                        const prevMsg = streamMessages[i];
                        if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                          const toolUse = prevMsg.message.content.find((c: any) => c.type === 'tool_use' && c.id === content.tool_use_id);
                          if (toolUse) {
                            const toolName = toolUse.name?.toLowerCase();
                            const toolsWithWidgets = ['task','edit','multiedit','todowrite','todoread','ls','read','glob','bash','write','grep','websearch','webfetch','skill'];
                            if (toolsWithWidgets.includes(toolName) || toolUse.name?.startsWith('mcp__')) {
                              hasCorrespondingWidget = true;
                            }
                            break;
                          }
                        }
                      }
                    }

                    if (hasCorrespondingWidget) {
                      return null;
                    }
                    // Extract the actual content string
                    let contentText = '';
                    if (typeof content.content === 'string') {
                      contentText = content.content;
                    } else if (content.content && typeof content.content === 'object') {
                      // Handle object with text property
                      if (content.content.text) {
                        contentText = content.content.text;
                      } else if (Array.isArray(content.content)) {
                        // Handle array of content blocks
                        contentText = content.content
                          .map((c: any) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
                          .join('\n');
                      } else {
                        // Fallback to JSON stringify
                        contentText = JSON.stringify(content.content, null, 2);
                      }
                    }
                    
                    // Always show system reminders regardless of widget status
                    const reminderMatch = contentText.match(/<system-reminder>(.*?)<\/system-reminder>/s);
                    if (reminderMatch) {
                      const reminderMessage = reminderMatch[1].trim();
                      const beforeReminder = contentText.substring(0, reminderMatch.index || 0).trim();
                      const afterReminder = contentText.substring((reminderMatch.index || 0) + reminderMatch[0].length).trim();
                      
                      renderedSomething = true;
                      return (
                        <div key={idx} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            <span className="text-sm font-medium">Tool Result</span>
                          </div>
                          
                          {beforeReminder && (
                            <div className="ml-6 p-2 bg-background rounded-md border">
                              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                {beforeReminder}
                              </pre>
                            </div>
                          )}
                          
                          <div className="ml-6">
                            <SystemReminderWidget message={reminderMessage} />
                          </div>
                          
                          {afterReminder && (
                            <div className="ml-6 p-2 bg-background rounded-md border">
                              <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                                {afterReminder}
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    // Check if this is an Edit tool result
                    const isEditResult = contentText.includes("has been updated. Here's the result of running `cat -n`");
                    
                    if (isEditResult) {
                      renderedSomething = true;
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
                    
                    // Check if this is a MultiEdit tool result
                    const isMultiEditResult = contentText.includes("has been updated with multiple edits") || 
                                             contentText.includes("MultiEdit completed successfully") ||
                                             contentText.includes("Applied multiple edits to");
                    
                    if (isMultiEditResult) {
                      renderedSomething = true;
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
                    
                    // Check if this is an LS tool result (directory tree structure)
                    const isLSResult = (() => {
                      if (!content.tool_use_id || typeof contentText !== 'string') return false;
                      
                      // Check if this result came from an LS tool by looking for the tool call
                      let isFromLSTool = false;
                      
                      // Search in previous assistant messages for the matching tool_use
                      if (streamMessages) {
                        for (let i = streamMessages.length - 1; i >= 0; i--) {
                          const prevMsg = streamMessages[i];
                          // Only check assistant messages
                          if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                            const toolUse = prevMsg.message.content.find((c: any) => 
                              c.type === 'tool_use' && 
                              c.id === content.tool_use_id &&
                              c.name?.toLowerCase() === 'ls'
                            );
                            if (toolUse) {
                              isFromLSTool = true;
                              break;
                            }
                          }
                        }
                      }
                      
                      // Only proceed if this is from an LS tool
                      if (!isFromLSTool) return false;
                      
                      // Additional validation: check for tree structure pattern
                      const lines = contentText.split('\n');
                      const hasTreeStructure = lines.some(line => /^\s*-\s+/.test(line));
                      const hasNoteAtEnd = lines.some(line => line.trim().startsWith('NOTE: do any of the files'));
                      
                      return hasTreeStructure || hasNoteAtEnd;
                    })();
                    
                    if (isLSResult) {
                      renderedSomething = true;
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
                    
                    // Check if this is a Read tool result (contains line numbers with arrow separator)
                    const isReadResult = content.tool_use_id && typeof contentText === 'string' && 
                      /^\s*\d+→/.test(contentText);
                    
                    if (isReadResult) {
                      // Try to find the corresponding Read tool call to get the file path
                      let filePath: string | undefined;
                      
                      // Search in previous assistant messages for the matching tool_use
                      if (streamMessages) {
                        for (let i = streamMessages.length - 1; i >= 0; i--) {
                          const prevMsg = streamMessages[i];
                          // Only check assistant messages
                          if (prevMsg.type === 'assistant' && prevMsg.message?.content && Array.isArray(prevMsg.message.content)) {
                            const toolUse = prevMsg.message.content.find((c: any) => 
                              c.type === 'tool_use' && 
                              c.id === content.tool_use_id &&
                              c.name?.toLowerCase() === 'read'
                            );
                            if (toolUse?.input?.file_path) {
                              filePath = toolUse.input.file_path;
                              break;
                            }
                          }
                        }
                      }
                      
                      renderedSomething = true;
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
                    
                    // Handle empty tool results
                    if (!contentText || contentText.trim() === '') {
                      renderedSomething = true;
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
                    
                    // Parse task notifications and strip metadata from tool result
                    const { notifications: toolNotifications, cleanContent: afterToolNotifications } = parseTaskNotifications(contentText);
                    const toolDisplayText = stripMetadataTags(afterToolNotifications);

                    renderedSomething = true;
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
                  }
                  
                  // Text content
                  if (content.type === "text") {
                    // Handle both string and object formats
                    const textContent = typeof content.text === 'string' 
                      ? content.text 
                      : (content.text?.text || JSON.stringify(content.text));
                    
                    renderedSomething = true;
                    return (
                      <div key={idx} className="text-sm">
                        {textContent}
                      </div>
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

    // Result message - render with markdown
    if (message.type === "result") {
      const isError = message.is_error || message.subtype?.includes("error");
      
      return (
        <Card className={cn(
          isError ? "border-destructive/20 bg-destructive/5" : "border-green-500/20 bg-green-500/5",
          className
        )}>
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
                  const { notifications: resultNotifications, cleanContent: afterResultNotifications } = parseTaskNotifications(message.result);
                  const resultDisplayContent = stripMetadataTags(afterResultNotifications);
                  return (
                    <>
                      {resultNotifications.map((n, i) => (
                        <TaskNotificationWidget key={`result-notif-${i}`} {...n} />
                      ))}
                      {resultDisplayContent && (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code({ node, inline, className, children, ...props }: any) {
                                const match = /language-(\w+)/.exec(className || '');
                                return !inline && match ? (
                                  <ShikiCodeBlock
                                    code={String(children).replace(/\n$/, '')}
                                    language={match[1]}
                                  />
                                ) : (
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                );
                              }
                            }}
                          >
                            {resultDisplayContent}
                          </ReactMarkdown>
                        </div>
                      )}
                    </>
                  );
                })()}
                
                {message.error && (
                  <div className="text-sm text-destructive">{message.error}</div>
                )}
                
                <div className="text-xs text-muted-foreground space-y-1 mt-2">
                  {(message.cost_usd !== undefined || message.total_cost_usd !== undefined) && (
                    <div>Cost: ${((message.cost_usd || message.total_cost_usd)!).toFixed(4)} USD</div>
                  )}
                  {message.duration_ms !== undefined && (
                    <div>Duration: {(message.duration_ms / 1000).toFixed(2)}s</div>
                  )}
                  {message.num_turns !== undefined && (
                    <div>Turns: {message.num_turns}</div>
                  )}
                  {message.usage && (
                    <div>
                      Total tokens: {message.usage.input_tokens + message.usage.output_tokens} 
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

    // Skip rendering if no meaningful content
    return null;
  } catch (error) {
    // If any error occurs during rendering, show a safe error message
    console.error("Error rendering stream message:", error, message);
    return (
      <Card className={cn("border-destructive/20 bg-destructive/5", className)}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium">Error rendering message</p>
              <p className="text-xs text-muted-foreground mt-1">
                {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
};

export const StreamMessage = React.memo(StreamMessageComponent);
