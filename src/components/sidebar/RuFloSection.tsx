import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap } from 'lucide-react';
import {
  ruFloService,
  useRuFloStore,
  swarmHealthLabel,
  type RuFloProjectStatus,
  type RuFloAgent,
} from '@/domain/ruflo';
import { onRuFloEvent, RUFLO_EVENTS } from '@/infrastructure/ruflo/browser-events-bridge';

interface RuFloSectionProps {
  projectPath: string;
}

const AGENT_EMOJI: Record<string, string> = {
  coder: '🧠', reviewer: '🔍', tester: '🧪', planner: '📋',
  researcher: '🔬', default: '🤖',
};

function agentEmoji(type: string) {
  return AGENT_EMOJI[type] ?? AGENT_EMOJI.default;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-green-400' : 'bg-zinc-500'}`} />
  );
}

export function RuFloSection({ projectPath }: RuFloSectionProps) {
  const { swarm: swarmStatus, installation, fetchInstallation, fetchSwarm, activateMcp } = useRuFloStore();
  const isInstalled: boolean | null = installation === null ? null : installation.installed;
  const [isActivating, setIsActivating] = useState(false);
  const [mcpLog, setMcpLog] = useState<{ ok: boolean; msg: string } | null>(null);
  const mcpLogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [projectStatus, setProjectStatus] = useState<RuFloProjectStatus | null>(null);
  const [isStale, setIsStale] = useState(false);
  const [isIniting, setIsIniting] = useState(false);
  const [memoryBackend, setMemoryBackend] = useState<string>('hybrid');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isConsolidating, setIsConsolidating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectPath) return;
    const projResult = await ruFloService.getProjectStatus(projectPath);
    if (!projResult.ok) {
      setIsStale(true);
    } else {
      setProjectStatus(projResult.value);
      await fetchSwarm();
      setIsStale(false);
    }
    const statsResult = await ruFloService.getMemoryStats();
    if (statsResult.ok) {
      setMemoryBackend(String(statsResult.value.backend ?? 'hybrid'));
    }
    // non-critical — ignore Err silently
  }, [projectPath, fetchSwarm]);

  // Check install status once on mount
  useEffect(() => {
    fetchInstallation();
  }, [fetchInstallation]);

  // Re-check install status when Settings triggers a ruflo status change.
  // Skip when already known to be not installed — the settings page handles
  // the install flow and will update the store directly after install completes.
  // We still need to listen when isInstalled is null (unknown) or true.
  useEffect(() => {
    if (isInstalled === false) return;
    return onRuFloEvent(RUFLO_EVENTS.STATUS_CHANGED, () => {
      fetchInstallation();
    });
  }, [fetchInstallation, isInstalled]);

  // Fetch + poll only when expanded
  useEffect(() => {
    if (!isExpanded) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isExpanded, fetchData]);

  const totalTasks = (projectStatus?.pending ?? 0) + (projectStatus?.completed ?? 0) + (projectStatus?.blocked ?? 0);
  const agentCount = swarmStatus?.agents.length ?? 0;

  if (isInstalled === null) {
    return (
      <div className="px-4 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">RuFlo</div>
        <div className="h-8 bg-white/5 rounded-lg animate-pulse" />
      </div>
    );
  }

  if (isInstalled === false) {
    return null;
  }

  return (
    <div className="px-3 py-1">
      <div className="flex items-center gap-1.5 px-1 pb-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">RuFlo</div>
        {installation && installation.installed && !installation.mcpActive && (
          <button
            onClick={async () => {
              setIsActivating(true);
              if (mcpLogTimer.current) clearTimeout(mcpLogTimer.current);
              setMcpLog(null);
              try {
                await activateMcp();
                await fetchInstallation();
                setMcpLog({ ok: true, msg: 'MCP activated' });
                mcpLogTimer.current = setTimeout(() => setMcpLog(null), 4000);
              } catch (err) {
                const msg = String(err).replace(/^Error:\s*/i, '');
                setMcpLog({ ok: false, msg });
              } finally {
                setIsActivating(false);
              }
            }}
            disabled={isActivating}
            title="Click to activate RuFlo MCP"
            className="text-[9px] text-amber-400/60 hover:text-amber-400 transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isActivating ? 'activating...' : 'MCP not registered'}
          </button>
        )}
      </div>

      {/* Subtle MCP activation log */}
      {mcpLog && (
        <div
          className={`mb-1.5 px-2 py-1 rounded text-[9px] leading-snug break-all select-text cursor-text ${
            mcpLog.ok
              ? 'text-green-400/70 bg-green-500/5'
              : 'text-red-400/80 bg-red-500/5 border border-red-500/10'
          }`}
        >
          {mcpLog.msg}
        </div>
      )}

      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
        aria-label="Toggle RuFlo panel"
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <StatusDot active={swarmStatus?.active ?? false} />
          <span className="text-xs font-medium">
            <Zap className="inline w-3 h-3 text-purple-400 mr-1" />
            RuFlo
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {agentCount} agent{agentCount !== 1 ? 's' : ''} · {totalTasks} task{totalTasks !== 1 ? 's' : ''}
          </span>
          {swarmStatus && (
            <span className={`text-[9px] px-1 rounded ${
              swarmHealthLabel(swarmStatus) === 'healthy' ? 'text-green-400/70' :
              swarmHealthLabel(swarmStatus) === 'idle' ? 'text-white/40' :
              'text-red-400/50'
            }`}>
              {swarmHealthLabel(swarmStatus)}
            </span>
          )}
          {isStale && <span className="text-[9px] text-yellow-500/70">• stale</span>}
        </div>
        <span className="text-muted-foreground/40 text-[10px]">{isExpanded ? '▴' : '▾'}</span>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Pending', value: projectStatus?.pending ?? 0, color: 'text-yellow-400' },
              { label: 'Done', value: projectStatus?.completed ?? 0, color: 'text-green-400' },
              { label: 'Blocked', value: projectStatus?.blocked ?? 0, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center bg-white/5 rounded-md py-1.5">
                <div className={`text-sm font-semibold ${color}`}>{value}</div>
                <div className="text-[9px] text-muted-foreground/50">{label}</div>
              </div>
            ))}
          </div>

          {/* Active agents */}
          {(swarmStatus?.agents.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 px-1">Active Agents</div>
              {(swarmStatus?.agents ?? []).map((agent: RuFloAgent) => (
                <div key={agent.id.toString()} className="flex items-center justify-between bg-white/5 rounded-lg px-2 py-1.5">
                  <span className="text-xs">{agentEmoji(agent.agentType)} {agent.name}</span>
                  <span className={`text-[10px] ${agent.status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Memory bar */}
          {(swarmStatus?.memoryEntries ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2 px-1">
                <span className="text-[9px] text-muted-foreground/50 w-12 flex-shrink-0">Memory</span>
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500/60 rounded-full"
                    style={{ width: `${Math.min(100, ((swarmStatus?.memoryEntries ?? 0) / 100) * 100)}%` }}
                  />
                </div>
                <span className="text-[9px] text-purple-400/70">{swarmStatus?.memoryEntries}</span>
                <span className="text-[9px] text-white/20 bg-white/5 rounded px-1">{memoryBackend}</span>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={async () => {
                setIsIniting(true);
                const result = await ruFloService.initProject(projectPath);
                if (!result.ok) {
                  console.warn('RuFlo init failed:', result.error);
                } else {
                  await fetchData();
                }
                setIsIniting(false);
              }}
              disabled={isIniting}
              className="flex-1 py-1 text-[10px] bg-purple-500/10 border border-purple-500/20 rounded-md text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              {isIniting ? '...' : 'Run Init'}
            </button>
            <button
              onClick={async () => {
                setIsSyncing(true);
                const result = await ruFloService.syncMemoryLocal(`${projectPath}/ruflo-memory-backup.json`);
                if (!result.ok) console.warn('sync failed:', result.error);
                setIsSyncing(false);
              }}
              disabled={isSyncing}
              className="flex-1 py-1 text-[10px] bg-purple-500/10 border border-purple-500/20 rounded-md text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-50"
            >
              {isSyncing ? '...' : 'Sync'}
            </button>
            <button
              onClick={async () => {
                setIsConsolidating(true);
                const result = await ruFloService.consolidateMemory();
                if (!result.ok) console.warn('consolidate failed:', result.error);
                setIsConsolidating(false);
              }}
              disabled={isConsolidating}
              className="flex-1 py-1 text-[10px] bg-white/5 rounded-md text-muted-foreground/60 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {isConsolidating ? '...' : 'Compact'}
            </button>
            <button
              onClick={async () => {
                const logPath = `${projectPath}/logs/swarm_log.txt`;
                try {
                  const { open } = await import('@tauri-apps/plugin-shell');
                  await open(logPath);
                } catch {
                  // fallback: copy path to clipboard
                  await navigator.clipboard.writeText(logPath).catch(() => {});
                }
              }}
              className="flex-1 py-1 text-[10px] bg-white/5 rounded-md text-muted-foreground/60 hover:bg-white/10 transition-colors"
            >
              View Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
