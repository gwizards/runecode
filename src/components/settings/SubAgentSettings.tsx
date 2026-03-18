import { Bot, Cpu, Shield, Gauge, Clock, GitBranch, Eye, Zap, Layers } from 'lucide-react';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { cn } from '@/lib/utils';

export function SubAgentSettings() {
  const {
    subAgentDefaultModel, setSubAgentDefaultModel,
    subAgentDefaultPermissionMode, setSubAgentDefaultPermissionMode,
    subAgentProgressSummaries, setSubAgentProgressSummaries,
    subAgentMaxTurns, setSubAgentMaxTurns,
    subAgentDefaultIsolation, setSubAgentDefaultIsolation,
    subAgentAutoCollapse, setSubAgentAutoCollapse,
  } = useSessionConfig();

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Bot className="w-5 h-5 text-cyan-400" />
          Sub-Agent Defaults
        </h2>
        <p className="text-sm text-muted-foreground">
          Configure default behavior for sub-agents spawned during sessions.
          These apply when Claude uses the Agent tool to delegate tasks.
          Individual agents can override these via their <code className="text-xs bg-muted px-1 py-0.5 rounded font-mono">.md</code> frontmatter.
        </p>
        <div className="mt-2 px-2.5 py-1.5 rounded-md bg-amber-500/5 border border-amber-500/15 text-[11px] text-amber-400/80 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 flex-shrink-0" />
          Sub-agent prompts use ~3-5x more tokens on average than a normal prompt due to parallel context windows.
        </div>
      </div>

      {/* ─── Model ─── */}
      <SettingsCard
        icon={Cpu}
        iconColor="text-blue-400"
        title="Default Model"
        description="Which model sub-agents use by default. 'Inherit' uses the parent session's model."
      >
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            { id: 'inherit', label: 'Inherit', desc: 'Same as parent session' },
            { id: 'sonnet', label: 'Sonnet', desc: 'Fast, capable' },
            { id: 'opus', label: 'Opus', desc: 'Most powerful' },
            { id: 'haiku', label: 'Haiku', desc: 'Fastest, lightweight' },
          ].map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setSubAgentDefaultModel(id)}
              title={desc}
              className={cn(
                'px-3 py-1.5 rounded-md border text-xs font-medium transition-all',
                subAgentDefaultModel === id
                  ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                  : 'border-border/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground/50">
          Tip: Use Haiku for fast exploration tasks and Opus for complex reasoning tasks.
        </p>
      </SettingsCard>

      {/* ─── Permission Mode ─── */}
      <SettingsCard
        icon={Shield}
        iconColor="text-amber-400"
        title="Default Permission Mode"
        description="Controls what sub-agents can do without asking. 'Inherit' uses the parent session's mode."
      >
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[
            { id: 'inherit', label: 'Inherit', desc: 'Same as parent session' },
            { id: 'default', label: 'Ask', desc: 'Ask before every action' },
            { id: 'acceptEdits', label: 'Auto-Edit', desc: 'Auto-approve file edits' },
            { id: 'plan', label: 'Plan Only', desc: 'Read-only, no modifications' },
            { id: 'bypassPermissions', label: 'Full Access', desc: 'No permission prompts' },
          ].map(({ id, label, desc }) => (
            <button
              key={id}
              onClick={() => setSubAgentDefaultPermissionMode(id)}
              title={desc}
              className={cn(
                'px-3 py-1.5 rounded-md border text-xs font-medium transition-all',
                subAgentDefaultPermissionMode === id
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                  : 'border-border/30 text-muted-foreground hover:border-border/60 hover:bg-muted/30'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {subAgentDefaultPermissionMode === 'bypassPermissions' && (
          <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-[10px] text-red-400 flex items-center gap-1.5">
            <Shield className="w-3 h-3 flex-shrink-0" />
            Full Access allows sub-agents to execute any tool without approval. Use with caution.
          </div>
        )}
      </SettingsCard>

      {/* ─── Max Turns ─── */}
      <SettingsCard
        icon={Clock}
        iconColor="text-violet-400"
        title="Max Turns per Sub-Agent"
        description="Limit how many turns each sub-agent can take before it must return. Prevents runaway agents. 0 = unlimited."
      >
        <div className="flex items-center gap-3 mt-2">
          <input
            type="number"
            min={0}
            max={200}
            value={subAgentMaxTurns}
            onChange={(e) => setSubAgentMaxTurns(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-20 px-2 py-1.5 rounded-md border border-border/30 bg-background text-sm font-mono text-center focus:border-violet-500/50 focus:outline-none"
          />
          <span className="text-xs text-muted-foreground">turns</span>
          <div className="flex gap-1">
            {[0, 10, 25, 50].map((val) => (
              <button
                key={val}
                onClick={() => setSubAgentMaxTurns(val)}
                className={cn(
                  'px-2 py-1 rounded text-[10px] font-mono transition-all',
                  subAgentMaxTurns === val
                    ? 'bg-violet-500/15 text-violet-400 border border-violet-500/30'
                    : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30'
                )}
              >
                {val === 0 ? '∞' : val}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">
          Recommended: 25 for most tasks. Complex refactors may need 50+.
        </p>
      </SettingsCard>

      {/* ─── Worktree Isolation ─── */}
      <SettingsCard
        icon={GitBranch}
        iconColor="text-emerald-400"
        title="Default Worktree Isolation"
        description="Run sub-agents in isolated git worktrees by default. Each agent gets its own copy of the repo, preventing conflicts between parallel agents."
      >
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <ToggleSwitch enabled={subAgentDefaultIsolation} onChange={setSubAgentDefaultIsolation} color="emerald" />
            <span className="text-xs text-muted-foreground">
              {subAgentDefaultIsolation ? 'Enabled — each sub-agent works in its own worktree' : 'Disabled — sub-agents share the main working tree'}
            </span>
          </div>
        </div>
        {subAgentDefaultIsolation && (
          <div className="mt-2 p-2 rounded bg-emerald-500/5 border border-emerald-500/15 text-[10px] text-emerald-400/70">
            Worktree isolation uses more disk space but prevents file conflicts when multiple agents edit simultaneously.
            Changes are merged back when the agent completes.
          </div>
        )}
      </SettingsCard>

      {/* ─── Progress Summaries ─── */}
      <SettingsCard
        icon={Gauge}
        iconColor="text-cyan-400"
        title="Progress Summaries"
        description="Show AI-generated progress summaries for running sub-agents. Updates every ~30 seconds in the activity bar and SubAgent Tracker panel."
      >
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-2">
            <ToggleSwitch enabled={subAgentProgressSummaries} onChange={setSubAgentProgressSummaries} color="cyan" />
            <span className="text-xs text-muted-foreground">
              {subAgentProgressSummaries ? 'Showing progress summaries' : 'Progress summaries hidden'}
            </span>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/50">
          Summaries consume a small amount of extra tokens (~100 tokens per update) but give valuable insight into long-running tasks.
        </p>
      </SettingsCard>

      {/* ─── UI Behavior ─── */}
      <SettingsCard
        icon={Eye}
        iconColor="text-pink-400"
        title="Tracker Behavior"
        description="Control how the Sub-Agent Tracker panel behaves in the session view."
      >
        <div className="space-y-3 mt-2">
          <label className="flex items-center justify-between cursor-pointer">
            <div>
              <span className="text-xs font-medium">Auto-collapse completed agents</span>
              <p className="text-[10px] text-muted-foreground/50">
                Automatically collapse sub-agent cards when they finish, keeping the tracker clean.
              </p>
            </div>
            <ToggleSwitch enabled={subAgentAutoCollapse} onChange={setSubAgentAutoCollapse} color="pink" />
          </label>
        </div>
      </SettingsCard>

      {/* ─── Info box ─── */}
      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/15 text-xs text-blue-300/70">
        <div className="flex items-start gap-2">
          <Layers className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium text-blue-300/90 mb-1">How Sub-Agents Work</p>
            <ul className="space-y-0.5 text-blue-300/60">
              <li>• Claude spawns sub-agents using the <code className="font-mono text-[10px] bg-blue-500/10 px-1 rounded">Agent</code> tool for parallel or specialized tasks</li>
              <li>• Each sub-agent runs in its own context with its own conversation history</li>
              <li>• Sub-agents can run in the foreground (blocking) or background (non-blocking)</li>
              <li>• Progress is tracked via the Sub-Agent Tracker panel in the session view</li>
              <li>• Completed sub-agents return their results to the parent conversation</li>
              <li>• Per-agent settings in <code className="font-mono text-[10px] bg-blue-500/10 px-1 rounded">.md</code> frontmatter override these defaults</li>
            </ul>
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
    pink: { bg: 'bg-pink-500/60' },
    amber: { bg: 'bg-amber-500/60' },
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
