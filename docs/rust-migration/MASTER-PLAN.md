# RuneCode — Rust Migration & CLI Tooling Master Plan

**Produced by:** 5-agent swarm audit (2026-03-22)
**Teams:** Alpha (migration candidates), Beta (CLI design), Gamma (existing Rust audit)
**Source reports:** `alpha-quantization.md`, `alpha-api.md`, `alpha-storage.md`, `beta-cli-design.md`, `gamma-rust-audit.md`

---

## Executive Summary

The audit found **3 critical bugs, 5 high-severity reliability issues**, and **4 significant migration opportunities**. Critically, several findings are not migration work — they are bugs that affect correctness and security today:

| Category | Count | Immediate action |
|----------|-------|-----------------|
| Security vulnerabilities | 1 | **Fix this sprint** |
| Data correctness bugs | 2 | **Fix this sprint** |
| Panic/crash risks | 2 | **Fix this sprint** |
| Reliability issues | 5 | Fix next sprint |
| Migration candidates (P1) | 3 | Implement next quarter |
| CLI tools to build | 3 | Phase 1 after fixes |

---

## PART 1 — CRITICAL BUGS (Fix Before Any Migration)

### 🔴 Critical-1: Path Traversal in Web Server
**File:** `src-tauri/src/web_server.rs:2566` — `list_directory_contents`
**Bug:** Web mode directory listing has no path restriction. Any network-accessible requester can enumerate arbitrary filesystem paths. The Tauri command version (`claude.rs:1424`) correctly restricts to the home directory; the web handler does not.
**Fix:** Add the same `canonicalize()` + home-dir prefix check that exists in the Tauri path.

### 🔴 Critical-2: WebSocket Protocol Gap (Silent Feature Loss)
**File:** `src-tauri/src/web_server.rs:964` — `claude_websocket_handler`
**Bug:** TypeScript sends 9 WS message types (`init`, `init_agent`, `prompt`, `interrupt`, `rewind_files`, `set_model`, `set_permission_mode`, `stop_task`, `close`). The Rust handler only parses the old 3-field `ClaudeExecutionRequest`. All richer types fall into the parse-error branch and are **silently discarded**. Result: interrupt, mid-session model change, file rewind, and agent sessions are dead in web mode.
**Fix:** Replace `ClaudeExecutionRequest` with a `WsClientMessage` enum covering all 9 types.

### 🔴 Critical-3: Panic in Async Tauri Command
**File:** `src-tauri/src/commands/agents.rs:890`
**Bug:** `.expect("Failed to get app data dir")` panics inside an async Tauri command. When this panics, agent runs are left stuck in `status='running'` with no cleanup — the app appears hung.
**Fix:** Replace `.expect(...)` with `? ` propagation, returning `Err(anyhow::anyhow!(...))`.

### 🔴 Critical-4: Float Arithmetic for Billing (Data Correctness)
**Files:** `src/domain/usage/service.ts` + `src-tauri/src/commands/usage.rs`
**Bug:** `UsageLedger.summary()` accumulates `costUsd` with IEEE-754 float addition. `getTotalCost()` runs a second-order `reduce` over all ledgers. Silent rounding drift compounds on every API call. **The same bug exists in the Rust `usage.rs`.**
**Fix:** Store and accumulate as `i64` micro-dollars (multiply by 1,000,000, round with `i64::from(f64::round(cost * 1_000_000.0))`). Convert to display string only at the presentation layer.

### 🔴 Critical-5: UsageLedger Lost on Restart (Data Loss)
**File:** `src/domain/usage/repository.ts`
**Bug:** `InMemoryUsageLedgerRepository` is a TypeScript `Map` — **all usage/billing data is lost on every app restart**. The existing `commands/usage.rs` only reads JSONL from `~/.claude` for display-only stats.
**Fix:** Persist `UsageLedger` aggregates to the existing rusqlite DB via a new `persist_usage_ledger` / `load_usage_ledger` Tauri command pair.

---

## PART 2 — HIGH SEVERITY RELIABILITY (Next Sprint)

### 🟠 High-1: Dropped JoinHandles → Task Leaks
**Files:** `commands/agents.rs` — `spawn_claude_process`, `spawn_agent_system`
**Issue:** All `JoinHandle`s are dropped immediately. IO tasks leak indefinitely when Claude hangs.
**Fix:** Store handles in `Arc<Mutex<Vec<JoinHandle>>>`, cancel on WS disconnect via `tokio_util::CancellationToken`.

### 🟠 High-2: Blocking Calls Inside Async Context
**Files:** `commands/agents.rs`, `commands/claude.rs`
**Issue:** `std::process::Command::output()` called directly inside `async` Tauri commands, blocking the Tokio executor thread on `npx`/`claude` invocations.
**Fix:** Wrap in `tokio::task::spawn_blocking(|| ...)`.

