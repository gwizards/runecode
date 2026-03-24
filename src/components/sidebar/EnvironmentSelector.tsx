import { useState, useEffect } from 'react';
import { applyStartupToken } from '@/lib/startupToken';
import { User } from 'lucide-react';

export function EnvironmentSelector() {
  const [account, setAccount] = useState<{ email: string; organization?: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/auth/status', { headers: applyStartupToken({}) });
        if (res.ok) {
          const data = await res.json();
          if (data.email) setAccount({ email: data.email, organization: data.organization });
        }
      } catch {}
    })();
  }, []);

  const displayName = account?.organization || account?.email?.split('@')[0] || 'Loading...';

  return (
    <div className="px-3 py-2 border-b border-border/20">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <div className="w-6 h-6 rounded-full bg-primary/15 flex items-center justify-center flex-shrink-0">
          <User className="w-3 h-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-medium text-foreground/90 truncate">{displayName}</div>
          {account?.email && (
            <div className="text-[9px] text-muted-foreground/50 truncate">{account.email}</div>
          )}
        </div>
      </div>
    </div>
  );
}
