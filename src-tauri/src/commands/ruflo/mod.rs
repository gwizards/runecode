pub mod domain;
pub mod repository;

use domain::{AgentStatus, RuFloAgent, RuFloProjectStatus, RuFloStatus, RuFloSwarmStatus};
#[allow(unused_imports)]
use domain::{MemoryBackend, MemoryStats, MemorySyncResult};

// ---------------------------------------------------------------------------
// Cache TTLs
// ---------------------------------------------------------------------------
const RUFLO_STATUS_CACHE_TTL_SECS: u64 = 60;
const RUFLO_SWARM_CACHE_TTL_SECS: u64 = 10;

// ---------------------------------------------------------------------------
// File-based cache helpers — best-effort, silently skip on any error
// ---------------------------------------------------------------------------

fn try_read_cache<T: for<'de> serde::Deserialize<'de>>(
    filename: &str,
    ttl_secs: u64,
) -> Option<T> {
    let cache_path = std::env::temp_dir().join(filename);
    let content = std::fs::read_to_string(&cache_path).ok()?;
    let cached: serde_json::Value = serde_json::from_str(&content).ok()?;
    let ts = cached["timestamp"].as_u64()?;
    let value: T = serde_json::from_value(cached["value"].clone()).ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let age = now.saturating_sub(ts);
    if age < ttl_secs {
        Some(value)
    } else {
        None
    }
}

fn write_cache<T: serde::Serialize>(filename: &str, value: &T) {
    let cache_path = std::env::temp_dir().join(filename);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Ok(json) = serde_json::to_string(&serde_json::json!({
        "timestamp": now,
        "value": value,
    })) {
        let _ = std::fs::write(cache_path, json);
    }
}

#[tauri::command]
pub fn check_ruflo_installed() -> RuFloStatus {
    // Return cached result if still within TTL (60 s) to avoid repeated npx/claude calls
    if let Some(cached) = try_read_cache::<RuFloStatus>("runecode_ruflo_cache.json", RUFLO_STATUS_CACHE_TTL_SECS) {
        return cached;
    }

    // Single npx call: --no-install means "don't download if not cached"
    // Use create_command_with_env to inherit PATH/NVM
    let output = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "--version"])
        .output()
        .ok();

    let installed = output.as_ref().map(|o| o.status.success()).unwrap_or(false);

    let version = if installed {
        output
            .as_ref()
            .and_then(|o| {
                // Strip UTF-8 BOM if present, then trim
                String::from_utf8_lossy(&o.stdout)
                    .trim_start_matches('\u{FEFF}')
                    .trim()
                    .to_string()
                    .into()
            })
            .filter(|s: &String| !s.is_empty())
    } else {
        None
    };

    // Check if MCP is active — use create_command_with_env for PATH/NVM
    let mcp_active = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "list"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| {
            // Check for "claude-flow" as a standalone server name (not just substring)
            s.lines().any(|line| {
                let trimmed = line.trim();
                trimmed == "claude-flow"
                    || trimmed.starts_with("claude-flow ")
                    || trimmed.starts_with("claude-flow\t")
            })
        })
        .unwrap_or(false);

    let slash_command_exists = dirs::home_dir()
        .map(|h| {
            h.join(".claude")
                .join("commands")
                .join("setup-ruflo.md")
                .exists()
        })
        .unwrap_or(false);

    let result = RuFloStatus::build(installed, version, mcp_active, slash_command_exists);
    write_cache("runecode_ruflo_cache.json", &result);
    result
}

#[tauri::command]
pub async fn install_ruflo(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    use std::io::BufRead;

    // Use npm directly — create_command_with_env inherits PATH which resolves npm on all platforms
    let mut child = crate::claude_binary::create_command_with_env("npm")
        .args(["install", "-g", "@claude-flow/cli@latest"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start npm: {e}"))?;

    // Drain stderr in a separate thread to prevent deadlock
    let stderr_handle = if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        Some(std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            let mut lines_vec = Vec::new();
            for line in reader.lines().flatten() {
                let _ = app_clone.emit("ruflo-install-progress", format!("[err] {}", &line));
                lines_vec.push(line);
            }
            lines_vec
        }))
    } else {
        None
    };

    // Stream stdout progress
    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = app.emit("ruflo-install-progress", &line);
        }
    }

    let status = child.wait().map_err(|e| format!("npm wait failed: {e}"))?;

    // Collect stderr output for error messages
    let stderr_output = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default()
        .join("\n");

    if status.success() {
        Ok("RuFlo installed successfully".to_string())
    } else if !stderr_output.is_empty() {
        Err(format!("npm install failed: {}", stderr_output))
    } else {
        Err("npm install failed — check terminal output".to_string())
    }
}

