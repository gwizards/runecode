# Design: Windows Crash Fix + RuFlo Integration

**Date:** 2026-03-21
**Status:** Approved
**Approach:** Parallel tracks — Rust crash fix + all RuFlo features as non-overlapping changes

---

## 1. Problem Statement

### 1.1 Windows Instant Crash

RuneCode crashes immediately on launch on Windows. Root cause: seven Tauri plugins (`tauri-plugin-fs`, `tauri-plugin-http`, `tauri-plugin-process`, `tauri-plugin-updater`, `tauri-plugin-notification`, `tauri-plugin-clipboard-manager`, `tauri-plugin-global-shortcut`) are declared in `Cargo.toml` and granted permissions in `capabilities/default.json`, but are **never registered** with `.plugin()` in `main.rs`. In Tauri 2.x the permission resolver panics at startup when a capability references an unregistered plugin.

Secondary issues:
- Two `.expect()` calls in `setup()` on the `init_database` return produce unrecoverable panics if the DB cannot be created
- `USERPROFILE`/`APPDATA` Windows env vars are missing from the allowlist in `create_command_with_env()`

### 1.2 RuFlo Integration

RuFlo (claude-flow v3) needs to be a first-class optional feature of RuneCode — surfaced during onboarding, wired into project creation, visible in the sidebar, and configurable in settings.

---

## 2. Scope

### In Scope

- Register all 7 missing Tauri plugins in `main.rs`
- Harden `setup()` error handling (degraded-mode continue, not abort)
- Add Windows env vars to `create_command_with_env()` allowlist
- RuFlo onboarding step (new step 4 of 9, optional/skippable)
- Automated CLI install, MCP activation, and slash command creation
- RuFlo section in `ProjectSidebar`
- RuFlo section in `Settings` (Integrations group, id `"ruflo"`, label `"RuFlo"`, icon `Zap`)
- Project creation RuFlo auto-init (success path only)
- 7 new Tauri backend commands in `src-tauri/src/commands/ruflo.rs`
- Use RuFlo MCP + hierarchical swarm for implementation

### Out of Scope

- Changes to existing onboarding steps 1–3 and their content
- Changes to existing sidebar sections
- Changes to existing settings sections
- RuFlo cloud/account features
- Modifying the claude-flow CLI itself

---

## 3. Architecture

### 3.1 Track 1 — Windows Crash Fix

#### Plugin registrations (`main.rs`)

Add all seven missing plugins to the builder chain, **in addition** to the existing `dialog` and `shell` registrations:

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

#### `setup()` error hardening (`main.rs`)

The two `.expect("Failed to initialize agents database")` calls are replaced with log-and-continue. If `init_database` fails, the app starts in **degraded mode** (no agents DB, no proxy settings loaded) rather than aborting. A warning is logged; the user is not shown an error dialog.

```rust
.setup(|app| {
    let db_result = init_database(&app.handle());
    match db_result {
        Ok(conn) => {
            // load proxy settings, then re-open for app.manage(...)
            let proxy_settings = load_proxy_from_conn(&conn);
            apply_proxy_settings(&proxy_settings);
            match init_database(&app.handle()) {
                Ok(conn2) => app.manage(AgentDb(Mutex::new(conn2))),
                Err(e) => log::warn!("DB re-open failed (degraded mode): {e}"),
            }
        }
        Err(e) => log::warn!("DB init failed (degraded mode): {e}"),
    }
    // checkpoint, process registry, Claude process state — always initialized
    // vibrancy — macOS only, already cfg-gated
    Ok(())
})
```

#### Windows env vars (`claude_binary.rs` — `create_command_with_env`)

The function uses an **explicit allowlist**. Add these four keys to the allowlist:

```rust
|| key == "USERPROFILE"
|| key == "APPDATA"
|| key == "LOCALAPPDATA"
|| key == "SYSTEMROOT"
```

This is an **additive** change to the existing list — no other logic changes.

---

