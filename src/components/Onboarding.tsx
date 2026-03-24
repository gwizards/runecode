import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { type StepStatus } from '@/components/onboarding/StepCard';
import { OnboardingSteps } from '@/components/onboarding/OnboardingSteps';
import { api } from '@/lib/api';
import { getEnvironmentInfo } from '@/lib/apiAdapter';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { ConsentManager } from '@/infrastructure/analytics';
import type { PermissionMode } from '@/hooks/useSessionConfig';
import { isWindowsPlatform, setPlatformMode, setWslDistro } from '@/lib/platformMode';
import { PlatformStep } from '@/components/onboarding/PlatformStep';

// In web/server mode, Tauri IPC is unavailable — we can't detect or install
// Node.js, Claude Code, or RuFlo. Show manual instructions instead.
const IS_WEB_MODE = !getEnvironmentInfo().isTauri;

const IS_WINDOWS = isWindowsPlatform();
const TOTAL_STEPS = IS_WINDOWS ? 10 : 9;

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(IS_WINDOWS ? 0 : 1);
  const [statuses, setStatuses] = useState<Record<number, StepStatus>>({});
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [claudeVersion, setClaudeVersion] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState('~/Projects');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [selectedPermission, setSelectedPermission] = useState<PermissionMode>('default');
  const [rufloStatus, setRufloStatus] = useState<import('@/lib/api').RuFloStatus | null>(null);
  const [rufloInstalling, setRufloInstalling] = useState(false);
  const [rufloLines, setRufloLines] = useState<string[]>([]);

  const { setPermissionMode } = useSessionConfig();

  const handlePlatformSelect = useCallback((mode: 'windows' | 'wsl', distro?: string) => {
    setPlatformMode(mode);
    if (mode === 'wsl' && distro) {
      setWslDistro(distro);
    }
    // Re-fetch home directory for the selected platform (WSL home differs from Windows home)
    api.getHomeDirectory().then((home) => {
      setProjectDir(`${home}/Projects`);
    }).catch(() => {});
    setCurrentStep(1);
  }, []);

  // Listen for install-progress events (dynamic import to avoid crash if Tauri not ready)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let mounted = true;

    (async () => {
      try {
        const { listen } = await import('@tauri-apps/api/event');
        const fn = await listen<{ line: string } | string>('install-progress', (event) => {
          if (!mounted) return;
          const line = typeof event.payload === 'string'
            ? event.payload
            : event.payload.line;
          setInstallLines((prev) => [...prev, line]);
        });
        unlisten = fn;
      } catch {
        // Tauri event system not available (web mode) — install progress won't stream
      }
    })();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  // Fetch home directory for default project path
  useEffect(() => {
    api.getHomeDirectory().then((home) => {
      setProjectDir(`${home}/Projects`);
    }).catch(() => {
      // Keep default ~/Projects
    });
  }, []);

  const setStatus = useCallback((step: number, status: StepStatus) => {
    setStatuses((prev) => ({ ...prev, [step]: status }));
  }, []);

  // Step 1: Check Node.js
  const checkNode = useCallback(async () => {
    setStatus(1, 'checking');
    setInstallLines([]);
    try {
      const result = await api.checkNodeInstalled();
      if (result && result.installed && result.meets_minimum) {
        setNodeVersion(result.version);
        setStatus(1, 'passed');
      } else if (result && result.installed) {
        setNodeVersion(result.version);
        setStatus(1, 'failed');
      } else {
        setStatus(1, 'failed');
      }
    } catch (err) {
      console.warn('Node.js check failed:', err);
      setStatus(1, 'failed');
    }
  }, [setStatus]);

  // Step 2 & 3: Check Claude Code
  const checkClaude = useCallback(async (step: 2 | 3) => {
    setStatus(step, 'checking');
    setInstallLines([]);
    try {
      const result = await api.checkClaudeVersion();
      if (result.is_installed) {
        setClaudeVersion(result.version ?? null);
        setStatus(step, 'passed');
      } else {
        setStatus(step, 'failed');
      }
    } catch {
      setStatus(step, 'failed');
    }
  }, [setStatus]);

  // Auto-check on step enter — desktop mode only.
  useEffect(() => {
    if (IS_WEB_MODE) return;
    if (currentStep === 1 && !statuses[1]) {
      const timer = setTimeout(() => checkNode(), 500);
      return () => clearTimeout(timer);
    }
  }, [currentStep, statuses, checkNode]);

  useEffect(() => {
    if (IS_WEB_MODE) return;
    if (currentStep === 2 && !statuses[2]) checkClaude(2);
  }, [currentStep, statuses, checkClaude]);

  useEffect(() => {
    if (IS_WEB_MODE) return;
    if (currentStep === 3 && !statuses[3]) checkClaude(3);
  }, [currentStep, statuses, checkClaude]);

  const checkRuflo = useCallback(async () => {
    if (IS_WEB_MODE) return;
    setStatus(4, 'checking');
    try {
      const result = await api.checkRufloInstalled();
      setRufloStatus(result);
      if (result.installed) setStatus(4, 'passed');
      else setStatus(4, 'failed');
    } catch {
      setRufloStatus({ installed: false, version: null, mcp_active: false, slash_command_exists: false });
      setStatus(4, 'failed');
    }
  }, [setStatus]);

  useEffect(() => {
    if (IS_WEB_MODE) return;
    if (currentStep === 4 && !statuses[4]) checkRuflo();
  }, [currentStep, statuses, checkRuflo]);

  const handleInstallRuflo = async () => {
    setRufloInstalling(true);
    setRufloLines([]);

    let unlisten: (() => void) | undefined;
    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<string>('ruflo-install-progress', (event) => {
        setRufloLines((prev) => [...prev, event.payload]);
      });
    } catch { /* web mode */ }

    try {
      await api.installRuflo();
      setRufloLines((prev) => [...prev, '\u2713 CLI installed']);
      await api.activateRufloMcp();
      setRufloLines((prev) => [...prev, '\u2713 MCP server activated in Claude Code']);
      await api.createRufloSlashCommand();
      setRufloLines((prev) => [...prev, '\u2713 /setup-ruflo slash command created']);
      try {
        await api.createDddOptimizationCommand();
        setRufloLines((prev) => [...prev, '\u2713 /ddd-optimization slash command created']);
      } catch {
        setRufloLines((prev) => [...prev, '\u26A0 /ddd-optimization command skipped (will retry on next setup)']);
      }
      await checkRuflo();
    } catch (err) {
      setRufloLines((prev) => [...prev, `\u2717 Error: ${String(err)}`]);
      try {
        const s = await api.checkRufloInstalled();
        if (s.installed) { setStatus(4, 'passed'); } else { setStatus(4, 'failed'); }
      } catch { setStatus(4, 'failed'); }
    } finally {
      unlisten?.();
      setRufloInstalling(false);
    }
  };

  const handleInstallNode = async () => {
    const confirmed = window.confirm(
      'This will install Node.js v22 on your system.\n\nProceed with installation?'
    );
    if (!confirmed) return;
    setStatus(1, 'checking');
    setInstallLines([]);
    try {
      await api.installNode();
      await checkNode();
    } catch {
      setStatus(1, 'failed');
    }
  };

  const handleInstallClaude = async () => {
    const confirmed = window.confirm(
      'This will install Claude Code globally via npm.\n\nCommand: npm install -g @anthropic-ai/claude-code\n\nProceed?'
    );
    if (!confirmed) return;
    setStatus(2, 'checking');
    setInstallLines([]);
    try {
      await api.installClaudeCode();
      await checkClaude(2);
    } catch {
      setStatus(2, 'failed');
    }
  };

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep((s) => s + 1);
    }
  };

  const prevStep = () => {
    const minStep = IS_WINDOWS ? 0 : 1;
    if (currentStep > minStep) {
      setCurrentStep((s) => s - 1);
    }
  };

  const skipStep = () => {
    setStatus(currentStep, 'skipped');
    nextStep();
  };

  const finishOnboarding = async () => {
    const consent = ConsentManager.getInstance();
    await consent.initialize();
    if (analyticsEnabled) { await consent.grantConsent(); } else { await consent.revokeConsent(); }
    localStorage.setItem('runecode-default-project-dir', projectDir);
    localStorage.setItem('runecode-theme', selectedTheme);
    setPermissionMode(selectedPermission);
    localStorage.setItem('runecode-onboarding-complete', 'true');
    onComplete();
  };

  const copyWebModeCommand = () => {
    navigator.clipboard.writeText('runecode serve --port 8080 --open').catch(() => {});
  };

  const openBrowser = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      await open('http://localhost:8080');
    } catch {
      window.open('http://localhost:8080', '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
      {/* Purple glow background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-lg px-4 flex flex-col gap-3">
        {/* Web mode escape hatch — shown only on step 1 */}
        {currentStep === 1 && (
          <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-white/60 font-medium">Prefer the browser?</p>
              <p className="text-[11px] text-white/35 mt-0.5">Run <code className="font-mono text-purple-400/80">runecode serve</code> in a terminal, then open your browser.</p>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={copyWebModeCommand}
                className="px-2.5 py-1 text-[11px] bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white/50 hover:text-white/80 transition-colors font-mono"
              >
                Copy cmd
              </button>
              <button
                onClick={openBrowser}
                className="px-2.5 py-1 text-[11px] bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-purple-400/80 hover:text-purple-300 transition-colors"
              >
                Open
              </button>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {currentStep === 0 && IS_WINDOWS ? (
            <div key="step-platform" className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
              <div className="text-[11px] text-white/50 font-medium mb-4">Step 1 of {TOTAL_STEPS}</div>
              <PlatformStep onSelect={handlePlatformSelect} />
            </div>
          ) : (
          <OnboardingSteps
            currentStep={currentStep}
            totalSteps={TOTAL_STEPS}
            stepOffset={IS_WINDOWS ? 1 : 0}
            statuses={statuses}
            IS_WEB_MODE={IS_WEB_MODE}
            nodeVersion={nodeVersion}
            installLines={installLines}
            onInstallNode={handleInstallNode}
            onCheckNode={checkNode}
            claudeVersion={claudeVersion}
            onInstallClaude={handleInstallClaude}
            onCheckClaude={checkClaude}
            rufloStatus={rufloStatus}
            rufloInstalling={rufloInstalling}
            rufloLines={rufloLines}
            onInstallRuflo={handleInstallRuflo}
            projectDir={projectDir}
            onProjectDirChange={setProjectDir}
            selectedPermission={selectedPermission}
            onPermissionChange={setSelectedPermission}
            onPermissionSave={() => setPermissionMode(selectedPermission)}
            analyticsEnabled={analyticsEnabled}
            onAnalyticsChange={setAnalyticsEnabled}
            selectedTheme={selectedTheme}
            onThemeChange={setSelectedTheme}
            onThemeSave={() => localStorage.setItem('runecode-theme', selectedTheme)}
            onNext={nextStep}
            onBack={prevStep}
            onSkip={skipStep}
            onSetStatus={setStatus}
            onFinish={finishOnboarding}
            onCopyWebModeCommand={copyWebModeCommand}
            onOpenBrowser={openBrowser}
          />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