#[tauri::command]
pub async fn activate_ruflo_mcp(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    let output = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "add", "claude-flow", "--", "npx", "-y", "@claude-flow/cli@latest"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp add: {e}"))?;

    if output.status.success() {
        let _ = app.emit("ruflo-mcp-changed", "activated");
        Ok("MCP server activated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP activation failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn deactivate_ruflo_mcp(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    let output = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "remove", "claude-flow"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp remove: {e}"))?;

    if output.status.success() {
        let _ = app.emit("ruflo-mcp-changed", "deactivated");
        Ok("MCP server deactivated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP deactivation failed: {stderr}"))
    }
}

#[tauri::command]
pub fn create_ruflo_slash_command() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let commands_dir = home.join(".claude").join("commands");
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create commands dir: {e}"))?;

    let content = r#"---
name: setup-ruflo
description: Sets up RuneCode as a fully autonomous DDD project manager with RuFlo MCP swarms, scalar quantization memory, and AgentDB backend
---

Update the `CLAUDE.md` file in the root of this project. You are writing the **permanent operating manual** for the Autonomous Project Manager. This document must be a comprehensive, strictly formatted Markdown file detailing all operating procedures using the RuFlo MCP swarm system.

Before writing, perform these setup steps in ONE message:

**Step 1 — Install AgentDB bridge and configure memory backend:**
```
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 15, strategy: "specialized" })
mcp__claude-flow__agent_spawn({ agentType: "memory-specialist", agentId: "mem-setup", model: "haiku" })
```
Then run these CLI commands sequentially:
```bash
ruflo memory backend set agentdb          # set AgentDB as primary backend
ruflo memory configure --hnsw-optimization aggressive  # aggressive HNSW indexing in AgentDB
ruflo memory configure --quantization scalar           # scalar quantization (float32 → uint8)
ruflo memory consolidate                               # compact + deduplicate existing entries
```

**Step 2 — Write CLAUDE.md with these mandatory sections:**

## ⚡ PRIME DIRECTIVE — RUFLO MCP SWARM IS MANDATORY

Every task, without exception, uses the RuFlo MCP swarm. The sequence for EVERY task is:
1. `mcp__claude-flow__swarm_init` — hierarchical topology, up to 15 agents
2. `mcp__claude-flow__agent_spawn` — spawn ALL specialized agents in parallel in ONE message
3. `mcp__claude-flow__task_create` — register tasks with the swarm
4. `Agent` tool with `run_in_background: true` — dispatch real workers
5. `mcp__claude-flow__memory_store` — persist context and findings

**There are NO exceptions.** Simple bug fix? Swarm. Single file? Swarm. Quick question that turns into code? Swarm.

## 1. STARTUP CHECKLIST
On every session start:
1. Read this file
2. Scan `tasks/pending/` — if tasks exist, execute immediately
3. If no tasks — await user input in intake mode

## 2. INTAKE & TASK CREATION
**Trigger**: User requests a feature, fix, refactor, or update.
- **DO NOT write code directly** — act as Systems Architect
- Write detailed spec as Markdown → save to `tasks/pending/<name>.md`
- For large requests, decompose into sequential files (`001-`, `002-`, ...)
- **Spec must include**: Title · Context · Acceptance Criteria · Technical Approach · Dependencies · Out of Scope · Test Requirements
- **Confirm**: "Spec saved to `tasks/pending/<filename>.md`. Say **execute** to run."

## 3. SWARM INITIALIZATION (MANDATORY)

