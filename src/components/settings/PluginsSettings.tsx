import { useState, useEffect } from 'react';
import { Blocks, RefreshCw, Loader2, ExternalLink, ChevronDown, ChevronRight, Zap, Sparkles, Search, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { applyStartupToken } from '@/lib/startupToken';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PluginInfo {
  name: string;
  displayName: string;
  marketplace: string;
  description?: string;
  version?: string;
  author?: string;
  homepage?: string;
  skills: { name: string; description: string }[];
  enabled: boolean;
  installPath?: string;
  installedAt?: string;
}

interface RecommendedPlugin {
  name: string;
  marketplace: string;
  desc: string;
  /** Badge shown when the plugin adds RuneCode-specific capability. */
  extendsRuneCode?: boolean;
}

/** Recommended plugins shown at the top */
const RECOMMENDED: RecommendedPlugin[] = [
  {
    name: 'superpowers',
    marketplace: 'claude-plugins-official',
    desc: 'Core skills library — TDD, debugging, collaboration, planning, code review, and 30+ more skills.',
    extendsRuneCode: true,
  },
  {
    name: 'ralph-loop',
    marketplace: 'claude-plugins-official',
    desc: 'Continuous self-referential AI loops for iterative development — auto-plan, execute, and refine.',
    extendsRuneCode: true,
  },
  {
    name: 'chrome-devtools-mcp',
    marketplace: 'chrome-devtools-plugins',
    desc: 'Chrome DevTools integration — reliable browser automation, debugging, and performance analysis.',
  },
  {
    name: 'github',
    marketplace: 'claude-plugins-official',
    desc: 'Official GitHub integration — PRs, issues, code search, repository management.',
  },
  {
    name: 'code-simplifier',
    marketplace: 'claude-plugins-official',
    desc: 'Auto-simplify and refine code for clarity, consistency, and maintainability.',
  },
  {
    name: 'context7',
    marketplace: 'claude-plugins-official',
    desc: 'Up-to-date library documentation lookup — prevents hallucinated APIs and outdated code.',
  },
  {
    name: 'frontend-design',
    marketplace: 'claude-plugins-official',
    desc: 'UI/UX implementation skill — design-aware frontend code generation.',
  },
  {
    name: 'pr-review-toolkit',
    marketplace: 'claude-plugins-official',
    desc: 'Comprehensive PR review agents — comments, tests, silent failures, type design analysis.',
  },
  {
    name: 'claude-md-management',
    marketplace: 'claude-plugins-official',
    desc: 'Audit, improve, and maintain CLAUDE.md project documentation files.',
  },
];

/** All available marketplace plugins (for Browse tab) */
const MARKETPLACE_PLUGINS = [
  { name: 'agent-sdk-dev', desc: 'Claude Agent SDK development toolkit' },
  { name: 'clangd-lsp', desc: 'C/C++ language server integration' },
  { name: 'claude-code-setup', desc: 'Project setup and onboarding automation' },
  { name: 'claude-md-management', desc: 'CLAUDE.md file management and auditing' },
  { name: 'code-review', desc: 'Automated code review against project guidelines' },
  { name: 'code-simplifier', desc: 'Code simplification and cleanup agent' },
  { name: 'commit-commands', desc: 'Streamlined git commit workflow commands' },
  { name: 'csharp-lsp', desc: 'C# language server integration' },
  { name: 'explanatory-output-style', desc: 'Verbose explanatory output formatting' },
  { name: 'feature-dev', desc: 'Comprehensive feature development workflow' },
  { name: 'frontend-design', desc: 'UI/UX design-aware frontend implementation' },
  { name: 'gopls-lsp', desc: 'Go language server integration' },
  { name: 'hookify', desc: 'Hook configuration helper' },
  { name: 'jdtls-lsp', desc: 'Java language server integration' },
  { name: 'kotlin-lsp', desc: 'Kotlin language server integration' },
  { name: 'learning-output-style', desc: 'Educational output style for learning' },
  { name: 'lua-lsp', desc: 'Lua language server integration' },
  { name: 'php-lsp', desc: 'PHP language server integration' },
  { name: 'plugin-dev', desc: 'Plugin development toolkit — create agents, skills, hooks' },
  { name: 'pr-review-toolkit', desc: 'PR review agents: comments, tests, type analysis' },
  { name: 'pyright-lsp', desc: 'Python language server integration (Pyright)' },
  { name: 'ralph-loop', desc: 'Continuous AI loops for iterative development' },
  { name: 'ruby-lsp', desc: 'Ruby language server integration' },
  { name: 'rust-analyzer-lsp', desc: 'Rust language server integration' },
  { name: 'security-guidance', desc: 'Security best practices and vulnerability guidance' },
  { name: 'skill-creator', desc: 'Create custom skills interactively' },
  { name: 'superpowers', desc: 'Core skills library: TDD, debugging, planning, 30+ skills' },
  { name: 'swift-lsp', desc: 'Swift language server integration' },
  { name: 'typescript-lsp', desc: 'TypeScript language server integration' },
];

export function PluginsSettings() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'installed' | 'browse'>('installed');
  const [search, setSearch] = useState('');
  const [installing, setInstalling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadPlugins = async () => {
    try {
      setLoading(true);
      const [registryRes, settingsRes] = await Promise.all([
        fetch('/api/plugins/list', { headers: applyStartupToken({}) }),
        api.getClaudeSettings(),
      ]);
      const registry = registryRes.ok ? await registryRes.json() : [];
      const enabledMap: Record<string, boolean> = settingsRes?.enabledPlugins || {};
      setPlugins(registry.map((p: any) => ({
        ...p,
        enabled: enabledMap[`${p.name}@${p.marketplace}`] === true,
      })));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadPlugins(); }, []);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); } }, [toast]);

  const togglePlugin = async (plugin: PluginInfo) => {
    const key = `${plugin.name}@${plugin.marketplace}`;
    const newEnabled = !plugin.enabled;
    setSaving(key);
    try {
      const settings = await api.getClaudeSettings();
      if (!settings.enabledPlugins) settings.enabledPlugins = {};
      if (newEnabled) settings.enabledPlugins[key] = true;
      else delete settings.enabledPlugins[key];
      await api.saveClaudeSettings(settings);
      setPlugins(prev => prev.map(p => `${p.name}@${p.marketplace}` === key ? { ...p, enabled: newEnabled } : p));
      setToast({ message: `${plugin.displayName} ${newEnabled ? 'enabled' : 'disabled'}`, type: 'success' });
    } catch {
      setToast({ message: `Failed to update ${plugin.displayName}`, type: 'error' });
    }
    setSaving(null);
  };

  const installFromMarketplace = async (name: string) => {
    setInstalling(name);
    try {
      // Use the CLI to install the plugin
      const res = await fetch('/api/exec-cli', {
        method: 'POST',
        headers: applyStartupToken({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ command: `claude plugin install ${name}` }),
      });
      if (res.ok) {
        setToast({ message: `Installing "${name}"... restart Claude Code to activate`, type: 'success' });
        setTimeout(loadPlugins, 2000);
      } else {
        setToast({ message: `Failed to install "${name}"`, type: 'error' });
      }
    } catch {
      setToast({ message: `Failed to install "${name}"`, type: 'error' });
    }
    setInstalling(null);
  };

  const installedNames = new Set(plugins.map(p => p.name));
  const enabledCount = plugins.filter(p => p.enabled).length;

  // Recommended plugins that aren't installed yet
  const uninstalledRecommended = RECOMMENDED.filter(r => !installedNames.has(r.name));
  // Recommended plugins that are installed but not enabled
  const disabledRecommended = RECOMMENDED.filter(r => {
    const p = plugins.find(pp => pp.name === r.name);
    return p && !p.enabled;
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <Blocks className="w-5 h-5 text-purple-400" />
          Plugins
        </h2>
        <p className="text-sm text-muted-foreground">
          Enable, disable, and discover Claude Code plugins.
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground/60">
          <span>{plugins.length} installed</span>
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          <span className="text-emerald-400/70">{enabledCount} enabled</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
          <button
            onClick={() => setActiveTab('installed')}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              activeTab === 'installed' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
          >
            <Blocks className="h-3.5 w-3.5" /> Installed
          </button>
          <button
            onClick={() => setActiveTab('browse')}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
              activeTab === 'browse' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
          >
            <Search className="h-3.5 w-3.5" /> Marketplace
          </button>
        </div>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={loadPlugins} disabled={loading} className="text-xs text-muted-foreground">
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} /> Refresh
        </Button>
      </div>

      {/* ─── Installed Tab ─── */}
      {activeTab === 'installed' && (
        <div className="space-y-4">
          {/* Recommendations: not-installed */}
          {uninstalledRecommended.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-primary/50 px-1">Recommended to Install</h3>
              {uninstalledRecommended.map(r => (
                <div key={r.name} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-primary/15 bg-primary/[0.02]">
                  <Sparkles className="w-3.5 h-3.5 text-primary/50 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium">{r.name}</span>
                      {r.extendsRuneCode && (
                        <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">RuneCode Enhanced</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground/50 truncate">{r.desc}</p>
                  </div>
                  <Button variant="outline" size="sm" disabled={installing === r.name}
                    onClick={() => installFromMarketplace(r.name)} className="text-[10px] h-6 px-2 shrink-0">
                    {installing === r.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Download className="h-3 w-3 mr-0.5" /> Install</>}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations: installed but disabled */}
          {disabledRecommended.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-amber-400/50 px-1">Recommended to Enable</h3>
              {disabledRecommended.map(r => {
                const p = plugins.find(pp => pp.name === r.name)!;
                return (
                  <div key={r.name} className="flex items-center gap-2.5 px-3 py-2 rounded-md border border-amber-500/15 bg-amber-500/[0.02]">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400/50 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{p.displayName}</span>
                        {r.extendsRuneCode && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">RuneCode Enhanced</span>
                        )}
                        {p.skills.length > 0 && <span className="text-[9px] text-purple-400/40">{p.skills.length} skills</span>}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 truncate">{r.desc}</p>
                    </div>
                    <button onClick={() => togglePlugin(p)} disabled={saving === `${p.name}@${p.marketplace}`}
                      className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors flex-shrink-0">
                      Enable
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground/50">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
            </div>
          )}

          {/* Plugin list */}
          {!loading && plugins.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/40 px-1">All Installed</h3>
              {[...plugins].sort((a, b) => (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0) || a.displayName.localeCompare(b.displayName)).map(plugin => {
                const key = `${plugin.name}@${plugin.marketplace}`;
                const isExpanded = expanded === key;
                const isSaving = saving === key;
                const rec = RECOMMENDED.find(r => r.name === plugin.name);
                return (
                  <div key={key} className={cn(
                    "rounded-lg border transition-colors",
                    plugin.enabled ? "border-border/30 bg-muted/5" : "border-border/15 bg-muted/[0.02] opacity-60"
                  )}>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button onClick={() => setExpanded(isExpanded ? null : key)} className="text-muted-foreground/40 hover:text-muted-foreground">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-medium">{plugin.displayName}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground/40 font-mono">{plugin.marketplace}</span>
                          {rec && rec.extendsRuneCode && (
                            <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">RuneCode Enhanced</span>
                          )}
                          {plugin.skills.length > 0 && (
                            <span className="text-[9px] text-purple-400/50 flex items-center gap-0.5">
                              <Zap className="w-2.5 h-2.5" /> {plugin.skills.length}
                            </span>
                          )}
                        </div>
                        {plugin.description && <p className="text-[10px] text-muted-foreground/50 truncate mt-0.5">{plugin.description}</p>}
                      </div>
                      <button onClick={() => togglePlugin(plugin)} disabled={isSaving}
                        className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                          plugin.enabled ? 'bg-emerald-500/60' : 'bg-muted-foreground/20')} role="switch" aria-checked={plugin.enabled}>
                        {isSaving ? <Loader2 className="w-3 h-3 animate-spin mx-auto text-white/60" /> :
                          <span className={cn('inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform', plugin.enabled ? 'translate-x-[18px]' : 'translate-x-[3px]')} />}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border/10 space-y-2">
                        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[10px] pt-2">
                          {plugin.version && <><span className="text-muted-foreground/40">Version</span><span className="font-mono">{plugin.version}</span></>}
                          {plugin.author && <><span className="text-muted-foreground/40">Author</span><span>{plugin.author}</span></>}
                          <><span className="text-muted-foreground/40">ID</span><span className="font-mono">{key}</span></>
                          {plugin.installedAt && <><span className="text-muted-foreground/40">Installed</span><span>{new Date(plugin.installedAt).toLocaleDateString()}</span></>}
                        </div>
                        {plugin.skills.length > 0 && (
                          <div className="mt-2">
                            <span className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground/40">Skills</span>
                            <div className="mt-1 space-y-0.5">
                              {plugin.skills.map(s => (
                                <div key={s.name} className="flex items-start gap-2 text-[10px]">
                                  <Zap className="w-2.5 h-2.5 text-purple-400/40 mt-0.5 flex-shrink-0" />
                                  <span><strong>{s.name}</strong>{s.description && <span className="text-muted-foreground/40"> — {s.description}</span>}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {plugin.homepage && (
                          <a href={plugin.homepage} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary/50 hover:text-primary/80">
                            <ExternalLink className="w-2.5 h-2.5" /> Homepage
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {!loading && plugins.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <Blocks className="h-8 w-8 mx-auto text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground/50">No plugins installed</p>
              <p className="text-xs text-muted-foreground/30">Switch to the Marketplace tab to browse and install plugins</p>
            </div>
          )}
        </div>
      )}

      {/* ─── Marketplace Tab ─── */}
      {activeTab === 'browse' && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-1">Official Plugin Marketplace</h3>
            <p className="text-[11px] text-muted-foreground/60">
              Browse plugins from <code className="font-mono bg-muted px-0.5 rounded text-[10px]">anthropics/claude-plugins-official</code>.
              Install via Claude Code CLI.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plugins..." className="h-8 text-xs pl-7" />
          </div>
          <div className="space-y-1">
            {MARKETPLACE_PLUGINS
              .filter(p => !search || p.name.includes(search.toLowerCase()) || p.desc.toLowerCase().includes(search.toLowerCase()))
              .map(mp => {
                const installed = installedNames.has(mp.name);
                const rec = RECOMMENDED.find(r => r.name === mp.name);
                return (
                  <div key={mp.name} className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md border transition-colors",
                    rec ? "border-primary/15 bg-primary/[0.02]" : "border-border/20 bg-muted/[0.03]"
                  )}>
                    <Blocks className={cn("w-3.5 h-3.5 flex-shrink-0", rec ? "text-primary/50" : "text-muted-foreground/30")} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium">{mp.name}</span>
                        {rec && <span className="text-[8px] px-1 py-0.5 rounded bg-primary/15 text-primary font-semibold uppercase tracking-wider">Recommended</span>}
                        {rec && rec.extendsRuneCode && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">RuneCode Enhanced</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground/50 truncate">{mp.desc}</p>
                    </div>
                    {installed ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/20 shrink-0">Installed</span>
                    ) : (
                      <Button variant="outline" size="sm" disabled={installing === mp.name}
                        onClick={() => installFromMarketplace(mp.name)} className="text-[10px] h-6 px-2 shrink-0">
                        {installing === mp.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Download className="h-3 w-3 mr-0.5" /> Install</>}
                      </Button>
                    )}
                  </div>
                );
              })}
          </div>
          <div className="pt-2 border-t border-border/15 text-center">
            <a href="https://github.com/anthropics/claude-plugins-official" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-primary/50 hover:text-primary/80 inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" /> Browse on GitHub
            </a>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="p-3 rounded-lg bg-muted/10 border border-border/20 text-[11px] text-muted-foreground/50 space-y-1">
        <p><strong className="text-muted-foreground/70">Plugins</strong> extend Claude Code with skills, MCP servers, and automations. Enable/disable takes effect on next session.</p>
        <p>Plugins tagged <span className="text-[9px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-400 font-semibold">RuneCode Enhanced</span> add features that integrate directly with RuneCode's grid system, browser, and terminal management.</p>
      </div>

      {/* Toast */}
      {toast && (
        <div className={cn('fixed bottom-4 right-4 z-50 px-4 py-2 rounded-lg text-xs font-medium shadow-lg',
          toast.type === 'success' ? 'bg-emerald-500/90 text-white' : 'bg-red-500/90 text-white')}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
