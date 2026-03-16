import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IntegrationConfig, DEFAULT_CONFIG } from '../types';

export function useIntegrationConfig() {
  const queryClient = useQueryClient();

  const { data: config = DEFAULT_CONFIG } = useQuery({
    queryKey: ['integrations-config'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/integrations');
        if (!res.ok) return DEFAULT_CONFIG;
        const data = await res.json();
        // Deep merge with defaults so missing fields don't crash
        return {
          compute: { ...DEFAULT_CONFIG.compute, ...data.compute },
          security: { ...DEFAULT_CONFIG.security, ...data.security },
          intelligence: { ...DEFAULT_CONFIG.intelligence, ...data.intelligence },
          observability: { ...DEFAULT_CONFIG.observability, ...data.observability },
        } as IntegrationConfig;
      } catch {
        return DEFAULT_CONFIG;
      }
    },
    staleTime: 30000,
  });

  const { mutate: updateConfig } = useMutation({
    mutationFn: async (updates: Partial<IntegrationConfig>) => {
      const merged = { ...config, ...updates };
      await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(merged),
      });
      return merged;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['integrations-config'], data);
    },
  });

  return { config, updateConfig };
}