### 3.2 Track 2 — RuFlo Backend (`src-tauri/src/commands/ruflo.rs`)

New file. All commands use `#[tauri::command]`. `AppHandle` is injected only where event emission is needed (install progress streaming).

#### Types (all derive `Serialize`, `Deserialize`, `Clone`)

```rust
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,   // e.g. "3.1.2"
    pub mcp_active: bool,          // true if "claude-flow" appears in `claude mcp list` output
    pub slash_command_exists: bool, // true if ~/.claude/commands/setup-ruflo.md exists
}

pub struct RuFloProjectStatus {
    pub initialized: bool,  // true if tasks/ directory exists in project root
    pub pending: usize,     // count of .md files in tasks/pending/
    pub completed: usize,   // count of .md files in tasks/completed/
    pub blocked: usize,     // count of .md files in tasks/blocked/
}

pub struct RuFloAgent {
    pub id: String,
    pub name: String,
    pub agent_type: String,  // "coder", "reviewer", "tester", etc.
    pub status: String,      // "running" | "waiting" | "idle"
}

pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,   // count from `memory list` output, 0 if unavailable
}
```

#### Command signatures

```rust
// No AppHandle needed — synchronous checks only
#[tauri::command]
pub fn check_ruflo_installed() -> RuFloStatus

// AppHandle required — emits "ruflo-install-progress" events during streaming
#[tauri::command]
pub async fn install_ruflo(app: tauri::AppHandle) -> Result<String, String>

// No AppHandle — runs claude mcp add ... and waits for exit
#[tauri::command]
pub async fn activate_ruflo_mcp() -> Result<String, String>

// No AppHandle — writes file, no streaming
#[tauri::command]
pub fn create_ruflo_slash_command() -> Result<String, String>

// No AppHandle — runs CLI init, waits for exit
#[tauri::command]
pub async fn init_ruflo_project(path: String) -> Result<String, String>

// No AppHandle — reads filesystem only
#[tauri::command]
pub fn get_ruflo_project_status(path: String) -> RuFloProjectStatus

// No AppHandle — runs CLI commands, waits, returns parsed JSON
#[tauri::command]
pub async fn get_ruflo_swarm_status() -> RuFloSwarmStatus
```

#### `activate_ruflo_mcp()` invocation pattern

Uses the existing `crate::claude_binary::silent_command` pattern (not the shell plugin, not `create_command_with_env`) to run `claude` directly as a child process:

```rust
let output = crate::claude_binary::silent_command("claude")
    .args(["mcp", "add", "claude-flow", "--", "npx", "-y", "@claude-flow/cli@latest"])
    .output()
    .map_err(|e| format!("Failed to run claude mcp add: {e}"))?;
```

No new capability entries are needed — `silent_command` uses `std::process::Command`, not the Tauri shell plugin.

#### `install_ruflo()` invocation pattern

Same pattern via `silent_command("npm")`. Emits `ruflo-install-progress` Tauri events for each stdout line:

```rust
app.emit("ruflo-install-progress", line)?;
```

#### Registration in `main.rs` `invoke_handler`

Add to the existing `tauri::generate_handler![]` macro:

```rust
commands::ruflo::check_ruflo_installed,
commands::ruflo::install_ruflo,
commands::ruflo::activate_ruflo_mcp,
commands::ruflo::create_ruflo_slash_command,
commands::ruflo::init_ruflo_project,
commands::ruflo::get_ruflo_project_status,
commands::ruflo::get_ruflo_swarm_status,
```

---

### 3.3 RuFlo Onboarding Step (`src/components/Onboarding.tsx`)

- `TOTAL_STEPS` changes from `8` → `9`
- A new `case 4` is inserted; the existing cases `4`, `5`, `6`, `7`, `8` are renumbered to `5`, `6`, `7`, `8`, `9` respectively. The step numbers passed to `<StepCard step={N} totalSteps={TOTAL_STEPS}>` are updated accordingly.
- The existing effects that check `currentStep === 4`, `5`, `6`, `7`, `8` are updated to `5`, `6`, `7`, `8`, `9`

