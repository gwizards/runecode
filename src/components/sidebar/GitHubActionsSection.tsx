import { useState } from 'react';
import { applyStartupToken } from '@/lib/startupToken';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, GitBranch, ExternalLink, CheckCircle2, XCircle, Loader2, Clock, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface WorkflowRun {
  databaseId: number;
  status: string;
  conclusion: string | null;
  workflowName: string;
  headBranch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  name: string;
  elapsedSeconds?: number;
  durationSeconds?: number;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function StatusIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === 'in_progress' || status === 'queued') {
    return <Loader2 className="h-3 w-3 text-amber-400 animate-spin flex-shrink-0" />;
  }
  if (status === 'waiting') {
    return <Clock className="h-3 w-3 text-yellow-400 flex-shrink-0" />;
  }
  if (conclusion === 'success') {
    return <CheckCircle2 className="h-3 w-3 text-emerald-400 flex-shrink-0" />;
  }
  if (conclusion === 'failure') {
    return <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />;
  }
  if (conclusion === 'cancelled' || conclusion === 'skipped') {
    return <span className="h-3 w-3 flex items-center justify-center text-muted-foreground/40 flex-shrink-0">—</span>;
  }
  if (conclusion === 'action_required') {
    return <AlertTriangle className="h-3 w-3 text-amber-400 flex-shrink-0" />;
  }
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/30 flex-shrink-0" />;
}

export function GitHubActionsSection({ projectPath }: { projectPath?: string }) {
  const [collapsed, setCollapsed] = useState(false);

  const { data } = useQuery<{ runs: WorkflowRun[]; repo?: string; error?: string }>({
    queryKey: ['github-actions', projectPath],
    queryFn: async () => {
      try {
        const params = projectPath ? `?path=${encodeURIComponent(projectPath)}` : '';
        const res = await fetch(`/api/github/actions${params}`, { headers: applyStartupToken({}) });
        return res.ok ? res.json() : { runs: [] };
      } catch (err) {
        console.warn('[GitHubActionsSection] Failed to fetch actions:', err);
        return { runs: [] };
      }
    },
    refetchInterval: 15000,
    staleTime: 15000,  // Don't refetch if we have data less than 15s old (prevents rapid fetches on project switch)
    placeholderData: (prev: any) => prev, // Show previous project's data while new one loads
    enabled: !!projectPath,
  });

  const runs = data?.runs || [];
  if (runs.length === 0) return null;

  const inProgress = runs.filter(r => r.status === 'in_progress' || r.status === 'queued');
  const failed = runs.filter(r => r.conclusion === 'failure');
  const latest = runs[0];

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        {collapsed ? (
          <span className="flex items-center gap-2 text-[10px] text-muted-foreground overflow-hidden">
            <GitBranch className="h-2.5 w-2.5 shrink-0" />
            <span>Actions</span>
            {inProgress.length > 0 && (
              <span className="flex items-center gap-0.5 text-amber-400">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                {inProgress.length} running
              </span>
            )}
            {inProgress.length === 0 && failed.length > 0 && (
              <span className="flex items-center gap-0.5 text-red-400">
                <XCircle className="h-2.5 w-2.5" />
                {failed.length} failed
              </span>
            )}
            {inProgress.length === 0 && failed.length === 0 && latest && (
              <span className="flex items-center gap-0.5">
                <StatusIcon status={latest.status} conclusion={latest.conclusion} />
                <span className="truncate">{fmtTimeAgo(latest.createdAt)}</span>
              </span>
            )}
          </span>
        ) : (
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            GitHub Actions
          </h3>
        )}
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-0.5">
              {data?.repo && (
                <div className="text-[9px] text-muted-foreground/30 font-mono mb-1">{data.repo}</div>
              )}
              {runs.slice(0, 3).map(run => {
                const isActive = run.status === 'in_progress' || run.status === 'queued';
                return (
                  <a
                    key={run.databaseId}
                    href={run.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 py-1 px-1 rounded hover:bg-muted/30 transition-colors group text-[10px]"
                  >
                    <StatusIcon status={run.status} conclusion={run.conclusion} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`truncate ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground/70'}`}>
                          {run.workflowName}
                        </span>
                        <ExternalLink className="h-2 w-2 text-muted-foreground/20 group-hover:text-muted-foreground/50 shrink-0" />
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground/40">
                        <span className="font-mono truncate">{run.headBranch}</span>
                        {isActive && run.elapsedSeconds != null && (
                          <span className="text-amber-400/70 font-mono">{fmtDuration(run.elapsedSeconds)}</span>
                        )}
                        {!isActive && run.durationSeconds != null && run.durationSeconds > 0 && (
                          <span className="font-mono">{fmtDuration(run.durationSeconds)}</span>
                        )}
                        <span>{fmtTimeAgo(run.createdAt)}</span>
                      </div>
                    </div>
                  </a>
                );
              })}

              {data?.repo && (
                <a
                  href={`https://github.com/${data.repo}/actions`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors px-1 pt-1"
                >
                  <ExternalLink className="h-2.5 w-2.5" />
                  View all actions
                </a>
              )}

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