```javascript
// Step 1 — Init swarm
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 15, strategy: "specialized",
  config: { consensus: "raft", memoryNamespace: "<task-name>" }
})

// Step 2 — Store context
mcp__claude-flow__memory_store({ key: "<task>-context", namespace: "<task-name>", value: { /* task details */ } })

// Step 3 — Spawn agents (ALL in ONE message)
mcp__claude-flow__agent_spawn({ agentType: "planner",  agentId: "queen",       model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "coder",    agentId: "coder-01",    model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "tester",   agentId: "tester-01",   model: "haiku"  })
mcp__claude-flow__agent_spawn({ agentType: "reviewer", agentId: "reviewer-01", model: "sonnet" })

// Step 4 — Register tasks
mcp__claude-flow__task_create({ type: "feature", description: "...", assignTo: ["coder-01"] })

// Step 5 — Dispatch workers (ALL in ONE message, background)
Agent({ subagent_type: "coder",    run_in_background: true, prompt: "..." })
Agent({ subagent_type: "tester",   run_in_background: true, prompt: "..." })
Agent({ subagent_type: "reviewer", run_in_background: true, prompt: "..." })
```

All steps 1–5 go in **ONE single message**. Never split across turns.

## 4. DDD ARCHITECTURE (ENFORCED)

This project uses **Domain-Driven Design** across 5 bounded contexts:

| Domain | Location | Score Target |
|--------|----------|-------------|
| `ruflo` | `src/domain/ruflo/` | 5/5 |
| `session` | `src/domain/session/` | 5/5 |
| `project` | `src/domain/project/` | 5/5 |
| `agent` | `src/domain/agent/` | 5/5 |
| `mcp` | `src/domain/mcp/` | 5/5 |

**DDD rules**: Aggregates with private constructors + factory methods · Value Objects (self-validating, immutable) · Domain Events raised **inside** aggregate methods · Application Services (thin command handlers) · Repository interfaces + in-memory implementations

Shared kernel at `src/domain/shared/`: `DomainEventBus`, `Result<T,E>`, `IRepository<T,ID>`

## 5. MEMORY ARCHITECTURE

**Backend**: AgentDB (primary) + HNSW indexing for semantic search
**Quantization**: Scalar (float32 → uint8, 4× compression, <1% accuracy loss)
**Local cache**: `QuantizedMemoryStore` with TTL + LRU eviction in `src/domain/ruflo/memory-store.ts`

```bash
# Memory maintenance commands (run via ruflo CLI)
ruflo memory sync --local <output-path>   # export to local JSON
ruflo memory consolidate                  # compact + deduplicate
ruflo memory backend set agentdb          # ensure AgentDB is active
ruflo memory configure --hnsw-optimization aggressive
ruflo memory configure --quantization scalar
```

## 6. DELEGATION RULES
- **You are the manager — never write application code yourself**
- Spawn ALL agents in ONE message with `run_in_background: true`
- After spawning, STOP — wait for results, do not poll
- Store every agent's findings via `mcp__claude-flow__memory_store`
- When results arrive, review ALL before proceeding

**Agent model routing:**

| Complexity | Model | Use for |
|-----------|-------|---------|
| Simple / mechanical | `haiku` | File edits, build checks, formatting |
| Standard | `sonnet` | Feature implementation, reviews |
| Architecture / security | `sonnet` | Design decisions, security audits |

## 7. QUALITY GATES

Both must pass before any task is complete:

**Gate 1 — Tester**: `npm run build` · `npx vitest run` · `cd src-tauri && cargo check` · new tests for new code

**Gate 2 — Reviewer**: DDD bounded contexts · files <500 lines · no hardcoded secrets · typed public APIs · validated at boundaries · explicit `APPROVED` sign-off

**Failure** → ERROR HANDLING (max 2 retries, then BLOCKED)

## 8. ERROR HANDLING
1. Re-init swarm, retry **max 2 times**
2. If still failing:
   - Move: `tasks/pending/<file>.md` → `tasks/blocked/<file>.md`
   - Log to `logs/swarm_log.txt`: `[BLOCKED] <timestamp> — <task> — <error>`
3. Stop. Notify user with exact error.

