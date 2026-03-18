import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { getAutocompleteConfig, setAutocompleteConfig, type AutocompleteProvider } from '@/hooks/useAiAutocomplete';

function SettingRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex-shrink-0 ml-4">{children}</div>
    </div>
  );
}

export function AiAutocompleteSettings() {
  const [config, setConfig] = useState(getAutocompleteConfig);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
          AI Autocomplete
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-500 border border-yellow-500/20">Experimental</span>
        </h3>
        <p className="text-sm text-muted-foreground mb-1">
          Ghost text suggestions as you type. Uses Claude Haiku by default, or a local model (Qwen3-Coder via Ollama/vLLM).
        </p>
        <p className="text-sm text-yellow-500/70 mb-4">
          When using a local model, this may use up to 600 MB of additional RAM on your system.
        </p>
      </div>

      <SettingRow
        label="Enable AI autocomplete"
        description="Show ghost text predictions as you type in the prompt input. Press Tab to accept."
      >
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => {
            setAutocompleteConfig({ enabled: v });
            setConfig(prev => ({ ...prev, enabled: v }));
          }}
        />
      </SettingRow>

      {config.enabled && (
        <>
          <SettingRow
            label="Autocomplete provider"
            description="Choose which AI model powers the suggestions"
          >
            <div className="flex gap-1">
              {([
                { id: 'haiku' as AutocompleteProvider, label: 'Claude Haiku', desc: 'Uses your Claude Code plan (~3-5s)' },
                { id: 'local' as AutocompleteProvider, label: 'Local (Qwen3)', desc: 'Requires Ollama running (~0.2s)' },
              ]).map(opt => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setAutocompleteConfig({ provider: opt.id });
                    setConfig(prev => ({ ...prev, provider: opt.id }));
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                    config.provider === opt.id
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'text-muted-foreground border-border hover:bg-muted/50'
                  }`}
                  title={opt.desc}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </SettingRow>

          {config.provider === 'haiku' && (
            <div className="rounded-md bg-muted/30 border border-border/20 p-3 text-xs text-muted-foreground space-y-1">
              <p>Claude Haiku suggestions use your Claude Code plan. Each suggestion costs a few tokens.</p>
              <p>Response time: ~3-5 seconds (SDK initialization overhead).</p>
            </div>
          )}

          {config.provider === 'local' && (
            <LocalModelSection />
          )}
        </>
      )}
    </div>
  );
}

/** Local model management — download, start, stop */
function LocalModelSection() {
  const [status, setStatus] = useState<{ running: boolean; url: string | null }>({ running: false, url: null });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/local-model/status');
        if (res.ok) setStatus(await res.json());
      } catch { /* ignore */ }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/local-model/start', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setStatus({ running: true, url: data.url });
      } else {
        setError(data.error || 'Failed to start');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await fetch('/api/local-model/stop', { method: 'POST' });
      setStatus({ running: false, url: null });
    } catch { /* ignore */ }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between py-3 border-b border-border/20">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Local model server</Label>
          <p className="text-xs text-muted-foreground">
            Qwen2.5-Coder 0.5B — everything auto-downloaded on first start
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          <span className={`flex items-center gap-1.5 text-xs ${status.running ? 'text-green-500' : 'text-muted-foreground/50'}`}>
            <span className={`w-2 h-2 rounded-full ${status.running ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/30'}`} />
            {status.running ? 'Running' : 'Stopped'}
          </span>
          {status.running ? (
            <Button variant="outline" size="sm" onClick={handleStop} className="h-7 text-xs">
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={starting} className="h-7 text-xs">
              {starting ? <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Starting...</> : 'Start'}
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md bg-muted/30 border border-border/20 p-3 text-xs text-muted-foreground space-y-1.5">
        <p>The local model runs entirely on your machine. No external services needed.</p>
        <p>On first start, the model (~400MB) and inference engine are downloaded automatically to <code className="bg-muted px-1 py-0.5 rounded font-mono">~/.runecode/</code>.</p>
        <p>Response time: ~200ms. GPU acceleration used automatically when available.</p>
      </div>
    </div>
  );
}
