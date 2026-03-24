/**
 * DockerSection — Docker container selector and creator for the AddEnvironmentForm.
 * Extracted from EnvironmentsSettings.tsx to keep that file under 500 lines.
 */

import { useState, useEffect } from 'react';
import { applyStartupToken } from '@/lib/startupToken';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface DockerSectionProps {
  dockerContainer: string;
  setDockerContainer: (v: string) => void;
  dockerImage?: string;
  setDockerImage: (v: string) => void;
}

export function DockerSection({ dockerContainer, setDockerContainer, setDockerImage }: DockerSectionProps) {
  const [dockerStatus, setDockerStatus] = useState<{ running: boolean; version?: string; containers: any[] } | null>(null);
  const [loadingDocker, setLoadingDocker] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newImage, setNewImage] = useState('ubuntu:22.04');
  const [showCreate, setShowCreate] = useState(false);
  const [createStatus, setCreateStatus] = useState('');
  const [installingClaude, setInstallingClaude] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/docker/status', { headers: applyStartupToken({}) });
        if (res.ok) setDockerStatus(await res.json());
      } catch {}
      setLoadingDocker(false);
    })();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim() || !newImage.trim()) return;
    setCreating(true);
    setCreateStatus('Creating container...');
    try {
      const res = await fetch('/api/docker/create', {
        method: 'POST',
        headers: applyStartupToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ name: newName.trim(), image: newImage.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setDockerContainer(data.name);
        setDockerImage(newImage.trim());
        setCreateStatus(data.claudeInstalled ? 'Created with Claude Code!' : 'Created (Claude Code install failed — you can install manually)');
        setShowCreate(false);
        const statusRes = await fetch('/api/docker/status', { headers: applyStartupToken({}) });
        if (statusRes.ok) setDockerStatus(await statusRes.json());
      } else {
        setCreateStatus(`Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setCreateStatus(`Error: ${err.message}`);
    }
    setCreating(false);
  };

  const handleInstallClaude = async (containerName: string) => {
    setInstallingClaude(containerName);
    try {
      const res = await fetch('/api/docker/install-claude', {
        method: 'POST',
        headers: applyStartupToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ container: containerName }),
      });
      const data = await res.json();
      if (data.alreadyInstalled) { setInstallingClaude(null); return; }
      if (!data.success) console.error('Claude install failed:', data.error);
    } catch (err) {
      console.error('[DockerSection] Failed to install Claude in container:', err);
    }
    setInstallingClaude(null);
  };

  if (loadingDocker) {
    return <div className="text-xs text-muted-foreground/40 py-2">Checking Docker...</div>;
  }

  if (!dockerStatus?.running) {
    return (
      <div className="space-y-3">
        <div className="p-2.5 rounded-md bg-amber-500/5 border border-amber-500/15 text-[10px] text-amber-400/70">
          Docker is not running. Start Docker to connect to containers.
        </div>
        <div className="space-y-1.5">
          <Label className="text-[11px] text-muted-foreground/60">Container Name or ID (manual)</Label>
          <Input value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} placeholder="my-dev-container" className="h-8 text-xs font-mono" />
        </div>
      </div>
    );
  }

  const runningContainers = dockerStatus.containers.filter((c: any) => c.state === 'running');
  const stoppedContainers = dockerStatus.containers.filter((c: any) => c.state !== 'running');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[10px] text-emerald-400/60">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Docker {dockerStatus.version} — {runningContainers.length} running
      </div>

      {runningContainers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground/60">Running containers</Label>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {runningContainers.map((c: any) => (
              <div key={c.id} className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-[10px] transition-colors",
                dockerContainer === c.name
                  ? "bg-primary/10 border border-primary/30 text-primary"
                  : "hover:bg-muted/30 border border-transparent"
              )}>
                <button
                  onClick={() => { setDockerContainer(c.name); setDockerImage(c.image); }}
                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="font-mono font-medium truncate">{c.name}</span>
                  <span className="text-muted-foreground/40 truncate flex-1">{c.image}</span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleInstallClaude(c.name); }}
                  disabled={installingClaude === c.name}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
                  title="Install Claude Code in this container"
                >
                  {installingClaude === c.name ? '...' : 'Install Claude'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stoppedContainers.length > 0 && (
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground/40">Stopped</Label>
          <div className="space-y-0.5 max-h-20 overflow-y-auto">
            {stoppedContainers.map((c: any) => (
              <button
                key={c.id}
                onClick={() => { setDockerContainer(c.name); setDockerImage(c.image); }}
                className={cn(
                  "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[10px] opacity-50 transition-colors",
                  dockerContainer === c.name ? "bg-primary/10 border border-primary/30 opacity-100" : "hover:bg-muted/30 border border-transparent"
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                <span className="font-mono font-medium truncate">{c.name}</span>
                <span className="text-muted-foreground/30 truncate flex-1">{c.image}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!showCreate ? (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full py-1.5 rounded-md border border-dashed border-border/30 text-[10px] text-muted-foreground/50 hover:text-foreground hover:border-border/50 transition-colors"
        >
          + Create new container
        </button>
      ) : (
        <div className="p-3 rounded-md border border-primary/20 bg-primary/[0.02] space-y-2">
          <Label className="text-[11px] font-medium">Create Container</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/50">Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="claude-dev" className="h-7 text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground/50">Image</Label>
              <Input value={newImage} onChange={e => setNewImage(e.target.value)} placeholder="ubuntu:22.04" className="h-7 text-xs font-mono" />
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground/40">
            Creates a container and auto-installs Node.js + Claude Code. This may take a minute.
          </p>
          <div className="flex gap-1.5 items-center">
            <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()} className="text-[10px] h-7">
              {creating ? 'Creating & Installing...' : 'Create'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)} className="text-[10px] h-7 text-muted-foreground">
              Cancel
            </Button>
            {createStatus && <span className="text-[9px] text-muted-foreground/50">{createStatus}</span>}
          </div>
        </div>
      )}

      <div className="space-y-1.5 pt-1 border-t border-border/10">
        <Label className="text-[11px] text-muted-foreground/40">Or enter manually</Label>
        <Input value={dockerContainer} onChange={e => setDockerContainer(e.target.value)} placeholder="container-name" className="h-7 text-xs font-mono" />
      </div>
    </div>
  );
}