## 9. SUCCESS PROTOCOL
```bash
git add <specific files>
git commit -m "feat(<scope>): <description>\n\nCo-Authored-By: claude-flow <ruv@ruv.net>"
git push runecode main
mv tasks/pending/<file>.md tasks/completed/<file>.md
```
Append to `logs/swarm_log.txt`:
```
[COMPLETED] <ISO-8601> — <task>
Summary: <1-3 sentences>
Agents: <list>  Tests: PASSED  Commit: <hash>
```

## BEHAVIORAL RULES
- Do exactly what was asked — nothing more, nothing less
- NEVER write code outside of a swarm delegation
- NEVER create files unless absolutely necessary
- ALWAYS prefer editing existing files over creating new ones
- NEVER save files to root — use `/src`, `/tests`, `/docs`, `/config`, `/scripts`
- ALWAYS read a file before editing it
- NEVER commit secrets, `.env` files, or credentials
- ALWAYS run build + tests after changes before committing

## PROJECT STACK
- **Stack**: Tauri 2.x + React + TypeScript + Rust
- **Design**: Domain-Driven Design · bounded contexts · event sourcing
- **Build**: `npm run build` · `npx vitest run` · `cd src-tauri && cargo check`

Format this document beautifully with clear headings, bullet points, and bold text. Make it scannable at a glance.
"#;

    let path = commands_dir.join("setup-ruflo.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write setup-ruflo.md: {e}"))?;

    Ok(format!("Created {}", path.display()))
}

#[tauri::command]
pub fn create_ddd_optimization_command() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let commands_dir = home.join(".claude").join("commands");
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create commands directory: {}", e))?;

    let command_file = commands_dir.join("ddd-optimization.md");
    let content = r#"---
name: ddd-optimization
description: Audits DDD compliance across all bounded contexts, proposes refactors to reach 5/5 domains, optimizes memory with scalar quantization, and executes via RuFlo MCP swarm
---

You are the DDD Architecture Optimizer for this RuneCode project. Execute the full DDD compliance audit and optimization in one autonomous run using the maximum number of RuFlo MCP swarm agents possible.

## MANDATORY EXECUTION SEQUENCE — ALL IN ONE MESSAGE

**Step 1 — Initialize max swarm:**
```javascript
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 15, strategy: "specialized",
  config: { consensus: "raft", memoryNamespace: "ddd-optimization" }
})
```

**Step 2 — Store context and spawn ALL agents simultaneously:**
```javascript
// Memory setup agent
mcp__claude-flow__agent_spawn({ agentType: "memory-specialist", agentId: "mem-optimizer", model: "haiku" })

// DDD audit agents — one per bounded context
mcp__claude-flow__agent_spawn({ agentType: "analyst",   agentId: "audit-ruflo",   model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "analyst",   agentId: "audit-session", model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "analyst",   agentId: "audit-project", model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "analyst",   agentId: "audit-agent",   model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "analyst",   agentId: "audit-mcp",     model: "sonnet" })

// Implementation agents
mcp__claude-flow__agent_spawn({ agentType: "coder",     agentId: "ddd-coder",     model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "tester",    agentId: "ddd-tester",    model: "haiku"  })
mcp__claude-flow__agent_spawn({ agentType: "reviewer",  agentId: "ddd-reviewer",  model: "sonnet" })
```

**Step 3 — Dispatch parallel workers (ALL `run_in_background: true` in ONE message):**

