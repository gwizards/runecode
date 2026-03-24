/**
 * EnvironmentCard — expandable card that displays one remote environment's
 * details and provides Test / Enable-Disable / Edit / Remove actions.
 *
 * Extracted from EnvironmentsSettings.tsx to keep that file under 500 lines.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal, Monitor, Server,
  ChevronDown, ChevronRight,
  Loader2, CheckCircle2, AlertCircle, RefreshCw, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { RemoteEnvironment } from '@/components/settings/EnvironmentsSettings';

interface EnvironmentCardProps {
  env: RemoteEnvironment;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleEnabled: () => void;
  onRemove: () => void;
  onEdit: () => void;
}

export function EnvironmentCard({
  env,
  isExpanded,
  onToggleExpand,
  onToggleEnabled,
  onRemove,
  onEdit,
}: EnvironmentCardProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const testResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (testResultTimerRef.current !== null) clearTimeout(testResultTimerRef.current);
    };
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/environments/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(env),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data.success ? 'success' : 'error');
      } else {
        setTestResult('error');
      }
    } catch {
      setTestResult('error');
    }
    setTesting(false);
    if (testResultTimerRef.current !== null) clearTimeout(testResultTimerRef.current);
    testResultTimerRef.current = setTimeout(() => setTestResult(null), 5000);
  };

  const typeIcons = { ssh: Terminal, wsl: Monitor, docker: Server };
  const typeColors = { ssh: 'text-amber-400/60', wsl: 'text-blue-400/60', docker: 'text-cyan-400/60' };
  const Icon = typeIcons[env.type];

  return (
    <div className={cn(
      'rounded-lg border overflow-hidden transition-colors',
      env.enabled ? 'border-border/30 bg-muted/5' : 'border-border/15 bg-muted/3 opacity-60'
    )}>
      <button
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/10 transition-colors"
      >
        <Icon className={cn('h-4 w-4 flex-shrink-0', typeColors[env.type])} />
        <span className="text-xs font-medium flex-1 truncate">{env.name}</span>
        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-mono bg-muted-foreground/10 text-muted-foreground/50 uppercase">{env.type}</span>
        {env.enabled && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">enabled</span>
        )}
        {isExpanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 border-t border-border/10 space-y-2">
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
                {env.type === 'ssh' && (
                  <>
                    <span className="text-muted-foreground/40">Host</span>
                    <span className="font-mono">{env.sshHost}</span>
                    {env.sshPort && env.sshPort !== 22 && (
                      <><span className="text-muted-foreground/40">Port</span><span className="font-mono">{env.sshPort}</span></>
                    )}
                    <span className="text-muted-foreground/40">Auth</span>
                    <span>{env.sshAuthMethod === 'password' ? 'Password' : 'SSH Key'}</span>
                    {env.sshAuthMethod !== 'password' && env.sshIdentityFile && (
                      <><span className="text-muted-foreground/40">Key</span><span className="font-mono truncate">{env.sshIdentityFile}</span></>
                    )}
                    {env.sshAuthMethod === 'password' && (
                      <><span className="text-muted-foreground/40">Password</span><span>••••••••</span></>
                    )}
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
                {env.type === 'wsl' && (
                  <>
                    <span className="text-muted-foreground/40">Distro</span>
                    <span className="font-mono">{env.wslDistro || 'default'}</span>
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
                {env.type === 'docker' && (
                  <>
                    <span className="text-muted-foreground/40">Container</span>
                    <span className="font-mono">{env.dockerContainer}</span>
                    {env.dockerImage && (
                      <><span className="text-muted-foreground/40">Image</span><span className="font-mono truncate">{env.dockerImage}</span></>
                    )}
                    {env.startDirectory && (
                      <><span className="text-muted-foreground/40">Dir</span><span className="font-mono truncate">{env.startDirectory}</span></>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleTest}
                  disabled={testing}
                  className="text-[10px] h-6 px-2 text-muted-foreground/60"
                >
                  {testing
                    ? <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />
                    : testResult === 'success'
                      ? <CheckCircle2 className="h-2.5 w-2.5 mr-1 text-emerald-400" />
                      : testResult === 'error'
                        ? <AlertCircle className="h-2.5 w-2.5 mr-1 text-red-400" />
                        : <RefreshCw className="h-2.5 w-2.5 mr-1" />}
                  {testing ? 'Testing...' : testResult === 'success' ? 'Connected' : testResult === 'error' ? 'Failed' : 'Test'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onToggleEnabled} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  {env.enabled ? 'Disable' : 'Enable'}
                </Button>
                <Button variant="ghost" size="sm" onClick={onEdit} className="text-[10px] h-6 px-2 text-muted-foreground/60">
                  Edit
                </Button>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemove}
                  className="text-[10px] h-6 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="h-2.5 w-2.5 mr-1" /> Remove
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
