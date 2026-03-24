import { StepCard, type StepStatus } from '@/components/onboarding/StepCard';
import { TerminalOutput } from '@/components/onboarding/TerminalOutput';
import { CopyBlock } from '@/components/onboarding/OnboardingStep';
import {
  Box,
  Terminal,
  CheckCircle,
  Sparkles,
} from 'lucide-react';

export interface InstallStepsProps {
  currentStep: number;
  totalSteps: number;
  stepOffset: number;
  statuses: Record<number, StepStatus>;
  IS_WEB_MODE: boolean;
  nodeVersion: string | null;
  installLines: string[];
  onInstallNode: () => void;
  onCheckNode: () => void;
  claudeVersion: string | null;
  onInstallClaude: () => void;
  onCheckClaude: (step: 2 | 3) => void;
  rufloStatus: { installed: boolean; version: string | null; mcp_active: boolean; slash_command_exists: boolean } | null;
  rufloInstalling: boolean;
  rufloLines: string[];
  onInstallRuflo: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

/** Steps 1-4: Node.js, Claude Code, Verify Claude, RuFlo installation */
export function renderInstallStep(props: InstallStepsProps): React.ReactElement | null {
  const {
    currentStep, totalSteps, stepOffset, statuses, IS_WEB_MODE,
    nodeVersion, installLines, onInstallNode, onCheckNode,
    claudeVersion, onInstallClaude, onCheckClaude,
    rufloStatus, rufloInstalling, rufloLines, onInstallRuflo,
    onNext, onBack, onSkip,
  } = props;

  const TOTAL_STEPS = totalSteps;
  /** Display step = internal step + offset (accounts for platform step on Windows) */
  const displayStep = (s: number) => s + stepOffset;

  switch (currentStep) {
    case 1:
      if (IS_WEB_MODE) return (
        <StepCard key="step-1" step={displayStep(1)} totalSteps={TOTAL_STEPS} title="Node.js Runtime" description="RuneCode is running in server mode — install tools manually in your terminal." icon={Box} status="skipped" onNext={onNext} onBack={onBack}>
          <div className="flex flex-col gap-3">
            <div className="text-xs text-white/50 leading-relaxed">Install Node.js v22+ on the machine running the RuneCode server:</div>
            <CopyBlock code="# macOS / Linux (via nvm)\ncurl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash\nnvm install 22 && nvm use 22" />
            <CopyBlock code="# Windows — download from nodejs.org/en/download" />
            <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">nodejs.org →</a>
          </div>
        </StepCard>
      );
      return (
        <StepCard key="step-1" step={displayStep(1)} totalSteps={TOTAL_STEPS} title="Node.js Runtime" description="RuneCode requires Node.js to run Claude Code and manage packages." icon={Box} status={statuses[1] ?? 'pending'} onNext={onNext} onBack={onBack} nextDisabled={statuses[1] !== 'passed' && statuses[1] !== 'skipped'} onSkip={onSkip} canSkip={statuses[1] === 'failed' || statuses[1] === 'pending'}>
          {statuses[1] === 'passed' && nodeVersion && <div className="text-sm text-green-400">Node.js {nodeVersion} detected</div>}
          {statuses[1] === 'failed' && (
            <div className="flex flex-col gap-2">
              <button onClick={onInstallNode} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors">Install Node.js</button>
              <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">Install manually from nodejs.org</a>
              <button onClick={onCheckNode} className="text-sm text-white/50 hover:text-white/80 transition-colors">Retry Check</button>
            </div>
          )}
          <TerminalOutput lines={installLines} />
        </StepCard>
      );

    case 2:
      if (IS_WEB_MODE) return (
        <StepCard key="step-2" step={displayStep(2)} totalSteps={TOTAL_STEPS} title="Claude Code CLI" description="Install Claude Code on the machine running the RuneCode server." icon={Terminal} status="skipped" onNext={onNext} onBack={onBack}>
          <div className="flex flex-col gap-3">
            <CopyBlock code="npm install -g @anthropic-ai/claude-code" />
            <a href="https://docs.anthropic.com/en/docs/claude-code" target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">docs.anthropic.com →</a>
          </div>
        </StepCard>
      );
      return (
        <StepCard key="step-2" step={displayStep(2)} totalSteps={TOTAL_STEPS} title="Claude Code CLI" description="Install the Claude Code command-line interface to power your AI coding sessions." icon={Terminal} status={statuses[2] ?? 'pending'} onNext={onNext} onBack={onBack} nextDisabled={statuses[2] !== 'passed' && statuses[2] !== 'skipped'} onSkip={onSkip} canSkip={statuses[2] === 'failed' || statuses[2] === 'pending'}>
          {statuses[2] === 'passed' && claudeVersion && <div className="text-sm text-green-400">Claude Code {claudeVersion} installed</div>}
          {statuses[2] === 'failed' && (
            <div className="flex flex-col gap-2">
              <button onClick={onInstallClaude} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors">Install Claude Code</button>
              <a href="https://docs.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-sm text-purple-400 hover:text-purple-300 transition-colors">Install manually from docs.anthropic.com</a>
              <button onClick={() => onCheckClaude(2)} className="text-sm text-white/50 hover:text-white/80 transition-colors">Retry Check</button>
            </div>
          )}
          <TerminalOutput lines={installLines} />
        </StepCard>
      );

    case 3:
      if (IS_WEB_MODE) return (
        <StepCard key="step-3" step={displayStep(3)} totalSteps={TOTAL_STEPS} title="Verify Claude" description="Verify Claude Code is working on the server machine." icon={CheckCircle} status="skipped" onNext={onNext} onBack={onBack}>
          <div className="flex flex-col gap-3">
            <div className="text-xs text-white/50">Run this in your terminal to verify:</div>
            <CopyBlock code="claude --version" />
            <div className="text-xs text-white/50">Then authenticate:</div>
            <CopyBlock code="claude auth login" />
          </div>
        </StepCard>
      );
      return (
        <StepCard key="step-3" step={displayStep(3)} totalSteps={TOTAL_STEPS} title="Verify Claude" description="Verifying that Claude Code is properly configured and ready to use." icon={CheckCircle} status={statuses[3] ?? 'pending'} onNext={onNext} onBack={onBack} nextDisabled={statuses[3] !== 'passed' && statuses[3] !== 'skipped'} onSkip={onSkip} canSkip={statuses[3] === 'failed' || statuses[3] === 'pending'}>
          {statuses[3] === 'passed' && claudeVersion && <div className="text-sm text-green-400">Claude Code {claudeVersion} — Ready!</div>}
          {statuses[3] === 'failed' && (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-red-400">Could not verify Claude Code. Please ensure it is installed correctly.</div>
              <button onClick={() => onCheckClaude(3)} className="text-sm text-white/50 hover:text-white/80 transition-colors">Retry Check</button>
            </div>
          )}
        </StepCard>
      );

    case 4:
      if (IS_WEB_MODE) return (
        <StepCard key="step-4" step={displayStep(4)} totalSteps={TOTAL_STEPS} title="RuFlo — AI Swarm Manager" description="Install RuFlo on the machine running the RuneCode server." icon={Sparkles} status="skipped" onNext={onNext} onBack={onBack} onSkip={() => { localStorage.setItem('runecode-ruflo-skipped', 'true'); onSkip(); }} canSkip>
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1.5">
              {['Hierarchical swarms with 15+ agent types', 'Autonomous task execution pipeline', 'Claude Code MCP integration'].map((item) => (
                <li key={item} className="flex gap-2 text-xs text-white/60"><span className="text-purple-400">✦</span>{item}</li>
              ))}
            </ul>
            <CopyBlock code="npm install -g @claude-flow/cli@latest" />
            <CopyBlock code="claude mcp add claude-flow -- npx -y @claude-flow/cli@latest" />
          </div>
        </StepCard>
      );
      return (
        <StepCard key="step-4" step={displayStep(4)} totalSteps={TOTAL_STEPS} title="RuFlo — AI Swarm Manager" description="Supercharge your projects with autonomous AI agents and hierarchical swarms." icon={Sparkles} status={statuses[4] ?? 'pending'} onNext={onNext} onBack={onBack} nextDisabled={statuses[4] !== 'passed' && statuses[4] !== 'skipped'} onSkip={() => { localStorage.setItem('runecode-ruflo-skipped', 'true'); onSkip(); }} canSkip>
          {rufloStatus?.installed ? (
            <div className="text-sm text-green-400">RuFlo {rufloStatus.version} already installed ✓</div>
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {['Hierarchical swarms with 15+ agent types', 'Autonomous task execution pipeline', 'Claude Code MCP integration — activated automatically', '/setup-ruflo slash command available in all projects'].map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-white/70"><span className="text-purple-400">✦</span>{item}</li>
                ))}
              </ul>
              {statuses[4] !== 'failed' && statuses[4] !== 'checking' && (
                <button onClick={onInstallRuflo} disabled={rufloInstalling} className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
                  {rufloInstalling ? 'Installing...' : 'Install RuFlo'}
                </button>
              )}
              {statuses[4] === 'checking' && (
                <div className="text-sm text-white/50">Checking for existing installation...</div>
              )}
              {statuses[4] === 'failed' && (
                <div className="flex flex-col gap-2">
                  <div className="text-sm text-red-400">Installation failed</div>
                  <button onClick={onInstallRuflo} className="text-sm text-white/50 hover:text-white/80">Retry</button>
                </div>
              )}
            </div>
          )}
          <TerminalOutput lines={rufloLines} />
        </StepCard>
      );

    default:
      return null;
  }
}
