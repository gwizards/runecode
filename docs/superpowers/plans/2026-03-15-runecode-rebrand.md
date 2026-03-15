# RuneCode Rebrand Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename Opcode to RuneCode throughout the codebase, establish glassmorphic visual identity, and apply thematic vocabulary.

**Architecture:** Three phases: R1 (pure rename — no visual changes), R2 (glassmorphic design tokens and visual identity), R3 (thematic vocabulary in UI copy). Each phase is independently shippable. This plan should be executed BEFORE the UI enhancements plan.

**Tech Stack:** React 18, TypeScript, Tailwind CSS v4, Rust/Tauri 2

**Spec:** `docs/superpowers/specs/2026-03-15-runecode-rebrand-design.md`

---

## Chunk 1: Phase R1 — Pure Rename

### Task 1: Rename package configuration files

**Files:**
- Modify: `package.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Update package.json**

Change the `name` field and any `opcode` references:

```json
{
  "name": "runecode",
  "description": "RuneCode - A blazingly fast desktop engine for Claude Code"
}
```

Also update any scripts that reference `opcode`.

- [ ] **Step 2: Update src-tauri/Cargo.toml**

Change package name and binary targets:

```toml
[package]
name = "runecode"

[[bin]]
name = "runecode"
path = "src/main.rs"

[[bin]]
name = "runecode-web"
path = "src/web_main.rs"
```

- [ ] **Step 3: Update src-tauri/tauri.conf.json**

Read the file first, then update:
- `productName` → `"RuneCode"`
- `identifier` → `"us.wizards.runecode"` (or appropriate identifier)
- `title` → `"RuneCode"`
- Any `opcode` references in window config

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun install && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add package.json src-tauri/Cargo.toml src-tauri/tauri.conf.json bun.lock
git commit -m "refactor: rename package configs from Opcode to RuneCode"
```

### Task 2: Rename Rust backend references

