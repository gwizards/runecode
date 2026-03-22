# Gamma Team: Existing Rust Code Audit

**Date:** 2026-03-22
**Auditor:** Team Gamma (gamma-rust-audit)
**Codebase:** RuneCode — Tauri 2.x desktop app + web server mode
**Scope:** All Rust source files under `src-tauri/src/`

---

## Executive Summary

The RuneCode Rust backend is a well-structured Tauri 2.x application with a growing web-server mode (`web_server.rs`). The codebase has clearly matured through multiple DDD refactors — the ruflo domain layer shows strong typing discipline, and security-sensitive paths (file access, SQL identifiers, path traversal) have been hardened. However, several structural problems threaten reliability and maintainability at scale.

**Top concerns:**

1. **Single SQLite connection behind a `std::sync::Mutex`** — all Tauri commands that touch the DB serialize through one lock. Under load this creates a latency cliff and potential deadlocks if two commands compete.
2. **`spawn_claude_process` / `spawn_agent_system` spawn unbounded `tokio::spawn` tasks** whose handles are dropped. If the process hangs, the tasks leak forever — there is no timeout on the IO loops.
3. **`web_server.rs` is 2 869 lines** and contains duplicated business logic that already exists in the Tauri command layer. This creates a maintenance split-brain.
4. **`std::process::Command` (blocking) is called inside `async` Tauri commands** via `create_command_with_env`, which runs on the async executor thread without `spawn_blocking`.
5. **52 `.unwrap()` calls** across production code (not just tests); the most dangerous ones are in `spawn_claude_process` at lines `claude.rs:1304`, `1319`, `1332`, `1337`, `1352`, `1378`, `1389` — all inside a long-running `tokio::spawn` background task where panics are silently swallowed.

**Quality score:** 6.8 / 10 (solid foundation, three files need split, concurrency model needs refinement)

---

## Severity Table

| Sev | Finding | File : Line |
|-----|---------|-------------|
| **Critical** | Mutex-poisoning panic swallowed by `unwrap_or_else(|e| e.into_inner())` — poison is recovered silently, corrupted state may be used | `claude.rs:1304,1319,1332,1337,1352,1378,1389` |
| **Critical** | `app_dir.expect("Failed to get app data dir")` panics the async task on app data dir unavailability | `agents.rs:890` |
| **Critical** | `web_server.rs:list_directory_contents` (line 2566) performs no path-traversal validation — unlike the Tauri version at `claude.rs:1424`, the web handler accepts arbitrary `directoryPath` without home-dir restriction | `web_server.rs:2566` |
| **High** | `spawn_claude_process` spawns three `tokio::spawn` tasks and drops all handles — if Claude hangs, IO tasks and the waiter task leak indefinitely with no timeout | `claude.rs:1295,1347,1366` |
| **High** | `spawn_agent_system` similarly leaks stdout/stderr/wait tasks. Additionally opens a **new SQLite connection** inside a background task (`Connection::open`) bypassing the shared `AgentDb` mutex | `agents.rs:907,952` |
| **High** | Blocking `std::process::Command::output()` called directly inside `async fn` Tauri commands (not via `spawn_blocking`) — blocks the Tokio executor thread | `mcp.rs:109`, `ruflo/mod.rs:62,86,173,190`, `claude_binary.rs:185,229,427,496,515` |
| **High** | `web_server.rs:get_usage_window` (line 415) calls `spawn_blocking(…).await.unwrap_or_else(|_| …)` — a JoinError (panic in blocking task) silently returns empty JSON | `web_server.rs:415` |
| **High** | `SYSTEM: once_cell::sync::Lazy<Mutex<System>>` global — `sysinfo::System::refresh_cpu_usage()` called on every `get_system_resources` invocation (called from web frontend as a polling endpoint) without any debounce | `resources.rs:5-9` |
| **Medium** | `create_command_with_env` duplicated between `claude_binary.rs` (std) and `commands/claude.rs` (tokio) — the tokio version omits proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY`, etc.) present in the std version | `claude.rs:234`, `claude_binary.rs:633` |
| **Medium** | `AgentDb` is a `Mutex<Connection>` — single connection, no WAL mode set, no busy timeout configured. Concurrent read/write under multiple Tauri commands will timeout silently | `agents.rs:96` |
| **Medium** | `unwrap_or_default()` on `serde_json::to_value(stats)` in web_server handlers silently returns `null` JSON on serialization failure with no log | `web_server.rs:237,262,278,293` |
| **Medium** | `Utc.timestamp_opt(…).unwrap()` on timestamp conversion — panics on out-of-range timestamps (possible with corrupt JSONL files) | `checkpoint/manager.rs:142` |
| **Medium** | `list_directory_contents` (Tauri, `claude.rs:1432`) uses `std::env::var("HOME")` string comparison for path restriction — does not use `canonicalize` of home dir itself, susceptible to case differences on case-insensitive FS | `claude.rs:1425-1434` |
| **Medium** | `Regex::new(r"...")` compiled on every call to `extract_version_from_output` and inside `check_claude_version` — should be `once_cell::sync::Lazy` | `claude_binary.rs:546`, `claude.rs:688` |
| **Medium** | `ruflo/mod.rs` cache files written to `std::env::temp_dir()` — temp dir is world-readable on Linux; another process can inject a crafted cache to fake `installed=true` | `ruflo/mod.rs:22,40` |
| **Low** | `decode_project_path` (marked DEPRECATED) still called as live fallback path | `claude.rs:191,358,489` |
| **Low** | `#[allow(dead_code)]` on 8 items in `ruflo/domain/` modules — entire `CliResultCache` in `repository.rs` is unused in production | `repository.rs:4`, `value_objects.rs:5,26`, `events.rs:6`, etc. |
| **Low** | `web_main.rs` suppresses all module warnings with `#[allow(dead_code)]` on all four mod declarations — indicates web-mode module isolation is incomplete | `web_main.rs:3,5,7,9` |
| **Low** | `process/registry.rs:register_sidecar_process` references "sidecar" — sidecar was removed per comment in `agents.rs:13` | `registry.rs:84-119` |
| **Low** | `tokio::time::sleep(100ms)` called twice in `cancel_claude_execution` on the Tauri command thread — artificial blocking | `claude.rs:1202,1208` |
| **Low** | `hardcoded estimated_limit: f64 = 5_000_000.0` for rate-limit calculation — no way to configure per plan | `web_server.rs:397` |

