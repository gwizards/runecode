import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, GitBranch, CircleDot, ArrowUp, ArrowDown } from 'lucide-react';

interface GitInfo {
  branch: string;
  dirty: number;
  staged: number;
  ahead: number;
  behind: number;
  hasRepo: boolean;
}

export function GitStatus({ projectPath }: { projectPath?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  const { data: git } = useQuery<GitInfo>({
    queryKey: ['git-status', projectPath],
    queryFn: async () => {
      if (!projectPath) return { branch: '', dirty: 0, staged: 0, ahead: 0, behind: 0, hasRepo: false };
      try {
        const res = await fetch(`/api/git/status?path=${encodeURIComponent(projectPath)}`);
        if (!res.ok) return { branch: '', dirty: 0, staged: 0, ahead: 0, behind: 0, hasRepo: false };
        return res.json();
      } catch {
        return { branch: '', dirty: 0, staged: 0, ahead: 0, behind: 0, hasRepo: false };
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!projectPath,
  });

  if (!git?.hasRepo) return null;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        <GitBranch className="h-3 w-3 text-muted-foreground/60" />
        {collapsed ? (
          <span className="text-[10px] text-muted-foreground font-mono truncate">{git.branch}</span>
        ) : (
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Git</h3>
        )}
        {git.dirty > 0 && (
          <span className="ml-auto text-[9px] text-amber-400">{git.dirty}M</span>
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="py-1 px-1 space-y-1">
              {/* Branch */}
              <div className="flex items-center gap-1.5 text-[10px]">
                <GitBranch className="h-2.5 w-2.5 text-purple-400/60" />
                <span className="font-mono truncate" style={{ color: 'var(--color-text-secondary)' }}>{git.branch}</span>
              </div>
              {/* Status */}
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground/60">
                {git.dirty > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-400/70">
                    <CircleDot className="h-2.5 w-2.5" /> {git.dirty} modified
                  </span>
                )}
                {git.staged > 0 && (
                  <span className="flex items-center gap-0.5 text-emerald-400/70">
                    + {git.staged} staged
                  </span>
                )}
                {git.ahead > 0 && (
                  <span className="flex items-center gap-0.5">
                    <ArrowUp className="h-2.5 w-2.5" /> {git.ahead}
                  </span>
                )}
                {git.behind > 0 && (
                  <span className="flex items-center gap-0.5">
                    <ArrowDown className="h-2.5 w-2.5" /> {git.behind}
                  </span>
                )}
                {git.dirty === 0 && git.staged === 0 && (
                  <span className="text-emerald-400/50">Clean</span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
