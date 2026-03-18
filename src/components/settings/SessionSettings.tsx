import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useTrackEvent } from '@/hooks';
import { TabPersistenceService } from '@/services/tabPersistence';

interface SessionSettingsProps {
  settings: any;
  onSettingsChange: (key: string, value: any) => void;
}

export function SessionSettings({ settings, onSettingsChange }: SessionSettingsProps) {
  const trackEvent = useTrackEvent();

  // Reduced visual effects preference (localStorage-backed)
  const [reducedEffects, setReducedEffects] = useState(() => {
    return localStorage.getItem('runecode-reduced-effects') === 'true';
  });


  // Tab persistence preference
  const [tabPersistenceEnabled, setTabPersistenceEnabled] = useState(() => {
    return TabPersistenceService.isEnabled();
  });

  // Startup intro preference (API-backed)
  const [startupIntroEnabled, setStartupIntroEnabled] = useState(true);

  // Load startup intro setting from API on mount
  useEffect(() => {
    (async () => {
      const pref = await api.getSetting('startup_intro_enabled');
      setStartupIntroEnabled(pref === null ? true : pref === 'true');
    })();
  }, []);

  // Apply reduced effects class on mount
  useEffect(() => {
    if (localStorage.getItem('runecode-reduced-effects') === 'true') {
      document.documentElement.classList.add('reduced-effects');
    }
  }, []);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Session</h3>
        <p className="text-sm text-muted-foreground mb-4">Configure session behavior and preferences</p>
      </div>

      {/* Include Co-Authored-By */}
      <SettingRow
        label='Include "Co-Authored-By"'
        description="Add Claude attribution to git commits and pull requests"
      >
        <Switch
          checked={settings?.includeCoAuthoredBy !== false}
          onCheckedChange={(v) => onSettingsChange('includeCoAuthoredBy', v)}
        />
      </SettingRow>

      {/* Verbose Output */}
      <SettingRow
        label="Verbose Output"
        description="Show full bash and command outputs"
      >
        <Switch
          checked={settings?.verbose === true}
          onCheckedChange={(v) => onSettingsChange('verbose', v)}
        />
      </SettingRow>

      {/* Chat Transcript Retention */}
      <SettingRow
        label="Chat Transcript Retention (days)"
        description="How long to retain chat transcripts locally (default: 30 days)"
      >
        <Input
          type="number"
          min="1"
          placeholder="30"
          value={settings?.cleanupPeriodDays || ''}
          onChange={(e) => {
            const value = e.target.value ? parseInt(e.target.value) : undefined;
            onSettingsChange('cleanupPeriodDays', value);
          }}
          className="w-24 text-right"
        />
      </SettingRow>

      {/* Tab Persistence */}
      <SettingRow
        label="Remember Open Tabs"
        description="Restore your tabs when you restart the app"
      >
        <Switch
          checked={tabPersistenceEnabled}
          onCheckedChange={(v) => {
            TabPersistenceService.setEnabled(v);
            setTabPersistenceEnabled(v);
            trackEvent.settingsChanged('tab_persistence_enabled', v);
          }}
        />
      </SettingRow>

      {/* Startup Intro */}
      <SettingRow
        label="Show Welcome Intro on Startup"
        description="Display a brief welcome animation when the app launches"
      >
        <Switch
          checked={startupIntroEnabled}
          onCheckedChange={async (v) => {
            setStartupIntroEnabled(v);
            try {
              await api.saveSetting('startup_intro_enabled', v ? 'true' : 'false');
              trackEvent.settingsChanged('startup_intro_enabled', v);
            } catch {
              // Silently handle save failure
            }
          }}
        />
      </SettingRow>

      {/* Reduce Visual Effects */}
      <SettingRow
        label="Reduce visual effects"
        description="Disable blur and glow effects for performance"
      >
        <Switch
          checked={reducedEffects}
          onCheckedChange={(v) => {
            localStorage.setItem('runecode-reduced-effects', String(v));
            document.documentElement.classList.toggle('reduced-effects', v);
            setReducedEffects(v);
          }}
        />
      </SettingRow>

    </div>
  );
}

/** Reusable setting row component for consistent layout across settings sections */
function SettingRow({ label, description, children }: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border/20">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export { SettingRow };
