import { useEffect, useState } from 'react';
import { Monitor, Terminal, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface PlatformStepProps {
  onSelect: (mode: 'windows' | 'wsl', distro?: string) => void;
}

export function PlatformStep({ onSelect }: PlatformStepProps) {
  const [wslStatus, setWslStatus] = useState<{
    available: boolean;
    distros: { name: string; is_default: boolean; version: number; state: string }[];
    recommended_distro: string | null;
    claude_in_wsl: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDistro, setSelectedDistro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { detectWsl } = await import('@/infrastructure/tauri/wsl-client');
        const status = await detectWsl();
        setWslStatus(status);
        setSelectedDistro(status.recommended_distro);
      } catch {
        setWslStatus({ available: false, distros: [], recommended_distro: null, claude_in_wsl: false });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 py-12">
        <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        <p className="text-sm text-white/60">Detecting platform capabilities...</p>
      </div>
    );
  }

  const wslAvailable = wslStatus?.available ?? false;
  const v2Distros = wslStatus?.distros.filter((d) => d.version === 2) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Choose your development environment</h2>
        <p className="text-xs text-white/50 mt-1">
          RuneCode works best with WSL2 on Windows — full Linux compatibility for Claude Code.
        </p>
      </div>

      {/* WSL Option (recommended) */}
      <button
        onClick={() => {
          if (wslAvailable && selectedDistro) {
            onSelect('wsl', selectedDistro);
          }
        }}
        disabled={!wslAvailable}
        className={`w-full p-4 rounded-xl border text-left transition-all ${
          wslAvailable
            ? 'border-purple-500/50 bg-purple-500/10 hover:bg-purple-500/20 cursor-pointer'
            : 'border-white/10 bg-white/5 opacity-60'
        }`}
      >
        <div className="flex items-start gap-3">
          <Terminal className="w-6 h-6 text-purple-400 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">WSL2 Mode</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-semibold">
                RECOMMENDED
              </span>
            </div>
            <p className="text-xs text-white/50 mt-1">
              Run Claude Code in Linux (Ubuntu/Debian) via WSL2. Full tmux support,
              native npm/node, and better Claude Code compatibility.
            </p>
            {wslAvailable ? (
              <div className="flex items-center gap-2 mt-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs text-green-400">
                  WSL2 detected — {selectedDistro}
                  {wslStatus?.claude_in_wsl ? ' (Claude installed)' : ''}
                </span>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-xs text-yellow-400">WSL2 not detected</span>
                </div>
                <p className="text-xs text-white/40">
                  To install WSL2, open PowerShell as Administrator and run:
                </p>
                <code className="block text-xs font-mono bg-black/40 px-3 py-2 rounded text-purple-300">
                  wsl --install
                </code>
                <p className="text-xs text-white/40">
                  Then restart your computer and re-open RuneCode.
                </p>
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Windows Native Option */}
      <button
        onClick={() => onSelect('windows')}
        className="w-full p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-left transition-all cursor-pointer"
      >
        <div className="flex items-start gap-3">
          <Monitor className="w-6 h-6 text-blue-400 mt-0.5" />
          <div>
            <span className="font-medium">Windows Mode</span>
            <p className="text-xs text-white/50 mt-1">
              Run Claude Code natively on Windows. Works but with limitations:
              no tmux teammate mode, PowerShell-based terminal.
            </p>
          </div>
        </div>
      </button>

      {/* Distro picker if WSL has multiple v2 distros */}
      {wslAvailable && v2Distros.length > 1 && (
        <div className="mt-2">
          <label className="text-xs text-white/40">WSL Distribution:</label>
          <select
            className="w-full mt-1 px-3 py-2 rounded-lg border border-white/10 bg-black/40 text-sm"
            defaultValue={selectedDistro ?? undefined}
            onChange={(e) => setSelectedDistro(e.target.value)}
          >
            {v2Distros.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} {d.is_default ? '(default)' : ''} — {d.state}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