```javascript
// Memory optimization worker
Agent({ subagent_type: "memory-specialist", run_in_background: true,
  prompt: "Optimize ruflo memory: (1) run 'ruflo memory backend set agentdb', (2) 'ruflo memory configure --hnsw-optimization aggressive', (3) 'ruflo memory configure --quantization scalar', (4) 'ruflo memory consolidate', (5) 'ruflo memory sync --local ./memory-export.json'. Report results." })

// DDD audit workers — one per domain
Agent({ subagent_type: "analyst", run_in_background: true,
  prompt: "Audit src/domain/ruflo/ for DDD maturity across 5 axes: Aggregates (private constructor + factory + invariants), Value Objects (branded types, self-validating, immutable), Domain Events (raised inside aggregates, typed payloads), Application Services (thin handlers, load→mutate→save→dispatch), Repositories (interface + in-memory impl). Score each axis 1-5. List every gap with file:line references. Return structured score table." })

Agent({ subagent_type: "analyst", run_in_background: true,
  prompt: "Audit src/domain/session/ for DDD maturity. Score Aggregates/VOs/Events/AppServices/Repos each 1-5. List gaps with file:line. Return structured score table." })

Agent({ subagent_type: "analyst", run_in_background: true,
  prompt: "Audit src/domain/project/ for DDD maturity. Score Aggregates/VOs/Events/AppServices/Repos each 1-5. List gaps with file:line. Return structured score table." })

Agent({ subagent_type: "analyst", run_in_background: true,
  prompt: "Audit src/domain/agent/ for DDD maturity. Score Aggregates/VOs/Events/AppServices/Repos each 1-5. List gaps with file:line. Return structured score table." })

Agent({ subagent_type: "analyst", run_in_background: true,
  prompt: "Audit src/domain/mcp/ for DDD maturity. Score Aggregates/VOs/Events/AppServices/Repos each 1-5. List gaps with file:line. Return structured score table." })
```

## WHAT EACH AUDIT COVERS

For each bounded context, score these 5 DDD axes:

| Axis | 5/5 Criteria |
|------|-------------|
| **Aggregates** | Private constructor + `static create()` factory enforcing invariants; all state mutation via domain methods; no raw field access |
| **Value Objects** | Branded types for all IDs; `static create()` validates and throws on invalid input; immutable; equality by value |
| **Domain Events** | Events raised **inside** aggregate methods (not stores/services); typed `DomainEvent` objects with `aggregateId + occurredAt + payload`; cleared after dispatch |
| **Application Services** | Thin handlers only: `load → domain call → save → dispatch events → clearEvents`; no business logic; returns `Result<T,E>` |
| **Repositories** | `IRepository` interface + `InMemoryRepository` test impl + production impl; dependency-injected into services |

## MEMORY OPTIMIZATION TARGETS

After setup, these should be true:
- **Backend**: AgentDB as primary (not HNSW-only)
- **Quantization**: Scalar mode (`float32 → uint8`, 4× compression)
- **HNSW indexing**: Aggressive (128 connections, ef_construction=200)
- **Local cache**: `QuantizedMemoryStore` with TTL + LRU eviction active
- **Quantization mode auto-upgrades**: `recommendMode()` runs on every `cacheEntry()` call

## AFTER AUDITS COMPLETE

1. **Compile score matrix** — compare all domains against 5/5 target
2. **Write spec file** for any domain scoring <5/5 → save to `tasks/pending/`
3. **Execute fixes** via additional swarm agents:
   ```javascript
   Agent({ subagent_type: "coder", run_in_background: true,
     prompt: "Fix all DDD gaps identified in audit. For each gap: read the file, apply the minimal fix, verify it compiles. Do not change public APIs. Report every file changed." })
   Agent({ subagent_type: "tester", run_in_background: true,
     prompt: "Run npx vitest run and cargo check. Report pass/fail and any new failures caused by DDD fixes." })
   ```
