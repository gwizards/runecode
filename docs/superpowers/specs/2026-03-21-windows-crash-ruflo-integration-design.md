# Design: Windows Crash Fix + RuFlo Integration

**Date:** 2026-03-21
**Status:** Approved
**Approach:** Parallel tracks — Rust crash fix + all RuFlo features as non-overlapping changes

---

## 1. Problem Statement

### 1.1 Windows Instant Crash

RuneCode crashes immediately on launch on Windows. Root cause identified: seven Tauri plugins (`tauri-plugin-fs`, `tauri-plugin-http`, `tauri-plugin-process`, `tauri-plugin-updater`, `tauri-plugin-notification`, `tauri-plugin-clipboard-manager`, `tauri-plugin-global-shortcut`) are declared in `Cargo.toml` and granted permissions in `capabilities/default.json`, but are **never registered** with `.plugin()` in `main.rs`. In Tauri 2.x, the permission resolver panics at startup when a capability references an unregistered plugin. Secondary issues: two `.expect()` calls in `setup()` produce unrecoverable panics, and `USERPROFILE`/`APPDATA` Windows env vars are missing from `create_command_with_env()`.

### 1.2 RuFlo Integration

RuFlo (claude-flow v3) needs to be a first-class optional feature of RuneCode — surfaced during onboarding, wired into project creation, visible in the sidebar, and configurable in settings.

---

## 2. Scope

### In Scope

- Register all missing Tauri plugins in `main.rs`
- Harden `setup()` error handling
- Add Windows env vars to command builder
- RuFlo onboarding step (new step 4 of 9, optional)
- Automated MCP activation (runs `claude mcp add ...` from the UI)
- Automated `/setup-ruflo` slash command creation
- RuFlo section in `ProjectSidebar`
- RuFlo section in `Settings` (Integrations group)
- Project creation RuFlo auto-init
- New Tauri backend commands for all RuFlo operations
- Use RuFlo MCP + swarm for implementation

### Out of Scope

- Changes to existing onboarding steps (steps 1–3, 5–8)
- Changes to existing sidebar sections
- Changes to existing settings sections
- RuFlo cloud/account features
- Modifying the claude-flow CLI itself

---

## 3. Architecture

### 3.1 Track 1 — Windows Crash Fix (`src-tauri/src/main.rs`)

**Problem:** Missing `.plugin()` registrations cause Tauri permission resolver panic at startup.

**Fix:** Add all seven missing plugin registrations to the builder chain:

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_notification::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_global_shortcut::Builder::new().build())
```

**Fix 2:** Replace `.expect()` panics in `setup()` with graceful `?` returns so the setup closure returns `Result` and logs the error instead of crashing:

```rust
.setup(|app| {
    let conn = init_database(&app.handle())
        .map_err(|e| format!("DB init failed: {e}"))?;
    // ...
})
```

**Fix 3:** Add Windows-specific env vars to `create_command_with_env()`:

```rust
|| key == "USERPROFILE"
|| key == "APPDATA"
|| key == "LOCALAPPDATA"
|| key == "PROGRAMFILES"
|| key == "SYSTEMROOT"
```

---

### 3.2 Track 2 — RuFlo Backend (`src-tauri/src/commands/ruflo.rs`)

New command module. All commands are non-blocking and stream progress via Tauri events where applicable.

| Command | Signature | Description |
|---------|-----------|-------------|
| `check_ruflo_installed` | `() -> RuFloStatus` | Checks if `claude-flow` CLI is globally installed; returns version if found |
| `install_ruflo` | `(app: AppHandle) -> Result<String>` | Runs `npm install -g @claude-flow/cli@latest`; emits `ruflo-install-progress` events |
| `activate_ruflo_mcp` | `() -> Result<String>` | Runs `claude mcp add claude-flow -- npx -y @claude-flow/cli@latest` |
| `create_ruflo_slash_command` | `() -> Result<String>` | Creates `~/.claude/commands/setup-ruflo.md` with the setup-ruflo content |
| `init_ruflo_project` | `(path: String) -> Result<String>` | Runs `npx @claude-flow/cli@latest init` in the given project dir |
| `get_ruflo_project_status` | `(path: String) -> RuFloProjectStatus` | Reads `tasks/pending/`, `tasks/completed/`, `tasks/blocked/` counts |
| `get_ruflo_swarm_status` | `() -> RuFloSwarmStatus` | Runs `npx @claude-flow/cli@latest agent list --json` and `swarm status --json`; returns active agents + swarm state |

**Types:**

```rust
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub mcp_active: bool,
    pub slash_command_exists: bool,
}

