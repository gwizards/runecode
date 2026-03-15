import { useState, useEffect } from 'react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Popover } from '../ui/popover';

interface Skill {
  name: string;
  description: string;
}

interface PluginGroup {
  plugin: string;
  skills: Skill[];
}

interface SkillsCatalogSectionProps {
  activeSkills?: Set<string>;
}

export function SkillsCatalogSection({ activeSkills }: SkillsCatalogSectionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [catalog, setCatalog] = useState<PluginGroup[]>([]);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function loadSkills() {
      try {
        if ((window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke('get_skills_catalog');
          setCatalog(data as PluginGroup[]);
        } else {
          const res = await fetch('/api/skills');
          setCatalog(await res.json());
        }
      } catch {
        /* silently fail */
      }
    }
    loadSkills();
  }, []);

  const totalSkills = catalog.reduce((sum, group) => sum + group.skills.length, 0);

  const togglePlugin = (plugin: string) => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(plugin)) {
        next.delete(plugin);
      } else {
        next.add(plugin);
      }
      return next;
    });
  };

  return (
    <div className="border-b border-border/40">
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full px-4 py-3 flex items-center gap-2 text-sm font-medium text-foreground/80 hover:bg-accent/30 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />
        )}
        <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
        Skills ({totalSkills})
      </button>

      {isOpen && (
        <div className="px-2 pb-3">
          {catalog.length === 0 ? (
            <p className="text-xs text-muted-foreground px-2">No skills installed</p>
          ) : (
            catalog.map((group) => (
              <div key={group.plugin} className="mb-1">
                <button
                  onClick={() => togglePlugin(group.plugin)}
                  className="w-full px-2 py-1.5 flex items-center gap-1.5 text-xs font-medium text-foreground/70 hover:bg-accent/20 rounded transition-colors"
                >
                  {expandedPlugins.has(group.plugin) ? (
                    <ChevronDown className="h-3 w-3 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 flex-shrink-0" />
                  )}
                  <span className="truncate">{group.plugin}</span>
                  <span className="ml-auto text-muted-foreground">{group.skills.length}</span>
                </button>

                {expandedPlugins.has(group.plugin) && (
                  <div className="ml-4 mt-0.5 space-y-0.5">
                    {group.skills.map((skill) => (
                      <Popover
                        key={skill.name}
                        align="start"
                        side="bottom"
                        className="max-w-[220px] p-3"
                        trigger={
                          <button className="w-full px-2 py-1 flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground/90 hover:bg-accent/20 rounded transition-colors">
                            {activeSkills?.has(skill.name) && (
                              <span className="relative flex h-2 w-2 flex-shrink-0">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                              </span>
                            )}
                            <span className="truncate">{skill.name}</span>
                          </button>
                        }
                        content={
                          <div>
                            <p className="text-xs font-medium mb-1">{skill.name}</p>
                            <p className="text-xs text-muted-foreground">{skill.description}</p>
                          </div>
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