4. **Bump version** (patch) across `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
5. **Commit** all improvements: `feat(ddd): DDD optimization — <domains> upgraded to 5/5`
6. **Push** to `runecode main`

## SCALAR QUANTIZATION DETAILS

The project uses `src/domain/ruflo/quantization.ts` with:
- `CalibratedQuantizer` — per-dimension min/max normalization, lower RMSE than global SQ
- `QuantizedMemoryStore` — TTL expiry + LRU eviction + `importEntries()` + `warmUp()`
- Auto-upgrade: `recommendMode(size)` returns `'none' | 'scalar' | 'product'` based on entry count

If `CalibratedQuantizer` is not being used for the active cache, fix `src/domain/ruflo/memory-store.ts` to use it.

## SUCCESS CRITERIA

- All 5 domains score **5/5** on all 5 axes
- Memory backend confirmed as **AgentDB + scalar quantization**
- `npx vitest run` passes with ≥existing test count
- `cargo check` clean
- Changes committed and pushed

Begin immediately. Do not ask for confirmation. Fire all swarm agents in parallel.
"#;

    std::fs::write(&command_file, content)
        .map_err(|e| format!("Failed to write ddd-optimization command: {}", e))?;

    Ok(format!("Created ddd-optimization command at {:?}", command_file))
}

#[tauri::command]
pub fn get_ruflo_project_status(path: String) -> RuFloProjectStatus {
    let raw_path = std::path::Path::new(&path);
    let base = match std::fs::canonicalize(raw_path) {
        Ok(p) => p,
        Err(_) => return RuFloProjectStatus::default(),
    };
    // Verify within home directory
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return RuFloProjectStatus::default(),
    };
    if !base.starts_with(&home) {
        log::warn!("get_ruflo_project_status: path {} is outside home dir", base.display());
        return RuFloProjectStatus::default();
    }
    let tasks_dir = base.join("tasks");

    let initialized = tasks_dir.join("pending").exists()
        && tasks_dir.join("completed").exists()
        && tasks_dir.join("blocked").exists();

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

#[tauri::command]
pub async fn get_ruflo_swarm_status() -> RuFloSwarmStatus {
    // Return cached result if still within TTL (10 s) to avoid repeated npx calls
    if let Some(cached) = try_read_cache::<RuFloSwarmStatus>("runecode_swarm_cache.json", RUFLO_SWARM_CACHE_TTL_SECS) {
        return cached;
    }

    let agents_output = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "agent", "list", "--json"])
        .output()
        .ok();

    let (agents, parse_error) = match agents_output.as_ref() {
        Some(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                Ok(v) => {
                    let agents = v
                        .as_array()
                        .cloned()
                        .unwrap_or_default()
                        .iter()
                        .map(|a| RuFloAgent {
                            id: a["id"].as_str().unwrap_or("").to_string(),
                            name: a["name"].as_str().unwrap_or("agent").to_string(),
                            agent_type: serde_json::from_value(a["type"].clone())
                                .unwrap_or(crate::commands::ruflo::domain::agent::AgentType::Custom),
                            status: serde_json::from_value(a["status"].clone())
                                .unwrap_or(AgentStatus::Unknown),
                            capabilities: vec![],
                        })
                        .collect::<Vec<_>>();
                    (agents, None)
                }
                Err(e) => {
                    log::warn!("Failed to parse agent list JSON: {}", e);
                    (vec![], Some(format!("parse error: {}", e)))
                }
            }
        }
        Some(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            log::warn!("agent list command failed: {}", stderr);
            (vec![], Some(stderr.to_string()))
        }
        None => (vec![], Some("command not found".to_string())),
    };

    let _ = parse_error; // logged above; callers see empty agents

    let swarm_active = !agents.is_empty() && agents.iter().any(|a| a.status.is_active());

    let memory_entries = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "memory", "list", "--json"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().map(|a| a.len()))
        .unwrap_or(0);

    let result = RuFloSwarmStatus { swarm_active, agents, memory_entries };
    write_cache("runecode_swarm_cache.json", &result);
    result
}

#[tauri::command]
pub async fn init_ruflo_project(app: tauri::AppHandle, path: String) -> Result<String, String> {
    use tauri::Emitter;
    let project_path = std::path::Path::new(&path);
    if !project_path.exists() {
        return Err(format!("Project path does not exist: {}", project_path.display()));
    }
    if !project_path.is_dir() {
        return Err(format!("Project path is not a directory: {}", project_path.display()));
    }

    let project_path = match std::fs::canonicalize(project_path) {
        Ok(p) => p,
        Err(e) => return Err(format!("Cannot resolve project path: {}", e)),
    };
    // Verify within home directory
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    if !project_path.starts_with(&home) {
        return Err("Project path must be within the home directory".to_string());
    }

    let output = crate::claude_binary::create_command_with_env("npx")
        .args(["@claude-flow/cli", "init"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run ruflo init: {e}"))?;

    if output.status.success() {
        let _ = app.emit("ruflo-project-changed", project_path.to_string_lossy().as_ref());
        Ok("RuFlo initialized in project".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("ruflo init failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn uninstall_ruflo() -> Result<String, String> {
    let output = crate::claude_binary::create_command_with_env("npm")
        .args(["uninstall", "-g", "@claude-flow/cli"])
        .output()
        .map_err(|e| format!("Failed to run npm uninstall: {e}"))?;

    if output.status.success() {
        Ok("RuFlo uninstalled successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("npm uninstall failed: {stderr}"))
    }
}

/// Get memory statistics from the claude-flow CLI
#[tauri::command]
pub async fn get_ruflo_memory_stats() -> Result<serde_json::Value, String> {
    let output = crate::claude_binary::create_command_with_env("npx")
        .args(["-y", "@claude-flow/cli@latest", "memory", "stats", "--json"])
        .output()
        .map_err(|e| format!("Failed to run memory stats: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut val: serde_json::Value = serde_json::from_str(stdout.trim())
            .unwrap_or_else(|_| serde_json::json!({ "raw": stdout.trim() }));
        // Inject agentdb as the default backend when the CLI omits it
        if let Some(obj) = val.as_object_mut() {
            obj.entry("backend").or_insert_with(|| serde_json::json!("agentdb"));
        }
        Ok(val)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory stats failed: {stderr}"))
    }
}

/// Sync memory to local file (export as JSON)
#[tauri::command]
pub async fn sync_ruflo_memory_local(app: tauri::AppHandle, output_path: String) -> Result<String, String> {
    use tauri::Emitter;
    // Validate path is within home dir
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let resolved = std::path::Path::new(&output_path);
    let canonical_parent = resolved
        .parent()
        .and_then(|p| std::fs::canonicalize(p).ok())
        .ok_or("Cannot resolve output path")?;
    if !canonical_parent.starts_with(&home) {
        return Err("Output path must be within home directory".to_string());
    }

    let output = crate::claude_binary::create_command_with_env("npx")
        .args([
            "-y",
            "@claude-flow/cli@latest",
            "memory",
            "export",
            "--format",
            "json",
            "--output",
            &output_path,
        ])
        .output()
        .map_err(|e| format!("Failed to run memory export: {e}"))?;

    if output.status.success() {
        let _ = app.emit("ruflo-memory-changed", "synced");
        Ok(format!("Memory synced to {}", output_path))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory export failed: {stderr}"))
    }
}

/// Consolidate memory (compress + cleanup stale entries)
#[tauri::command]
pub async fn consolidate_ruflo_memory(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    // Run compress first
    let compress = crate::claude_binary::create_command_with_env("npx")
        .args(["-y", "@claude-flow/cli@latest", "memory", "compress"])
        .output()
        .map_err(|e| format!("Failed to run memory compress: {e}"))?;

    if !compress.status.success() {
        let stderr = String::from_utf8_lossy(&compress.stderr);
        return Err(format!("memory compress failed: {stderr}"));
    }

    // Then cleanup stale entries
    let cleanup = crate::claude_binary::create_command_with_env("npx")
        .args(["-y", "@claude-flow/cli@latest", "memory", "cleanup"])
        .output()
        .map_err(|e| format!("Failed to run memory cleanup: {e}"))?;

    if cleanup.status.success() {
        let _ = app.emit("ruflo-memory-changed", "consolidated");
        Ok("Memory consolidated (compressed + cleaned up stale entries)".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&cleanup.stderr);
        Err(format!("memory cleanup failed: {stderr}"))
    }
}

/// Set memory backend (agentdb, hnsw, or hybrid)
#[tauri::command]
pub async fn set_ruflo_memory_backend(app: tauri::AppHandle, backend: String) -> Result<String, String> {
    use tauri::Emitter;
    // Validate backend value
    if !["agentdb", "hnsw", "hybrid"].contains(&backend.as_str()) {
        return Err(format!(
            "Invalid backend '{}'. Must be: agentdb, hnsw, hybrid",
            backend
        ));
    }

    let output = crate::claude_binary::create_command_with_env("npx")
        .args([
            "-y",
            "@claude-flow/cli@latest",
            "memory",
            "configure",
            "--backend",
            &backend,
        ])
        .output()
        .map_err(|e| format!("Failed to run memory configure: {e}"))?;

    if output.status.success() {
        let _ = app.emit("ruflo-memory-changed", backend.as_str());
        Ok(format!("Memory backend set to {}", backend))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory configure failed: {stderr}"))
    }
}
