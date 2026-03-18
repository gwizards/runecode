import { Users, Bot, Gauge, Shield } from 'lucide-react';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { cn } from '@/lib/utils';

export function TeamsSettings() {
  const { teamsEnabled, setTeamsEnabled } = useSessionConfig();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-1">Teams & Agents</h2>
        <p className="text-sm text-muted-foreground">
          Configure agent teams and sub-agent behavior.
        </p>
      </div>

      {/* Agent Teams */}
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border/30 bg-muted/5">
          <Users className="w-5 h-5 text-purple-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Agent Teams</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Allow Claude to spawn coordinated teams of agents that work together on complex tasks.
                  Teams are managed by Claude — ask it to "create a team" to get started.
                </p>
              </div>
              <ToggleSwitch enabled={teamsEnabled} onChange={setTeamsEnabled} />
            </div>
          </div>
        </div>

        {/* Agent Progress Summaries */}
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border/30 bg-muted/5">
          <Gauge className="w-5 h-5 text-cyan-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <div>
              <h3 className="text-sm font-medium">Progress Summaries</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Show AI-generated progress summaries for running sub-agents every ~30 seconds.
                Enabled by default for better visibility into long-running tasks.
              </p>
            </div>
            <div className="mt-2 px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] text-emerald-400 inline-block">
              Always enabled
            </div>
          </div>
        </div>

        {/* Default Permission Mode for Subagents */}
        <div className="flex items-start gap-3 p-4 rounded-lg border border-border/30 bg-muted/5">
          <Shield className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-sm font-medium">Sub-Agent Permissions</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Sub-agents inherit the session's permission mode. Change it in the config panel
              or per-agent in the agent creation form.
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/70">
          <div className="flex items-start gap-2">
            <Bot className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-blue-300/90 mb-1">How Agent Teams Work</p>
              <ul className="space-y-0.5 text-blue-300/60">
                <li>• Ask Claude to "create a team of agents" for parallel tasks</li>
                <li>• Claude coordinates teammates using the Agent tool</li>
                <li>• Teammates can communicate via SendMessage</li>
                <li>• Each teammate runs in its own context with shared access</li>
                <li>• The Team Dashboard shows live status when teams are active</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
        enabled ? 'bg-purple-500/60' : 'bg-muted-foreground/20'
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
          enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
        )}
      />
    </button>
  );
}
