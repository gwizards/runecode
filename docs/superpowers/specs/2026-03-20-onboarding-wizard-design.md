# Onboarding Wizard — Design Spec

**Date:** 2026-03-20
**Status:** Approved

## Overview

Full-screen step-by-step onboarding wizard that runs on first launch. Checks dependencies (Node.js, Claude Code CLI), verifies Claude works, and collects user preferences. Cross-platform: Linux, macOS, Windows.

## Dependency Chain

```
Node.js (v18+) → Claude Code CLI → Claude Verification → [Preferences]
```

Steps 1-3 are **hard gates** (can't proceed without passing). Steps 4-8 are **preferences** (skippable with defaults).

## Steps

| # | Title | Gate | Description |
|---|-------|------|-------------|
| 1 | Node.js Runtime | Hard | Check `node --version`. If missing or <v18, offer auto-install + manual fallback. |
| 2 | Claude Code CLI | Hard | Check `claude --version` via existing binary detection. If missing, run `npm install -g @anthropic-ai/claude-code`. |
| 3 | Verify Claude | Hard | Run `claude --version`, show version string. Confirms CLI is functional. |
| 4 | Default Project | Soft | File picker or text input. Defaults: `~/Projects` (Linux/macOS), `%USERPROFILE%\Projects` (Windows). |
| 5 | Permission Mode | Soft | Radio cards: Ask (default, recommended), Accept Edits, Bypass. Writes to `useSessionConfig`. |
| 6 | Analytics | Soft | Toggle, defaults off. Calls `ConsentManager.grantConsent()` or `.revokeConsent()`. |
| 7 | Appearance | Soft | Dark/Light/System toggle. |
| 8 | Quick Tour | Soft | 3-4 slides showing tab system, agents, settings, shortcuts. "Get Started" finishes. |

## Platform-Specific Installation

### Node.js

| Platform | Auto-install | Fallback |
|----------|-------------|----------|
| Linux | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash - && sudo apt-get install -y nodejs` | Link to nodejs.org |
| macOS | `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh \| bash && source ~/.bashrc && nvm install 22` | Link to nodejs.org |
| Windows | Download + execute official `.msi` from nodejs.org via `tauri-plugin-shell` | Link to nodejs.org |

### Claude Code CLI

All platforms: `npm install -g @anthropic-ai/claude-code`

### Claude Verification

All platforms: `claude --version` — parse output, display version.

## UI Design

- **Layout:** Full-screen, centered glassmorphic card (~600px wide)
- **Progress:** Bar at top showing step N of 8
- **Each step:** Icon + title, status indicator (spinner/check/error), action area, Next/Skip buttons
- **Install steps:** Embedded scrollable terminal output area showing command progress
- **Transitions:** Fade/slide between steps via `motion/react`
- **Hard gate steps:** No Skip button. Next only enabled after check passes.
- **Preference steps:** Skip button available, uses sensible defaults.

## File Structure

### New Files
- `src/components/Onboarding.tsx` — Main wizard with all 8 steps
- `src/components/onboarding/StepCard.tsx` — Reusable step card shell
- `src/components/onboarding/TerminalOutput.tsx` — Scrollable command output area

### Modified Files
- `src/App.tsx` — Gate: render `<Onboarding>` when `runecode-onboarding-complete` not set
- `src-tauri/src/commands/claude.rs` — Add `check_node_installed`, `install_node`, `install_claude_code` commands
- `src-tauri/src/main.rs` — Register new commands
- `src-tauri/src/claude_binary.rs` — Fix Windows PATH separator (`:` → `;`)

### New Tauri Commands
- `check_node_installed` — Runs `node --version`, returns `{installed: bool, version: string}`
- `install_node` — Platform-aware Node.js installation with streaming output
- `install_claude_code` — Runs `npm install -g @anthropic-ai/claude-code` with streaming output

## State Management

- No new Zustand store or React context
- Wizard uses local `useState` for step tracking
- On completion: writes preferences to localStorage using existing keys (`runecode-session-config`, `runecode-analytics-settings`, etc.) and sets `runecode-onboarding-complete = "true"`
- Settings page gets "Run Setup Wizard Again" button that clears the flag

## Cross-Platform Bug Fix

Fix Windows PATH separator in `claude_binary.rs` line 668:
```rust
// Before: format!("{}:{}", node_bin_str, current_path)
// After:
let sep = if cfg!(windows) { ";" } else { ":" };
format!("{}{}{}", node_bin_str, sep, current_path)
```
Apply same fix at lines 682 and 688.

## Integration Point

In `App.tsx`, before rendering the main app:
```tsx
const [onboardingComplete] = useState(() =>
  localStorage.getItem('runecode-onboarding-complete') === 'true'
);

if (!onboardingComplete) {
  return <Onboarding onComplete={() => { /* set flag, reload */ }} />;
}
```