---

## Reliability Risks

### `.unwrap()` count by file (production code only, excluding test blocks)

| File | `.unwrap()` in prod | Notes |
|------|---------------------|-------|
| `commands/claude.rs` | 8 | All inside `tokio::spawn` background tasks — panics are swallowed |
| `web_server.rs` | 7 | CORS origin parsing (static literals — safe); `get_usage_window` join unwrap |
| `checkpoint/manager.rs` | 1 | `Utc.timestamp_opt(…).unwrap()` on arbitrary user data |
| `commands/agents.rs` | 2 | Both are safe (guarded by `is_none()` check just above) |
| Test code | ~30 | Acceptable |

### Mutex-Poisoning Recovery Pattern

`spawn_claude_process` uses this pattern in 8 places inside a long-running `tokio::spawn`:

```rust
session_id_holder_clone.lock().unwrap_or_else(|e| e.into_inner())
```

This silently recovers poisoned mutexes and continues using potentially inconsistent state. If one of the other spawned tasks panics and poisons the mutex, subsequent lock calls will operate on corrupted data with no error propagation.

### Unbounded Task Leaks

`spawn_claude_process` (claude.rs) creates 3 background tasks. The outer function returns `Ok(())` immediately after spawning, dropping all `JoinHandle`s. If the Claude binary hangs:
- `stdout_task` blocks indefinitely on `lines.next_line()`
- `stderr_task` blocks indefinitely
- The wait task blocks on `child.wait()`

There is no timeout, no cancellation token, and no way for the caller to detect the hang. The `cancel_claude_execution` command can kill the process via `ClaudeProcessState`, which would unblock the IO tasks indirectly — but only if the caller knows to call it.

The same pattern exists in `spawn_agent_system` (agents.rs).

### `expect` Panic in Async Task

`agents.rs:890`:
```rust
let app_dir = app
    .path()
    .app_data_dir()
    .expect("Failed to get app data dir");
```
This is called inside `spawn_agent_system` before the background tasks are created. If `app_data_dir()` fails (e.g., sandboxed environment), the Tauri command panics. Tauri catches panics from commands, but the DB record for the agent run will be left in `status='running'` with no cleanup.

---

## Resource Usage Issues

### Blocking I/O on the Async Executor

The following call sites execute synchronous, potentially long-running OS operations directly on a Tokio async task (not via `spawn_blocking`):

