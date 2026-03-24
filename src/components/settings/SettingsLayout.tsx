import {
  Palette, Settings2, Puzzle,
  Timer, Shield, Variable,
  Terminal, Monitor,
  Sparkles, Globe, Database, Plug, FolderOpen, Blocks, Zap, Heart
} from 'lucide-react';

type SettingsMode = 'both' | 'web';

interface SettingsItem {
  id: string;
  label: string;
  icon: React.ElementType;
  mode?: SettingsMode; // 'web' = web mode only, 'both' or undefined = both modes
}

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: SettingsItem[];
  mode?: SettingsMode;
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'projects-group',
    label: 'Projects',
    icon: FolderOpen,
    items: [
      { id: 'project-explorer', label: 'Project Explorer', icon: FolderOpen },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    items: [
      { id: 'appearance', label: 'Appearance', icon: Palette },
    ],
  },
  {
    id: 'general',
    label: 'General',
    icon: Settings2,
    items: [
      { id: 'session', label: 'Session', icon: Timer },
      { id: 'permissions', label: 'Permissions', icon: Shield },
      { id: 'environment', label: 'Environment', icon: Variable },
      { id: 'commands-hooks', label: 'Commands & Hooks', icon: Terminal },
      { id: 'wsl', label: 'Platform / WSL', icon: Monitor },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Puzzle,
    items: [
      { id: 'partner-stack', label: 'Integrations', icon: Sparkles },
      { id: 'plugins', label: 'Plugins', icon: Blocks },
      { id: 'mcp-servers', label: 'MCP Servers', icon: Plug },
      { id: 'network', label: 'Proxy & Network', icon: Globe },
      { id: 'storage', label: 'Storage', icon: Database },
      { id: 'ruflo', label: 'RuFlo', icon: Zap },
    ],
  },
  {
    id: 'about-group',
    label: 'About',
    icon: Heart,
    items: [
      { id: 'credits', label: 'Credits', icon: Heart },
    ],
  },
];

interface SettingsLayoutProps {
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  children: React.ReactNode;
}

function ModeBadge({ mode }: { mode?: SettingsMode }) {
  if (!mode || mode === 'both') return null;
  return (
    <span className="ml-auto px-1 py-0.5 rounded text-[8px] font-medium tracking-wide uppercase flex-shrink-0 bg-cyan-500/10 text-cyan-400/70 border border-cyan-500/15">
      Web
    </span>
  );
}

export function SettingsLayout({ activeSection, onSectionChange, children }: SettingsLayoutProps) {
  return (
    <div className="flex h-full">
      {/* Sidebar navigation */}
      <nav className="w-52 flex-shrink-0 border-r border-border/30 overflow-y-auto py-4 px-2"
           style={{ backgroundColor: 'var(--color-void-deep, var(--color-background))' }}>
        <h2 className="px-3 mb-4 text-sm font-semibold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
          Settings
        </h2>

        {SETTINGS_SECTIONS.map((section) => {
          const isSingleItem = section.items.length === 1;

          if (isSingleItem) {
            // Single-item group: render as a direct clickable link
            const item = section.items[0];
            const isActive = activeSection === item.id;
            return (
              <div key={section.id} className="mb-3">
                <button
                  onClick={() => onSectionChange(item.id)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded transition-all ${
                    isActive ? 'font-medium' : 'hover:bg-muted/50'
                  }`}
                  style={isActive ? {
                    backgroundColor: 'color-mix(in oklch, var(--color-purple-500, #8b5cf6) 15%, transparent)',
                    color: 'var(--color-purple-400, #a78bfa)',
                  } : {
                    color: 'var(--color-text-secondary, var(--color-muted-foreground))',
                  }}
                >
                  <section.icon className="h-3.5 w-3.5" />
                  {section.label}
                  <ModeBadge mode={item.mode || section.mode} />
                </button>
              </div>
            );
          }

          // Multi-item group: render group header + indented sub-items
          return (
            <div key={section.id} className="mb-3">
              {/* Group header */}
              <button
                onClick={() => onSectionChange(section.items[0].id)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded transition-colors"
                style={{ color: 'var(--color-gold-400, var(--color-muted-foreground))' }}
              >
                <section.icon className="h-3.5 w-3.5" />
                {section.label}
                <ModeBadge mode={section.mode} />
              </button>

              {/* Sub-items */}
              <div className="mt-0.5 space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onSectionChange(item.id)}
                      className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded transition-all ${
                        isActive
                          ? 'font-medium'
                          : 'hover:bg-muted/50'
                      }`}
                      style={isActive ? {
                        backgroundColor: 'color-mix(in oklch, var(--color-purple-500, #8b5cf6) 15%, transparent)',
                        color: 'var(--color-purple-400, #a78bfa)',
                      } : {
                        color: 'var(--color-text-secondary, var(--color-muted-foreground))',
                      }}
                    >
                      <item.icon className="h-3.5 w-3.5" />
                      {item.label}
                      {/* Only show item badge if group doesn't already have one */}
                      {!section.mode && <ModeBadge mode={item.mode} />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto p-6">
        {children}
      </div>
    </div>
  );
}

export function getSectionTitle(sectionId: string): string {
  for (const section of SETTINGS_SECTIONS) {
    const item = section.items.find(i => i.id === sectionId);
    if (item) return item.label;
  }
  return 'Settings';
}

export function getSectionGroup(sectionId: string): string {
  for (const section of SETTINGS_SECTIONS) {
    if (section.items.find(i => i.id === sectionId)) {
      return section.label;
    }
  }
  return '';
}

/** Returns 'web' if the section only applies to web mode, undefined otherwise */
export function getSettingsMode(sectionId: string): SettingsMode | undefined {
  for (const section of SETTINGS_SECTIONS) {
    const item = section.items.find(i => i.id === sectionId);
    if (item) return item.mode || section.mode;
  }
  return undefined;
}

export { SETTINGS_SECTIONS };
export type { SettingsSection, SettingsMode };
