import { useState, useEffect } from "react";
import {
  Activity,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";

interface LiveContextSectionProps {
  projectPath: string;
  envFilesDetected?: string[];
}

/**
 * Fetches the current git branch for a project path by calling the web server.
 * Falls back to null on any error.
 */
async function fetchGitBranch(projectPath: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/project-info?path=${encodeURIComponent(projectPath)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.gitBranch ?? data.git_branch ?? null;
  } catch {
    return null;
  }
}

export function LiveContextSection({
  projectPath,
  envFilesDetected,
}: LiveContextSectionProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [gitBranch, setGitBranch] = useState<string | null>(null);

  // Fetch git branch when projectPath changes
  useEffect(() => {
    if (!projectPath) {
      setGitBranch(null);
      return;
    }

    let cancelled = false;

    fetchGitBranch(projectPath).then((branch) => {
      if (!cancelled) setGitBranch(branch);
    });

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

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
            </div>
          )}

          {/* Env files warning */}
          {envFilesDetected && envFilesDetected.length > 0 && (
            <div className="flex items-start gap-1.5 text-xs text-yellow-400 bg-yellow-500/10 rounded p-2">
              <Shield className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Plaintext secrets detected</div>
                <div className="opacity-75">{envFilesDetected.length} .env file{envFilesDetected.length > 1 ? 's' : ''} found</div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!gitBranch && (!envFilesDetected || envFilesDetected.length === 0) && (
            <p className="text-xs text-muted-foreground">
              No live context yet
            </p>
          )}
        </div>
      )}
    </div>
  );
}
