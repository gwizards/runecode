import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Terminal,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Copy,
  ArrowRight,
  Monitor,
  Package,
  Code2,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WslInstallGuideProps {
  onComplete: (distro: string) => void;
  onSkip: () => void;
}

type Step = 'check' | 'install-wsl' | 'install-distro' | 'install-node' | 'install-claude' | 'done';

const STEP_META: Record<Step, { title: string; number: number }> = {
  'check':           { title: 'Detecting WSL',          number: 1 },
  'install-wsl':     { title: 'Install WSL2',           number: 2 },
  'install-distro':  { title: 'Install Linux Distro',   number: 3 },
  'install-node':    { title: 'Install Node.js',        number: 4 },
  'install-claude':  { title: 'Install Claude Code',    number: 5 },
  'done':            { title: 'Ready',                   number: 6 },
};

const TOTAL_STEPS = 6;

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(command).catch(() => { /* clipboard may fail when unfocused */ });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/40 border border-white/10 p-3 font-mono text-sm text-white/80">
      <code className="flex-1 overflow-x-auto whitespace-pre">{command}</code>
      <button
        onClick={handleCopy}
        className="flex-shrink-0 p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/50 hover:text-white/80"
        title="Copy command"
        aria-label="Copy command"
      >
        {copied ? (
          <CheckCircle2 className="w-4 h-4 text-green-400" />
        ) : (
          <Copy className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

function OutputPanel({ output }: { output: string }) {
  const ref = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  }, [output]);

  if (!output) return null;

  return (
    <div
      ref={ref}
      className="rounded-lg bg-black/40 border border-white/5 p-3 overflow-y-auto font-mono text-xs text-white/70 leading-relaxed max-h-40"
    >
      <pre className="whitespace-pre-wrap break-all">{output}</pre>
    </div>
  );
}

