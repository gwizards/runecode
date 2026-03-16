import { useState } from 'react';
import { Terminal, Webhook } from 'lucide-react';
import { SlashCommandsManager } from '@/components/SlashCommandsManager';
import { HooksEditor } from '@/components/HooksEditor';

interface CommandsHooksSettingsProps {
  onHooksChange?: (hasChanges: boolean, getHooks: () => any) => void;
}

export function CommandsHooksSettings({ onHooksChange }: CommandsHooksSettingsProps) {
  const [activeTab, setActiveTab] = useState<'commands' | 'hooks'>('commands');

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Commands & Hooks</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Customize slash commands and event hooks
        </p>
      </div>

      {/* Simple tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit">
        <button
          onClick={() => setActiveTab('commands')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'commands'
              ? 'bg-background shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Terminal className="h-3.5 w-3.5" />
          Commands
        </button>
        <button
          onClick={() => setActiveTab('hooks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
            activeTab === 'hooks'
              ? 'bg-background shadow-sm font-medium'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Webhook className="h-3.5 w-3.5" />
          Hooks
        </button>
      </div>

      {/* Content */}
      <div className="mt-4">
        {activeTab === 'commands' ? (
          <SlashCommandsManager />
        ) : (
          <HooksEditor
            scope="user"
            hideActions={true}
            onChange={onHooksChange}
          />
        )}
      </div>
    </div>
  );
}
