import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { INTEGRATIONS } from '../config';
import { useIntegrationConfig } from '../hooks/useIntegrationConfig';

interface SecurityWarningProps {
  hasEnvFiles: boolean;
  envFiles: string[];
}

export function SecurityWarning({ hasEnvFiles }: SecurityWarningProps) {
  const { config, updateConfig } = useIntegrationConfig();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!hasEnvFiles || config.security.dismissed || shownRef.current) return;
    shownRef.current = true;

    toast.warning('Plaintext .env detected', {
      description: `For agentic safety, inject secrets securely via ${INTEGRATIONS.security.infisical.name}.`,
      duration: 15000,
      action: {
        label: 'Set up Infisical',
        onClick: () => {
          window.open(INTEGRATIONS.security.infisical.url, '_blank');
        },
      },
      cancel: {
        label: "Don't show again",
        onClick: () => {
          updateConfig({ security: { ...config.security, dismissed: true } });
        },
      },
    });
  }, [hasEnvFiles, config.security.dismissed]);

  return null; // This is a side-effect component, renders nothing
}
