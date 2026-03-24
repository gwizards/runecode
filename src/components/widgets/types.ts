/**
 * Shared types, helpers, and constants used across widget components.
 */

/**
 * Represents a tool result returned by the Claude API for a tool_use call.
 * Used across all widget components that display tool results.
 */
export interface ToolResult {
  type?: "tool_result";
  tool_use_id?: string;
  content?: string | { text?: string } | ToolResultContentItem[];
  is_error?: boolean;
  /** Some results embed a todos array directly */
  todos?: TodoItem[];
}

/** A single item inside a ToolResult content array. */
export interface ToolResultContentItem {
  type?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Represents a single TODO item used by TodoWidget and TodoReadWidget.
 */
export interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | string;
  priority?: "high" | "medium" | "low" | string;
  dependencies?: string[];
  [key: string]: unknown;
}

/**
 * Language map for syntax highlighting based on file extension.
 */
export const languageMap: Record<string, string> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  cpp: "cpp",
  c: "c",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  scala: "scala",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  xml: "xml",
  html: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  sql: "sql",
  md: "markdown",
  toml: "ini",
  ini: "ini",
  dockerfile: "dockerfile",
  makefile: "makefile"
};

/**
 * Get the syntax highlighting language for a file path.
 */
export const getLanguage = (path: string): string => {
  const ext = path.split('.').pop()?.toLowerCase();
  return languageMap[ext || ""] || "text";
};

/**
 * Extract result content string from a tool result object.
 * Many widgets share this same extraction logic.
 */
export const extractResultContent = (result: ToolResult | undefined | null): { content: string; isError: boolean } => {
  let content = '';
  let isError = false;

  if (result) {
    isError = result.is_error || false;
    if (typeof result.content === 'string') {
      content = result.content;
    } else if (result.content && typeof result.content === 'object') {
      if (!Array.isArray(result.content) && (result.content as { text?: string }).text) {
        content = (result.content as { text?: string }).text!;
      } else if (Array.isArray(result.content)) {
        content = result.content
          .map((c: ToolResultContentItem) => (typeof c === 'string' ? c : c.text || JSON.stringify(c)))
          .join('\n');
      } else {
        content = JSON.stringify(result.content, null, 2);
      }
    }
  }

  return { content, isError };
};
