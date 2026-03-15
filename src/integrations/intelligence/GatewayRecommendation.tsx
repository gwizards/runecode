import { Sparkles, ExternalLink } from 'lucide-react';
import { INTEGRATIONS } from '../config';
import { useIntegrationConfig } from '../hooks/useIntegrationConfig';

interface GatewayRecommendationProps {
  variant: 'settings' | 'inline';
}

export function GatewayRecommendation({ variant }: GatewayRecommendationProps) {
  const { config, updateConfig } = useIntegrationConfig();

  if (config.intelligence.dismissed && variant === 'inline') return null;

  if (variant === 'inline') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
        <Sparkles className="h-3 w-3 text-purple-400" />
        <span>Need multi-model access?</span>
        <a
          href={INTEGRATIONS.intelligence.gateway.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-0.5"
        >
          Use a unified gateway
          <span className="text-xs px-1 py-0.5 rounded bg-primary/10 text-primary ml-1">Recommended</span>
        </a>
      </div>
    );
  }

  // Settings variant — full card with API key input
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-400" />
          <h4 className="text-sm font-medium">Unified LLM Gateway</h4>
          <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary">Recommended</span>
        </div>
        <a
          href={INTEGRATIONS.intelligence.gateway.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
        >
          Set up <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <p className="text-xs text-muted-foreground">
        Access Claude, GPT, LLaMA, and DeepSeek with one API key. No vendor lock-in.
      </p>
      <div>
        <label className="text-xs text-muted-foreground">Gateway API Key (optional)</label>
        <input
          type="password"
          value={config.intelligence.gatewayKey}
          onChange={(e) => updateConfig({
            intelligence: { ...config.intelligence, gatewayKey: e.target.value }
          })}
          placeholder="Enter your gateway API key"
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
        />
      </div>
    </div>
  );
}
