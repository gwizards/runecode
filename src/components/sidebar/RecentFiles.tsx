import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { applyStartupToken } from '@/lib/startupToken';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, FileText, Clock } from 'lucide-react';

interface RecentFile {
  path: string;
  project: string;
  timestamp: number;
  action: 'created' | 'modified' | 'deleted';
}

export function RecentFiles({ projectPath }: { projectPath?: string }) {
  const [collapsed, setCollapsed] = useState(true);

  const { data: files = [] } = useQuery<RecentFile[]>({
    queryKey: ['recent-files', projectPath],
    queryFn: async () => {
      if (!projectPath) return [];
      try {
        const res = await fetch(`/api/git/recent-files?path=${encodeURIComponent(projectPath)}&limit=10`, { headers: applyStartupToken({}) });
        if (!res.ok) return [];
        return res.json();
      } catch (err) {
        console.warn('[RecentFiles] Failed to fetch recent files:', err);
        return [];
      }
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!projectPath,
  });

  if (files.length === 0) return null;

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts * 1000;
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  };

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        <Clock className="h-3 w-3 text-muted-foreground/60" />
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Recent Files</h3>
        <span className="ml-auto text-[9px] text-muted-foreground/40">{files.length}</span>
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
            <div className="py-1 space-y-0.5">
              {files.map((file, i) => {
                const fileName = file.path.split('/').pop() || file.path;
                return (
                  <div key={i} className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] hover:bg-muted/30 transition-colors">
                    <FileText className={`h-2.5 w-2.5 flex-shrink-0 ${
                      file.action === 'created' ? 'text-emerald-400/60' :
                      file.action === 'deleted' ? 'text-red-400/60' : 'text-blue-400/60'
                    }`} />
                    <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>
                      {fileName}
                    </span>
                    <span className="text-[8px] text-muted-foreground/30 flex-shrink-0 font-mono">
                      {formatTime(file.timestamp)}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
