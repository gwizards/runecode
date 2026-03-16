import { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { isDevMode } from '@/lib/devFallback';
import { safeParsePluginGroup } from '../../lib/safeParser';

interface Skill {
  name: string;
  description: string;
}

interface PluginGroup {
  plugin: string;
  skills: Skill[];
}

interface FlatSkill extends Skill {
  plugin: string;
}

interface SkillsCatalogSectionProps {
  activeSkills?: Set<string>;
}

export function SkillsCatalogSection({ activeSkills }: SkillsCatalogSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [catalog, setCatalog] = useState<PluginGroup[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    async function loadSkills() {
      try {
        let raw: any;
        if ((window as any).__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          raw = await invoke('get_skills_catalog');
        } else {
          const res = await fetch('/api/skills');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const contentType = res.headers.get('content-type') || '';
          if (!contentType.includes('json')) throw new Error('Non-JSON response');
          raw = await res.json();
        }
        const parsed = Array.isArray(raw)
          ? (raw.map(safeParsePluginGroup).filter(Boolean) as PluginGroup[])
          : [];
        setCatalog(parsed);
      } catch {
        setLoadFailed(true);
      }
    }
    loadSkills();
  }, []);

  // Flatten all skills into a single sorted list
  const allSkills = useMemo<FlatSkill[]>(() => {
    const flat = catalog.flatMap((group) =>
      group.skills.map((skill) => ({
        ...skill,
        plugin: group.plugin,
      }))
    );
    return flat.sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog]);

  // Filter by search query (matches skill name or plugin name)
  const filteredSkills = useMemo(() => {
    if (!search.trim()) return allSkills;
    const q = search.toLowerCase();
    return allSkills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.plugin.toLowerCase().includes(q)
    );
  }, [allSkills, search]);

  const totalSkills = allSkills.length;

  const handleCopy = (skillName: string) => {
    navigator.clipboard.writeText(`/${skillName}`);
  };

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
              {/* Search input */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter skills..."
                className="w-full h-[28px] text-[11px] px-2 mb-1.5 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
              />

              {allSkills.length === 0 ? (
                <p className="text-[11px] text-muted-foreground pl-1">
                  {loadFailed && isDevMode()
                    ? 'Connect backend to see skills'
                    : 'No skills installed'}
                </p>
              ) : filteredSkills.length === 0 ? (
                <p className="text-[11px] text-muted-foreground pl-1">
                  No skills match
                </p>
              ) : (
                <div className="max-h-[200px] overflow-y-auto space-y-0.5">
                  {filteredSkills.map((skill) => (
                    <button
                      key={`${skill.plugin}:${skill.name}`}
                      onClick={() => handleCopy(skill.name)}
                      className="flex items-center gap-1.5 px-1 py-1 w-full text-left rounded hover:bg-accent/20 transition-colors group"
                      title={`${skill.description}\nClick to copy /${skill.name}`}
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
                      <span className="ml-auto text-[9px] text-muted-foreground/40 truncate max-w-[80px]">
                        {skill.plugin}
                      </span>
                    </button>
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