**Files:**
- Modify: `src-tauri/src/web_main.rs`
- Modify: `src-tauri/src/web_server.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Update web_main.rs**

Read the file, then change:

```rust
#[derive(Parser)]
#[command(name = "runecode")]
#[command(about = "RuneCode Web Server - Run RuneCode in your browser")]
struct Args {
```

Update all println messages:
```rust
println!("🚀 Starting RuneCode Web Server...");
println!("RuneCode running at http://{}:{}", args.host, args.port);
```

- [ ] **Step 2: Update web_server.rs**

Search for all `opcode` / `Opcode` strings in `web_server.rs` and replace:
- Server name references → "RuneCode"
- Any log messages or error strings
- Comment references

- [ ] **Step 3: Update main.rs**

Read `src-tauri/src/main.rs` and update any `opcode` / `Opcode` references in window titles, app names, or log messages.

- [ ] **Step 4: Verify Rust build**

```bash
cd /home/koves/GitHub/opcode/src-tauri && cargo build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/
git commit -m "refactor: rename Rust backend references from Opcode to RuneCode"
```

### Task 3: Rename frontend references

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/*.tsx` (any files containing "Opcode" display strings)
- Modify: `src/lib/*.ts` (any adapter/config references)

- [ ] **Step 1: Find all frontend Opcode references**

```bash
cd /home/koves/GitHub/opcode && grep -rn -i "opcode" src/ --include="*.tsx" --include="*.ts" --include="*.css" | grep -v node_modules | grep -v ".superpowers"
```

- [ ] **Step 2: Update App.tsx**

Replace all "Opcode" display strings with "RuneCode". Update the document title, any branding text, about dialogs, etc.

- [ ] **Step 3: Update all component files**

For each file found in Step 1, replace:
- `"Opcode"` → `"RuneCode"` (display strings)
- `"opcode"` → `"runecode"` (identifiers, class names)
- Keep variable names as-is if they don't appear in UI

- [ ] **Step 4: Rename localStorage keys**

Search for all `localStorage.getItem('opcode-` and `localStorage.setItem('opcode-` patterns. Update to `runecode-` prefix.

Add a migration function in `src/App.tsx` that runs once on startup:

```typescript
function migrateLocalStorage() {
  const migrated = localStorage.getItem('runecode-migrated');
  if (migrated) return;

  // Migrate all opcode-* keys to runecode-*
  const keys = Object.keys(localStorage).filter(k => k.startsWith('opcode-'));
  for (const key of keys) {
    const newKey = key.replace('opcode-', 'runecode-');
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem('runecode-migrated', 'true');
}
```

Call this in the App component's initialization.

- [ ] **Step 5: Update PostHog analytics project name**

In `src/lib/analytics.ts` or wherever PostHog is initialized, update the project/app name reference.

- [ ] **Step 6: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 7: Commit**

```bash
git add src/
git commit -m "refactor: rename all frontend references from Opcode to RuneCode"
```

### Task 4: Rename config directory and documentation

**Files:**
- Modify: All references to `.opcode/` → `.runecode/`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `web_server.design.md`

- [ ] **Step 1: Update .opcode/ references to .runecode/**

```bash
cd /home/koves/GitHub/opcode && grep -rn "\.opcode" src/ src-tauri/ --include="*.tsx" --include="*.ts" --include="*.rs"
```

Replace all `.opcode/` path references with `.runecode/`. Add fallback logic where config is read:

```typescript
// Frontend fallback
const configDir = fs.existsSync('.runecode') ? '.runecode' : '.opcode';
```

```rust
// Rust fallback
let config_dir = if Path::new(".runecode").exists() {
    ".runecode"
} else if Path::new(".opcode").exists() {
    ".opcode"  // Legacy fallback
} else {
    ".runecode"
};
```

- [ ] **Step 2: Update README.md**

Rebrand the README:
- Project name: RuneCode
- Description: Update with new tagline
- Creator credit: "Created by [Mr Polti](https://www.youtube.com/@MrPoltiOfficial) from [Wizards](https://www.wizards.us)"
- Installation instructions: update binary names
- All `opcode` CLI examples → `runecode`

- [ ] **Step 3: Update CONTRIBUTING.md and web_server.design.md**

Replace all `opcode` / `Opcode` references.

- [ ] **Step 4: Update spec and plan docs**

Update the spec and plan filenames or add notes that "Opcode" references in existing docs refer to the pre-rename project.

- [ ] **Step 5: Verify full build**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: complete Opcode → RuneCode rename across codebase and docs"
```

---

## Chunk 2: Phase R2 — Glassmorphic Visual Identity

### Task 5: Add glassmorphic design tokens

**Files:**
- Modify: `src/styles.css` — add glass utility classes
- Create: `public/runecode-icon.svg` — app icon placeholder

- [ ] **Step 1: Add glass CSS utilities to styles.css**

Add to `src/styles.css`:

```css
/* RuneCode Glassmorphic Design Tokens */
@layer utilities {
  .glass {
    background: hsl(var(--background) / 0.8);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid hsl(var(--foreground) / 0.1);
  }

  .glass-elevated {
    background: hsl(var(--background) / 0.6);
    backdrop-filter: blur(40px);
    -webkit-backdrop-filter: blur(40px);
    border: 1px solid hsl(var(--foreground) / 0.15);
    box-shadow: 0 8px 32px hsl(var(--background) / 0.4);
  }

  .glass-subtle {
    background: hsl(var(--background) / 0.9);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid hsl(var(--foreground) / 0.05);
  }

  .rune-glow {
    box-shadow: 0 0 15px hsl(var(--primary) / 0.3), 0 0 45px hsl(var(--primary) / 0.1);
  }

  .rune-glow-sm {
    box-shadow: 0 0 8px hsl(var(--primary) / 0.2);
  }

  .rune-pulse {
    animation: rune-pulse 2s ease-in-out infinite;
  }

  @keyframes rune-pulse {
    0%, 100% { box-shadow: 0 0 5px hsl(var(--primary) / 0.2); }
    50% { box-shadow: 0 0 20px hsl(var(--primary) / 0.4); }
  }
}
```

- [ ] **Step 2: Update primary color to rune purple**

In `src/styles.css`, find the CSS variables for the theme and update the primary color:

```css
--primary: 263 70% 50%; /* Purple #8b5cf6 */
```

Keep the existing color as a secondary if needed.

- [ ] **Step 3: Create app icon placeholder**

Create `public/runecode-icon.svg` — a simple rune-themed SVG icon. This can be refined later with proper design:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#1a1625"/>
  <path d="M32 8L20 28h8v20l12-20h-8V8z" fill="#8b5cf6" stroke="#a78bfa" stroke-width="1.5"/>
</svg>
```

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/styles.css public/runecode-icon.svg
git commit -m "feat: add glassmorphic design tokens and RuneCode icon"
```

### Task 6: Apply glass effects to key UI surfaces

**Files:**
- Modify: `src/components/ProjectSidebar.tsx` — glass background
- Modify: `src/components/TabManager.tsx` — glass tab bar
- Modify: `src/components/FloatingPromptInput.tsx` — rune glow on focus

- [ ] **Step 1: Apply glass to ProjectSidebar**

In `ProjectSidebar.tsx`, update the sidebar container class:

```tsx
// Replace: className="... border-l border-border bg-background ..."
// With:
className="... glass border-l-0 ..."
```

- [ ] **Step 2: Apply glass to tab bar**

In `TabManager.tsx`, update the tab bar container:

```tsx
// Add glass-subtle to the tab bar wrapper
className="... glass-subtle ..."
```

- [ ] **Step 3: Add rune glow to prompt input on focus**

In `FloatingPromptInput.tsx`, find the main input/textarea wrapper and add focus glow:

```tsx
className={`... transition-shadow ${isFocused ? 'rune-glow' : ''}`}
```

- [ ] **Step 4: Add "Reduce visual effects" setting**

In `Settings.tsx`, add a toggle:

```tsx
<div className="flex items-center justify-between">
  <div>
    <label className="text-sm font-medium">Reduce visual effects</label>
    <p className="text-xs text-muted-foreground">Disable blur and glow effects for performance</p>
  </div>
  <Switch
    checked={reducedEffects}
    onCheckedChange={(checked) => {
      localStorage.setItem('runecode-reduced-effects', String(checked));
      document.documentElement.classList.toggle('reduced-effects', checked);
    }}
  />
</div>
```

Add to `styles.css`:

```css
.reduced-effects .glass,
.reduced-effects .glass-elevated,
.reduced-effects .glass-subtle {
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  background: hsl(var(--background));
}

.reduced-effects .rune-glow,
.reduced-effects .rune-glow-sm {
  box-shadow: none;
}
```

- [ ] **Step 5: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 6: Commit**

```bash
git add src/components/ProjectSidebar.tsx src/components/TabManager.tsx src/components/FloatingPromptInput.tsx src/components/Settings.tsx src/styles.css
git commit -m "feat: apply glassmorphic effects to sidebar, tabs, and prompt input"
```

---

## Chunk 3: Phase R3 — Thematic Vocabulary

### Task 7: Update UI copy with RuneCode vocabulary

**Files:**
- Modify: `src/components/FloatingPromptInput.tsx` — placeholder text
- Modify: `src/components/TabManager.tsx` — tab labels
- Modify: `src/components/ClaudeCodeSession.tsx` — status messages
- Modify: `src/components/AgentExecution.tsx` — agent terminology

- [ ] **Step 1: Update prompt input placeholder**

In `FloatingPromptInput.tsx`, find the placeholder text and update:

```tsx
placeholder="Cast a rune..." // or "Enter a rune..."
```

Keep it subtle — this is flavor text, not jargon that confuses.

- [ ] **Step 2: Update session/tab labels**

In relevant components, optionally use "Spell" for sessions:
- New tab button tooltip: "New Spell" (or keep "New Session" — user preference)
- This is the most debatable change — keep "Session" if "Spell" feels forced

- [ ] **Step 3: Update agent references to "Familiar"**

In agent-related components, update display text:
- Agent tab labels: keep technical name but add "Familiar" as category label
- Agent status badge: "2 familiars running" (or "2 agents running" if too whimsical)
- This should be configurable or at least tasteful — don't overdo the theming

- [ ] **Step 4: Update status messages**

In `ClaudeCodeSession.tsx`, update status text where appropriate:
- "Executing..." → "Casting..." (only in UI status, not in actual command output)
- "Complete" → "Complete" (keep this — no need to change everything)

- [ ] **Step 5: Verify build and review UI copy**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

Open the app and review all changed copy. Ensure it feels cohesive but not forced. Roll back any changes that feel awkward.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add RuneCode thematic vocabulary to UI copy"
```

### Task 8: Final integration and verification

- [ ] **Step 1: Full build check**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build 2>&1 | tail -30
```

- [ ] **Step 2: Search for remaining Opcode references**

```bash
cd /home/koves/GitHub/opcode && grep -rn -i "opcode" src/ src-tauri/src/ --include="*.tsx" --include="*.ts" --include="*.rs" --include="*.json" --include="*.toml" | grep -v node_modules | grep -v target | grep -v ".superpowers" | grep -v "docs/"
```

Any remaining references should be either:
- Internal variable names (acceptable to keep)
- Legacy fallback code (acceptable)

- [ ] **Step 3: Manual smoke test**

Open the app and verify:
1. Window title shows "RuneCode"
2. About dialog/branding shows RuneCode by Wizards
3. Glassmorphic effects render on sidebar, tabs, prompt
4. "Reduce visual effects" toggle works
5. App icon updated
6. localStorage migrated from opcode-* to runecode-*

- [ ] **Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "feat: complete RuneCode rebrand — rename, visual identity, vocabulary"
```
