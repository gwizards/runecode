import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { INTEGRATIONS } from '../config';
import { useIntegrationConfig } from '../hooks/useIntegrationConfig';

export interface SystemResources {
  cpuPercent: number;
  ramPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

async function fetchResources(): Promise<SystemResources> {
  try {
    if (window.__TAURI__) {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke('get_system_resources') as SystemResources;
    }
    const res = await fetch('/api/resources');
    if (!res.ok) throw new Error('Failed to fetch resources');
    return await res.json();
  } catch {
    // Return zeros if monitoring unavailable
    return { cpuPercent: 0, ramPercent: 0, ramUsedGb: 0, ramTotalGb: 0 };
  }
}

export function useResourceMonitor() {
  const { config, updateConfig } = useIntegrationConfig();
  const alertCooldownRef = useRef<number>(0);

  const { data: resources = { cpuPercent: 0, ramPercent: 0, ramUsedGb: 0, ramTotalGb: 0 } } = useQuery({
    queryKey: ['system-resources'],
    queryFn: fetchResources,
    refetchInterval: 5000,
  });

  // Threshold alert
  useEffect(() => {
    if (config.compute.dismissed) return;
    const now = Date.now();
    if (now - alertCooldownRef.current < config.compute.cooldownMinutes * 60 * 1000) return;

    const cpuHigh = resources.cpuPercent > config.compute.thresholdCpu;
    const ramHigh = resources.ramPercent > config.compute.thresholdRam;

    if (cpuHigh || ramHigh) {
      alertCooldownRef.current = now;
      const provider = config.compute.provider;
      const link = INTEGRATIONS.compute[provider];

      toast.warning('Heavy workload detected', {
        description: `Eject to ${link.name} for faster execution.`,
        duration: 15000,
        action: {
          label: `Eject to ${link.name}`,
          onClick: () => window.open(link.url, '_blank'),
        },
        cancel: {
          label: "Don't show again",
          onClick: () => updateConfig({ compute: { ...config.compute, dismissed: true } }),
        },
      });
    }
  }, [resources, config.compute]);

  return resources;
}
