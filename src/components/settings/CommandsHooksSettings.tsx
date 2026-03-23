import React, { useState, useEffect } from 'react';
import { Terminal, Webhook, Sparkles, Shield, GitBranch, TestTube, FileCode, Zap, Bug, Loader2 } from 'lucide-react';
import { SlashCommandsManager } from '@/components/SlashCommandsManager';
import { HooksEditor } from '@/components/HooksEditor';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CommandsHooksSettingsProps {
  onHooksChange?: (hasChanges: boolean, getHooks: () => any) => void;
}

interface BuiltInCommand {
  name: string;
  desc: string;
  content: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  /** When true, the command accepts user arguments via $ARGUMENTS. */
  args?: boolean;
}

const COMMANDS: BuiltInCommand[] = [
  {
    name: 'review',
    desc: 'Review current changes for bugs and security issues',
    content: 'Review the current git diff (staged and unstaged). Flag only real issues grouped by severity: critical, important, minor. Skip style nitpicks. Be concise.',
    icon: Shield, color: 'text-red-400',
  },
  {
    name: 'test',
    desc: 'Write or update tests for recent changes',
    content: 'Look at the recent git diff and write or update tests to cover the changed code. Focus on edge cases and error paths. Use the existing test framework and patterns in the project. Run the tests after.',
    icon: TestTube, color: 'text-emerald-400',
  },
  {
    name: 'commit',
    desc: 'Stage and commit with a good message',
    content: 'Review changes with git diff and git status. Stage relevant files (never .env or secrets). Write a conventional commit message explaining the "why". Create the commit. Do not push.',
    icon: GitBranch, color: 'text-blue-400',
  },
  {
    name: 'fix',
    desc: 'Debug and fix a bug',
    content: 'Debug and fix: $ARGUMENTS. Reproduce or understand the error, find the root cause (don\'t patch symptoms), implement the fix, and run relevant tests to verify.',
    icon: Bug, color: 'text-orange-400', args: true,
  },
  {
    name: 'refactor',
    desc: 'Refactor code for clarity',
    content: 'Refactor: $ARGUMENTS. Reduce complexity, extract reusable functions, improve naming, remove duplication. Keep the same external behavior. Run tests after.',
    icon: Sparkles, color: 'text-purple-400', args: true,
  },
  {
    name: 'explain',
    desc: 'Explain how code works',
    content: 'Read and explain: $ARGUMENTS. Cover what it does, how key parts work, non-obvious design decisions, and potential gotchas. Use bullet points for complex flows.',
    icon: FileCode, color: 'text-amber-400', args: true,
  },
  {
    name: 'pr',
    desc: 'Create a pull request from current branch',
    content: 'Create a pull request for the current branch. Write a clear title (under 70 chars) and description with: summary of changes, motivation, and test plan. Use gh pr create. Do not merge.',
    icon: GitBranch, color: 'text-cyan-400',
  },
  {
    name: 'optimize',
    desc: 'Optimize code for performance',
    content: 'Analyze and optimize: $ARGUMENTS. Profile if possible, identify bottlenecks, apply targeted optimizations. Measure before/after. Don\'t sacrifice readability for marginal gains.',
    icon: Zap, color: 'text-yellow-400', args: true,
  },
];

const HOOKS = [
  {
    id: 'protect-main',
    name: 'Protect main branch',
    desc: 'Block commits and pushes to main/master',
    event: 'PreToolUse', matcher: 'Bash',
    command: 'if echo "$TOOL_INPUT" | grep -qE "git (commit|push).*main|git (commit|push).*master"; then echo "BLOCKED: Use a feature branch" >&2; exit 2; fi',
    icon: Shield, color: 'text-red-400',
  },
  {
    id: 'auto-format',
    name: 'Auto-format after edits',
    desc: 'Run your formatter after Claude edits files',
    event: 'PostToolUse', matcher: 'Edit|Write',
    command: 'npx prettier --write "$TOOL_RESULT_PATH" 2>/dev/null || true',
    icon: Sparkles, color: 'text-purple-400',
  },
  {
    id: 'notify',
    name: 'Notify when done',
    desc: 'Desktop notification when Claude finishes',
    event: 'Stop', matcher: null,
    command: 'notify-send "Claude Code" "Task completed" 2>/dev/null || osascript -e \'display notification "Task completed" with title "Claude Code"\' 2>/dev/null || true',
    icon: Zap, color: 'text-amber-400',
  },
  {
    id: 'test-on-stop',
    name: 'Run tests when done',
    desc: 'Auto-run tests after Claude finishes a task',
    event: 'Stop', matcher: null,
    command: 'npm test 2>&1 | tail -20',
    icon: TestTube, color: 'text-emerald-400',
  },
  {
    id: 'lint-check',
    name: 'Lint check after edits',
    desc: 'Run eslint/tsc after file changes',
    event: 'PostToolUse', matcher: 'Edit|Write',
    command: 'npx eslint "$TOOL_RESULT_PATH" --fix 2>/dev/null || true',
    icon: FileCode, color: 'text-blue-400',
  },
];