| Location | Blocking operation |
|----------|--------------------|
| `mcp.rs:109` | `cmd.output()` — spawns external process, blocks until done |
| `ruflo/mod.rs:62` | `create_command_with_env("npx").output()` |
| `ruflo/mod.rs:86` | `create_command_with_env("claude").output()` |
| `ruflo/mod.rs:173` | `create_command_with_env("claude").output()` |
| `ruflo/mod.rs:190` | `create_command_with_env("claude").output()` |
| `claude_binary.rs:185,229,427,496,515` | Multiple `silent_command().output()` calls |

These run on Tokio's async thread pool. For short operations this is unlikely to cause problems, but `npx` and `claude` binary invocations can take 500ms–5s, which will starve other async tasks sharing the same thread.

**Note:** `commands/mcp.rs:execute_claude_mcp_command` is `fn` (not `async fn`) and is called from `async` Tauri commands that use `.await`. The calling async functions are correct in that they `await` future results, but the synchronous `execute_claude_mcp_command` still runs on the executor thread.

### `sysinfo` Global Called on Every Request

`resources.rs:5-9` creates a global `Mutex<System>`. The `get_system_resources()` command refreshes CPU and memory on every call. In the web server mode this endpoint is likely polled by the frontend (the web app shows a resource bar). Without a per-call debounce or TTL, each UI poll takes a sysinfo refresh, which on some kernels can be slow (reading `/proc/stat`).

**Recommendation:** Add a timestamp-based skip: if last refresh was <500ms ago, return cached values.

### SQLite Single Connection

`AgentDb(Mutex<Connection>)` — all CRUD operations on agents, runs, and settings serialize through one connection. SQLite in WAL mode supports concurrent readers + one writer, but with a single connection this is academic. Heavy usage patterns (parallel agent runs each updating their status) will queue on this lock.