### 🟠 High-3: SQLite Single Connection + No WAL Mode
**File:** `commands/agents.rs` — `AgentDb`
**Issue:** `Mutex<Connection>` with no WAL mode and no busy timeout. Concurrent writes from background stdout task + main command path hit `SQLITE_BUSY`.
**Fix:** Enable WAL: `conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;")`.

### 🟠 High-4: Mutex Poisoning Silently Swallowed
**File:** `commands/claude.rs:1304,1319,1332,1337,1352,1378,1389`
**Issue:** `unwrap_or_else(|e| e.into_inner())` inside long-running background tasks. If one task panics, sibling tasks continue running on corrupted shared state.
**Fix:** Propagate poisoning as a proper error, restart the affected task, log the original panic payload.

### 🟠 High-5: sysinfo Refresh on Every Call
**File:** `commands/resources.rs` — `get_system_resources`
**Issue:** `sysinfo::System::refresh_all()` is called on every invocation with no debounce. This is expensive (full /proc scan on Linux).
**Fix:** Cache the `System` instance in `once_cell::sync::Lazy<Mutex<System>>`, refresh at most once per second.

### 🟠 High-6: Dual-Write localStorage + SQLite
**File:** `src/infrastructure/tauri/storage-client.ts:131–178`
**Issue:** `getSetting`/`saveSetting` write to both `localStorage` and SQLite. Cache coherence is the caller's problem.
**Fix:** New Rust command `get_app_setting`/`set_app_setting` backed by `dashmap::DashMap` (in-memory LRU) + rusqlite write-through. Remove the `localStorage` layer.

---

## PART 3 — MIGRATION ROADMAP

### M1 — Quantization Kernels → Rust (P1, ~2 weeks)
**Source:** `src/domain/shared/quantization.ts`, `src/domain/ruflo/quantization.ts`
**Target:** `src-tauri/src/quantization/mod.rs`

Migrate pure math kernels with zero TS coupling:
- `quantizeVector` / `dequantizeVector` (int8 symmetric)
- `int8CosineSimilarity` — **must use `i32` accumulator**, not `f64` (correctness trap)
- `QuantizedVectorStore.search` (ANN inner loop)
- `ProductQuantizer._kMeans` + `_nearestCentroid` (largest compute win)

**Crates:** `rayon` (parallel batch + k-means), `wide` (portable SIMD), `ndarray` (codebook), `bytemuck` (zero-copy)
**IPC:** Expose as `#[tauri::command] quantize_vectors(...)`, `ann_search(...)`, `train_product_quantizer(...)`
**Keep in TS (P3):** 6 `*SnapshotQuantizer` classes (tightly coupled to TS domain types)

**Estimated speedup:** k-means training: 10-50× (rayon + SIMD). ANN search: 3-10×.

### M2 — Analytics Event Pipeline → Rust tokio (P2, ~1 week)
**Source:** `src/hooks/useAnalytics.ts` (350 of 661 lines are pure forwarding)
**Target:** `src-tauri/src/commands/analytics.rs`

Move event queueing, batching, retry, and HTTP flush to a Rust tokio background task (`reqwest`). Each TS call becomes a thin `invoke('analytics_track', { event, properties })`.
**Keep in TS:** PostHog `init`, `opt_in_capturing`, all composite hooks with React lifecycle (`useWorkflowTracking`, etc.)

### M3 — WebSocket Protocol Completion → Rust (P1, ~1 week)
This is already in the Critical fixes above but it's also a migration opportunity — once the enum is in place, the Rust handler can natively support:
- `rewind_files` → delegate to `checkpoint` module (already exists)
- `init_agent` → pass `--agent-name` flag to Claude subprocess
- `set_model` / `set_permission_mode` → mid-session config injection

---

## PART 4 — CLI TOOLING STRATEGY

### Recommendation: clap (Phase 1) → argh (Phase 2)

Since `clap 4` + derive macros is already compiled into the binary (`web_main.rs` already uses it), adding `[[bin]]` entries costs **zero** marginal binary size.

`argh` (Google) is reserved for Phase 2 — a standalone headless daemon distributed separately without the Tauri window stack, where binary size matters.

### Phase 1 — Add [[bin]] entries to src-tauri/Cargo.toml

```toml
[[bin]]
name = "runecode-health"
path = "src/cli/health.rs"

[[bin]]
name = "runecode-migrate"
path = "src/cli/migrate.rs"

[[bin]]
name = "runecode-export"
path = "src/cli/export.rs"
```

**Blocking code change first:** `commands::agents::init_database` currently takes `tauri::AppHandle`. Refactor to accept `PathBuf` directly; thin AppHandle wrapper calls it. This is the **only blocker** for Phase 1 CLI.

