import { useState } from 'react';
import { Terminal, Monitor, RefreshCw, Download, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWslStatus } from '@/hooks/useWslStatus';
import { getPlatformMode, setPlatformMode, setWslDistro, getWslDistro, isWindowsPlatform } from '@/lib/platformMode';

export function WslSettings() {
  const { status, loading, error: _error, refresh } = useWslStatus();
  const [mode, setMode] = useState(getPlatformMode());
  const [selectedDistro, setSelectedDistro] = useState(getWslDistro() || '');
  const [installing, setInstalling] = useState(false);
  const [installResult, setInstallResult] = useState<string | null>(null);

  // Only show on Windows
  if (!isWindowsPlatform()) return null;

  const handleModeChange = (newMode: 'windows' | 'wsl') => {
    setPlatformMode(newMode);
    setMode(newMode);
    if (newMode === 'wsl') {
      const distro = selectedDistro || status?.recommended_distro || '';
      if (distro) {
        setWslDistro(distro);
        setSelectedDistro(distro);
      }
    }
  };

  const handleDistroChange = (distro: string) => {
    setSelectedDistro(distro);
    setWslDistro(distro);
  };

  const handleInstallClaude = async () => {
    if (!status?.recommended_distro) return;
    setInstalling(true);
    setInstallResult(null);
    try {
      const { installClaudeInWsl } = await import('@/infrastructure/tauri/wsl-client');
      const result = await installClaudeInWsl(status.recommended_distro);
      setInstallResult(result);
      refresh(); // Re-detect after install
    } catch (e) {
      setInstallResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Platform Mode</h3>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading} aria-label="Refresh WSL status">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => handleModeChange('wsl')}
          className={`p-3 rounded-lg border text-left text-xs ${
            mode === 'wsl' ? 'border-purple-500/50 bg-purple-500/10' : 'border-white/10 bg-white/5'
          }`}>
          <Terminal className="w-4 h-4 text-purple-400 mb-1" />
          <div className="font-medium">WSL Mode</div>
          <div className="text-white/40 mt-0.5">Recommended</div>
        </button>
        <button onClick={() => handleModeChange('windows')}
          className={`p-3 rounded-lg border text-left text-xs ${
            mode === 'windows' ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/5'
          }`}>
          <Monitor className="w-4 h-4 text-blue-400 mb-1" />
          <div className="font-medium">Windows</div>
          <div className="text-white/40 mt-0.5">Native</div>
        </button>
      </div>

      {/* WSL Status */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-white/40">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting WSL...
        </div>
      ) : status?.available ? (
        <div className="space-y-3">
          <div className="text-xs font-medium text-white/60">Installed Distributions — click to select</div>
          {status.distros.map(d => (
            <button
              key={d.name}
              onClick={() => handleDistroChange(d.name)}
              className={`w-full flex items-center justify-between p-2 rounded-lg text-xs transition-all ${
                selectedDistro === d.name
                  ? 'bg-purple-500/15 border border-purple-500/30'
                  : 'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className="flex items-center gap-2">
                <Terminal className={`w-3.5 h-3.5 ${selectedDistro === d.name ? 'text-purple-400' : 'text-white/40'}`} />
                <span className={selectedDistro === d.name ? 'text-white font-medium' : ''}>{d.name}</span>
                {d.is_default && <span className="text-[9px] px-1 py-0.5 rounded bg-white/10">default</span>}
                {selectedDistro === d.name && <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/20 text-purple-300">active</span>}
                <span className="text-white/50">WSL{d.version}</span>
              </div>
              <span className={d.state === 'Running' ? 'text-green-400' : 'text-white/50'}>
                {d.state}
              </span>
            </button>
          ))}

          {/* Claude/Node status in WSL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              {status.claude_in_wsl ? (
                <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Claude Code installed in WSL</>
              ) : (
                <><XCircle className="w-3.5 h-3.5 text-red-400" /> Claude Code not found in WSL</>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {status.node_in_wsl ? (
                <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /> Node.js available in WSL</>
              ) : (
                <><XCircle className="w-3.5 h-3.5 text-red-400" /> Node.js not found in WSL</>
              )}
            </div>
          </div>

          {/* Install Claude button */}
          {!status.claude_in_wsl && status.node_in_wsl && (
            <Button size="sm" onClick={handleInstallClaude} disabled={installing}>
              {installing ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Download className="w-3.5 h-3.5 mr-1" />}
              Install Claude Code in WSL
            </Button>
          )}
          {installResult && (
            <pre className="text-[10px] font-mono bg-black/40 p-2 rounded max-h-24 overflow-auto text-white/60">
              {installResult}
            </pre>
          )}
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-xs space-y-2">
          <p className="text-yellow-400 font-medium">WSL2 not detected</p>
          <p className="text-white/50">Install WSL2 for the best experience. Open PowerShell as Administrator:</p>
          <code className="block font-mono bg-black/40 px-2 py-1.5 rounded text-purple-300">wsl --install</code>
          <p className="text-white/40">Restart your computer after installation.</p>
        </div>
      )}
    </div>
  );
}