The agent run update inside `spawn_agent_system` opens a *second* independent connection (`Connection::open(&db_path_for_stdout)`) from inside the background task (agents.rs:952). This means:
- Two writers can be active simultaneously (the main `AgentDb` Mutex and the background task's raw connection)
- Without explicit WAL mode and `busy_timeout`, the second writer will fail with `SQLITE_BUSY` on any contention

### Over-Cloning in `spawn_claude_process`

`spawn_claude_process` clones `Arc` and `String` values 12+ times across task closures. For session IDs and paths these are typically small, so this is not a hot-path concern, but the pattern of creating many short-lived `Arc<Mutex<...>>` holders (`session_id_holder`, `run_id_holder`) just for inter-task communication would be cleaner with `tokio::sync::oneshot` or `watch` channels.

---

## Code Quality Issues

### Duplicated `create_command_with_env`

Two copies exist:
- `claude_binary.rs:633` — `std::process::Command`, includes proxy env vars
- `commands/claude.rs:234` — `tokio::process::Command`, **missing proxy env vars** (`HTTP_PROXY`, `HTTPS_PROXY`, `NO_PROXY`, `ALL_PROXY`)

This means Claude processes launched for interactive sessions (via `execute_claude_code` / `continue_claude_code`) may not inherit proxy settings that were loaded at startup. Agents launched via `execute_agent` (which uses `commands/claude.rs`'s version for the tokio command) also lack proxy inheritance.

### Regex Compiled on Every Call

Two locations compile the same semver regex at call time:

- `claude_binary.rs:546` inside `extract_version_from_output()`
- `claude.rs:688` inside `check_claude_version()`

This function is called for each discovered installation during binary scanning. Use `once_cell::sync::Lazy<Regex>`.

### Dead Ruflo Domain Code

The following domain types exist in `commands/ruflo/domain/` but are never referenced outside their module:
- `SwarmId` value object (`value_objects.rs:7`) — `#[allow(dead_code)]`
- `ProjectPath` value object (`value_objects.rs:27`) — `#[allow(dead_code)]`
- All types in `events.rs` — `#[allow(dead_code)]`
- `CliResultCache` in `repository.rs` — struct is defined but never instantiated; the DB cache mechanism is unused while the file-based TTL cache in `ruflo/mod.rs` is used instead

This is not a bug but represents ~150 lines of infrastructure that should either be wired up or removed.

### Missing `tracing`/`log` Instrumentation in Key Paths

- `checkpoint/storage.rs` — no log calls in `save_checkpoint`, `restore_checkpoint`
- `process/registry.rs:kill_process` — logs exist but the 5-second timeout path has no metrics
- `web_server.rs` WebSocket handler — no per-connection logging (session ID, project path) on connect/disconnect

### Inconsistent Error Surface at Tauri Command Boundaries

Several Tauri commands return `Err(String)` with raw Rust error messages (e.g., `"Failed to read directory entry: Permission denied (os error 13)"`). These bubble directly to the frontend. User-facing errors should be mapped to structured error codes before crossing the Tauri boundary.

---

## Expansion Opportunities

The table below identifies TypeScript/JavaScript functionality in the frontend layer that has natural affinity for the Rust backend — either because Rust already performs related work, or because moving the logic would improve correctness, performance, or security.

| TS Module | Should Move to Rust | Rust Location | Effort |
|-----------|---------------------|---------------|--------|
| Frontend JSONL parser (re-parses session files to display history) | Yes — Rust already reads JSONL in `claude.rs:load_session_history`; a streaming incremental parser would avoid re-reading entire files | `commands/claude.rs` or new `commands/session_stream.rs` | Medium |
| Usage cost calculation (TS side recalculates from JSONL) | Yes — `commands/usage.rs` already has `calculate_cost()` and `parse_jsonl_file()`; the TS duplication introduces divergence risk | `commands/usage.rs` (expose `get_usage_details` per-session endpoint) | Low |
| File-system watcher (frontend polls `get_recently_modified_files`) | Yes — use `notify` crate with Tauri event emission; removes polling | New `commands/watch.rs` | Medium |
| Project path encoding/decoding (TS encodes `"/"` → `"-"` for project IDs) | Yes — encoding is already in `claude.rs:create_project` and the decoding fallback in `decode_project_path`; round-trip should be owned by Rust | `commands/claude.rs` | Low |
| Binary discovery (TS has its own `findClaudePath` helper) | Yes — `claude_binary.rs` is the authoritative implementation; TS copy can be removed | `claude_binary.rs` (already exposed via `get_claude_binary_path` command) | Low |
| Session deduplication logic for usage (TS deduplicates token entries) | Yes — `usage.rs:parse_jsonl_file` already deduplicates by `msg_id:req_id` hash | `commands/usage.rs` | Low |
| Checkpoint diff rendering (TS reads file snapshot bytes and diffs) | Partial — Rust stores snapshots via zstd; decompression and unified diff generation belong in Rust | `checkpoint/manager.rs` — add `get_diff()` method | Medium |
| Rate-limit window calculation (5h rolling window in `web_server.rs:get_usage_window`) | Already in Rust (web_server only); should be exposed as a Tauri command too | `commands/usage.rs` | Low |
| MCP server health ping (TS calls `mcp_test_connection` then re-validates) | Already in Rust (`mcp.rs:mcp_test_connection`); TS retry logic should be removed | `commands/mcp.rs` | Low |
| `hooks` JSON validation (TS validates hook structure before saving) | Should be in Rust — `agents.rs` stores `hooks: Option<String>` opaquely; validate on `create_agent`/`update_agent` | `commands/agents.rs` | Low |

### Pattern for Adding New Commands

The codebase has a consistent, clean pattern:

1. Add a new file under `src-tauri/src/commands/<name>.rs`
2. Declare `pub mod <name>;` in `commands/mod.rs`
3. Add `use commands::<name>::<fn_name>;` in `main.rs`
4. Add `<fn_name>` to `invoke_handler![]` in `main.rs`
5. For web mode: add a route in `web_server.rs` that calls `tokio::task::spawn_blocking(|| commands::<name>::<fn_name>(...))` or wraps the async command directly

Most existing commands are thin wrappers — they validate input, find the Claude binary path, build args, and delegate to `spawn_claude_process`/`spawn_agent_system`. Real work lives in `claude_binary.rs`, `checkpoint/`, and `process/registry.rs`. New commands should follow this delegation model.

---

## Files Needing Split (>500 lines)

| File | Lines | Suggested Split |
|------|-------|-----------------|
| `web_server.rs` | **2 869** | Extract into: `web_server/routes/claude.rs`, `web_server/routes/checkpoint.rs`, `web_server/routes/usage.rs`, `web_server/routes/agents.rs`, `web_server/routes/mcp.rs`, `web_server/state.rs` |
| `commands/claude.rs` | **2 616** | Extract into: `commands/claude/session.rs` (list_projects, sessions, history), `commands/claude/execution.rs` (execute, continue, resume, cancel), `commands/claude/files.rs` (directory listing, file search, CLAUDE.md ops), `commands/claude/checkpoint_cmds.rs` (checkpoint Tauri commands) |
| `commands/agents.rs` | **2 050** | Extract into: `commands/agents/db.rs` (CRUD), `commands/agents/execution.rs` (spawn_agent_system, IO tasks), `commands/agents/metrics.rs` (AgentRunMetrics, JSONL parsing), `commands/agents/github.rs` (GitHub import) |
| `commands/mcp.rs` | **726** | Borderline — acceptable if no further growth; consider extracting `mcp_serve` (lines 400-600) into `commands/mcp/serve.rs` |
| `commands/ruflo/mod.rs` | **800** | Extract large slash-command content strings to `commands/ruflo/templates.rs`; the content strings alone account for ~350 lines |
| `checkpoint/manager.rs` | **843** | Extract `track_bash_side_effects` and file snapshot logic into `checkpoint/tracker.rs` |
| `process/registry.rs` | **550** | Borderline — split `kill_process` and `kill_process_by_pid` into `process/kill.rs` |

---

## Recommended Immediate Fixes (Top 5)

### Fix 1 — Enable SQLite WAL Mode and Set Busy Timeout

In `agents.rs:init_database()`, after `Connection::open`:

```rust
// After line 226: let conn = Connection::open(db_path)?;
conn.execute_batch(
    "PRAGMA journal_mode=WAL;
     PRAGMA busy_timeout=5000;
     PRAGMA foreign_keys=ON;"
)?;
```

This prevents `SQLITE_BUSY` errors when the background stdout task opens a second connection, and enables concurrent readers. No schema migration needed.

### Fix 2 — Replace `expect` with Proper Error Propagation in `spawn_agent_system`

`agents.rs:890` currently:
```rust
let app_dir = app
    .path()
    .app_data_dir()
    .expect("Failed to get app data dir");
```

Should be:
```rust
let app_dir = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("Failed to get app data dir: {}", e))?;
```

This converts a panic into a clean `Err` that the caller can handle and that the DB cleanup path can run.

### Fix 3 — Add IO Task Timeout in `spawn_claude_process`

Wrap the wait task body with a Tokio timeout:

```rust
tokio::spawn(async move {
    // Wait for stdout/stderr tasks with a maximum lifetime guard
    let timeout_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(3600), // 1-hour hard cap
        async {
            let _ = stdout_task.await;
            let _ = stderr_task.await;
        }
    ).await;
    if timeout_result.is_err() {
        log::error!("Claude IO tasks exceeded 1-hour limit — forcibly terminating tracking");
    }
    // ... rest of wait logic
});
```

This prevents permanent task leaks from hung processes.

### Fix 4 — Use `once_cell` for Compiled Regex

In `claude_binary.rs`, replace:
```rust
// Inside extract_version_from_output:
let version_regex =
    regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok()?;
```

With a module-level static:
```rust
use once_cell::sync::Lazy;
static VERSION_REGEX: Lazy<regex::Regex> = Lazy::new(|| {
    regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)")
        .expect("version regex is valid")
});
```

Remove the duplicate regex in `claude.rs:688` and call the shared version. This eliminates regex compilation on every binary version check.

### Fix 5 — Add Path Traversal Check to Web Mode `list_directory_contents`

`web_server.rs:2566` currently has no home-dir restriction:
```rust
// VULNERABLE — accepts any path
if let Ok(dir) = std::fs::read_dir(&dir_path) {
```

Add the same guard as the Tauri version:
```rust
let dir_path_buf = std::path::PathBuf::from(&dir_path);
let canonical = dir_path_buf
    .canonicalize()
    .map_err(|_| axum::http::StatusCode::BAD_REQUEST)?;
let home = std::env::var("HOME").unwrap_or_default();
if !home.is_empty() && !canonical.starts_with(&home) {
    return axum::http::StatusCode::FORBIDDEN.into_response();
}
```

This closes a directory traversal vulnerability in the web server mode where an attacker with network access could enumerate arbitrary filesystem paths.

---

*Report generated by Team Gamma (gamma-rust-audit). All file:line references are relative to `src-tauri/src/`. Line numbers reflect the codebase state at commit `94cc3e9` (2026-03-22).*
