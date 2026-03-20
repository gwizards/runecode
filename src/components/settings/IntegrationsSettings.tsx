import { Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useIntegrationConfig } from "@/integrations/hooks/useIntegrationConfig";

export function IntegrationsSettings() {
  const { config, updateConfig } = useIntegrationConfig();

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">Integrations</h3>
        <p className="text-sm text-muted-foreground mb-2">
          Secrets management for your development workflow.
        </p>
      </div>

      {/* Security / Secrets */}
      <section>
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Lock className="h-4 w-4 text-yellow-400" />
          Secrets Management
        </h4>
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
        </div>
      </section>
    </div>
  );
}
