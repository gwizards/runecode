# Windows Crash Fix + RuFlo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Windows instant-crash (7 unregistered Tauri plugins + setup panics) and add RuFlo as an optional first-class feature with onboarding step, project auto-init, sidebar section, and settings panel.

**Architecture:** Two parallel tracks — Track 1 is pure Rust (plugin registrations + error hardening), Track 2 adds a new `ruflo.rs` command module plus React components (onboarding step, sidebar section, settings section). The tracks share no files except `main.rs` and `api.ts` where they each add non-overlapping lines.

**Tech Stack:** Rust/Tauri 2.x, React 18 + TypeScript, `std::process::Command` (silent_command pattern), localStorage for RuFlo preferences, 15s polling via `setInterval`.

**Spec:** `docs/superpowers/specs/2026-03-21-windows-crash-ruflo-integration-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src-tauri/src/main.rs` | Modify | Add 9 plugin registrations; harden setup(); add ruflo to invoke_handler |
| `src-tauri/src/claude_binary.rs` | Modify | Add 4 Windows env vars to allowlist |
| `src-tauri/src/commands/mod.rs` | Modify | Add `pub mod ruflo;` |
| `src-tauri/src/commands/ruflo.rs` | Create | 8 Tauri commands + 4 types |
| `src/lib/api.ts` | Modify | Add 4 interfaces + 8 method signatures |
| `src/components/Onboarding.tsx` | Modify | New step 4; renumber 4→5 through 8→9; 3 new state vars |
| `src/components/CreateProjectDialog.tsx` | Modify | Fire-and-forget RuFlo init in success path |
| `src/components/sidebar/RuFloSection.tsx` | Create | Collapsible sidebar section with polling |
| `src/components/ProjectSidebar.tsx` | Modify | Import and render RuFloSection |
| `src/components/settings/RuFloSettings.tsx` | Create | 5-card settings panel |
| `src/components/settings/SettingsLayout.tsx` | Modify | Add ruflo entry to integrations group |
| `src/components/Settings.tsx` | Modify | Add case 'ruflo' render |

---

## Task 1: Windows Crash Fix — Plugin Registrations

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add 7 missing plugin registrations to builder**

