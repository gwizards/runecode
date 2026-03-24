import { useState, useEffect, useCallback } from 'react';
import { Folder, ArrowUp, Home, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WslFileBrowserProps {
  distro: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
  initialPath?: string;
}

export function WslFileBrowser({ distro, onSelect, onCancel, initialPath }: WslFileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || '/home');
  const [entries, setEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const { wslExecute } = await import('@/infrastructure/tauri/wsl-client');
      // List entries, one per line, with trailing slash for directories
      const result = await wslExecute(distro,
        `ls -1pa "${path}" 2>/dev/null | head -100`
      );
      const items = result.split('\n')
        .filter(line => line.trim())
        .map(line => ({
          name: line.replace(/\/$/, ''),
          isDir: line.endsWith('/'),
        }))
        .filter(item => item.name !== '.' && item.name !== '..')
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      setEntries(items);
      setCurrentPath(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [distro]);

  useEffect(() => {
    loadDirectory(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only load initial path on mount

  const navigateTo = (dirName: string) => {
    const newPath = currentPath === '/' ? `/${dirName}` : `${currentPath}/${dirName}`;
    loadDirectory(newPath);
  };

  const navigateUp = () => {
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parent);
  };

  const goHome = async () => {
    try {
      const { wslExecute } = await import('@/infrastructure/tauri/wsl-client');
      const home = (await wslExecute(distro, 'echo $HOME')).trim();
      loadDirectory(home || '/home');
    } catch {
      loadDirectory('/home');
    }
  };

  return (
    <div className="flex flex-col h-[400px] rounded-lg border border-border/30 bg-background/80 overflow-hidden">
      {/* Path bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/30 bg-muted/10">
        <Button size="sm" variant="ghost" onClick={navigateUp} className="h-7 w-7 p-0" title="Go up">
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={goHome} className="h-7 w-7 p-0" title="Go home">
          <Home className="w-3.5 h-3.5" />
        </Button>
        <code className="flex-1 text-xs font-mono text-muted-foreground truncate px-2 py-1 bg-background/50 rounded border border-border/20">
          {currentPath}
        </code>
      </div>

      {/* Directory listing */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="text-xs text-destructive p-3">{error}</div>
        ) : entries.length === 0 ? (
          <div className="text-xs text-muted-foreground p-3">Empty directory</div>
        ) : (
          entries.map(entry => (
            <button
              key={entry.name}
              onClick={() => entry.isDir ? navigateTo(entry.name) : undefined}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent/50 transition-colors text-left ${
                entry.isDir ? 'cursor-pointer' : 'opacity-50 cursor-default'
              }`}
            >
              {entry.isDir ? (
                <Folder className="w-3.5 h-3.5 text-primary shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 shrink-0" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
          ))
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/10">
        <span className="text-[10px] text-muted-foreground">WSL: {distro}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button size="sm" onClick={() => onSelect(currentPath)}>
            Select This Folder
          </Button>
        </div>
      </div>
    </div>
  );
}
