import { useEffect, useRef } from 'react';
import { Shield } from 'lucide-react';
import { toast } from 'sonner';
import { INTEGRATIONS } from '../config';
import { useIntegrationConfig } from '../hooks/useIntegrationConfig';
import { CostCounter } from './CostCounter';

interface HeliconeToggleProps {
  sessionCostUsd: number;
}

export function HeliconeToggle({ sessionCostUsd }: HeliconeToggleProps) {
  const { config } = useIntegrationConfig();
  const isConfigured = !!config.observability.heliconeKey;
  const costAlertShown = useRef(false);

  // Cost limit alert
  useEffect(() => {
    if (!isConfigured || costAlertShown.current) return;
    if (sessionCostUsd >= config.observability.costLimit) {
      costAlertShown.current = true;
      toast.warning(`Session cost reached $${config.observability.costLimit.toFixed(2)}`, {
        description: 'View breakdown on Helicone.',
        duration: 10000,
        action: {
          label: 'Open Dashboard',
          onClick: () => window.open('https://helicone.ai/dashboard', '_blank'),
        },
      });
    }
  }, [sessionCostUsd, config.observability.costLimit, isConfigured]);

  if (config.observability.dismissed) return null;

  return (
    <div className="flex items-center gap-2 text-xs">
      {isConfigured && config.observability.showCounter && (
        <CostCounter costUsd={sessionCostUsd} />
      )}
      {isConfigured ? (
        <button
          onClick={() => window.open('https://helicone.ai/dashboard', '_blank')}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="h-3 w-3 text-green-500" />
          <span>Cost Guard</span>
        </button>
      ) : (
        <a
          href={INTEGRATIONS.observability.helicone.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <Shield className="h-3 w-3" />
          <span>Cost Guard</span>
          <span className="text-[10px] opacity-50">Set up</span>
        </a>
      )}
    </div>
  );
}
