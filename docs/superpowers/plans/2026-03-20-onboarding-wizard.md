# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full-screen onboarding wizard on first launch that checks Node.js + Claude Code, verifies Claude works, collects user preferences, and handles cross-platform differences.

**Architecture:** Self-contained `<Onboarding>` component gates the main app via a localStorage flag. 3 new Tauri commands handle Node.js detection/installation and Claude Code installation. All state is local useState — no new stores.

**Tech Stack:** React 19, TypeScript, Tauri 2 commands (Rust), motion/react animations, Lucide icons, existing shadcn/ui primitives.

**Spec:** `docs/superpowers/specs/2026-03-20-onboarding-wizard-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/components/Onboarding.tsx` | Main wizard: 8-step state machine, step rendering, completion handler |
| `src/components/onboarding/StepCard.tsx` | Reusable glassmorphic card shell: progress bar, icon, title, status, actions |
| `src/components/onboarding/TerminalOutput.tsx` | Scrollable monospace output area for install commands |

### Modified Files
| File | Change |
|------|--------|
| `src/App.tsx` | Gate: render `<Onboarding>` when flag not set |
| `src-tauri/src/commands/claude.rs` | Add `check_node_installed`, `install_node`, `install_claude_code` commands |
| `src-tauri/src/main.rs` | Register 3 new commands in `invoke_handler` |
| `src-tauri/src/claude_binary.rs` | Fix Windows PATH separator at lines 668, 682, 688 |
| `src/lib/api.ts` | Add `checkNodeInstalled()`, `installNode()`, `installClaudeCode()` API wrappers |
| `src/components/settings/SessionSettings.tsx` | Add "Run Setup Wizard Again" button |

---

## Task 1: Fix Windows PATH Separator Bug

**Files:**
- Modify: `src-tauri/src/claude_binary.rs:668,682,688`

- [ ] **Step 1: Fix PATH separator in NVM block (line 668)**

In `src-tauri/src/claude_binary.rs`, find:
```rust
let new_path = format!("{}:{}", node_bin_str, current_path);
```
Replace with:
```rust
let sep = if cfg!(windows) { ";" } else { ":" };
let new_path = format!("{}{}{}", node_bin_str, sep, current_path);
```

- [ ] **Step 2: Fix PATH separator in Homebrew block (line 682)**

Same file, find the second occurrence:
```rust
let new_path = format!("{}:{}", homebrew_bin_str, current_path);
```
Replace with:
```rust
let sep = if cfg!(windows) { ";" } else { ":" };
let new_path = format!("{}{}{}", homebrew_bin_str, sep, current_path);
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/claude_binary.rs
git commit -m "fix: use platform-correct PATH separator on Windows"
```

---

## Task 2: Add Rust Backend Commands

**Files:**
- Modify: `src-tauri/src/commands/claude.rs`
- Modify: `src-tauri/src/main.rs:193-280`

- [ ] **Step 1: Add `check_node_installed` command**

At the end of `src-tauri/src/commands/claude.rs` (before the last closing bracket or at module level), add:

```rust
/// Check if Node.js is installed and return version info
#[tauri::command]
pub async fn check_node_installed() -> Result<serde_json::Value, String> {
    let program = if cfg!(windows) { "node.exe" } else { "node" };

    match std::process::Command::new(program)
        .arg("--version")
        .output()
    {
        Ok(output) if output.status.success() => {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            // Parse major version (e.g., "v22.1.0" -> 22)
            let major: u32 = version
                .trim_start_matches('v')
                .split('.')
                .next()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0);
            Ok(serde_json::json!({
                "installed": true,
                "version": version,
                "major": major,
                "meets_minimum": major >= 18
            }))
        }
        _ => Ok(serde_json::json!({
            "installed": false,
            "version": null,
            "major": 0,
            "meets_minimum": false
        })),
    }
}
```

- [ ] **Step 2: Add `install_node` command**

