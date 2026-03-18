import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Save, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  api,
  type ClaudeSettings,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { StorageTab } from "./StorageTab";
import { SettingsLayout } from "./settings/SettingsLayout";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { SessionSettings } from "./settings/SessionSettings";
import { PermissionsSettings, type PermissionRule } from "./settings/PermissionsSettings";
import { EnvironmentSettings, type EnvironmentVariable } from "./settings/EnvironmentSettings";
import { IntegrationsSettings } from "./settings/IntegrationsSettings";
import { CommandsHooksSettings } from "./settings/CommandsHooksSettings";
import { NetworkSettings } from "./settings/NetworkSettings";
import { AiAutocompleteSettings } from "./settings/AiAutocompleteSettings";
import { AccountsSettings } from "./settings/AccountsSettings";
import { SubAgentSettings } from "./settings/SubAgentSettings";
import { TeamSettings } from "./settings/TeamSettings";

interface SettingsProps {
  onBack: () => void;
  className?: string;
  initialSection?: string;
}

/**
 * Comprehensive Settings UI for managing Claude Code settings.
 * Delegates rendering to sub-components via a sidebar layout.
 */
export const Settings: React.FC<SettingsProps> = ({ className, initialSection }) => {
  const [settings, setSettings] = useState<ClaudeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(initialSection || "appearance");

  // Listen for external navigation to a specific section
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      if (e.detail?.section) setActiveSection(e.detail.section);
    };
    window.addEventListener('runecode:open-settings', handler as EventListener);
    return () => window.removeEventListener('runecode:open-settings', handler as EventListener);
  }, []);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Permission rules state
  const [allowRules, setAllowRules] = useState<PermissionRule[]>([]);
  const [denyRules, setDenyRules] = useState<PermissionRule[]>([]);

  // Environment variables state
  const [envVars, setEnvVars] = useState<EnvironmentVariable[]>([]);

  // Hooks state
  const [userHooksChanged, setUserHooksChanged] = useState(false);
  const getUserHooks = React.useRef<(() => any) | null>(null);

  // Proxy state
  const [proxySettingsChanged, setProxySettingsChanged] = useState(false);
  const saveProxySettings = React.useRef<(() => Promise<void>) | null>(null);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      setError(null);
      const loadedSettings = await api.getClaudeSettings();

      if (!loadedSettings || typeof loadedSettings !== 'object') {
        console.warn("Loaded settings is not an object:", loadedSettings);
        setSettings({});
        return;
      }

      setSettings(loadedSettings);

      // Parse permissions
      if (loadedSettings.permissions && typeof loadedSettings.permissions === 'object') {
        if (Array.isArray(loadedSettings.permissions.allow)) {
          setAllowRules(
            loadedSettings.permissions.allow.map((rule: string, index: number) => ({
              id: `allow-${index}`,
              value: rule,
            }))
          );
        }
        if (Array.isArray(loadedSettings.permissions.deny)) {
          setDenyRules(
            loadedSettings.permissions.deny.map((rule: string, index: number) => ({
              id: `deny-${index}`,
              value: rule,
            }))
          );
        }
      }

      // Parse environment variables
      if (loadedSettings.env && typeof loadedSettings.env === 'object' && !Array.isArray(loadedSettings.env)) {
        setEnvVars(
          Object.entries(loadedSettings.env).map(([key, value], index) => ({
            id: `env-${index}`,
            key,
            value: value as string,
          }))
        );
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
      setError("Failed to load settings. Please ensure ~/.claude directory exists.");
      setSettings({});
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      setError(null);
      setToast(null);

      const updatedSettings: ClaudeSettings = {
        ...settings,
        permissions: {
          allow: allowRules.map(rule => rule.value).filter(v => v && String(v).trim()),
          deny: denyRules.map(rule => rule.value).filter(v => v && String(v).trim()),
        },
        env: envVars.reduce((acc, { key, value }) => {
          if (key && String(key).trim() && value && String(value).trim()) {
            acc[key] = String(value);
          }
          return acc;
        }, {} as Record<string, string>),
      };

      await api.saveClaudeSettings(updatedSettings);
      setSettings(updatedSettings);

      // Save user hooks if changed
      if (userHooksChanged && getUserHooks.current) {
        const hooks = getUserHooks.current();
        await api.updateHooksConfig('user', hooks);
        setUserHooksChanged(false);
      }

      // Save proxy settings if changed
      if (proxySettingsChanged && saveProxySettings.current) {
        await saveProxySettings.current();
        setProxySettingsChanged(false);
      }

      setToast({ message: "Settings saved successfully!", type: "success" });
    } catch (err) {
      console.error("Failed to save settings:", err);
      setError("Failed to save settings.");
      setToast({ message: "Failed to save settings", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const renderSection = () => {
    switch (activeSection) {
      // Appearance group (single item)
      case 'appearance':
        return <AppearanceSettings />;

      // General group
      case 'accounts':
        return <AccountsSettings />;
      case 'session':
        return <SessionSettings settings={settings} onSettingsChange={updateSetting} />;
      case 'ai-autocomplete':
        return <AiAutocompleteSettings />;
      case 'permissions':
        return (
          <PermissionsSettings
            allowRules={allowRules}
            denyRules={denyRules}
            onAllowRulesChange={setAllowRules}
            onDenyRulesChange={setDenyRules}
          />
        );
      case 'environment':
        return <EnvironmentSettings envVars={envVars} onEnvVarsChange={setEnvVars} />;

      // Agents & Teams group
      case 'subagent-defaults':
        return <SubAgentSettings />;
      case 'team-settings':
        return <TeamSettings />;

      case 'commands-hooks':
        return (
          <CommandsHooksSettings
            onHooksChange={(hasChanges, getHooks) => {
              setUserHooksChanged(hasChanges);
              getUserHooks.current = getHooks;
            }}
          />
        );

      // Integrations group
      case 'partner-stack':
        return <IntegrationsSettings />;
      case 'network':
        return (
          <NetworkSettings
            settings={settings}
            onSettingsChange={updateSetting}
            setToast={setToast}
            onProxyChange={(hasChanges, _getSettings, save) => {
              setProxySettingsChanged(hasChanges);
              saveProxySettings.current = save;
            }}
          />
        );
      case 'storage':
        return <StorageTab />;

      default:
        return <AppearanceSettings />;
    }
  };

  return (
    <div className={cn("h-full flex flex-col", className)}>
      {/* Header with save button */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/30">
        <div>
          <h1 className="text-heading-1">Settings</h1>
          <p className="mt-1 text-body-small text-muted-foreground">
            Configure Claude Code preferences
          </p>
        </div>
        <motion.div whileTap={{ scale: 0.97 }} transition={{ duration: 0.15 }}>
          <Button onClick={saveSettings} disabled={saving || loading} size="default">
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </motion.div>
      </div>

      {/* Error message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="mx-4 mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/50 flex items-center gap-2 text-body-small text-destructive"
          >
            <AlertCircle className="h-4 w-4" />
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Layout with sidebar + content */}
      <SettingsLayout activeSection={activeSection} onSectionChange={setActiveSection}>
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          renderSection()
        )}
      </SettingsLayout>

      {/* Toast Notification */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>
    </div>
  );
};