**Step 4 state additions:**

```typescript
const [rufloStatus, setRufloStatus] = useState<RuFloStatus | null>(null);
const [rufloInstalling, setRufloInstalling] = useState(false);
const [rufloLines, setRufloLines] = useState<string[]>([]);
```

**Step 4 flow:**
1. On `currentStep === 4` enter (via `useEffect`): call `api.checkRufloInstalled()` → set `rufloStatus`
2. If `rufloStatus.installed` → status `passed`, show version badge, enable Next
3. If not installed → show feature bullets + **Install RuFlo** button, `canSkip: true`
4. On install click: `setRufloInstalling(true)` → `api.installRuflo()` (streams `ruflo-install-progress` events into `rufloLines`) → `api.activateRufloMcp()` → `api.createRufloSlashCommand()` (sequential) → `setStatus(4, 'passed')`
5. Install failure → `setStatus(4, 'failed')`, show retry button

**Skip behavior:** Calls `skipStep()` which calls `setStatus(4, 'skipped')`. Additionally persists `localStorage.setItem('runecode-ruflo-skipped', 'true')`. The sidebar/settings still check RuFlo at runtime — this key only suppresses the onboarding prompt on re-run (i.e., if the user runs Setup Wizard again via Settings).

**Feature bullets (Option A design):**
- Hierarchical swarms with 15+ agent types
- Autonomous task execution pipeline
- Claude Code MCP integration — activated automatically
- `/setup-ruflo` slash command available in all projects

---

### 3.4 Project Creation Auto-Init (`src/components/CreateProjectDialog.tsx`)

After `api.initializeProject(projectPath, name)` **succeeds** (inside the `try` block, before `onProjectCreated` callback):

```typescript
// Fire-and-forget — do not await, do not block dialog close
void (async () => {
  try {
    const rufloStatus = await api.checkRufloInstalled();
    if (rufloStatus.installed) {
      await api.initRufloProject(projectPath);
      await api.createRufloSlashCommand();
    }
  } catch (err) {
    console.warn('[RuFlo] Background init failed:', err);
  }
})();
```

This is **not** called in the `catch` block (error/fallback path). The `onProjectCreated` callback fires immediately — the dialog is not held open.

---

### 3.5 RuFlo Sidebar Section (`src/components/sidebar/RuFloSection.tsx`)

New file, wrapped in `<SectionErrorBoundary>` in `ProjectSidebar.tsx`, placed between `GitHubActionsSection` and the `System` group label.

**Collapsed state** (click header to toggle): shows `⚡ RuFlo · N agents · N tasks` inline.

**Expanded body:**
```
[status dot] Swarm Active / Inactive
──────────────────────────────────────
[  Pending: 3  ] [  Done: 12  ] [  Blocked: 1  ]   ← 3-col grid
──────────────────────────────────────
Active Agents
┌──────────────────────────────────────────────────┐
│ 🧠 coder-01                              running  │ ← card row with bg
├──────────────────────────────────────────────────┤
│ 🔍 reviewer-01                           waiting  │
└──────────────────────────────────────────────────┘
Memory ████████░░░░░░░░  24 / 60              ← progress bar
[  Run Init  ] [  View Log  ]
```

**Polling:**
- Data is fetched on mount via `Promise.all([api.getRufloProjectStatus(projectPath), api.getRufloSwarmStatus()])`
- Polling uses `setInterval` (not recursive `setTimeout`), cleared on unmount
- Interval: **15 seconds** when the section is **expanded only**. Polling pauses when collapsed (`isExpanded === false`) to avoid background churn. Resumes (and triggers an immediate fetch) when expanded.
- On fetch error: retain last-known data, show a subtle `• stale` text badge next to the status dot. No throw, no toast.