pub struct RuFloProjectStatus {
    pub initialized: bool,  // tasks/ directory exists
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}

pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,
}

pub struct RuFloAgent {
    pub id: String,
    pub name: String,
    pub agent_type: String,  // "coder", "reviewer", etc.
    pub status: String,       // "running", "waiting", "idle"
}
```

Register the new module in `main.rs` and add all commands to the `invoke_handler!` macro.

---

### 3.3 Track 2 — RuFlo Onboarding Step

**File:** `src/components/Onboarding.tsx`

- `TOTAL_STEPS` bumped from `8` → `9`
- New `case 4` inserted; existing cases 4–8 shift to 5–9
- Step icon: `Sparkles` or a custom ⚡ element
- Step title: **"RuFlo — AI Swarm Manager"**
- Optional (`canSkip: true`)

**Step flow:**
1. On enter: call `check_ruflo_installed()` → if already installed, show "Already installed" + version, mark `passed`
2. If not installed: show feature bullets + **Install RuFlo** button
3. On install click: run `install_ruflo()`, stream progress to `TerminalOutput`
4. After install: auto-run `activate_ruflo_mcp()` → auto-run `create_ruflo_slash_command()`
5. All three complete → mark step `passed`, enable Next

**Feature bullets (Option A design):**
- Hierarchical swarms with 15+ agent types
- Autonomous task execution pipeline
- Claude Code MCP integration — activated automatically
- `/setup-ruflo` slash command in every project

**State:**
```typescript
const [rufloStatus, setRufloStatus] = useState<RuFloStatus | null>(null);
const [rufloInstalling, setRufloInstalling] = useState(false);
const [rufloLines, setRufloLines] = useState<string[]>([]);
```

---

### 3.4 Track 2 — Project Creation Auto-Init

**File:** `src/components/CreateProjectDialog.tsx`

After `api.initializeProject(projectPath, name)` succeeds:
1. Check if RuFlo is installed: `api.checkRufloInstalled()`
2. If installed → silently run `api.initRufloProject(projectPath)` in background
3. Run `api.createRufloSlashCommand()` (idempotent — safe to re-run)
4. No blocking UI — happens in the background, errors are swallowed with a console warning

No new UI elements in the dialog — this is fully automatic.

---

### 3.5 Track 2 — RuFlo Sidebar Section

**New file:** `src/components/sidebar/RuFloSection.tsx`

**Placement in `ProjectSidebar.tsx`:** Between `GitHubActionsSection` and the System group label.

**Design (approved: B structure + A agent cards):**

```
▾ ⚡ RuFlo        [status dot] Swarm Active
─────────────────────────────────────────
[  3 Pending  ] [  12 Done  ] [  1 Blocked  ]
─────────────────────────────────────────
Active Agents
┌──────────────────────────────────────┐
│ 🧠 coder-01                  running │
├──────────────────────────────────────┤
│ 🔍 reviewer-01               waiting │
└──────────────────────────────────────┘
Memory ████████░░░░░░░░  24 / 60
[  Run Init  ] [  View Log  ]
```

**Data fetching:**
- On mount: `api.getRufloProjectStatus(projectPath)` + `api.getRufloSwarmStatus()`
- Polling interval: 15 seconds for swarm status (same pattern as `ResourcesSection`)
- If RuFlo not installed → show "RuFlo not installed" with Install button

**Collapsed state:** Shows header row only — `⚡ RuFlo · N agents · N tasks`

---

### 3.6 Track 2 — RuFlo Settings Section

**New file:** `src/components/settings/RuFloSettings.tsx`

**New entry in `SettingsLayout.tsx`** under Integrations group:
```typescript
{ id: 'ruflo', label: 'RuFlo', icon: Zap }
```

**Content (Option A — scrollable cards):**

**Card 1 — Install Status**
- Status dot + version badge
- Uninstall button (destructive)
- Update button (`npm install -g @claude-flow/cli@latest` again)

**Card 2 — MCP Server**
- Status: Active / Inactive
- **Activate button** → calls `api.activateRufloMcp()` (runs the command automatically, no copy-paste)
- Deactivate button → calls `claude mcp remove claude-flow`
- Shows the command for reference (read-only monospace)

**Card 3 — /setup-ruflo Slash Command**
- Present / Missing indicator
- Recreate button → calls `api.createRufloSlashCommand()`
- File path display: `~/.claude/commands/setup-ruflo.md`

**Card 4 — Swarm Defaults**
- Topology select: `hierarchical` | `mesh` | `star`
- Max agents number input (default 8)
- Toggle: "Auto-init RuFlo on project create" (persisted in localStorage)

**Card 5 — Swarm Log**
- Button: "View `logs/swarm_log.txt`" → opens file in `ClaudeFileEditor`

**New `api` methods to add to `src/lib/api.ts`:**
```typescript
checkRufloInstalled(): Promise<RuFloStatus>
installRuflo(): Promise<string>
activateRufloMcp(): Promise<string>
createRufloSlashCommand(): Promise<string>
initRufloProject(path: string): Promise<string>
getRufloProjectStatus(path: string): Promise<RuFloProjectStatus>
getRufloSwarmStatus(): Promise<RuFloSwarmStatus>
```

---

## 4. Data Flow

```
User opens app (Windows)
  → Tauri setup() → all plugins registered → no panic
  → init_database() → error returned gracefully if fails
  → App loads normally

