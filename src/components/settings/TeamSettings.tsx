import { Users, Crown, MessageSquare, Cpu, Shield, Zap, Layers, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { cn } from '@/lib/utils';

export function TeamSettings() {
  const {
    teamsEnabled, setTeamsEnabled,
    teamMaxConcurrentAgents, setTeamMaxConcurrentAgents,
    teamDefaultModel, setTeamDefaultModel,
    teamShowMessageLog, setTeamShowMessageLog,
    teamAutoExpandDashboard, setTeamAutoExpandDashboard,
  } = useSessionConfig();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Users className="w-5 h-5 text-purple-400" />
          Agent Teams
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure how coordinated agent teams behave. Teams are groups of agents that work together
          on complex tasks, coordinated by a team lead agent.
        </p>
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/15 text-[11px] text-amber-400/80 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Team prompts use ~5-10x more tokens on average than a normal prompt due to multiple parallel agents with inter-agent communication.
        </div>
      </div>

      {/* ─── Master Toggle ─── */}
      <div className={cn(
        'p-4 rounded-lg border transition-all',
        teamsEnabled
          ? 'border-purple-500/30 bg-purple-500/[0.04]'
          : 'border-border/30 bg-muted/5'
      )}>
        <div className="flex items-start gap-3">
          <Crown className={cn('w-5 h-5 mt-0.5 flex-shrink-0 transition-colors', teamsEnabled ? 'text-purple-400' : 'text-muted-foreground/40')} />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium flex items-center gap-2">
                  Enable Agent Teams
                  {teamsEnabled && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-purple-500/15 text-purple-400">
                      Active
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                  Allow Claude to spawn coordinated teams of agents that work in parallel on complex tasks.
                  When disabled, Claude can still use sub-agents but cannot form named teams.
                </p>
              </div>
              <ToggleSwitch enabled={teamsEnabled} onChange={setTeamsEnabled} color="purple" />
            </div>
            {teamsEnabled && (
              <div className="mt-3 p-2 rounded bg-purple-500/5 border border-purple-500/10 text-[10px] text-purple-300/70 flex items-start gap-1.5">
                <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>
                  Teams are enabled. Ask Claude to "create a team" or "split this into parallel tasks" to use them.
                  The environment variable <code className="font-mono bg-purple-500/10 px-1 rounded">CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1</code> is set.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Remaining settings — dimmed when teams disabled */}
      <div className={cn('space-y-4 transition-opacity', !teamsEnabled && 'opacity-40 pointer-events-none')}>

        {/* ─── Concurrency ─── */}
        <SettingsCard
          icon={Layers}
          iconColor="text-orange-400"
          title="Max Concurrent Teammates"
          description="Limit how many team members can run simultaneously. Prevents resource exhaustion on large teams. 0 = unlimited."
        >
          <div className="flex items-center gap-3 mt-2">
            <input
              type="number"
              min={0}
              max={20}
              value={teamMaxConcurrentAgents}
              onChange={(e) => setTeamMaxConcurrentAgents(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-20 px-2 py-1.5 rounded-md border border-border/30 bg-background text-sm font-mono text-center focus:border-orange-500/50 focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">agents</span>
            <div className="flex gap-1">
              {[0, 3, 5, 10].map((val) => (
                <button
                  key={val}
                  onClick={() => setTeamMaxConcurrentAgents(val)}
                  className={cn(
                    'px-2 py-1 rounded text-[10px] font-mono transition-all',
                    teamMaxConcurrentAgents === val
                      ? 'bg-orange-500/15 text-orange-400 border border-orange-500/30'
                      : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30'
                  )}
                >
                  {val === 0 ? '∞' : val}
                </button>
              ))}
            </div>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground/50">
            Recommended: 3-5 for most tasks. Higher values increase token usage and may hit rate limits.
          </p>
          {teamMaxConcurrentAgents > 5 && (
            <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 flex-shrink-0" />
              High concurrency may cause rate limiting on some plans. Monitor your usage.
            </div>
          )}
        </SettingsCard>

        {/* ─── Default Model ─── */}
        <SettingsCard
          icon={Cpu}
          iconColor="text-blue-400"
          title="Default Teammate Model"
          description="Which model new teammates use. 'Inherit' uses the team lead's model."
        >
          <div className="flex flex-wrap gap-1.5 mt-2">
            {[
              { id: 'inherit', label: 'Inherit', desc: 'Same as team lead' },
              { id: 'sonnet', label: 'Sonnet', desc: 'Fast, capable' },
              { id: 'opus', label: 'Opus', desc: 'Most powerful' },
              { id: 'haiku', label: 'Haiku', desc: 'Fastest, lightweight' },
            ].map(({ id, label, desc }) => (
              <button
                key={id}
                onClick={() => setTeamDefaultModel(id)}
                title={desc}
                className={cn(
                  'px-3 py-1.5 rounded-md border text-xs font-medium transition-all',
                  teamDefaultModel === id
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                    : 'border-border/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30'
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground/50">
            Tip: Use Haiku for simple parallel tasks (searching, testing) and Sonnet/Opus for complex work.
          </p>
        </SettingsCard>

        {/* ─── Dashboard Behavior ─── */}
        <SettingsCard
          icon={Users}
          iconColor="text-purple-400"
          title="Dashboard Behavior"
          description="Control how the Team Dashboard appears and behaves during sessions."
        >
          <div className="space-y-3 mt-3">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-medium">Auto-expand when teams spawn</span>
                <p className="text-[10px] text-muted-foreground/50">
                  Automatically show the Team Dashboard when a team is created.
                </p>
              </div>
              <ToggleSwitch enabled={teamAutoExpandDashboard} onChange={setTeamAutoExpandDashboard} color="purple" />
            </label>

            <div className="border-t border-border/15" />

            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="text-xs font-medium">Show inter-agent message log</span>
                <p className="text-[10px] text-muted-foreground/50">
                  Display SendMessage communications between teammates in the dashboard.
                </p>
              </div>
              <ToggleSwitch enabled={teamShowMessageLog} onChange={setTeamShowMessageLog} color="purple" />
            </label>
          </div>
        </SettingsCard>

      </div>

      {/* ─── How it works ─── */}
      <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/15 text-xs text-purple-300/70">
        <div className="flex items-start gap-2">
          <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-purple-300/90 mb-1.5">How Agent Teams Work</p>
            <div className="space-y-2 text-purple-300/60">
              <div>
                <p className="font-medium text-purple-300/70 text-[11px] mb-0.5">Spawning a Team</p>
                <p>Ask Claude to "create a team of 3 agents to review this codebase" or "split this refactor into parallel tasks". Claude decides the team structure and assigns roles.</p>
              </div>
              <div>
                <p className="font-medium text-purple-300/70 text-[11px] mb-0.5">Team Coordination</p>
                <p>The team lead (your main session) coordinates teammates via the Agent tool with <code className="font-mono text-[10px] bg-purple-500/10 px-1 rounded">team_name</code> and <code className="font-mono text-[10px] bg-purple-500/10 px-1 rounded">name</code> fields. Teammates can message each other via SendMessage.</p>
              </div>
              <div>
                <p className="font-medium text-purple-300/70 text-[11px] mb-0.5">Visibility</p>
                <p>The Team Dashboard shows all active teammates, their current task, progress summaries, and token usage in real time. The inter-agent message log shows how teammates communicate.</p>
              </div>
              <div>
                <p className="font-medium text-purple-300/70 text-[11px] mb-0.5">Lifecycle</p>
                <ul className="space-y-0.5 ml-2">
                  <li>1. Team lead spawns teammates with specific roles</li>
                  <li>2. Teammates work independently, reporting progress</li>
                  <li>3. Teammates can message each other to coordinate</li>
                  <li>4. When done, each teammate returns results to the lead</li>
                  <li>5. The lead synthesizes results and presents them to you</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Shared UI Components ─── */

function SettingsCard({ icon: Icon, iconColor, title, description, children }: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 rounded-lg border border-border/30 bg-muted/5">
      <div className="flex items-start gap-3">
        <Icon className={cn('w-4.5 h-4.5 mt-0.5 flex-shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{description}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ enabled, onChange, color = 'purple' }: { enabled: boolean; onChange: (v: boolean) => void; color?: string }) {
  const colorMap: Record<string, { bg: string }> = {
    purple: { bg: 'bg-purple-500/60' },
    cyan: { bg: 'bg-cyan-500/60' },
    emerald: { bg: 'bg-emerald-500/60' },
    orange: { bg: 'bg-orange-500/60' },
    blue: { bg: 'bg-blue-400/60' },
  };
  const { bg } = colorMap[color] || colorMap.purple;

  return (
    <button
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0',
        enabled ? bg : 'bg-muted-foreground/20'
      )}
    >
      <span className={cn(
        'inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform',
        enabled ? 'translate-x-[18px]' : 'translate-x-[3px]'
      )} />
    </button>
  );
}
