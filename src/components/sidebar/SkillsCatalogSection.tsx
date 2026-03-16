import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { isDevMode } from '@/lib/devFallback';

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
  const [collapsed, setCollapsed] = useState(true); // Collapsed by default
  const [catalog, setCatalog] = useState<PluginGroup[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    async function loadSkills() {
      try {
        if ((window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke('get_skills_catalog');
          setCatalog(data as PluginGroup[]);
        } else {
          const res = await fetch('/api/skills');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          setCatalog(await res.json());
        }
      } catch {
        setLoadFailed(true);
      }
    }
    loadSkills();
  }, []);

  const totalSkills = catalog.reduce((sum, group) => sum + group.skills.length, 0);

  // Flatten all skills for clean flat list in sidebar
  const allSkills = catalog.flatMap((group) =>
    group.skills.map((skill) => ({
      ...skill,
      plugin: group.plugin,
    }))
  );

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Skills
        </h3>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {totalSkills}
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
              {allSkills.length === 0 ? (
                <p className="text-[11px] text-muted-foreground pl-1">
                  {loadFailed && isDevMode()
                    ? 'Connect backend to see skills'
                    : 'No skills installed'}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {allSkills.map((skill) => (
                    <div
                      key={`${skill.plugin}:${skill.name}`}
                      className="flex items-center gap-1.5 px-1 py-1 rounded hover:bg-accent/20 transition-colors group"
                      title={skill.description}
                    >
                      {activeSkills?.has(skill.name) ? (
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      ) : (
                        <Sparkles className="h-2.5 w-2.5 text-muted-foreground/50 flex-shrink-0" />
                      )}
                      <span className="text-[11px] text-foreground/60 group-hover:text-foreground/90 truncate transition-colors">
                        {skill.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