In `main.rs`, find the `.plugin(tauri_plugin_dialog::init())` line and add the 7 missing plugins immediately after:

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
    .setup(|app| {
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
```

Expected: `Finished` with no errors. If `tauri_plugin_clipboard_manager` or `tauri_plugin_global_shortcut` show "use of undeclared crate" errors, check that `Cargo.toml` has `tauri-plugin-clipboard-manager = "2"` and `tauri-plugin-global-shortcut = "2"` (they should already be there).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "fix: register all missing Tauri plugins to prevent Windows startup crash"
```

---

## Task 2: Windows Crash Fix — setup() Hardening

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Replace the two .expect() calls with log-and-continue**

Find the two `.expect("Failed to initialize agents database")` calls in `setup()`. Replace the entire DB initialization block with this degraded-mode pattern:

```rust
.setup(|app| {
    // First pass: load proxy settings from DB (best-effort)
    match init_database(&app.handle()) {
        Ok(conn) => {
            let db = AgentDb(Mutex::new(conn));
            let proxy_settings = match db.0.lock() {
                Ok(conn) => {
                    let mut settings = commands::proxy::ProxySettings::default();
                    let keys = vec![
                        ("proxy_enabled", "enabled"),
                        ("proxy_http", "http_proxy"),
                        ("proxy_https", "https_proxy"),
                        ("proxy_no", "no_proxy"),
                        ("proxy_all", "all_proxy"),
                    ];
                    for (db_key, field) in keys {
                        if let Ok(value) = conn.query_row(
                            "SELECT value FROM app_settings WHERE key = ?1",
                            rusqlite::params![db_key],
                            |row| row.get::<_, String>(0),
                        ) {
                            match field {
                                "enabled" => settings.enabled = value == "true",
                                "http_proxy" => settings.http_proxy = Some(value).filter(|s| !s.is_empty()),
                                "https_proxy" => settings.https_proxy = Some(value).filter(|s| !s.is_empty()),
                                "no_proxy" => settings.no_proxy = Some(value).filter(|s| !s.is_empty()),
                                "all_proxy" => settings.all_proxy = Some(value).filter(|s| !s.is_empty()),
                                _ => {}
                            }
                        }
                    }
                    settings
                }
                Err(e) => {
                    log::warn!("Failed to lock DB for proxy settings: {}", e);
                    commands::proxy::ProxySettings::default()
                }
            };
            apply_proxy_settings(&proxy_settings);
        }
        Err(e) => log::warn!("DB init failed (degraded mode, no proxy/agent history): {}", e),
    }

    // Second pass: open connection for app state (best-effort)
    match init_database(&app.handle()) {
        Ok(conn) => app.manage(AgentDb(Mutex::new(conn))),
        Err(e) => log::warn!("DB re-open failed (degraded mode): {}", e),
    }

    // Checkpoint state — always initialize
    let checkpoint_state = CheckpointState::new();
    if let Ok(claude_dir) = dirs::home_dir()
        .ok_or_else(|| "no home dir")
        .and_then(|home| {
            home.join(".claude")
                .canonicalize()
                .map_err(|_| "no .claude dir")
        })
    {
        let state_clone = checkpoint_state.clone();
        tauri::async_runtime::spawn(async move {
            state_clone.set_claude_dir(claude_dir).await;
        });
    }
    app.manage(checkpoint_state);
    app.manage(ProcessRegistryState::default());
    app.manage(ClaudeProcessState::default());

    // macOS vibrancy (existing code, unchanged)
    #[cfg(target_os = "macos")]
    { /* existing vibrancy block unchanged */ }

    Ok(())
})
```

- [ ] **Step 2: Verify it compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -20
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "fix: harden setup() with degraded-mode DB init instead of panic"
```

---

## Task 3: Windows Crash Fix — Env Vars

**Files:**
- Modify: `src-tauri/src/claude_binary.rs`

- [ ] **Step 1: Add 4 Windows env vars to the allowlist in `create_command_with_env`**

Find the block of `|| key == "..."` conditions in `create_command_with_env`. Add after the existing `ALL_PROXY` line:

```rust
// Windows-specific paths (no-op on non-Windows)
|| key == "USERPROFILE"
|| key == "APPDATA"
|| key == "LOCALAPPDATA"
|| key == "SYSTEMROOT"
```

- [ ] **Step 2: Verify compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/claude_binary.rs
git commit -m "fix: add Windows USERPROFILE/APPDATA env vars to command env allowlist"
```

---

## Task 4: RuFlo Backend — Types and Module Setup

**Files:**
- Create: `src-tauri/src/commands/ruflo.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create `ruflo.rs` with types only**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub mcp_active: bool,
    pub slash_command_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloProjectStatus {
    pub initialized: bool,
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloAgent {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,
}
```

- [ ] **Step 2: Register module**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod ruflo;
```

- [ ] **Step 3: Verify compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/ruflo.rs src-tauri/src/commands/mod.rs
git commit -m "feat: add ruflo command module with types"
```

---

## Task 5: RuFlo Backend — check, install, mcp, slash commands

**Files:**
- Modify: `src-tauri/src/commands/ruflo.rs`

- [ ] **Step 1: Add `check_ruflo_installed`**

```rust
#[tauri::command]
pub fn check_ruflo_installed() -> RuFloStatus {
    // Check if claude-flow CLI is installed
    let installed = crate::claude_binary::silent_command("npx")
        .args(["--yes", "@claude-flow/cli@latest", "--version"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Try to get version
    let version = if installed {
        crate::claude_binary::silent_command("npx")
            .args(["@claude-flow/cli@latest", "--version"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    } else {
        None
    };

    // Check if MCP is active: look for "claude-flow" in `claude mcp list`
    let mcp_active = crate::claude_binary::silent_command("claude")
        .args(["mcp", "list"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.contains("claude-flow"))
        .unwrap_or(false);

    // Check if slash command file exists
    let slash_command_exists = dirs::home_dir()
        .map(|h| h.join(".claude").join("commands").join("setup-ruflo.md").exists())
        .unwrap_or(false);

    RuFloStatus { installed, version, mcp_active, slash_command_exists }
}
```

- [ ] **Step 2: Add `install_ruflo`**

```rust
#[tauri::command]
pub async fn install_ruflo(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;

    let npm_bin = if cfg!(target_os = "windows") { "npm.cmd" } else { "npm" };
    let mut child = crate::claude_binary::silent_command(npm_bin)
        .args(["install", "-g", "@claude-flow/cli@latest"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start npm: {e}"))?;

    if let Some(stdout) = child.stdout.take() {
        use std::io::BufRead;
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = app.emit("ruflo-install-progress", &line);
        }
    }

    let status = child.wait().map_err(|e| format!("npm wait failed: {e}"))?;
    if status.success() {
        Ok("RuFlo installed successfully".to_string())
    } else {
        Err("npm install failed — check terminal output".to_string())
    }
}
```

- [ ] **Step 3: Add `activate_ruflo_mcp` and `deactivate_ruflo_mcp`**

```rust
#[tauri::command]
pub async fn activate_ruflo_mcp() -> Result<String, String> {
    let output = crate::claude_binary::silent_command("claude")
        .args(["mcp", "add", "claude-flow", "--", "npx", "-y", "@claude-flow/cli@latest"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp add: {e}"))?;

    if output.status.success() {
        Ok("MCP server activated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP activation failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn deactivate_ruflo_mcp() -> Result<String, String> {
    let output = crate::claude_binary::silent_command("claude")
        .args(["mcp", "remove", "claude-flow"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp remove: {e}"))?;

    if output.status.success() {
        Ok("MCP server deactivated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP deactivation failed: {stderr}"))
    }
}
```

- [ ] **Step 4: Add `create_ruflo_slash_command`**

The content of `setup-ruflo.md` is the exact text from the user's pasted command (the heredoc contents):

```rust
#[tauri::command]
pub fn create_ruflo_slash_command() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let commands_dir = home.join(".claude").join("commands");
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create commands dir: {e}"))?;

    let content = r#"---
name: setup-ruflo
description: Generates the autonomous project manager rules in claude.md using Ruflo MCP
---
Update the 'claude.md' file in the root of this project. This file is your permanent operating manual. You are the Autonomous Project Manager. Write a comprehensive, strictly formatted Markdown document detailing your operating procedures using the Ruflo MCP. Include the following core directives:

1. INTAKE & TASK CREATION: If I request a feature, bug fix, or update directly in the chat, DO NOT write the code yourself. Instead, instantly act as a Systems Architect: write a highly detailed specification for the request, format it as a Markdown file, and save it to the 'tasks/pending/' directory. If the request is large, break it down into multiple smaller, sequential .md files.
2. EXECUTION TRIGGER: Always check the 'tasks/pending/' directory for new Markdown files when you start a session or when told to 'execute'.
3. SWARM INITIALIZATION: When a pending task is found, use your Ruflo MCP tools to initialize a 'hierarchical' swarm.
4. DELEGATION: Spawn specialized agents (e.g., 'coder', 'tester', 'reviewer') and delegate the work. You are the manager; you must never write the application code yourself. Rely entirely on the Ruflo swarm.
5. QUALITY GATES: The 'tester' agent must verify that all tests pass. The 'reviewer' agent must sign off on the code quality.
6. ERROR HANDLING: If the swarm fails to complete the task after multiple attempts, or tests continuously fail, move the task file to 'tasks/blocked/' and document the exact error in 'logs/swarm_log.txt'. Do not loop infinitely.
7. SUCCESS PROTOCOL: If the task is successful, commit all changes to Git with a descriptive, conventional commit message.
8. CLEANUP: Move the successfully finished task file from 'tasks/pending/' to 'tasks/completed/'.
9. REPORTING: Append a brief, timestamped summary of the completed (or blocked) work to 'logs/swarm_log.txt'.

Format this document beautifully with clear headings, bullet points, and bold text for emphasis so you can read it easily on startup.
"#;

    let path = commands_dir.join("setup-ruflo.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write setup-ruflo.md: {e}"))?;

    Ok(format!("Created {:?}", path))
}
```

- [ ] **Step 5: Verify compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/ruflo.rs
git commit -m "feat: add ruflo check/install/mcp/slash-command backend commands"
```

---

## Task 6: RuFlo Backend — project status, swarm status, project init

**Files:**
- Modify: `src-tauri/src/commands/ruflo.rs`

- [ ] **Step 1: Add `get_ruflo_project_status`**

```rust
#[tauri::command]
pub fn get_ruflo_project_status(path: String) -> RuFloProjectStatus {
    let base = std::path::Path::new(&path);
    let tasks_dir = base.join("tasks");

    let initialized = tasks_dir.exists();

    let count_md = |subdir: &str| -> usize {
        std::fs::read_dir(tasks_dir.join(subdir))
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        e.path().extension().and_then(|x| x.to_str()) == Some("md")
                    })
                    .count()
            })
            .unwrap_or(0)
    };

    RuFloProjectStatus {
        initialized,
        pending: count_md("pending"),
        completed: count_md("completed"),
        blocked: count_md("blocked"),
    }
}
```

- [ ] **Step 2: Add `get_ruflo_swarm_status`**

```rust
#[tauri::command]
pub async fn get_ruflo_swarm_status() -> RuFloSwarmStatus {
    // Try to get agent list as JSON
    let agents_output = crate::claude_binary::silent_command("npx")
        .args(["@claude-flow/cli@latest", "agent", "list", "--json"])
        .output()
        .ok();

    let agents: Vec<RuFloAgent> = agents_output
        .as_ref()
        .and_then(|o| String::from_utf8(o.stdout.clone()).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().cloned())
        .unwrap_or_default()
        .iter()
        .map(|a| RuFloAgent {
            id: a["id"].as_str().unwrap_or("").to_string(),
            name: a["name"].as_str().unwrap_or("agent").to_string(),
            agent_type: a["type"].as_str().unwrap_or("agent").to_string(),
            status: a["status"].as_str().unwrap_or("idle").to_string(),
        })
        .collect();

    let swarm_active = !agents.is_empty()
        && agents.iter().any(|a| a.status == "running" || a.status == "waiting");

    // Try to count memory entries
    let memory_entries = crate::claude_binary::silent_command("npx")
        .args(["@claude-flow/cli@latest", "memory", "list", "--json"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().map(|a| a.len()))
        .unwrap_or(0);

    RuFloSwarmStatus { swarm_active, agents, memory_entries }
}
```

- [ ] **Step 3: Add `init_ruflo_project`**

```rust
#[tauri::command]
pub async fn init_ruflo_project(path: String) -> Result<String, String> {
    let output = crate::claude_binary::silent_command("npx")
        .args(["@claude-flow/cli@latest", "init"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run ruflo init: {e}"))?;

    if output.status.success() {
        Ok("RuFlo initialized in project".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("ruflo init failed: {stderr}"))
    }
}
```

- [ ] **Step 4: Verify compiles**

```bash
cd src-tauri && cargo check 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/ruflo.rs
git commit -m "feat: add ruflo project-status/swarm-status/init backend commands"
```

---

## Task 7: Wire ruflo.rs into main.rs invoke_handler

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add import and handler entries**

At top of `main.rs`, add after the other `use commands::...` imports:

```rust
use commands::ruflo::{
    check_ruflo_installed, install_ruflo, activate_ruflo_mcp, deactivate_ruflo_mcp,
    create_ruflo_slash_command, init_ruflo_project, get_ruflo_project_status,
    get_ruflo_swarm_status,
};
```

In the `tauri::generate_handler![]` macro, add at the end (before the closing `]`):

```rust
// RuFlo
check_ruflo_installed,
install_ruflo,
activate_ruflo_mcp,
deactivate_ruflo_mcp,
create_ruflo_slash_command,
init_ruflo_project,
get_ruflo_project_status,
get_ruflo_swarm_status,
```

- [ ] **Step 2: Full build check**

```bash
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat: register all ruflo commands in invoke_handler"
```

---

## Task 8: API Layer — Interfaces and Methods

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add TypeScript interfaces after existing interfaces (after `FileEntry`)**

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

- [ ] **Step 2: Add API methods**

Find where the `api` object methods are defined (the large object/class in `api.ts`). Add these 8 methods following the same `apiCall` pattern as other methods:

```typescript
checkRufloInstalled: (): Promise<RuFloStatus> =>
  apiCall('check_ruflo_installed'),

installRuflo: (): Promise<string> =>
  apiCall('install_ruflo'),

activateRufloMcp: (): Promise<string> =>
  apiCall('activate_ruflo_mcp'),

deactivateRufloMcp: (): Promise<string> =>
  apiCall('deactivate_ruflo_mcp'),

createRufloSlashCommand: (): Promise<string> =>
  apiCall('create_ruflo_slash_command'),

initRufloProject: (path: string): Promise<string> =>
  apiCall('init_ruflo_project', { path }),

getRufloProjectStatus: (path: string): Promise<RuFloProjectStatus> =>
  apiCall('get_ruflo_project_status', { path }),

getRufloSwarmStatus: (): Promise<RuFloSwarmStatus> =>
  apiCall('get_ruflo_swarm_status'),
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npm run build 2>&1 | tail -20
```

Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat: add RuFlo TypeScript interfaces and API methods"
```

---

## Task 9: Onboarding — New Step 4

**Files:**
- Modify: `src/components/Onboarding.tsx`

- [ ] **Step 1: Add state variables and event listener**

After the existing `selectedPermission` state, add:

```typescript
const [rufloStatus, setRufloStatus] = useState<import('@/lib/api').RuFloStatus | null>(null);
const [rufloInstalling, setRufloInstalling] = useState(false);
const [rufloLines, setRufloLines] = useState<string[]>([]);
```

Add event listener for `ruflo-install-progress` in the existing useEffect pattern:

```typescript
useEffect(() => {
  let unlisten: (() => void) | undefined;
  let mounted = true;
  (async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      const fn = await listen<string>('ruflo-install-progress', (event) => {
        if (!mounted) return;
        setRufloLines((prev) => [...prev, event.payload]);
      });
      unlisten = fn;
    } catch { /* web mode */ }
  })();
  return () => { mounted = false; unlisten?.(); };
}, []);
```

- [ ] **Step 2: Bump TOTAL_STEPS and renumber existing steps**

Change `const TOTAL_STEPS = 8;` → `const TOTAL_STEPS = 9;`

In `renderStepContent()`, update every existing `case 4:` through `case 8:` to `case 5:` through `case 9:`. Also update the `step={N}` props inside those cases to match (e.g., `step={5}` in the old case 4, now case 5).

Update the `useEffect` that checks `currentStep === 4` to `currentStep === 5`, `currentStep === 5` to `currentStep === 6`, and so on through step 8 → 9.

- [ ] **Step 3: Add `checkRuflo` callback and auto-check useEffect**

```typescript
const checkRuflo = useCallback(async () => {
  try {
    const result = await api.checkRufloInstalled();
    setRufloStatus(result);
    if (result.installed) setStatus(4, 'passed');
  } catch {
    setRufloStatus({ installed: false, version: null, mcp_active: false, slash_command_exists: false });
  }
}, [setStatus]);

useEffect(() => {
  if (currentStep === 4 && !statuses[4]) {
    checkRuflo();
  }
}, [currentStep, statuses, checkRuflo]);
```

- [ ] **Step 4: Add `handleInstallRuflo` callback**

```typescript
const handleInstallRuflo = async () => {
  setRufloInstalling(true);
  setRufloLines([]);
  try {
    await api.installRuflo();
    setRufloLines((prev) => [...prev, '✓ CLI installed']);
    await api.activateRufloMcp();
    setRufloLines((prev) => [...prev, '✓ MCP server activated in Claude Code']);
    await api.createRufloSlashCommand();
    setRufloLines((prev) => [...prev, '✓ /setup-ruflo slash command created']);
    await checkRuflo();
  } catch (err) {
    setRufloLines((prev) => [...prev, `✗ Error: ${String(err)}`]);
    setStatus(4, 'failed');
  } finally {
    setRufloInstalling(false);
  }
};
```

- [ ] **Step 5: Add `case 4` to `renderStepContent`**

Insert before the (now renumbered) `case 5:`:

```typescript
case 4:
  return (
    <StepCard
      key="step-4"
      step={4}
      totalSteps={TOTAL_STEPS}
      title="RuFlo — AI Swarm Manager"
      description="Supercharge your projects with autonomous AI agents and hierarchical swarms."
      icon={Sparkles}
      status={statuses[4] ?? 'pending'}
      onNext={nextStep}
      nextDisabled={statuses[4] !== 'passed'}
      onSkip={() => {
        localStorage.setItem('runecode-ruflo-skipped', 'true');
        skipStep();
      }}
      canSkip
    >
      {rufloStatus?.installed ? (
        <div className="text-sm text-green-400">
          RuFlo {rufloStatus.version} already installed ✓
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {[
              'Hierarchical swarms with 15+ agent types',
              'Autonomous task execution pipeline',
              'Claude Code MCP integration — activated automatically',
              '/setup-ruflo slash command available in all projects',
            ].map((item) => (
              <li key={item} className="flex gap-2 text-sm text-white/70">
                <span className="text-purple-400">✦</span>
                {item}
              </li>
            ))}
          </ul>
          {statuses[4] !== 'failed' && (
            <button
              onClick={handleInstallRuflo}
              disabled={rufloInstalling}
              className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {rufloInstalling ? 'Installing...' : 'Install RuFlo'}
            </button>
          )}
          {statuses[4] === 'failed' && (
            <div className="flex flex-col gap-2">
              <div className="text-sm text-red-400">Installation failed</div>
              <button onClick={handleInstallRuflo} className="text-sm text-white/50 hover:text-white/80">
                Retry
              </button>
            </div>
          )}
        </div>
      )}
      <TerminalOutput lines={rufloLines} />
    </StepCard>
  );
```

- [ ] **Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/Onboarding.tsx
git commit -m "feat: add RuFlo onboarding step 4 with install/MCP/slash-command flow"
```

---

## Task 10: Project Creation Auto-Init

**Files:**
- Modify: `src/components/CreateProjectDialog.tsx`

- [ ] **Step 1: Add fire-and-forget RuFlo init in success path**

In `handleCreate`, inside the `try` block, after `api.initializeProject(projectPath, name)` succeeds and before `onProjectCreated(projectPath, name)`:

```typescript
// Fire-and-forget RuFlo init (non-blocking)
void (async () => {
  try {
    const rufloStatus = await api.checkRufloInstalled();
    if (rufloStatus.installed) {
      const autoInit = localStorage.getItem('runecode-ruflo-auto-init') !== 'false';
      if (autoInit) {
        await api.initRufloProject(projectPath);
        await api.createRufloSlashCommand();
      }
    }
  } catch (err) {
    console.warn('[RuFlo] Background init skipped:', err);
  }
})();
```

Note: this goes in the `try` block only, not in the `catch` block.

- [ ] **Step 2: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/components/CreateProjectDialog.tsx
git commit -m "feat: auto-init RuFlo on project create when installed"
```

---

## Task 11: Sidebar — RuFloSection Component

**Files:**
- Create: `src/components/sidebar/RuFloSection.tsx`
- Modify: `src/components/ProjectSidebar.tsx`

- [ ] **Step 1: Create `RuFloSection.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap } from 'lucide-react';
import { api, type RuFloProjectStatus, type RuFloSwarmStatus, type RuFloAgent } from '@/lib/api';

interface RuFloSectionProps {
  projectPath: string;
}

const AGENT_EMOJI: Record<string, string> = {
  coder: '🧠', reviewer: '🔍', tester: '🧪', planner: '📋',
  researcher: '🔬', default: '🤖',
};

function agentEmoji(type: string) {
  return AGENT_EMOJI[type] ?? AGENT_EMOJI.default;
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-green-400' : 'bg-zinc-500'}`} />
  );
}

