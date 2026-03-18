import { ProxySettings } from '@/components/ProxySettings';

interface NetworkSettingsProps {
  settings: any;
  onSettingsChange: (key: string, value: any) => void;
  setToast: (toast: { message: string; type: 'success' | 'error' } | null) => void;
  onProxyChange?: (hasChanges: boolean, getSettings: () => any, save: () => Promise<void>) => void;
}

export function NetworkSettings({ settings: _settings, onSettingsChange: _onSettingsChange, setToast, onProxyChange }: NetworkSettingsProps) {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Proxy & Network</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Configure proxy settings and API access
        </p>
      </div>

      {/* Proxy settings */}
      <section>
        <h4 className="text-sm font-semibold mb-3">Proxy Configuration</h4>
        <ProxySettings
          setToast={setToast}
          onChange={onProxyChange}
        />
      </section>

    </div>
  );
}