Onboarding Step 4
  → check_ruflo_installed()
  → [if not] Install button → install_ruflo() + activate_ruflo_mcp() + create_ruflo_slash_command()
  → step marked passed → onboarding continues

Create Project
  → initializeProject(path, name)
  → [if ruflo installed] initRufloProject(path) [background]
  → [if ruflo installed] createRufloSlashCommand() [background, idempotent]
  → onProjectCreated() callback fires immediately (not blocked)

Sidebar
  → getRufloProjectStatus(projectPath) on mount + every 15s
  → getRufloSwarmStatus() on mount + every 15s
  → renders collapsible section

Settings → RuFlo
  → checkRufloInstalled() on mount
  → Activate button → activateRufloMcp() → re-check status
```

---

## 5. File Changes

| File | Change |
|------|--------|
| `src-tauri/src/main.rs` | Add 7 plugin registrations, harden setup(), add Windows env vars |
| `src-tauri/src/commands/mod.rs` | Add `pub mod ruflo;` |
| `src-tauri/src/commands/ruflo.rs` | **New file** — all 7 RuFlo commands |
| `src/lib/api.ts` | Add 7 RuFlo method signatures |
| `src/components/Onboarding.tsx` | Add step 4, bump TOTAL_STEPS to 9 |
| `src/components/CreateProjectDialog.tsx` | Add background RuFlo init after project create |
| `src/components/sidebar/RuFloSection.tsx` | **New file** |
| `src/components/ProjectSidebar.tsx` | Import and render RuFloSection |
| `src/components/settings/RuFloSettings.tsx` | **New file** |
| `src/components/settings/SettingsLayout.tsx` | Add ruflo entry to Integrations group |
| `src/components/Settings.tsx` | Add case for `ruflo` section |

---

## 6. Error Handling

- All Tauri command errors are caught in frontend with `try/catch` — never crash the UI
- RuFlo install failure: show error in `TerminalOutput`, keep retry button
- MCP activation failure: show error message in settings card with retry
- `getRufloSwarmStatus()` failure: sidebar shows last-known state with a subtle "offline" indicator, does not throw
- Project init failure: logged to console, does not block project opening

---

## 7. Testing Requirements

- **Rust:** `cargo build` must succeed on Windows target; setup() must not panic if DB fails
- **Onboarding:** Step 4 renders, install flow completes, step can be skipped
- **Settings:** All 5 cards render; Activate MCP button triggers command and updates status
- **Sidebar:** Section renders with mock data; collapses/expands; handles missing RuFlo gracefully
- **Project create:** RuFlo init runs silently when installed; dialog not blocked when not installed

---

## 8. Implementation Strategy

Use RuFlo MCP + hierarchical swarm to implement this spec:

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

Swarm agent assignments:
- `coder` → Track 1 (Rust crash fix) + ruflo.rs backend commands
- `coder` → Onboarding step 4 + CreateProjectDialog changes
- `coder` → RuFloSection (sidebar) + RuFloSettings (settings)
- `tester` → Verify build, test all new paths
- `reviewer` → Code quality sign-off