export function CommandsHooksSettings({ onHooksChange }: CommandsHooksSettingsProps) {
  const [activeTab, setActiveTab] = useState<'recommended' | 'commands' | 'hooks'>('recommended');
  const [busy, setBusy] = useState<string | null>(null);
  // Map of name -> id for installed commands
  const [installedMap, setInstalledMap] = useState<Map<string, string>>(new Map());

  // Load installed commands
  useEffect(() => {
    (async () => {
      try {
        const list = await api.slashCommandsList();
        const map = new Map<string, string>();
        for (const c of list) map.set(c.name, c.id);
        setInstalledMap(map);
      } catch {}
    })();
  }, [activeTab]);

  const installCommand = async (cmd: typeof COMMANDS[0]) => {
    setBusy(cmd.name);
    try {
      const saved = await api.slashCommandSave('user', cmd.name, undefined, cmd.content, cmd.desc, []);
      setInstalledMap(prev => new Map([...prev, [cmd.name, saved.id]]));
    } catch {}
    setBusy(null);
  };

  const uninstallCommand = async (cmd: typeof COMMANDS[0]) => {
    const id = installedMap.get(cmd.name);
    if (!id) return;
    setBusy(cmd.name);
    try {
      await api.slashCommandDelete(id);
      setInstalledMap(prev => { const m = new Map(prev); m.delete(cmd.name); return m; });
    } catch {}
    setBusy(null);
  };

  const installAllCommands = async () => {
    setBusy('__all__');
    for (const cmd of COMMANDS) {
      if (installedMap.has(cmd.name)) continue;
      try {
        const saved = await api.slashCommandSave('user', cmd.name, undefined, cmd.content, cmd.desc, []);
        setInstalledMap(prev => new Map([...prev, [cmd.name, saved.id]]));
      } catch {}
    }
    setBusy(null);
  };

  const allInstalled = COMMANDS.every(c => installedMap.has(c.name));

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Commands & Hooks</h3>
        <p className="text-sm text-muted-foreground">
          Slash commands and event hooks for your Claude Code sessions.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        {([
          { id: 'recommended' as const, label: 'Recommended', icon: Sparkles },
          { id: 'commands' as const, label: 'Commands', icon: Terminal },
          { id: 'hooks' as const, label: 'Hooks', icon: Webhook },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              activeTab === tab.id
                ? 'bg-background shadow-sm font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Recommended */}
      {activeTab === 'recommended' && (
        <div className="space-y-5">
          {/* Commands */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-muted-foreground/60" />
                Slash Commands
              </h4>
              {!allInstalled && (
                <button
                  onClick={installAllCommands}
                  disabled={busy === '__all__'}
                  className="text-[10px] px-2 py-1 rounded-md bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 transition-colors font-medium"
                >
                  {busy === '__all__' ? 'Installing...' : 'Install All'}
                </button>
              )}
            </div>
            <div className="space-y-1">
              {COMMANDS.map(cmd => {
                const done = installedMap.has(cmd.name);
                const isBusy = busy === cmd.name || busy === '__all__';
                return (
                  <div key={cmd.name} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border/20 bg-muted/[0.03] hover:bg-muted/10 transition-colors group">
                    <cmd.icon className={cn("w-3.5 h-3.5 flex-shrink-0", cmd.color)} />
                    <code className="text-[11px] font-mono font-semibold w-16 flex-shrink-0">/{cmd.name}</code>
                    <span className="text-[11px] text-muted-foreground/60 flex-1 truncate">{cmd.desc}</span>
                    {cmd.args && <span className="text-[8px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/40 flex-shrink-0">+args</span>}
                    {done ? (
                      <button
                        onClick={() => uninstallCommand(cmd)}
                        disabled={isBusy}
                        className="text-[10px] px-2 py-0.5 rounded text-emerald-400 opacity-60 hover:opacity-100 hover:text-red-400 hover:bg-red-500/10 transition-all flex-shrink-0"
                        title="Uninstall"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Installed'}
                      </button>
                    ) : (
                      <button
                        onClick={() => installCommand(cmd)}
                        disabled={isBusy}
                        className="text-[10px] px-2 py-0.5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0"
                        title="Install"
                      >
                        {isBusy ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Install'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Hooks */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium flex items-center gap-1.5">
                <Webhook className="w-3.5 h-3.5 text-muted-foreground/60" />
                Event Hooks
              </h4>
            </div>
            <div className="space-y-1">
              {HOOKS.map(hook => (
                <div key={hook.id} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-border/20 bg-muted/[0.03] hover:bg-muted/10 transition-colors">
                  <hook.icon className={cn("w-3.5 h-3.5 flex-shrink-0", hook.color)} />
                  <span className="text-[11px] font-medium w-32 flex-shrink-0 truncate">{hook.name}</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-muted/40 text-muted-foreground/40 font-mono flex-shrink-0">{hook.event}</span>
                  {hook.matcher && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/10 text-blue-400/50 font-mono flex-shrink-0">{hook.matcher}</span>}
                  <span className="text-[11px] text-muted-foreground/40 flex-1 truncate">{hook.desc}</span>
                  <button
                    onClick={() => setActiveTab('hooks')}
                    className="text-[10px] px-2 py-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors flex-shrink-0"
                  >
                    Setup
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* How it works */}
          <div className="p-3 rounded-lg bg-muted/10 border border-border/20 text-[11px] text-muted-foreground/50 space-y-1">
            <p><strong className="text-muted-foreground/70">Commands</strong> — type <code className="font-mono bg-muted px-0.5 rounded">/name</code> in Claude Code. Saved to <code className="font-mono bg-muted px-0.5 rounded">~/.claude/commands/</code></p>
            <p><strong className="text-muted-foreground/70">Hooks</strong> — shell commands that auto-run at lifecycle events. Saved in <code className="font-mono bg-muted px-0.5 rounded">~/.claude/settings.json</code></p>
            <p>Both apply to all Claude Code sessions — RuneCode, CLI, and SSH.</p>
          </div>
        </div>
      )}

      {activeTab === 'commands' && <SlashCommandsManager />}

      {activeTab === 'hooks' && (
        <HooksEditor scope="user" hideActions={true} onChange={onHooksChange} />
      )}
    </div>
  );
}
