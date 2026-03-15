# RuneCode Rebrand & Strategy Design Spec

## Summary

Rename the project from "Opcode" to "RuneCode" (by Wizards), establish the brand identity, and lay the foundation for both B2C viral adoption and future B2B enterprise expansion. This spec covers the rename, visual identity, and strategic vocabulary — not the enterprise features themselves.

## Brand Identity

**Product Name:** RuneCode (stylized as `rune` in CLI)
**Company:** Wizards (https://www.wizards.us)
**Website:** https://runecode.sh
**Creator:** Mr Polti (https://www.youtube.com/@MrPoltiOfficial)
**Tagline:** "A blazingly fast, beautiful desktop engine that turns Claude Code into a fully autonomous, local developer."

## Thematic Vocabulary

The "Rune" metaphor extends throughout the product:

| Concept | RuneCode Term | Where it appears |
|---------|--------------|-----------------|
| Command/prompt | Rune | Prompt input placeholder, docs |
| Execution/run | Cast | Status messages, logs |
| Session | Spell | Tab labels, session list |
| Agent | Familiar | Agent tabs, sidebar |
| Audit log | Grimoire | Enterprise feature (future) |
| Execution ledger | Ledger | Enterprise feature (future) |
| Checkpoint | Bookmark | Timeline navigator |
| Project config | Tome | .runecode/ directory |

## Rename Scope

### Code Changes

**Package & Binary names:**
- npm package: `opcode` → `runecode`
- Rust binary (desktop): `opcode` → `runecode`
- Rust binary (web): `opcode-web` → `runecode serve` (subcommand)
- Tauri app name: `Opcode` → `RuneCode`
- Window title: `Opcode` → `RuneCode`

**File & Directory renames:**
- `.opcode/` → `.runecode/` (project config directory)
- `.opcode/project.json` → `.runecode/project.json`
- Config references throughout codebase

**Code references (search & replace):**
- All `opcode` / `Opcode` / `OPCODE` strings in:
  - `package.json` (name, description, scripts)
  - `src-tauri/Cargo.toml` (package name, binary names)
  - `src-tauri/tauri.conf.json` (app name, identifier, window title)
  - `src-tauri/src/web_main.rs` (command name, about text)
  - `src-tauri/src/web_server.rs` (server name references)
  - `src/App.tsx` (title, branding)
  - `src/components/*.tsx` (any "Opcode" display strings)
  - `README.md`, `CONTRIBUTING.md`
  - `web_server.design.md`
  - localStorage keys prefixed with `opcode-` → `runecode-`
  - PostHog analytics project name

**Assets:**
- App icon: new RuneCode icon (rune symbol)
- Favicon: update `public/vite.svg` → RuneCode icon
- Splash/loading screen if any

### Git & GitHub

- Repository rename: `getAsterisk/opcode` → appropriate new org/repo name
- Update all GitHub URLs in docs
- Update issue/PR templates if any

## Visual Identity — Glassmorphic Design Language

The B2C strategy emphasizes "aesthetic superiority" — the UI should be screenshot-worthy. This aligns with and extends the display polish phase from the UI enhancements plan.

**Design principles:**
- **Glassmorphism:** Semi-transparent panels with blur, subtle borders, and depth
- **Dark-first:** The dark theme is the hero — optimized for screenshots and demo videos
- **Rune accents:** Subtle magical/arcane visual touches (glow effects, particle hints on execution)
- **Clean typography:** Monospace for code, clean sans-serif for UI

**CSS approach:**
- Extend existing Tailwind config with RuneCode design tokens
- Add glassmorphic utility classes:
  ```css
  .glass { @apply bg-background/80 backdrop-blur-xl border border-white/10; }
  .glass-elevated { @apply bg-background/60 backdrop-blur-2xl border border-white/15 shadow-xl; }
  ```
- Accent colors: purple (#8b5cf6) as primary "rune" color, with green (#22c55e) for success, blue (#3b82f6) for info

**Specific UI touches:**
- Sidebar uses `.glass` background
- Tab bar uses `.glass-elevated`
- Agent status dots get a subtle glow effect
- Skill execution badge gets a brief spark animation
- The prompt input area gets a subtle rune-pattern border glow when focused

## B2C / B2B Strategy Integration Points

This spec only covers the technical foundation. Strategy-specific features:

**B2C (included in this rename + UI enhancements):**
- Beautiful glassmorphic UI (display polish phase)
- "Rune" vocabulary in UI copy
- Open-source core with strong branding
- Demo-worthy visual effects

**B2B Enterprise (separate future spec — NOT in scope here):**
- Sandboxed execution (Docker/Firecracker)
- Grimoire (audit logging)
- RBAC / HITL controls
- Enterprise dashboard
- Team telemetry
- SOC2 compliance features

**PLG Infrastructure (separate future spec — NOT in scope here):**
- Landing page & docs site
- Enterprise licensing system
- Cloud-synced execution logs

## Implementation

### New Files

| File | Purpose |
|------|---------|
| `src/styles/glass.css` | Glassmorphic utility classes |
| `public/runecode-icon.svg` | App icon |
| `.runecode/` | Project config directory (replaces .opcode/) |

### Modified Files (Rename)

| File | Changes |
|------|---------|
| `package.json` | name, description |
| `src-tauri/Cargo.toml` | package name, binary names |
| `src-tauri/tauri.conf.json` | app identifier, window title |
| `src-tauri/src/web_main.rs` | command name, about text |
| `src-tauri/src/web_server.rs` | server references |
| `src/App.tsx` | title, branding strings |
| `src/components/*.tsx` | "Opcode" display strings |
| `src/styles.css` | Add glassmorphic tokens |
| `README.md` | Full rebrand |
| All localStorage keys | `opcode-*` → `runecode-*` |

### Phases

**Phase R1 — Rename:** Pure search-and-replace rename across all code and config. No visual changes. Verify build.

**Phase R2 — Visual Identity:** Add glassmorphic design tokens, update app icon, apply glass effects to sidebar/tab bar/prompt input. This merges with Phase 4 (Display Polish) of the UI enhancements plan.

**Phase R3 — Vocabulary:** Update UI copy to use RuneCode thematic terms (Rune, Cast, Familiar, etc.) in appropriate places. Subtle, not overbearing — these are flavor, not jargon.

## Risks

- **localStorage migration:** Users with existing `opcode-*` localStorage keys need a one-time migration to `runecode-*`. Add a migration check on app startup.
- **Breaking changes:** The `.opcode/` → `.runecode/` directory rename could break existing project configs. Add fallback: if `.runecode/` doesn't exist but `.opcode/` does, read from `.opcode/` and suggest migration.
- **Glassmorphism performance:** `backdrop-blur` can be expensive on low-end GPUs. Add a "Reduce visual effects" setting that disables blur.