```rust
/// Install Node.js — platform-aware
#[tauri::command]
pub async fn install_node(app: AppHandle) -> Result<String, String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "windows") {
        // On Windows, open the Node.js download page — MSI install requires user interaction
        if let Err(e) = open::that("https://nodejs.org/en/download/") {
            return Err(format!("Failed to open browser: {}", e));
        }
        return Ok("Opened Node.js download page in browser. Install Node.js, then click 'Retry Check'.".to_string());
    } else if cfg!(target_os = "macos") {
        ("sh", vec!["-c", "curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && export NVM_DIR=\"$HOME/.nvm\" && [ -s \"$NVM_DIR/nvm.sh\" ] && . \"$NVM_DIR/nvm.sh\" && nvm install 22"])
    } else {
        // Linux
        ("sh", vec!["-c", "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs"])
    };

    let mut cmd = Command::new(program);
    cmd.args(&args);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start installer: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let mut output = String::new();

    if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            output.push_str(&line);
            output.push('\n');
            // Emit progress to frontend
            let _ = app.emit("install-progress", serde_json::json!({"line": line}));
        }
    }

    if let Some(stderr) = stderr {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            output.push_str(&line);
            output.push('\n');
            let _ = app.emit("install-progress", serde_json::json!({"line": line}));
        }
    }

    let status = child.wait().await.map_err(|e| format!("Install failed: {}", e))?;

    if status.success() {
        Ok(output)
    } else {
        Err(format!("Node.js installation failed:\n{}", output))
    }
}
```

- [ ] **Step 3: Add `install_claude_code` command**

```rust
/// Install Claude Code CLI via npm
#[tauri::command]
pub async fn install_claude_code(app: AppHandle) -> Result<String, String> {
    use tokio::process::Command;
    use tokio::io::{AsyncBufReadExt, BufReader};

    let npm = if cfg!(windows) { "npm.cmd" } else { "npm" };

    let mut cmd = Command::new(npm);
    cmd.args(["install", "-g", "@anthropic-ai/claude-code"]);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start npm: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let mut output = String::new();

    if let Some(stdout) = stdout {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            output.push_str(&line);
            output.push('\n');
            let _ = app.emit("install-progress", serde_json::json!({"line": line}));
        }
    }

    if let Some(stderr) = stderr {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            output.push_str(&line);
            output.push('\n');
            let _ = app.emit("install-progress", serde_json::json!({"line": line}));
        }
    }

    let status = child.wait().await.map_err(|e| format!("Install failed: {}", e))?;

    if status.success() {
        Ok(output)
    } else {
        Err(format!("Claude Code installation failed:\n{}", output))
    }
}
```

- [ ] **Step 4: Register commands in main.rs**

In `src-tauri/src/main.rs`, add to the existing `invoke_handler` block (around line 193-220, inside `tauri::generate_handler![]`), after `check_claude_version,`:

```rust
check_node_installed,
install_node,
install_claude_code,
```

Also add to the imports at top of main.rs (around line 20-30), in the `use commands::claude::{...}` block:

```rust
check_node_installed, install_node, install_claude_code,
```

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles with no errors (may have warnings)

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/claude.rs src-tauri/src/main.rs
git commit -m "feat: add check_node_installed, install_node, install_claude_code Tauri commands"
```

---

## Task 3: Add API Wrappers

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add TypeScript API methods**

In `src/lib/api.ts`, inside the `api` object (alongside existing methods like `checkClaudeVersion`), add:

```typescript
  async checkNodeInstalled(): Promise<{ installed: boolean; version: string | null; major: number; meets_minimum: boolean }> {
    return apiCall('check_node_installed', {});
  },

  async installNode(): Promise<string> {
    return apiCall('install_node', {});
  },

  async installClaudeCode(): Promise<string> {
    return apiCall('install_claude_code', {});
  },
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add Node.js and Claude Code install API wrappers"
```

---

## Task 4: Build StepCard Component

**Files:**
- Create: `src/components/onboarding/StepCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { motion } from 'motion/react';
import { Check, X, Loader2, type LucideIcon } from 'lucide-react';

export type StepStatus = 'pending' | 'checking' | 'passed' | 'failed' | 'skipped';

interface StepCardProps {
  step: number;
  totalSteps: number;
  title: string;
  description: string;
  icon: LucideIcon;
  status: StepStatus;
  children: React.ReactNode;
  onNext?: () => void;
  onSkip?: () => void;
  canSkip?: boolean;
  nextLabel?: string;
  nextDisabled?: boolean;
}

