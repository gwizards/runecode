import { StepCard, type StepStatus } from '@/components/onboarding/StepCard';
import { renderInstallStep, type InstallStepsProps } from '@/components/onboarding/OnboardingInstallSteps';
import type { PermissionMode } from '@/hooks/useSessionConfig';
import {
  FolderOpen,
  Shield,
  BarChart3,
  Palette,
  Sparkles,
} from 'lucide-react';

export interface OnboardingStepsProps extends InstallStepsProps {
  // Step 5 props
  projectDir: string;
  onProjectDirChange: (dir: string) => void;
  // Step 6 props
  selectedPermission: PermissionMode;
  onPermissionChange: (mode: PermissionMode) => void;
  onPermissionSave: () => void;
  // Step 7 props
  analyticsEnabled: boolean;
  onAnalyticsChange: (enabled: boolean) => void;
  // Step 8 props
  selectedTheme: 'dark' | 'light' | 'system';
  onThemeChange: (theme: 'dark' | 'light' | 'system') => void;
  onThemeSave: () => void;
  // Navigation
  onSetStatus: (step: number, status: StepStatus) => void;
  onFinish: () => void;
  // Step 9 helpers
  onCopyWebModeCommand: () => void;
  onOpenBrowser: () => void;
}

export function OnboardingSteps(props: OnboardingStepsProps) {
  const {
    currentStep, totalSteps, statuses,
    projectDir, onProjectDirChange,
    selectedPermission, onPermissionChange, onPermissionSave,
    analyticsEnabled, onAnalyticsChange,
    selectedTheme, onThemeChange, onThemeSave,
    onNext, onBack, onSkip, onSetStatus, onFinish,
    onCopyWebModeCommand, onOpenBrowser,
  } = props;

  const TOTAL_STEPS = totalSteps;
  const { stepOffset } = props;
  /** Display step = internal step + offset (accounts for platform step on Windows) */
  const displayStep = (s: number) => s + stepOffset;

  // Steps 1-4 are handled by the install steps module
  if (currentStep >= 1 && currentStep <= 4) {
    return renderInstallStep(props);
  }

  switch (currentStep) {
    // Step 5: Default Project Directory
    case 5:
      return (
        <StepCard
          key="step-5" step={displayStep(5)} totalSteps={TOTAL_STEPS}
          title="Default Project Directory"
          description="Choose where new projects will be created by default."
          icon={FolderOpen} status={statuses[5] ?? 'pending'}
          onNext={() => { onSetStatus(5, 'passed'); onNext(); }}
          onBack={onBack} onSkip={onSkip} canSkip
        >
          <input
            type="text" value={projectDir}
            onChange={(e) => onProjectDirChange(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-purple-500/50 transition-colors"
            placeholder="~/Projects"
          />
        </StepCard>
      );

    // Step 6: Permission Mode
    case 6: {
      const permissionOptions: { mode: PermissionMode; label: string; desc: string; recommended?: boolean }[] = [
        { mode: 'default', label: 'Ask Me', desc: 'Prompt for permission on file edits and commands', recommended: true },
        { mode: 'acceptEdits', label: 'Accept Edits', desc: 'Auto-approve file edits, prompt for commands' },
        { mode: 'bypassPermissions', label: 'Bypass All', desc: 'Auto-approve all actions without prompting' },
      ];
      return (
        <StepCard
          key="step-6" step={displayStep(6)} totalSteps={TOTAL_STEPS}
          title="Permission Mode"
          description="Control how much autonomy Claude has when modifying your project."
          icon={Shield} status={statuses[6] ?? 'pending'}
          onNext={() => { onPermissionSave(); onSetStatus(6, 'passed'); onNext(); }}
          onBack={onBack}
          onSkip={onSkip} canSkip
        >
          <div className="flex flex-col gap-2">
            {permissionOptions.map((opt) => (
              <button
                key={opt.mode}
                onClick={() => onPermissionChange(opt.mode)}
                className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                  selectedPermission === opt.mode
                    ? 'border-purple-500/60 bg-purple-500/10'
                    : 'border-white/10 bg-white/5 hover:bg-white/8'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full border-2 transition-colors ${selectedPermission === opt.mode ? 'border-purple-400 bg-purple-400' : 'border-white/30'}`} />
                  <span className="text-sm font-medium text-white">{opt.label}</span>
                  {opt.recommended && <span className="text-[10px] uppercase tracking-wider text-purple-400 bg-purple-500/15 px-1.5 py-0.5 rounded">Recommended</span>}
                </div>
                <p className="text-xs text-white/50 mt-1 ml-5">{opt.desc}</p>
              </button>
            ))}
          </div>
        </StepCard>
      );
    }

    // Step 7: Analytics
    case 7:
      return (
        <StepCard
          key="step-7" step={displayStep(7)} totalSteps={TOTAL_STEPS}
          title="Analytics"
          description="Help improve RuneCode by sharing anonymous usage data."
          icon={BarChart3} status={statuses[7] ?? 'pending'}
          onNext={() => { onSetStatus(7, 'passed'); onNext(); }}
          onBack={onBack}
          onSkip={onSkip} canSkip
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={analyticsEnabled} onChange={(e) => onAnalyticsChange(e.target.checked)} className="w-4 h-4 rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500/30 focus:ring-offset-0" />
            <span className="text-sm text-white/80">Send anonymous usage analytics</span>
          </label>
          <p className="text-xs text-white/40 leading-relaxed">
            We collect anonymous usage statistics to improve RuneCode. No personal data, code,
            or project contents are ever collected. You can change this anytime in Settings.
          </p>
        </StepCard>
      );

    // Step 8: Appearance
    case 8: {
      const themeOptions: { value: 'dark' | 'light' | 'system'; label: string }[] = [
        { value: 'dark', label: 'Dark' },
        { value: 'light', label: 'Light' },
        { value: 'system', label: 'System' },
      ];
      return (
        <StepCard
          key="step-8" step={displayStep(8)} totalSteps={TOTAL_STEPS}
          title="Appearance"
          description="Choose your preferred color theme."
          icon={Palette} status={statuses[8] ?? 'pending'}
          onNext={() => { onThemeSave(); onSetStatus(8, 'passed'); onNext(); }}
          onBack={onBack}
          onSkip={onSkip} canSkip
        >
          <div className="flex gap-2">
            {themeOptions.map((opt) => (
              <button key={opt.value} onClick={() => onThemeChange(opt.value)}
                className={`flex-1 px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${selectedTheme === opt.value ? 'border-purple-500/60 bg-purple-500/10 text-white' : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/8'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </StepCard>
      );
    }

    // Step 9: Quick Tour
    case 9:
      return (
        <StepCard
          key="step-9" step={displayStep(9)} totalSteps={TOTAL_STEPS}
          title="Quick Tour"
          description="A few things to get you started with RuneCode."
          icon={Sparkles} status={statuses[9] ?? 'pending'}
          onNext={onFinish} onBack={onBack} nextLabel="Get Started"
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
          <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex flex-col gap-2">
            <p className="text-xs font-medium text-white/70">Web / Server Mode</p>
            <p className="text-[11px] text-white/40 leading-relaxed">Access RuneCode from any browser — no desktop app required.</p>
            <div className="flex items-center gap-1.5 bg-black/30 rounded-lg px-3 py-2 font-mono text-[11px] text-purple-300/80">
              <span className="flex-1 select-all">runecode serve --port 8080 --open</span>
              <button onClick={onCopyWebModeCommand} aria-label="Copy web mode command" className="text-white/50 hover:text-white/70 transition-colors flex-shrink-0 text-[10px] px-2 py-0.5 rounded border border-white/10 hover:border-white/20">Copy</button>
            </div>
            <button onClick={onOpenBrowser} className="text-[11px] text-purple-400/70 hover:text-purple-300 transition-colors text-left">Open localhost:8080 →</button>
          </div>
        </StepCard>
      );

    default:
      return null;
  }
}
