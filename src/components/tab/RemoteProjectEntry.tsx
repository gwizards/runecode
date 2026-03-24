import React from 'react';
import { Button } from '@/components/ui/button';

interface RemoteProjectEntryProps {
  envName: string;
  onSelectPath: (path: string) => void;
}

export function RemoteProjectEntry({ envName, onSelectPath }: RemoteProjectEntryProps) {
  const [path, setPath] = React.useState('');
  const [recentPaths] = React.useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('runecode-remote-recent-paths');
      return stored ? JSON.parse(stored) : [];
    } catch { return []; }
  });

  const handleGo = () => {
    const trimmed = path.trim();
    if (!trimmed) return;
    // Save to recent paths
    try {
      const recent = [trimmed, ...recentPaths.filter(p => p !== trimmed)].slice(0, 10);
      localStorage.setItem('runecode-remote-recent-paths', JSON.stringify(recent));
    } catch {}
    onSelectPath(trimmed);
  };

  return (
    <div className="px-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Open project on {envName}</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Enter the absolute path to the project directory on the remote machine.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={path}
          onChange={e => setPath(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleGo()}
          placeholder="/home/user/project"
          className="flex-1 px-3 py-2 rounded-lg border border-border/50 bg-background text-sm font-mono focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20"
          autoFocus
        />
        <Button onClick={handleGo} disabled={!path.trim()}>
          Open
        </Button>
      </div>

      {/* Common paths */}
      <div className="space-y-1">
        {['/home', '/root', '/var/www', '/opt', '/srv'].map(p => (
          <button
            key={p}
            onClick={() => setPath(p)}
            className="text-[11px] font-mono text-muted-foreground/40 hover:text-muted-foreground px-2 py-0.5 rounded hover:bg-muted/30 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Recent paths */}
      {recentPaths.length > 0 && (
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/40">Recent</span>
          {recentPaths.map(p => (
            <button
              key={p}
              onClick={() => onSelectPath(p)}
              className="w-full text-left px-3 py-2 rounded-md border border-border/20 bg-muted/5 hover:bg-muted/15 transition-colors text-xs font-mono"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/30">
        Claude Code will open in this directory. Ensure the path exists on the remote machine.
      </p>
    </div>
  );
}
