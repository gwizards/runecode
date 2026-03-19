import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { INTEGRATIONS } from '../config';

const DISMISS_KEY = 'runecode-env-warning-dismissed';

interface SecurityWarningProps {
  hasEnvFiles: boolean;
  envFiles: string[];
}

export function SecurityWarning({ hasEnvFiles, envFiles }: SecurityWarningProps) {
  const shownRef = useRef(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!hasEnvFiles || envFiles.length === 0 || dismissed || shownRef.current) return;
    shownRef.current = true;

    const fileList = envFiles.length <= 3
      ? envFiles.join(', ')
      : `${envFiles.slice(0, 3).join(', ')} +${envFiles.length - 3} more`;

    toast.warning('Plaintext .env detected', {
      description: `Found ${fileList}. For agentic safety, inject secrets securely via ${INTEGRATIONS.security.infisical.name}.`,
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
          setDismissed(true);
          try {
            localStorage.setItem(DISMISS_KEY, 'true');
          } catch {
            // ignore
          }
        },
      },
    });
  }, [hasEnvFiles, envFiles, dismissed]);

  return null; // This is a side-effect component, renders nothing
}
