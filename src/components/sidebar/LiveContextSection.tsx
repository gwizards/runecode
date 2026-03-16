import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
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
  const [collapsed, setCollapsed] = useState(true);
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

  const hasEnvWarning = envFilesDetected && envFilesDetected.length > 0;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Context
        </h3>
        {hasEnvWarning && (
          <span className="ml-auto flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-75 sidebar-notification-dot" />
            <span className="relative inline-flex rounded-full h-2 w-2 sidebar-notification-dot" />
          </span>
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-1.5">
              {/* Git branch as pill */}
              {gitBranch && (
                <div className="flex items-center gap-1.5">
                  <GitBranch className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] bg-accent/60 text-foreground/80 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-green-500 flex-shrink-0" />
                    {gitBranch}
                  </span>
                </div>
              )}

              {/* Env files warning — compact */}
              {hasEnvWarning && (
                <div className="flex items-center gap-1.5 text-[11px] text-yellow-400">
                  <Shield className="h-3 w-3 flex-shrink-0" />
                  <span className="font-medium">
                    {envFilesDetected!.length} .env file{envFilesDetected!.length > 1 ? "s" : ""} detected
                  </span>
                </div>
              )}

              {/* Empty state */}
              {!gitBranch && !hasEnvWarning && (
                <p className="text-[11px] text-muted-foreground pl-1">
                  No live context yet
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
