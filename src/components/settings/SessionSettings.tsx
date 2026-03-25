import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { useTrackEvent } from '@/hooks';
import { TabPersistenceService } from '@/services/tabPersistence';
import { SettingRow } from './shared';

interface SessionSettingsProps {
  settings: Record<string, unknown> | null;
  onSettingsChange: (key: string, value: unknown) => void;
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

  // Startup intro preference (localStorage-backed)
  const [startupIntroEnabled, setStartupIntroEnabled] = useState(() => {
    const stored = localStorage.getItem('runecode-startup-intro-enabled');
    return stored === null ? true : stored === 'true';
  });

  // Terminal links open in browser panel (default: on)
  const [terminalLinksInBrowser, setTerminalLinksInBrowser] = useState(() => {
    return localStorage.getItem('runecode-terminal-links-in-browser') !== 'false';
  });

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

      {/* ─── CLI settings (saved to ~/.claude/settings.json) ─── */}

      <SettingRow
        label={<>Include "Co-Authored-By"</>}
        description="Add Claude attribution to git commits and pull requests"
      >
        <Switch
          checked={settings?.includeCoAuthoredBy !== false}
          onCheckedChange={(v) => onSettingsChange('includeCoAuthoredBy', v)}
        />
      </SettingRow>

      <SettingRow
        label={<>Verbose Output</>}
        description="Show full bash and command outputs in Claude Code sessions"
      >
        <Switch
          checked={settings?.verbose === true}
          onCheckedChange={(v) => onSettingsChange('verbose', v)}
        />
      </SettingRow>

      <SettingRow
        label={<>Chat Transcript Retention (days)</>}
        description="How long to retain chat transcripts locally (default: 30 days)"
      >
        <Input
          type="number"
          min="1"
          placeholder="30"
          value={(settings?.cleanupPeriodDays as string | number) || ''}
          onChange={(e) => {
            const value = e.target.value ? parseInt(e.target.value) : undefined;
            onSettingsChange('cleanupPeriodDays', value);
          }}
          className="w-24 text-right"
        />
      </SettingRow>

      {/* ─── Web-only settings (localStorage) ─── */}

      <SettingRow
        label={<>Remember Open Tabs</>}
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

      <SettingRow
        label={<>Show Welcome Intro on Startup</>}
        description="Display a brief welcome animation when the app launches"
      >
        <Switch
          checked={startupIntroEnabled}
          onCheckedChange={(v) => {
            setStartupIntroEnabled(v);
            localStorage.setItem('runecode-startup-intro-enabled', String(v));
            trackEvent.settingsChanged('startup_intro_enabled', v);
          }}
        />
      </SettingRow>

      <SettingRow
        label={<>Reduce visual effects</>}
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

      <SettingRow
        label={<>Open terminal links in Browser panel</>}
        description="Clicking URLs in the terminal opens them in the built-in browser instead of an external browser"
      >
        <Switch
          checked={terminalLinksInBrowser}
          onCheckedChange={(v) => {
            localStorage.setItem('runecode-terminal-links-in-browser', String(v));
            setTerminalLinksInBrowser(v);
          }}
        />
      </SettingRow>

      {/* Re-run onboarding */}
      <section>
        <h4 className="text-sm font-semibold mb-3">Setup Wizard</h4>
        <div className="rounded-lg border border-border p-4">
          <p className="text-xs text-muted-foreground mb-3">
            Re-run the initial setup wizard to check dependencies and update preferences.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem('runecode-onboarding-complete');
              window.location.reload();
            }}
            className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
          >
            Run Setup Wizard Again
          </button>
        </div>
      </section>

    </div>
  );
}