### CLI Tool Catalog

| Tool | Purpose | Priority | Notes |
|------|---------|----------|-------|
| `runecode-health` | Check claude binary, ruflo status, MCP servers | P1 | No Tauri context needed |
| `runecode-migrate` | Run rusqlite migrations headlessly | P1 | Needs PathBuf refactor |
| `runecode-export` | Export sessions/projects → JSON/Markdown | P2 | Needs checkpoint access |
| `runecode-bench` | Quantization benchmarks (after M1) | P3 | Useful for CI perf regression |
| `runecode-daemon` | Headless daemon (no GUI) — Phase 2 | Phase 2 | argh binary, separate crate |

### Phase 2 — Cargo Workspace + argh standalone

```
/
├── Cargo.toml              # [workspace] members = ["src-tauri", "crates/runecode-cli"]
├── src-tauri/              # Tauri app (unchanged)
└── crates/
    └── runecode-cli/       # Standalone daemon, uses argh, no tauri deps
        ├── Cargo.toml
        └── src/
            ├── main.rs
            └── commands/
```

### Cross-Platform Build Matrix

**Strategy: native CI runners** (NOT cross-rs — `rusqlite` bundled feature compiles SQLite from C, cross-compilation requires full C toolchain).

```yaml
# .github/workflows/cli-release.yml
strategy:
  matrix:
    include:
      - os: ubuntu-latest   target: x86_64-unknown-linux-gnu   suffix: linux-x86_64
      - os: macos-latest    target: aarch64-apple-darwin        suffix: darwin-arm64
      - os: macos-latest    target: x86_64-apple-darwin         suffix: darwin-x86_64
      - os: windows-latest  target: x86_64-pc-windows-msvc      suffix: windows-x86_64.exe
```

Linux ARM64: use QEMU runner or `cross-rs` (only exception).
Static linking for Linux: `RUSTFLAGS="-C target-feature=+crt-static"`.

---

## PART 5 — OVERSIZED FILES (Must Split)

| File | Current LOC | Limit | Action |
|------|-------------|-------|--------|
| `web_server.rs` | 2,869 | 500 | Split: `handlers/`, `ws/`, `routing/`, `middleware/` |
| `commands/claude.rs` | ~2,600 | 500 | Split: `claude/session.rs`, `claude/process.rs`, `claude/stream.rs` |
| `commands/agents.rs` | ~2,050 | 500 | Split: `agents/db.rs`, `agents/spawn.rs`, `agents/status.rs` |

---

## PART 6 — PRIORITIZED SPRINT PLAN

### Sprint 1 — Bug Fixes (this week, 5 tasks)
1. `009-ws-protocol-gap.md` — Fix WsClientMessage enum (9 message types)
2. `010-path-traversal-web.md` — Fix `list_directory_contents` path restriction
3. `011-agents-expect-panic.md` — Fix `agents.rs:890` expect → Result
4. `012-usage-float-precision.md` — Fix float→i64 micro-dollars in TS + Rust
5. `013-usage-ledger-persistence.md` — Persist UsageLedger to rusqlite

### Sprint 2 — Reliability (next week)
6. `014-sqlite-wal-mode.md` — WAL mode + busy timeout for AgentDb
7. `015-spawn-blocking.md` — Wrap blocking calls in spawn_blocking
8. `016-joinhandle-cleanup.md` — Store + cancel JoinHandles on disconnect
9. `017-sysinfo-debounce.md` — Cache + debounce sysinfo refresh
10. `018-settings-dashmap.md` — Replace dual-write with Rust DashMap cache

### Sprint 3 — Phase 1 CLI (2 weeks)
11. `019-init-database-refactor.md` — Refactor AppHandle→PathBuf (unblocks CLI)
12. `020-cli-health.md` — `runecode-health` binary
13. `021-cli-migrate.md` — `runecode-migrate` binary
14. `022-cli-export.md` — `runecode-export` binary

### Sprint 4 — Migration M1 (3-4 weeks)
15. `023-quantization-rust-p1.md` — Migrate quantization kernels to Rust

### Sprint 5 — Migration M2+M3 (2-3 weeks)
16. `024-analytics-rust-pipeline.md` — Analytics event batching in Rust
17. `025-ws-agent-features.md` — Complete WS agent/rewind/model features (after M1)

---

## Architecture Principle

> The Rust layer owns: persistence, computation, subprocess management, network I/O, file I/O.
> TypeScript owns: UI state, React lifecycle, domain types (DDD bounded contexts), IPC binding.
> The boundary is always a `#[tauri::command]` — never raw `fetch()` to a localhost port from TS.

---

*Reports: `docs/rust-migration/alpha-*.md`, `beta-cli-design.md`, `gamma-rust-audit.md`*