export function StepCard({
  step, totalSteps, title, description, icon: Icon,
  status, children, onNext, onSkip, canSkip = false,
  nextLabel = 'Next', nextDisabled = false,
}: StepCardProps) {
  const progress = ((step) / totalSteps) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="w-full max-w-[600px] mx-auto"
    >
      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-white/10 mb-8 overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-violet-400 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {/* Card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
        {/* Step indicator */}
        <div className="text-xs text-white/40 mb-4 font-medium tracking-wider uppercase">
          Step {step} of {totalSteps}
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Icon className="w-5 h-5 text-purple-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          {status === 'checking' && <Loader2 className="w-5 h-5 text-purple-400 animate-spin" />}
          {status === 'passed' && <Check className="w-5 h-5 text-green-400" />}
          {status === 'failed' && <X className="w-5 h-5 text-red-400" />}
        </div>
        <p className="text-sm text-white/50 mb-6">{description}</p>

        {/* Content */}
        <div className="mb-6">{children}</div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          {canSkip ? (
            <button
              onClick={onSkip}
              className="text-sm text-white/40 hover:text-white/60 transition-colors"
            >
              Skip
            </button>
          ) : <div />}
          <button
            onClick={onNext}
            disabled={nextDisabled || status === 'checking'}
            className="px-6 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            {nextLabel}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/StepCard.tsx
git commit -m "feat: add StepCard component for onboarding wizard"
```

---

## Task 5: Build TerminalOutput Component

**Files:**
- Create: `src/components/onboarding/TerminalOutput.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef } from 'react';

interface TerminalOutputProps {
  lines: string[];
  maxHeight?: number;
}

