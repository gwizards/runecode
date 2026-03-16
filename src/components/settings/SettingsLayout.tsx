import {
  Palette, Settings2, Code2, Puzzle, Wrench,
  Sun, Layers, Paintbrush,
  Timer, Shield, Variable,
  Binary, Terminal, Webhook, Bot,
  Cloud, Lock, Eye, Sparkles,
  Globe, Database, Key, Bug
} from 'lucide-react';

interface SettingsSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: { id: string; label: string; icon: React.ElementType }[];
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    items: [
      { id: 'theme', label: 'Theme', icon: Sun },
      { id: 'density', label: 'Density', icon: Layers },
      { id: 'colors', label: 'Colors', icon: Paintbrush },
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
    ],
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    icon: Code2,
    items: [
      { id: 'binary', label: 'Binary', icon: Binary },
      { id: 'commands', label: 'Commands', icon: Terminal },
      { id: 'hooks', label: 'Hooks', icon: Webhook },
      { id: 'models', label: 'Models', icon: Bot },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    icon: Puzzle,
    items: [
      { id: 'compute', label: 'Compute', icon: Cloud },
      { id: 'security', label: 'Security', icon: Lock },
      { id: 'observability', label: 'Observability', icon: Eye },
      { id: 'gateway', label: 'Gateway', icon: Sparkles },
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: Wrench,
    items: [
      { id: 'proxy', label: 'Proxy', icon: Globe },
      { id: 'storage', label: 'Storage', icon: Database },
      { id: 'api-keys', label: 'API Keys', icon: Key },
      { id: 'debug', label: 'Debug', icon: Bug },
    ],
  },
];

interface SettingsLayoutProps {
  activeSection: string;
  onSectionChange: (sectionId: string) => void;
  children: React.ReactNode;
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

        {SETTINGS_SECTIONS.map((section) => (
          <div key={section.id} className="mb-3">
            {/* Group header */}
            <button
              onClick={() => onSectionChange(section.items[0].id)}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded transition-colors"
              style={{ color: 'var(--color-gold-400, var(--color-muted-foreground))' }}
            >
              <section.icon className="h-3.5 w-3.5" />
              {section.label}
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
                  </button>
                );
              })}
            </div>
          </div>
        ))}
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

export { SETTINGS_SECTIONS };
export type { SettingsSection };