**When RuFlo not installed:** Show a compact card — "RuFlo not installed" + **Install** button that links to onboarding step (dispatches `runecode:open-settings` or triggers a re-run of onboarding).

---

### 3.6 RuFlo Settings Section (`src/components/settings/RuFloSettings.tsx`)

**`SettingsLayout.tsx` entry** added to the `integrations` section group:

```typescript
{ id: 'ruflo', label: 'RuFlo', icon: Zap }
```

The `id: 'ruflo'` string is used in `Settings.tsx`'s `activeSection === 'ruflo'` switch case to render `<RuFloSettings />`.

**Five scrollable cards (Option A):**

**Card 1 — Install Status**
- Fields: status dot, version badge (`rufloStatus.version`), install path (npm global)
- Buttons: **Update** (`npm install -g @claude-flow/cli@latest`), **Uninstall** (destructive, confirm dialog)

**Card 2 — MCP Server**
- Status indicator using `rufloStatus.mcp_active`
- **Activate** button → calls `api.activateRufloMcp()` → re-calls `api.checkRufloInstalled()` to refresh
- **Deactivate** button → calls `silent_command("claude").args(["mcp", "remove", "claude-flow"])` via a new `deactivate_ruflo_mcp` command (added to ruflo.rs)
- Shows command read-only in monospace for reference

**Card 3 — /setup-ruflo Slash Command**
- Status from `rufloStatus.slash_command_exists`
- **Recreate** button → `api.createRufloSlashCommand()`
- Shows path: `~/.claude/commands/setup-ruflo.md`

**Card 4 — Swarm Defaults**
- Topology select (`hierarchical` / `mesh` / `star`) — persisted in `localStorage` key `runecode-ruflo-topology`
- Max agents number input — persisted in `localStorage` key `runecode-ruflo-max-agents`
- Toggle: "Auto-init RuFlo on project create" — persisted in `localStorage` key `runecode-ruflo-auto-init`

**Card 5 — Swarm Log**
- Button: "View `logs/swarm_log.txt`" — dispatches `runecode:open-file` custom event or navigates to `ClaudeFileEditor` with the log path

---

### 3.7 API Layer (`src/lib/api.ts`)

New TypeScript interfaces:

```typescript
export interface RuFloStatus {
  installed: boolean;
  version: string | null;
  mcp_active: boolean;
  slash_command_exists: boolean;
}

export interface RuFloProjectStatus {
  initialized: boolean;
  pending: number;
  completed: number;
  blocked: number;
}

export interface RuFloAgent {
  id: string;
  name: string;
  agent_type: string;
  status: string;
}

export interface RuFloSwarmStatus {
  swarm_active: boolean;
  agents: RuFloAgent[];
  memory_entries: number;
}
```

New methods on the `api` object:

```typescript
checkRufloInstalled(): Promise<RuFloStatus>
installRuflo(): Promise<string>
activateRufloMcp(): Promise<string>
createRufloSlashCommand(): Promise<string>
initRufloProject(path: string): Promise<string>
getRufloProjectStatus(path: string): Promise<RuFloProjectStatus>
getRufloSwarmStatus(): Promise<RuFloSwarmStatus>
deactivateRufloMcp(): Promise<string>
```

All use the existing `apiCall()` wrapper pattern.

---

## 4. Data Flow

```
User opens app (Windows)
  → Tauri setup() → all 9 plugins registered → no permission panic
  → init_database() fails → log warn, continue in degraded mode
  → App loads normally

Onboarding Step 4
  → checkRufloInstalled() on enter
  → [not installed] Install → installRuflo() → activateRufloMcp() → createRufloSlashCommand()
  → [installed] show version, mark passed
  → [skipped] persist runecode-ruflo-skipped=true

Create Project (success path only)
  → initializeProject(path, name) succeeds
  → fire-and-forget: checkRufloInstalled() → initRufloProject(path) → createRufloSlashCommand()
  → onProjectCreated() fires immediately, dialog closes

Sidebar RuFlo section
  → mount: fetch project status + swarm status
  → expanded: poll every 15s; pauses when collapsed
  → error: stale badge, retain last data

Settings → RuFlo
  → mount: checkRufloInstalled()
  → Activate button → activateRufloMcp() → checkRufloInstalled() refresh
  → Deactivate button → deactivateRufloMcp() → refresh
```

