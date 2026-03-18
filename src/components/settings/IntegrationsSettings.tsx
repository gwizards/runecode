import { Eye, Lock, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIntegrationConfig } from "@/integrations/hooks/useIntegrationConfig";
import { INTEGRATIONS } from "@/integrations/config";
import type { IntegrationConfig } from "@/integrations/types";

interface IntegrationCardProps {
  config: IntegrationConfig;
  updateConfig: (partial: Partial<IntegrationConfig>) => void;
}

function ObservabilityCard({ config, updateConfig }: IntegrationCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div>
        <label className="text-xs text-muted-foreground">Helicone API Key</label>
        <input
          type="password"
          value={config.observability.heliconeKey}
          onChange={(e) => updateConfig({
            observability: { ...config.observability, heliconeKey: e.target.value }
          })}
          placeholder="Enter Helicone API key"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="text-sm">Show cost counter</label>
        <Switch checked={config.observability.showCounter} onCheckedChange={(v) =>
          updateConfig({ observability: { ...config.observability, showCounter: v } })
        } />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm">Cost limit alert</label>
          <p className="text-xs text-muted-foreground">Warn when session cost exceeds threshold</p>
        </div>
        <input
          type="number"
          value={config.observability.costLimit}
          onChange={(e) => updateConfig({
            observability: { ...config.observability, costLimit: parseFloat(e.target.value) || 5 }
          })}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-right"
        />
      </div>
    </div>
  );
}

function SecurityCard({ config, updateConfig }: IntegrationCardProps) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-xs text-muted-foreground">
        Scan for plaintext secrets and get recommendations for secure alternatives.
      </p>
      <div className="flex items-center justify-between">
        <label className="text-sm">Scan for plaintext secrets</label>
        <Switch
          checked={config.security.scanEnabled}
          onCheckedChange={(v) => updateConfig({ security: { ...config.security, scanEnabled: v } })}
        />
      </div>
      <a
        href={INTEGRATIONS.security.infisical.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        Set up Infisical <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-border/20" />;
}

export function IntegrationsSettings() {
  const { config, updateConfig } = useIntegrationConfig();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Integrations</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Cost monitoring and secrets management for your development workflow.
        </p>
      </div>

      {/* Models / LLM Gateway */}

      {/* Observability / Cost Guard */}
      <section>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-green-400" />
          Cost Guard
        </h4>
        <ObservabilityCard config={config} updateConfig={updateConfig} />
      </section>

      <Divider />

      {/* Security / Secrets */}
      <section>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-yellow-400" />
          Secrets Management
        </h4>
        <SecurityCard config={config} updateConfig={updateConfig} />
      </section>
    </div>
  );
}