export function TerminalOutput({ lines, maxHeight = 160 }: TerminalOutputProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines.length]);

  if (lines.length === 0) return null;

  return (
    <div
      className="rounded-lg bg-black/40 border border-white/5 p-3 overflow-y-auto font-mono text-xs text-white/70 leading-relaxed"
      style={{ maxHeight }}
    >
      {lines.map((line, i) => (
        <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/onboarding/TerminalOutput.tsx
git commit -m "feat: add TerminalOutput component for install progress"
```

---

## Task 6: Build Main Onboarding Wizard

**Files:**
- Create: `src/components/Onboarding.tsx`

- [ ] **Step 1: Create the wizard**

This is the largest file. Create `src/components/Onboarding.tsx`:

```tsx
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Box, Terminal, CheckCircle, FolderOpen, Shield, BarChart3, Palette, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { StepCard, type StepStatus } from './onboarding/StepCard';
import { TerminalOutput } from './onboarding/TerminalOutput';
import { useSessionConfig } from '@/hooks/useSessionConfig';
import { ConsentManager } from '@/lib/analytics/consent';
import { listen } from '@tauri-apps/api/event';

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
  const [projectDir, setProjectDir] = useState('');
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);
  const { setPermissionMode } = useSessionConfig();

  const setStatus = (step: number, status: StepStatus) =>
    setStatuses(prev => ({ ...prev, [step]: status }));

  // Listen for install progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ line: string }>('install-progress', (event) => {
      setInstallLines(prev => [...prev, event.payload.line]);
    }).then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // Set default project dir based on platform
  useEffect(() => {
    api.getHomeDirectory().then(home => {
      setProjectDir(`${home}/Projects`);
    }).catch(() => {
      setProjectDir('~/Projects');
    });
  }, []);

  // ── Step 1: Node.js ──
  const checkNode = useCallback(async () => {
    setStatus(1, 'checking');
    setInstallLines([]);
    try {
      const result = await api.checkNodeInstalled();
      if (result.installed && result.meets_minimum) {
        setNodeVersion(result.version);
        setStatus(1, 'passed');
      } else if (result.installed) {
        setNodeVersion(result.version);
        setStatus(1, 'failed');
      } else {
        setStatus(1, 'failed');
      }
    } catch {
      setStatus(1, 'failed');
    }
  }, []);

  const installNode = useCallback(async () => {
    setStatus(1, 'checking');
    setInstallLines([]);
    try {
      await api.installNode();
      // Re-check after install
      await checkNode();
    } catch (err) {
      setInstallLines(prev => [...prev, `Error: ${err}`]);
      setStatus(1, 'failed');
    }
  }, [checkNode]);

  // ── Step 2: Claude Code ──
  const checkClaude = useCallback(async () => {
    setStatus(2, 'checking');
    setInstallLines([]);
    try {
      const result = await api.checkClaudeVersion();
      if (result.is_installed) {
        setClaudeVersion(result.version || 'installed');
        setStatus(2, 'passed');
      } else {
        setStatus(2, 'failed');
      }
    } catch {
      setStatus(2, 'failed');
    }
  }, []);

  const installClaude = useCallback(async () => {
    setStatus(2, 'checking');
    setInstallLines([]);
    try {
      await api.installClaudeCode();
      await checkClaude();
    } catch (err) {
      setInstallLines(prev => [...prev, `Error: ${err}`]);
      setStatus(2, 'failed');
    }
  }, [checkClaude]);

  // ── Step 3: Verify ──
  const verifyClaude = useCallback(async () => {
    setStatus(3, 'checking');
    try {
      const result = await api.checkClaudeVersion();
      if (result.is_installed) {
        setClaudeVersion(result.version || 'verified');
        setStatus(3, 'passed');
      } else {
        setStatus(3, 'failed');
      }
    } catch {
      setStatus(3, 'failed');
    }
  }, []);

  // Auto-check on step enter
  useEffect(() => {
    if (currentStep === 1 && !statuses[1]) checkNode();
    if (currentStep === 2 && !statuses[2]) checkClaude();
    if (currentStep === 3 && !statuses[3]) verifyClaude();
  }, [currentStep, statuses, checkNode, checkClaude, verifyClaude]);

  const nextStep = () => {
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1);
      setInstallLines([]);
    } else {
      finishOnboarding();
    }
  };

  const skipStep = () => {
    setStatus(currentStep, 'skipped');
    nextStep();
  };

  const finishOnboarding = async () => {
    // Save analytics preference
    const consent = ConsentManager.getInstance();
    await consent.initialize();
    if (analyticsEnabled) {
      await consent.grantConsent();
    } else {
      await consent.revokeConsent();
    }

    // Save project dir
    if (projectDir) {
      localStorage.setItem('runecode-default-project-dir', projectDir);
    }

    // Mark complete
    localStorage.setItem('runecode-onboarding-complete', 'true');
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center p-8">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-purple-500/5 blur-[120px]" />
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1: Node.js */}
        {currentStep === 1 && (
          <StepCard
            key="node"
            step={1} totalSteps={TOTAL_STEPS}
            title="Node.js Runtime"
            description="Claude Code requires Node.js v18 or later."
            icon={Box}
            status={statuses[1] || 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[1] !== 'passed'}
          >
            {statuses[1] === 'passed' && (
              <div className="text-green-400 text-sm">Node.js {nodeVersion} detected</div>
            )}
            {statuses[1] === 'failed' && (
              <div className="space-y-3">
                {nodeVersion ? (
                  <div className="text-yellow-400 text-sm">Node.js {nodeVersion} found but v18+ is required.</div>
                ) : (
                  <div className="text-red-400 text-sm">Node.js not found on this system.</div>
                )}
                <div className="flex gap-2">
                  <button onClick={installNode} className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium transition-colors">
                    Install Node.js
                  </button>
                  <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
                    Install manually
                  </a>
                  <button onClick={checkNode} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
                    Retry Check
                  </button>
                </div>
                <TerminalOutput lines={installLines} />
              </div>
            )}
            {statuses[1] === 'checking' && (
              <div className="text-white/50 text-sm">Checking for Node.js...</div>
            )}
          </StepCard>
        )}

        {/* Step 2: Claude Code */}
        {currentStep === 2 && (
          <StepCard
            key="claude"
            step={2} totalSteps={TOTAL_STEPS}
            title="Claude Code CLI"
            description="The Claude Code command-line tool powers all AI interactions."
            icon={Terminal}
            status={statuses[2] || 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[2] !== 'passed'}
          >
            {statuses[2] === 'passed' && (
              <div className="text-green-400 text-sm">Claude Code {claudeVersion} detected</div>
            )}
            {statuses[2] === 'failed' && (
              <div className="space-y-3">
                <div className="text-red-400 text-sm">Claude Code CLI not found.</div>
                <div className="flex gap-2">
                  <button onClick={installClaude} className="px-4 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium transition-colors">
                    Install Claude Code
                  </button>
                  <a href="https://docs.anthropic.com/en/docs/claude-code/overview" target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
                    Install manually
                  </a>
                  <button onClick={checkClaude} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
                    Retry Check
                  </button>
                </div>
                <TerminalOutput lines={installLines} />
              </div>
            )}
            {statuses[2] === 'checking' && (
              <div className="text-white/50 text-sm">Checking for Claude Code...</div>
            )}
          </StepCard>
        )}

        {/* Step 3: Verify */}
        {currentStep === 3 && (
          <StepCard
            key="verify"
            step={3} totalSteps={TOTAL_STEPS}
            title="Verify Claude"
            description="Confirming Claude Code is working correctly."
            icon={CheckCircle}
            status={statuses[3] || 'pending'}
            onNext={nextStep}
            nextDisabled={statuses[3] !== 'passed'}
          >
            {statuses[3] === 'passed' && (
              <div className="text-green-400 text-sm">Claude Code {claudeVersion} is ready!</div>
            )}
            {statuses[3] === 'failed' && (
              <div className="space-y-3">
                <div className="text-red-400 text-sm">Could not verify Claude Code. Make sure it's installed and in your PATH.</div>
                <button onClick={verifyClaude} className="px-4 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">
                  Retry
                </button>
              </div>
            )}
            {statuses[3] === 'checking' && (
              <div className="text-white/50 text-sm">Verifying Claude Code...</div>
            )}
          </StepCard>
        )}

        {/* Step 4: Project Directory */}
        {currentStep === 4 && (
          <StepCard
            key="project"
            step={4} totalSteps={TOTAL_STEPS}
            title="Default Project Directory"
            description="Where should RuneCode look for your projects?"
            icon={FolderOpen}
            status={statuses[4] || 'pending'}
            onNext={() => { setStatus(4, 'passed'); nextStep(); }}
            canSkip onSkip={skipStep}
          >
            <input
              type="text"
              value={projectDir}
              onChange={(e) => setProjectDir(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-black/30 border border-white/10 text-white text-sm focus:border-purple-500 focus:outline-none"
              placeholder="~/Projects"
            />
          </StepCard>
        )}

        {/* Step 5: Permission Mode */}
        {currentStep === 5 && (
          <StepCard
            key="permissions"
            step={5} totalSteps={TOTAL_STEPS}
            title="Permission Mode"
            description="How should Claude handle file edits and commands?"
            icon={Shield}
            status={statuses[5] || 'pending'}
            onNext={() => { setStatus(5, 'passed'); nextStep(); }}
            canSkip onSkip={skipStep}
          >
            <div className="space-y-2">
              {[
                { id: 'default' as const, label: 'Ask Me', desc: 'Prompt for approval on each action (recommended)' },
                { id: 'acceptEdits' as const, label: 'Accept Edits', desc: 'Auto-approve file edits, ask for commands' },
                { id: 'bypassPermissions' as const, label: 'Bypass All', desc: 'Auto-approve everything (use with caution)' },
              ].map(mode => (
                <label
                  key={mode.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-white/10 hover:border-purple-500/50 cursor-pointer transition-colors"
                >
                  <input
                    type="radio"
                    name="permission"
                    className="mt-1 accent-purple-500"
                    defaultChecked={mode.id === 'default'}
                    onChange={() => setPermissionMode(mode.id)}
                  />
                  <div>
                    <div className="text-sm text-white font-medium">{mode.label}</div>
                    <div className="text-xs text-white/40">{mode.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 6: Analytics */}
        {currentStep === 6 && (
          <StepCard
            key="analytics"
            step={6} totalSteps={TOTAL_STEPS}
            title="Help Improve RuneCode"
            description="Share anonymous usage data to help us improve."
            icon={BarChart3}
            status={statuses[6] || 'pending'}
            onNext={() => { setStatus(6, 'passed'); nextStep(); }}
            canSkip onSkip={skipStep}
          >
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={analyticsEnabled}
                onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                className="w-4 h-4 accent-purple-500 rounded"
              />
              <span className="text-sm text-white/70">Send anonymous usage analytics</span>
            </label>
            <p className="text-xs text-white/30 mt-2">No prompts, code, or personal data is ever collected. You can change this anytime in Settings.</p>
          </StepCard>
        )}

        {/* Step 7: Theme */}
        {currentStep === 7 && (
          <StepCard
            key="theme"
            step={7} totalSteps={TOTAL_STEPS}
            title="Appearance"
            description="Choose your preferred look."
            icon={Palette}
            status={statuses[7] || 'pending'}
            onNext={() => { setStatus(7, 'passed'); nextStep(); }}
            canSkip onSkip={skipStep}
          >
            <div className="flex gap-3">
              {[
                { id: 'dark', label: 'Dark', colors: 'bg-[#0a0a0f] border-purple-500/50' },
                { id: 'light', label: 'Light', colors: 'bg-gray-100 border-gray-300' },
                { id: 'system', label: 'System', colors: 'bg-gradient-to-r from-[#0a0a0f] to-gray-100 border-white/20' },
              ].map(theme => (
                <button
                  key={theme.id}
                  onClick={() => localStorage.setItem('runecode-theme', theme.id)}
                  className={`flex-1 p-4 rounded-lg border-2 ${theme.colors} text-center text-sm text-white/70 hover:border-purple-400 transition-colors`}
                >
                  {theme.label}
                </button>
              ))}
            </div>
          </StepCard>
        )}

        {/* Step 8: Tour */}
        {currentStep === 8 && (
          <StepCard
            key="tour"
            step={8} totalSteps={TOTAL_STEPS}
            title="You're All Set!"
            description="Here's a quick overview of what you can do."
            icon={Sparkles}
            status={statuses[8] || 'pending'}
            onNext={finishOnboarding}
            nextLabel="Get Started"
          >
            <div className="space-y-3 text-sm text-white/60">
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Tabs</span> — Open multiple Claude sessions, agents, and tools side by side
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Agents</span> — Create custom AI agents with system prompts and run them on your codebase
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Settings</span> — Configure models, permissions, MCP servers, and more
              </div>
              <div className="flex items-start gap-2">
                <span className="text-purple-400 font-bold">Keyboard</span> — Ctrl/Cmd+T new tab, Ctrl/Cmd+W close, Ctrl/Cmd+1-9 switch
              </div>
            </div>
          </StepCard>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add Onboarding wizard component with 8 steps"
```

---

## Task 7: Integrate Onboarding Gate in App.tsx

**Files:**
- Modify: `src/App.tsx:1-72`

- [ ] **Step 1: Add import and gate**

At the top of `src/App.tsx`, add the import alongside the existing imports (around line 25):

```typescript
import { Onboarding } from "@/components/Onboarding";
```

Then modify the `AppContent` function (around line 71-72). Before the existing `const [view, setView] = useState<View>("tabs");` line, add the onboarding gate:

```typescript
function AppContent() {
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    localStorage.getItem('runecode-onboarding-complete') === 'true'
  );

  // Show onboarding wizard on first run
  if (!onboardingComplete) {
    return <Onboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  const [view, setView] = useState<View>("tabs");
  // ... rest of existing code
```

Note: This creates a conditional before hooks which is fine because the early return means the hooks below never run during onboarding. However, if the linter complains, wrap the existing hooks in a separate component:

```typescript
function AppContent() {
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    localStorage.getItem('runecode-onboarding-complete') === 'true'
  );

  if (!onboardingComplete) {
    return <Onboarding onComplete={() => setOnboardingComplete(true)} />;
  }

  return <AppMain />;
}

function AppMain() {
  const [view, setView] = useState<View>("tabs");
  // ... move ALL existing AppContent body here
```

- [ ] **Step 2: Verify TypeScript compiles and app renders**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: gate main app behind onboarding wizard on first run"
```

---

## Task 8: Add "Re-run Setup" Button to Settings

**Files:**
- Modify: `src/components/settings/SessionSettings.tsx`

- [ ] **Step 1: Add button at the bottom of the SessionSettings component**

Read the file first to find the right insertion point. Add before the closing `</div>` of the main container:

```tsx
{/* Re-run onboarding */}
<section>
  <h4 className="text-sm font-semibold mb-3">Setup Wizard</h4>
  <div className="rounded-lg border border-border p-4">
    <p className="text-xs text-muted-foreground mb-3">
      Re-run the initial setup wizard to check dependencies and update preferences.
    </p>
    <button
      onClick={() => {
        localStorage.removeItem('runecode-onboarding-complete');
        window.location.reload();
      }}
      className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-accent transition-colors"
    >
      Run Setup Wizard Again
    </button>
  </div>
</section>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/SessionSettings.tsx
git commit -m "feat: add 'Run Setup Wizard Again' button to settings"
```

---

## Task 9: Final Integration Test

- [ ] **Step 1: Clear onboarding flag and test**

Open browser devtools → Application → localStorage → delete `runecode-onboarding-complete`. Reload the app. The onboarding wizard should appear.

- [ ] **Step 2: Walk through all 8 steps**

Verify:
- Step 1: Node.js is detected (green check, auto-advances or shows version)
- Step 2: Claude Code is detected
- Step 3: Verification passes
- Steps 4-7: Preferences work, skip works
- Step 8: "Get Started" finishes and shows the main app

- [ ] **Step 3: Test re-run from settings**

Go to Settings → Session → "Run Setup Wizard Again" → wizard should reappear

- [ ] **Step 4: Verify TypeScript + Rust both compile clean**

```bash
npx tsc --noEmit
cd src-tauri && cargo check
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: onboarding wizard — first-run setup with dependency checks"
git push runecode main
```
