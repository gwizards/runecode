import { useState, useMemo } from "react";
import {
  Activity,
  GitBranch,
  FileEdit,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface LiveContextSectionProps {
  messages: any[];
  gitBranch?: string;
  dirtyFileCount?: number;
}

function extractModifiedFiles(messages: any[]): string[] {
  const files = new Set<string>();

  for (const msg of messages) {
    if (!msg?.content) continue;

    const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
    for (const block of contents) {
      if (block?.type !== "tool_use") continue;
      const name = block.name?.toLowerCase() ?? "";
      if (name === "write" || name === "edit" || name === "multiedit") {
        const filePath =
          block.input?.file_path ?? block.input?.path ?? null;
        if (typeof filePath === "string") {
          files.add(filePath);
        }
      }
    }
  }

  return Array.from(files);
}

function extractLastError(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg?.content) continue;

    const contents = Array.isArray(msg.content) ? msg.content : [msg.content];
    for (const block of contents) {
      if (block?.type !== "tool_result") continue;
      if (block.is_error || (block.exit_code && block.exit_code !== 0)) {
        const text =
          typeof block.content === "string"
            ? block.content
            : block.content?.[0]?.text ?? "Unknown error";
        return text.length > 120 ? text.slice(0, 120) + "..." : text;
      }
    }
  }

  return null;
}

export function LiveContextSection({
  messages,
  gitBranch,
  dirtyFileCount,
}: LiveContextSectionProps) {
  const [isOpen, setIsOpen] = useState(true);

  const modifiedFiles = useMemo(() => extractModifiedFiles(messages), [messages]);
  const lastError = useMemo(() => extractLastError(messages), [messages]);

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <Activity className="h-3.5 w-3.5 flex-shrink-0" />
        Live Context
      </button>

      {isOpen && (
        <div className="px-4 pb-3 space-y-2">
          {/* Git branch */}
          {gitBranch && (
            <div className="flex items-center gap-1.5 text-sm text-foreground">
              <GitBranch className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{gitBranch}</span>
              {dirtyFileCount !== undefined && dirtyFileCount > 0 && (
                <span className="text-xs text-yellow-500 ml-auto flex-shrink-0">
                  {dirtyFileCount} dirty
                </span>
              )}
            </div>
          )}

          {/* Modified files */}
          {modifiedFiles.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                Modified Files ({modifiedFiles.length})
              </p>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {modifiedFiles.map((file) => (
                  <div
                    key={file}
                    className="flex items-center gap-1.5 text-xs text-foreground/70"
                  >
                    <FileEdit className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">
                      {file.split("/").slice(-2).join("/")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last error */}
          {lastError && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Last Error</p>
              <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 rounded px-2 py-1.5">
                <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                <span className="break-words">{lastError}</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!gitBranch && modifiedFiles.length === 0 && !lastError && (
            <p className="text-xs text-muted-foreground">
              No live context yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
