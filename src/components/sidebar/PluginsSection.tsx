import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Package } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';
import { safeParsePluginGroup, type SafePluginGroup } from '../../lib/safeParser';

export function PluginsSection() {
  const [collapsed, setCollapsed] = useState(true);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const activeSkills = useSessionStore((state) => state.activeSkills);

  const { data: plugins = [] } = useQuery({
    queryKey: ['plugins-list'],
    queryFn: async (): Promise<SafePluginGroup[]> => {
      let raw: unknown;
      if (window.__TAURI__) {
        const { invoke } = await import('@tauri-apps/api/core');
        raw = await invoke('get_skills_catalog');
      } else {
        const res = await fetch('/api/skills');
        if (!res.ok) return [];
        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('json')) return [];
        raw = await res.json();
      }
      return Array.isArray(raw)
        ? (raw.map(safeParsePluginGroup).filter(Boolean) as SafePluginGroup[])
        : [];
    },
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const totalSkills = plugins.reduce((sum, g) => sum + g.skills.length, 0);

  const togglePlugin = (name: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Plugins
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {plugins.length}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5">
              {plugins.length === 0 ? (
                <p className="text-[11px] text-muted-foreground pl-1">
                  No plugins installed
                </p>
              ) : (
                <div className="space-y-0.5">
                  {plugins.map((plugin) => {
                    const isExpanded = expandedPlugins.has(plugin.plugin);
                    return (
                      <div key={plugin.plugin}>
                        {/* Plugin row */}
                        <button
                          onClick={() => togglePlugin(plugin.plugin)}
                          className="flex items-center gap-1.5 w-full text-left px-1 py-1 rounded transition-colors group sidebar-item"
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/60 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground/60 flex-shrink-0" />
                          )}
                          <Package className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />
                          <span className="text-[11px] font-medium truncate transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
                            {plugin.plugin}
                          </span>
                          <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums flex-shrink-0">
                            {plugin.skills.length} {plugin.skills.length === 1 ? 'skill' : 'skills'}
                          </span>
                        </button>

                        {/* Nested skills list */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="overflow-hidden"
                            >
                              <div className="pl-6 py-0.5 space-y-px">
                                {plugin.skills.map((skill) => (
                                  <div
                                    key={skill.name}
                                    className={`flex items-center gap-1.5 px-1 py-0.5 rounded transition-colors sidebar-item${activeSkills.has(skill.name) ? ' sidebar-item-active' : ''}`}
                                    title={skill.description}
                                  >
                                    {activeSkills.has(skill.name) ? (
                                      <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
                                      </span>
                                    ) : (
                                      <span className="h-1 w-1 rounded-full bg-muted-foreground/30 flex-shrink-0" />
                                    )}
                                    <span className="text-[10px] truncate transition-colors" style={{ color: 'var(--color-text-secondary)' }}>
                                      {skill.name}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Total skills summary */}
              {plugins.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-border/30">
                  <p className="text-[10px] text-muted-foreground/50 pl-1">
                    {totalSkills} total {totalSkills === 1 ? 'skill' : 'skills'} across{' '}
                    {plugins.length} {plugins.length === 1 ? 'plugin' : 'plugins'}
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