function ProgressBar({ step }: { step: Step }) {
  const meta = STEP_META[step];
  const pct = Math.round((meta.number / TOTAL_STEPS) * 100);

  return (
    <div className="h-1 w-full bg-white/10 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-gradient-to-r from-purple-600 to-purple-400"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      />
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const meta = STEP_META[step];
  return (
    <div className="text-xs text-white/40 font-medium tracking-wide uppercase">
      Step {meta.number} of {TOTAL_STEPS}
    </div>
  );
}

export function WslInstallGuide({ onComplete, onSkip }: WslInstallGuideProps) {
  const [step, setStep] = useState<Step>('check');
  const [checking, setChecking] = useState(false);
  const [_wslAvailable, setWslAvailable] = useState(false);
  const [distro, setDistro] = useState<string | null>(null);
  const [nodeInstalled, setNodeInstalled] = useState(false);
  const [claudeInstalled, setClaudeInstalled] = useState(false);
  const [installOutput, setInstallOutput] = useState('');
  const [installing, setInstalling] = useState(false);

  const checkWsl = useCallback(async () => {
    setChecking(true);
    setInstallOutput('');
    try {
      const { detectWsl } = await import('@/infrastructure/tauri/wsl-client');
      const status = await detectWsl();
      setWslAvailable(status.available);
      if (status.available && status.recommended_distro) {
        setDistro(status.recommended_distro);
        setNodeInstalled(status.node_in_wsl);
        setClaudeInstalled(status.claude_in_wsl);
        if (status.claude_in_wsl) {
          setStep('done');
        } else if (status.node_in_wsl) {
          setStep('install-claude');
        } else {
          setStep('install-node');
        }
      } else if (status.available) {
        setStep('install-distro');
      } else {
        setStep('install-wsl');
      }
    } catch {
      setWslAvailable(false);
      setStep('install-wsl');
    } finally {
      setChecking(false);
    }
  }, []);

  // Auto-run detection on mount
  useEffect(() => {
    checkWsl();
  }, [checkWsl]);

  const runWslCommand = async (command: string): Promise<boolean> => {
    if (!distro) return false;
    setInstalling(true);
    setInstallOutput('');
    try {
      const { wslExecute } = await import('@/infrastructure/tauri/wsl-client');
      const result = await wslExecute(distro, command);
      setInstallOutput(result);
      return true;
    } catch (e) {
      setInstallOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setInstalling(false);
    }
  };

  const handleInstallNode = async () => {
    const cmd = 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash && source ~/.bashrc && nvm install --lts';
    const ok = await runWslCommand(cmd);
    if (ok) {
      setNodeInstalled(true);
      setStep('install-claude');
    }
  };

  const handleInstallClaude = async () => {
    if (!distro) return;
    setInstalling(true);
    setInstallOutput('');
    try {
      const { installClaudeInWsl } = await import('@/infrastructure/tauri/wsl-client');
      const result = await installClaudeInWsl(distro);
      setInstallOutput(result);
      setClaudeInstalled(true);
      setStep('done');
    } catch (e) {
      setInstallOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setInstalling(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'check':
        return (
          <div className="flex flex-col items-center gap-4 py-6">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
            <p className="text-sm text-white/60">Detecting WSL environment...</p>
          </div>
        );

      case 'install-wsl':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Install WSL2</h3>
                <p className="text-sm text-white/50 mt-1">
                  WSL (Windows Subsystem for Linux) was not detected. Open PowerShell as
                  Administrator and run the following command:
                </p>
              </div>
            </div>

            <CopyableCommand command="wsl --install" />

            <p className="text-xs text-white/40">
              This will install WSL2 with the default Ubuntu distribution. A restart may be
              required. After restarting, re-open RuneCode and this guide will continue.
            </p>

            <a
              href="https://learn.microsoft.com/en-us/windows/wsl/install"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Microsoft WSL documentation
            </a>

            <OutputPanel output={installOutput} />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSkip}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Skip — use Windows mode
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={checkWsl}
                disabled={checking}
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Re-check
              </Button>
            </div>
          </div>
        );

      case 'install-distro':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Terminal className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Install a Linux Distribution</h3>
                <p className="text-sm text-white/50 mt-1">
                  WSL is installed but no Linux distribution was found. Open PowerShell and run:
                </p>
              </div>
            </div>

            <CopyableCommand command="wsl --install -d Ubuntu" />

            <p className="text-xs text-white/40">
              Ubuntu is the recommended distribution. After installation, set up your username
              and password in the Ubuntu terminal window that opens, then click Re-check.
            </p>

            <OutputPanel output={installOutput} />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSkip}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Skip — use Windows mode
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={checkWsl}
                disabled={checking}
              >
                {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                Re-check
              </Button>
            </div>
          </div>
        );

      case 'install-node':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Package className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Install Node.js in WSL</h3>
                <p className="text-sm text-white/50 mt-1">
                  Node.js was not found in your <span className="font-mono text-purple-300">{distro}</span> distribution.
                  Run this command to install via nvm:
                </p>
              </div>
            </div>

            <CopyableCommand command="curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash && source ~/.bashrc && nvm install --lts" />

            <p className="text-xs text-white/40">
              This installs nvm (Node Version Manager) and the latest LTS release of Node.js.
              You can either run this in your WSL terminal manually, or click the button below
              to run it automatically.
            </p>

            <OutputPanel output={installOutput} />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSkip}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Skip — use Windows mode
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkWsl}
                  disabled={checking || installing}
                >
                  {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Re-check
                </Button>
                <Button
                  size="sm"
                  onClick={handleInstallNode}
                  disabled={installing || checking}
                >
                  {installing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                  Install Node.js
                </Button>
              </div>
            </div>
          </div>
        );

      case 'install-claude':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Code2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Install Claude Code</h3>
                <p className="text-sm text-white/50 mt-1">
                  Node.js is ready in <span className="font-mono text-purple-300">{distro}</span>.
                  Now install the Claude Code CLI:
                </p>
              </div>
            </div>

            <CopyableCommand command="npm install -g @anthropic-ai/claude-code" />

            <p className="text-xs text-white/40">
              This installs the Claude Code CLI globally so RuneCode can communicate with it
              inside WSL. Click the button below to install automatically, or run the command
              in your WSL terminal.
            </p>

            <OutputPanel output={installOutput} />

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={onSkip}
                className="text-sm text-white/40 hover:text-white/70 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5"
              >
                Skip — use Windows mode
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkWsl}
                  disabled={checking || installing}
                >
                  {checking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Re-check
                </Button>
                <Button
                  size="sm"
                  onClick={handleInstallClaude}
                  disabled={installing || checking}
                >
                  {installing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowRight className="w-4 h-4 mr-2" />}
                  Install Claude Code
                </Button>
              </div>
            </div>
          </div>
        );

      case 'done':
        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">All Set</h3>
                <p className="text-sm text-white/50 mt-1">
                  Your WSL environment is fully configured and ready to use.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-white/5 border border-white/10 p-4 space-y-2">
              <CheckItem label="WSL2" checked />
              <CheckItem label={`Distribution: ${distro ?? 'unknown'}`} checked />
              <CheckItem label="Node.js (via nvm)" checked={nodeInstalled} />
              <CheckItem label="Claude Code CLI" checked={claudeInstalled} />
            </div>

            <div className="flex items-center justify-end pt-2">
              <Button
                size="sm"
                onClick={() => distro && onComplete(distro)}
              >
                <ArrowRight className="w-4 h-4 mr-2" />
                Continue
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-lg">
      <ProgressBar step={step} />
      <StepIndicator step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {renderStepContent()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function CheckItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {checked ? (
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-white/50 flex-shrink-0" />
      )}
      <span className={checked ? 'text-white/80' : 'text-white/40'}>{label}</span>
    </div>
  );
}
