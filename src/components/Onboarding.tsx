import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'motion/react';
import { listen } from '@tauri-apps/api/event';
import {
  Box,
  Terminal,
  CheckCircle,
  FolderOpen,
  Shield,
  BarChart3,
  Palette,
  Sparkles,
} from 'lucide-react';
import { StepCard, type StepStatus } from '@/components/onboarding/StepCard';
import { TerminalOutput } from '@/components/onboarding/TerminalOutput';
import { api } from '@/lib/api';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { ConsentManager } from '@/lib/analytics/consent';
import type { PermissionMode } from '@/hooks/useSessionConfig';

const TOTAL_STEPS = 8;

interface OnboardingProps {
  onComplete: () => void;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [statuses, setStatuses] = useState<Record<number, StepStatus>>({});
  const [installLines, setInstallLines] = useState<string[]>([]);
  const [nodeVersion, setNodeVersion] = useState<string | null>(null);
  const [claudeVersion, setClaudeVersion] = useState<string | null>(null);
  const [projectDir, setProjectDir] = useState('~/Projects');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<'dark' | 'light' | 'system'>('dark');
  const [selectedPermission, setSelectedPermission] = useState<PermissionMode>('default');

  const { setPermissionMode } = useSessionConfig();

  // Listen for install-progress events
  useEffect(() => {
    const unlisten = listen<string>('install-progress', (event) => {
      setInstallLines((prev) => [...prev, event.payload]);
    });
    return () => {
      unlisten.then((fn) => fn());
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
      if (result.installed && result.meets_minimum) {
        setNodeVersion(result.version);
        setStatus(1, 'passed');
      } else {
        setStatus(1, 'failed');
      }
    } catch {
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

  // Auto-check on step enter
  useEffect(() => {
    if (currentStep === 1 && !statuses[1]) {
      checkNode();
    }
  }, [currentStep, statuses, checkNode]);

  useEffect(() => {
    if (currentStep === 2 && !statuses[2]) {
      checkClaude(2);
    }
  }, [currentStep, statuses, checkClaude]);

  useEffect(() => {
    if (currentStep === 3 && !statuses[3]) {
      checkClaude(3);
    }
  }, [currentStep, statuses, checkClaude]);

  const handleInstallNode = async () => {
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

  const skipStep = () => {
    setStatus(currentStep, 'skipped');
    nextStep();
  };

  const finishOnboarding = async () => {
    // Save analytics consent
    const consent = ConsentManager.getInstance();
    await consent.initialize();
    if (analyticsEnabled) {
      await consent.grantConsent();
    } else {
      await consent.revokeConsent();
    }

    // Save project dir
    localStorage.setItem('runecode-default-project-dir', projectDir);

    // Save theme
    localStorage.setItem('runecode-theme', selectedTheme);

    // Apply permission mode
    setPermissionMode(selectedPermission);

    // Mark onboarding complete
    localStorage.setItem('runecode-onboarding-complete', 'true');

    onComplete();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      // Step 1: Node.js Runtime
      case 1:
        return (
          <StepCard
            key="step-1"
            step={1}
            totalSteps={TOTAL_STEPS}
            title="Node.js Runtime"
            description="RuneCode requires Node.js to run Claude Code and manage packages."
            icon={Box}
            status={statuses[1] ?? 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[1] !== 'passed'}
          >
            {statuses[1] === 'passed' && nodeVersion && (
              <div className="text-sm text-green-400">
                Node.js {nodeVersion} detected
              </div>
            )}
            {statuses[1] === 'failed' && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleInstallNode}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
                >
                  Install Node.js
                </button>
                <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Install manually from nodejs.org
                </a>
                <button
                  onClick={checkNode}
                  className="text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  Retry Check
                </button>
              </div>
            )}
            <TerminalOutput lines={installLines} />
          </StepCard>
        );

      // Step 2: Claude Code CLI
      case 2:
        return (
          <StepCard
            key="step-2"
            step={2}
            totalSteps={TOTAL_STEPS}
            title="Claude Code CLI"
            description="Install the Claude Code command-line interface to power your AI coding sessions."
            icon={Terminal}
            status={statuses[2] ?? 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[2] !== 'passed'}
          >
            {statuses[2] === 'passed' && claudeVersion && (
              <div className="text-sm text-green-400">
                Claude Code {claudeVersion} installed
              </div>
            )}
            {statuses[2] === 'failed' && (
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleInstallClaude}
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors"
                >
                  Install Claude Code
                </button>
                <a
                  href="https://docs.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
                >
                  Install manually from docs.anthropic.com
                </a>
                <button
                  onClick={() => checkClaude(2)}
                  className="text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  Retry Check
                </button>
              </div>
            )}
            <TerminalOutput lines={installLines} />
          </StepCard>
        );

      // Step 3: Verify Claude
      case 3:
        return (
          <StepCard
            key="step-3"
            step={3}
            totalSteps={TOTAL_STEPS}
            title="Verify Claude"
            description="Verifying that Claude Code is properly configured and ready to use."
            icon={CheckCircle}
            status={statuses[3] ?? 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[3] !== 'passed'}
          >
            {statuses[3] === 'passed' && claudeVersion && (
              <div className="text-sm text-green-400">
                Claude Code {claudeVersion} — Ready!
              </div>
            )}
            {statuses[3] === 'failed' && (
              <div className="flex flex-col gap-2">
                <div className="text-sm text-red-400">
                  Could not verify Claude Code. Please ensure it is installed correctly.
                </div>
                <button
                  onClick={() => checkClaude(3)}
                  className="text-sm text-white/50 hover:text-white/80 transition-colors"
                >
                  Retry Check
                </button>
              </div>
            )}
          </StepCard>
        );

      // Step 4: Default Project Directory
      case 4:
        return (
          <StepCard
            key="step-4"
            step={4}
            totalSteps={TOTAL_STEPS}
            title="Default Project Directory"
            description="Choose where new projects will be created by default."
            icon={FolderOpen}
            status={statuses[4] ?? 'pending'}
            onNext={() => {
              setStatus(4, 'passed');
              nextStep();
            }}
            onSkip={skipStep}
            canSkip
          >
            <input
              type="text"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-purple-500/50 transition-colors"
              placeholder="~/Projects"
            />
          </StepCard>
        );

      // Step 5: Permission Mode
      case 5: {
        const permissionOptions: { mode: PermissionMode; label: string; desc: string; recommended?: boolean }[] = [
          { mode: 'default', label: 'Ask Me', desc: 'Prompt for permission on file edits and commands', recommended: true },
          { mode: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-approve file edits, prompt for commands' },
          { mode: 'bypassPermissions', label: 'Bypass All', desc: 'Auto-approve all actions without prompting' },
        ];
        return (
          <StepCard
            key="step-5"
            step={5}
            totalSteps={TOTAL_STEPS}
            title="Permission Mode"
            description="Control how much autonomy Claude has when modifying your project."
            icon={Shield}
            status={statuses[5] ?? 'pending'}
            onNext={() => {
              setPermissionMode(selectedPermission);
              setStatus(5, 'passed');
              nextStep();
            }}
            onSkip={skipStep}
            canSkip
          >
            <div className="flex flex-col gap-2">
              {permissionOptions.map((opt) => (
                <button
                  key={opt.mode}
                  onClick={() => setSelectedPermission(opt.mode)}
                  className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                    selectedPermission === opt.mode
                      ? 'border-purple-500/60 bg-purple-500/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-3 h-3 rounded-full border-2 transition-colors ${
                        selectedPermission === opt.mode
                          ? 'border-purple-400 bg-purple-400'
                          : 'border-white/30'
                      }`}
                    />
                    <span className="text-sm font-medium text-white">{opt.label}</span>
                    {opt.recommended && (
                      <span className="text-[10px] uppercase tracking-wider text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/50 mt-1 ml-5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </StepCard>
        );
      }

      // Step 6: Analytics
      case 6:
        return (
          <StepCard
            key="step-6"
            step={6}
            totalSteps={TOTAL_STEPS}
            title="Analytics"
            description="Help improve RuneCode by sharing anonymous usage data."
            icon={BarChart3}
            status={statuses[6] ?? 'pending'}
            onNext={() => {
              setStatus(6, 'passed');
              nextStep();
            }}
            onSkip={skipStep}
            canSkip
          >
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30 focus:ring-offset-0"
              />
              <span className="text-sm text-white/80">Send anonymous usage analytics</span>
            </label>
            <p className="text-xs text-white/40 leading-relaxed">
              We collect anonymous usage statistics to improve RuneCode. No personal data, code,
              or project contents are ever collected. You can change this anytime in Settings.
            </p>
          </StepCard>
        );

      // Step 7: Appearance
      case 7: {
        const themeOptions: { value: 'dark' | 'light' | 'system'; label: string }[] = [
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'System' },
        ];
        return (
          <StepCard
            key="step-7"
            step={7}
            totalSteps={TOTAL_STEPS}
            title="Appearance"
            description="Choose your preferred color theme."
            icon={Palette}
            status={statuses[7] ?? 'pending'}
            onNext={() => {
              localStorage.setItem('runecode-theme', selectedTheme);
              setStatus(7, 'passed');
              nextStep();
            }}
            onSkip={skipStep}
            canSkip
          >
            <div className="flex gap-2">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedTheme(opt.value)}
                  className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                    selectedTheme === opt.value
                      ? 'border-purple-500/60 bg-purple-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/8'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </StepCard>
        );
      }

      // Step 8: Quick Tour
      case 8:
        return (
          <StepCard
            key="step-8"
            step={8}
            totalSteps={TOTAL_STEPS}
            title="Quick Tour"
            description="A few things to get you started with RuneCode."
            icon={Sparkles}
            status={statuses[8] ?? 'pending'}
            onNext={finishOnboarding}
            nextLabel="Get Started"
          >
            <ul className="flex flex-col gap-3">
              {[
                { title: 'Tabs', desc: 'Open multiple sessions side by side with the tab bar.' },
                { title: 'Agents', desc: 'Spin up autonomous agents to work in the background.' },
                { title: 'Settings', desc: 'Configure models, permissions, and integrations.' },
                { title: 'Keyboard Shortcuts', desc: 'Press Ctrl+K to open the command palette.' },
              ].map((item) => (
                <li key={item.title} className="flex gap-3">
                  <div className="w-1 rounded-full bg-purple-500/40 flex-shrink-0" />
                  <div>
                    <span className="text-sm font-medium text-white">{item.title}</span>
                    <p className="text-xs text-white/50 mt-0.5">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </StepCard>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center z-50">
      {/* Purple glow background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-purple-600/10 blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative w-full max-w-lg px-4">
        <AnimatePresence mode="wait">
          {renderStepContent()}
        </AnimatePresence>
      </div>
    </div>
  );
}