---

## 5. File Changes

| File | Change |
|------|--------|
| `src-tauri/src/main.rs` | Add 9 plugin registrations (including 7 new); harden `setup()` to degraded-mode continue; add 7 ruflo commands to `invoke_handler!`; add Windows env vars |
| `src-tauri/src/commands/mod.rs` | Add `pub mod ruflo;` |
| `src-tauri/src/commands/ruflo.rs` | **New file** — 8 commands (7 listed + `deactivate_ruflo_mcp`), 4 types |
| `src-tauri/src/claude_binary.rs` | Add 4 Windows env vars to `create_command_with_env` allowlist |
| `src/lib/api.ts` | Add 4 interfaces, 8 method signatures |
| `src/components/Onboarding.tsx` | Add step 4; renumber steps 4→5 through 8→9; bump `TOTAL_STEPS` to 9; add 3 state vars |
| `src/components/CreateProjectDialog.tsx` | Add fire-and-forget RuFlo init in success path only |
| `src/components/sidebar/RuFloSection.tsx` | **New file** |
| `src/components/ProjectSidebar.tsx` | Import and render `RuFloSection` in `SectionErrorBoundary` |
| `src/components/settings/RuFloSettings.tsx` | **New file** — 5 cards |
| `src/components/settings/SettingsLayout.tsx` | Add `{ id: 'ruflo', label: 'RuFlo', icon: Zap }` to integrations group |
| `src/components/Settings.tsx` | Add `case 'ruflo': return <RuFloSettings />` |

---

## 6. Error Handling

| Scenario | Behavior |
|----------|----------|
| DB init fails on startup | Log warn, continue in degraded mode (no agent history) |
| Plugin registration error | Tauri handles — no longer causes startup panic |
| `installRuflo()` fails | Show error in `TerminalOutput`, keep retry button visible |
| `activateRufloMcp()` fails | Show inline error in settings card with retry button |
| `createRufloSlashCommand()` fails | Show inline error with retry; non-fatal |
| `getRufloSwarmStatus()` fetch fails | Retain last-known data; show `• stale` badge; no toast |
| RuFlo project init fails (background) | `console.warn` only; dialog not blocked |
| RuFlo not installed at sidebar render | Render "not installed" card with Install CTA |

---

## 7. Testing Requirements

- **Rust:** `cargo build` succeeds; `setup()` does not panic when DB creation fails; all 8 ruflo commands compile
- **Onboarding:** Step 4 renders; install flow (3 sequential commands) completes; step can be skipped; `runecode-ruflo-skipped` set in localStorage; steps 5–9 still render correctly after renumbering
- **Settings:** All 5 cards render; Activate MCP triggers command and refreshes status; Deactivate works; Recreate slash command works
- **Sidebar:** Expands/collapses; polling starts on expand, stops on collapse; stale badge appears on simulated error; "not installed" fallback renders
- **Project create:** RuFlo init fires only on success path; dialog closes immediately without waiting

---

## 8. Implementation — Swarm Execution

```bash
npx @claude-flow/cli@latest swarm init --topology hierarchical --max-agents 8 --strategy specialized
```

| Agent | Task |
|-------|------|
| `coder-rust` | Track 1: plugin registrations, setup() hardening, Windows env vars, ruflo.rs backend |
| `coder-onboarding` | Onboarding step 4 + step renumbering + CreateProjectDialog changes |
| `coder-ui` | RuFloSection (sidebar) + RuFloSettings (settings) + SettingsLayout + Settings.tsx + api.ts |
| `tester` | Verify build, test all new paths per section 7 |
| `reviewer` | Code quality sign-off |