export function RuFloSection({ projectPath }: RuFloSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [projectStatus, setProjectStatus] = useState<RuFloProjectStatus | null>(null);
  const [swarmStatus, setSwarmStatus] = useState<RuFloSwarmStatus | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isStale, setIsStale] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectPath) return;
    try {
      const [proj, swarm] = await Promise.all([
        api.getRufloProjectStatus(projectPath),
        api.getRufloSwarmStatus(),
      ]);
      setProjectStatus(proj);
      setSwarmStatus(swarm);
      setIsStale(false);
    } catch {
      setIsStale(true);
    }
  }, [projectPath]);

  // Check install status once on mount
  useEffect(() => {
    api.checkRufloInstalled()
      .then((s) => setIsInstalled(s.installed))
      .catch(() => setIsInstalled(false));
  }, []);

  // Fetch + poll only when expanded
  useEffect(() => {
    if (!isExpanded) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    fetchData();
    intervalRef.current = setInterval(fetchData, 15_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isExpanded, fetchData]);

  const totalTasks = (projectStatus?.pending ?? 0) + (projectStatus?.completed ?? 0) + (projectStatus?.blocked ?? 0);
  const agentCount = swarmStatus?.agents.length ?? 0;

  if (isInstalled === false) {
    return (
      <div className="px-4 py-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-2">RuFlo</div>
        <div className="text-xs text-muted-foreground/60 bg-white/5 rounded-lg px-3 py-2">
          RuFlo not installed
        </div>
      </div>
    );
  }

  return (
    <div className="px-3 py-1">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-1 pb-1">RuFlo</div>

      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <StatusDot active={swarmStatus?.swarm_active ?? false} />
          <span className="text-xs font-medium">
            <Zap className="inline w-3 h-3 text-purple-400 mr-1" />
            RuFlo
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {agentCount} agent{agentCount !== 1 ? 's' : ''} · {totalTasks} task{totalTasks !== 1 ? 's' : ''}
          </span>
          {isStale && <span className="text-[9px] text-yellow-500/70">• stale</span>}
        </div>
        <span className="text-muted-foreground/40 text-[10px]">{isExpanded ? '▴' : '▾'}</span>
      </button>

      {/* Expanded body */}
      {isExpanded && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-1">
            {[
              { label: 'Pending', value: projectStatus?.pending ?? 0, color: 'text-yellow-400' },
              { label: 'Done', value: projectStatus?.completed ?? 0, color: 'text-green-400' },
              { label: 'Blocked', value: projectStatus?.blocked ?? 0, color: 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center bg-white/5 rounded-md py-1.5">
                <div className={`text-sm font-semibold ${color}`}>{value}</div>
                <div className="text-[9px] text-muted-foreground/50">{label}</div>
              </div>
            ))}
          </div>

          {/* Active agents */}
          {(swarmStatus?.agents.length ?? 0) > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground/40 px-1">Active Agents</div>
              {swarmStatus!.agents.map((agent: RuFloAgent) => (
                <div key={agent.id} className="flex items-center justify-between bg-white/5 rounded-lg px-2 py-1.5">
                  <span className="text-xs">{agentEmoji(agent.agent_type)} {agent.name}</span>
                  <span className={`text-[10px] ${agent.status === 'running' ? 'text-green-400' : 'text-yellow-400'}`}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Memory bar */}
          {(swarmStatus?.memory_entries ?? 0) > 0 && (
            <div className="flex items-center gap-2 px-1">
              <span className="text-[9px] text-muted-foreground/50 w-12 flex-shrink-0">Memory</span>
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500/60 rounded-full"
                  style={{ width: `${Math.min(100, ((swarmStatus?.memory_entries ?? 0) / 100) * 100)}%` }}
                />
              </div>
              <span className="text-[9px] text-purple-400/70">{swarmStatus?.memory_entries}</span>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex gap-1.5">
            <button
              onClick={() => api.initRufloProject(projectPath).catch(console.warn)}
              className="flex-1 py-1 text-[10px] bg-purple-500/10 border border-purple-500/20 rounded-md text-purple-400 hover:bg-purple-500/20 transition-colors"
            >
              Run Init
            </button>
            <button
              onClick={() => {
                const logPath = `${projectPath}/logs/swarm_log.txt`;
                window.dispatchEvent(new CustomEvent('runecode:open-file', { detail: { path: logPath } }));
              }}
              className="flex-1 py-1 text-[10px] bg-white/5 rounded-md text-muted-foreground/60 hover:bg-white/10 transition-colors"
            >
              View Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add to `ProjectSidebar.tsx`**

At the top of `ProjectSidebar.tsx`, add import:

```typescript
import { RuFloSection } from './sidebar/RuFloSection';
```

In the sidebar body, after `<SectionErrorBoundary><GitHubActionsSection ... /></SectionErrorBoundary>` and before `<GroupLabel>System</GroupLabel>`, add:

```tsx
<SectionDivider />
<SectionErrorBoundary>
  <RuFloSection projectPath={projectPath} />
</SectionErrorBoundary>
```

- [ ] **Step 3: Verify build**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/RuFloSection.tsx src/components/ProjectSidebar.tsx
git commit -m "feat: add RuFlo sidebar section with live swarm status and task counts"
```

---

## Task 12: Settings — RuFloSettings Component

**Files:**
- Create: `src/components/settings/RuFloSettings.tsx`
- Modify: `src/components/settings/SettingsLayout.tsx`
- Modify: `src/components/Settings.tsx`

- [ ] **Step 1: Create `RuFloSettings.tsx`**

```typescript
import { useState, useEffect, useCallback } from 'react';
import { api, type RuFloStatus } from '@/lib/api';
import { Loader2 } from 'lucide-react';

function Card({ children }: { children: React.ReactNode }) {
  return <div className="bg-white/5 rounded-xl p-4 space-y-3">{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium text-white/90">{children}</div>;
}

function StatusRow({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-zinc-500'}`} />
      <span className={`text-sm ${active ? 'text-green-400' : 'text-white/40'}`}>{label}</span>
    </div>
  );
}

export function RuFloSettings() {
  const [status, setStatus] = useState<RuFloStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Swarm defaults from localStorage
  const [topology, setTopology] = useState(() => localStorage.getItem('runecode-ruflo-topology') ?? 'hierarchical');
  const [maxAgents, setMaxAgents] = useState(() => parseInt(localStorage.getItem('runecode-ruflo-max-agents') ?? '8', 10));
  const [autoInit, setAutoInit] = useState(() => localStorage.getItem('runecode-ruflo-auto-init') !== 'false');

  const refresh = useCallback(async () => {
    try {
      const s = await api.checkRufloInstalled();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runAction = async (key: string, fn: () => Promise<unknown>) => {
    setActionLoading(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-white/40">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking RuFlo...
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">⚡ RuFlo</h2>
        <p className="text-sm text-white/50 mt-1">AI Swarm Manager · claude-flow v3</p>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Card 1: Install Status */}
      <Card>
        <CardTitle>Installation</CardTitle>
        <StatusRow active={status?.installed ?? false} label={status?.installed ? `Installed · v${status.version ?? '?'}` : 'Not installed'} />
        <p className="text-xs text-white/40">Global npm package · @claude-flow/cli</p>
        <div className="flex gap-2 pt-1">
          {status?.installed ? (
            <>
              <button
                onClick={() => runAction('update', () => api.installRuflo())}
                disabled={actionLoading !== null}
                className="px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/30 transition-colors disabled:opacity-50"
              >
                {actionLoading === 'update' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Update'}
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Uninstall RuFlo? This removes the global CLI.')) {
                    runAction('uninstall', () => api.installRuflo()); // TODO: replace with uninstall command when added
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs hover:bg-red-500/20 transition-colors"
              >
                Uninstall
              </button>
            </>
          ) : (
            <button
              onClick={() => runAction('install', () => api.installRuflo())}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs hover:bg-purple-500 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'install' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Install RuFlo'}
            </button>
          )}
        </div>
      </Card>

      {/* Card 2: MCP Server */}
      <Card>
        <CardTitle>MCP Server</CardTitle>
        <StatusRow active={status?.mcp_active ?? false} label={status?.mcp_active ? 'Active in Claude Code' : 'Inactive'} />
        <div className="font-mono text-[10px] text-white/30 bg-black/30 rounded px-3 py-2 break-all">
          claude mcp add claude-flow -- npx -y @claude-flow/cli@latest
        </div>
        <div className="flex gap-2">
          {!status?.mcp_active ? (
            <button
              onClick={() => runAction('mcp-activate', () => api.activateRufloMcp())}
              disabled={actionLoading !== null || !status?.installed}
              className="px-3 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs hover:bg-purple-600/30 transition-colors disabled:opacity-50"
            >
              {actionLoading === 'mcp-activate' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Activate'}
            </button>
          ) : (
            <button
              onClick={() => runAction('mcp-deactivate', () => api.deactivateRufloMcp())}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 rounded-lg bg-zinc-700 text-white/60 text-xs hover:bg-zinc-600 transition-colors disabled:opacity-50"
            >
              Deactivate
            </button>
          )}
        </div>
      </Card>

      {/* Card 3: /setup-ruflo slash command */}
      <Card>
        <CardTitle>/setup-ruflo Command</CardTitle>
        <StatusRow active={status?.slash_command_exists ?? false} label={status?.slash_command_exists ? 'Present' : 'Missing'} />
        <p className="text-xs text-white/40">~/.claude/commands/setup-ruflo.md</p>
        <button
          onClick={() => runAction('slash', () => api.createRufloSlashCommand())}
          disabled={actionLoading !== null || !status?.installed}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          {actionLoading === 'slash' ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Recreate'}
        </button>
      </Card>

      {/* Card 4: Swarm Defaults */}
      <Card>
        <CardTitle>Swarm Defaults</CardTitle>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Topology</span>
            <select
              value={topology}
              onChange={(e) => { setTopology(e.target.value); localStorage.setItem('runecode-ruflo-topology', e.target.value); }}
              className="bg-black/40 border border-white/10 rounded text-xs text-white px-2 py-1 focus:outline-none focus:border-purple-500/50"
            >
              <option value="hierarchical">hierarchical</option>
              <option value="mesh">mesh</option>
              <option value="star">star</option>
            </select>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Max Agents</span>
            <input
              type="number"
              min={1}
              max={15}
              value={maxAgents}
              onChange={(e) => { const v = parseInt(e.target.value, 10); setMaxAgents(v); localStorage.setItem('runecode-ruflo-max-agents', String(v)); }}
              className="w-16 bg-black/40 border border-white/10 rounded text-xs text-white px-2 py-1 text-center focus:outline-none focus:border-purple-500/50"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/60">Auto-init on project create</span>
            <button
              onClick={() => { const next = !autoInit; setAutoInit(next); localStorage.setItem('runecode-ruflo-auto-init', String(next)); }}
              className={`w-9 h-5 rounded-full transition-colors relative ${autoInit ? 'bg-purple-600' : 'bg-zinc-700'}`}
            >
              <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${autoInit ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </Card>

      {/* Card 5: Swarm Log */}
      <Card>
        <CardTitle>Swarm Log</CardTitle>
        <p className="text-xs text-white/40">logs/swarm_log.txt in each project</p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('runecode:open-settings', { detail: { section: 'project-explorer' } }))}
          className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white/60 text-xs hover:bg-white/10 transition-colors"
        >
          Open Project Explorer
        </button>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add ruflo entry to `SettingsLayout.tsx`**

In the `SETTINGS_SECTIONS` array, inside the `integrations` group's `items` array, add:

```typescript
{ id: 'ruflo', label: 'RuFlo', icon: Zap },
```

Add `Zap` to the import from `lucide-react` at the top of the file.

- [ ] **Step 3: Add case to `Settings.tsx`**

Find the section in `Settings.tsx` that renders sub-components based on `activeSection`. Add:

```typescript
import { RuFloSettings } from './settings/RuFloSettings';
// ...
// In the render switch/conditional:
{activeSection === 'ruflo' && <RuFloSettings />}
```

- [ ] **Step 4: Verify full build**

```bash
npm run build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/RuFloSettings.tsx src/components/settings/SettingsLayout.tsx src/components/Settings.tsx
git commit -m "feat: add RuFlo settings panel with install/MCP/slash-command/swarm config"
```

---

## Task 13: Full Build Verification

- [ ] **Step 1: Full Rust build**

```bash
cd src-tauri && cargo build 2>&1 | tail -30
```

Expected: `Finished dev [unoptimized + debuginfo] target(s)` with no errors.

- [ ] **Step 2: Full frontend build**

```bash
npm run build 2>&1 | tail -20
```

Expected: `✓ built in` with no TypeScript or Vite errors.

- [ ] **Step 3: Lint**

```bash
npm run lint 2>&1 | tail -20
```

Expected: no errors (warnings acceptable).

- [ ] **Step 4: Version bump**

Update `version` in `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` from `0.3.2` → `0.4.0` (minor bump — new feature set).

Also update `package.json` version to `0.4.0`.

- [ ] **Step 5: Final commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json package.json
git commit -m "chore: bump version to 0.4.0 (Windows crash fix + RuFlo integration)"
```
