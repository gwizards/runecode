import { useState, useEffect } from 'react';
import { User, Server, Monitor, Terminal, Settings, ChevronDown } from 'lucide-react';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';

export function EnvironmentSelector() {
  const [activeAccount, setActiveAccount] = useState<{ email: string; displayName?: string } | null>(null);
  const [environments, setEnvironments] = useState<RemoteEnvironment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  // Load account info
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/accounts');
        if (res.ok) {
          const data = await res.json();
          const active = data.accounts?.find((a: any) => a.id === data.activeId);
          if (active) setActiveAccount({ email: active.email, displayName: active.displayName });
        }
      } catch {}
    })();
  }, []);

  // Load environments
  useEffect(() => {
    const load = () => {
      try {
        const stored = localStorage.getItem('runecode-remote-environments');
        const envs: RemoteEnvironment[] = stored ? JSON.parse(stored) : [];
        setEnvironments(envs.filter(e => e.enabled));
      } catch { setEnvironments([]); }
    };
    load();
    const handler = () => load();
    window.addEventListener('runecode:environments-changed', handler);
    return () => window.removeEventListener('runecode:environments-changed', handler);
  }, []);

  const selectedEnv = environments.find(e => e.id === selectedEnvId) || null;
  const displayName = activeAccount?.displayName || activeAccount?.email?.split('@')[0] || 'Not logged in';

  const typeIcon = (type: string) => {
    switch (type) {
      case 'ssh': return Terminal;
      case 'wsl': return Monitor;
      case 'docker': return Server;
      default: return Server;
    }
  };

  const handleOpenSettings = () => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'environments' } }));
  };

  return (
    <div className="relative px-3 py-2 border-b border-border/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left hover:bg-muted/30 rounded-md px-2 py-1.5 transition-colors"
      >
        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          {selectedEnv ? (
            (() => { const Icon = typeIcon(selectedEnv.type); return <Icon className="w-3 h-3 text-primary" />; })()
          ) : (
            <User className="w-3 h-3 text-primary" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-foreground/90 truncate">{displayName}</div>
          <div className="text-[9px] text-muted-foreground/50">
            {selectedEnv ? `${selectedEnv.type.toUpperCase()}: ${selectedEnv.name}` : 'Local Environment'}
          </div>
        </div>
        <ChevronDown className={`w-3 h-3 text-muted-foreground/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Environment list */}
          <div className="max-h-[200px] overflow-y-auto py-1">
            {/* Local option */}
            <button
              onClick={() => { setSelectedEnvId(null); setIsOpen(false); }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors"
            >
              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                <Monitor className="w-2.5 h-2.5 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium">Local</div>
                <div className="text-[9px] text-muted-foreground/40">This machine</div>
              </div>
              {!selectedEnvId && (
                <span className="text-[8px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono">active</span>
              )}
            </button>

            {/* Remote environments */}
            {environments.map(env => {
              const Icon = typeIcon(env.type);
              const isActive = selectedEnvId === env.id;
              return (
                <button
                  key={env.id}
                  onClick={() => { setSelectedEnvId(env.id); setIsOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/40 transition-colors"
                >
                  <div className="w-5 h-5 rounded-full bg-muted/50 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-2.5 h-2.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium truncate">{env.name}</div>
                    <div className="text-[9px] text-muted-foreground/40 uppercase">{env.type}</div>
                  </div>
                  {isActive && (
                    <span className="text-[8px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono">active</span>
                  )}
                </button>
              );
            })}

            {environments.length === 0 && (
              <div className="px-3 py-1.5 text-[9px] text-muted-foreground/30">No remote environments configured</div>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-border/30 py-1">
            <button
              onClick={handleOpenSettings}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
            >
              <Settings className="w-3 h-3" />
              Manage Environments
            </button>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
      )}
    </div>
  );
}
