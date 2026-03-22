# Beta Team: Rust CLI Tooling Strategy

> **Status:** Draft — 2026-03-22
> **Author:** Beta Team (CLI Architect)
> **Scope:** Standalone and integrated CLI tooling for RuneCode v0.5.x onward

---

## Executive Summary and Recommendation

RuneCode already ships `clap 4` as a hard dependency and already has a working second binary (`runecode-web`) that uses `clap` derive macros. This is the key insight that collapses the parser decision: **for binaries that live inside `src-tauri/`, clap costs nothing extra** because it is already compiled into the dependency graph.

For any CLI tools that must live as **truly standalone, independently distributed binaries** (i.e., a separate crate with its own `Cargo.toml`), `argh` is the better choice for its dramatically smaller code footprint.

The recommended strategy is a **two-tier approach**:

1. **Integrated tier** — additional `[[bin]]` entries in `src-tauri/Cargo.toml`, using `clap` (zero marginal cost). Used for tools that need database access, MCP commands, or any logic already in `runecode_lib`.
2. **Standalone tier** — a `crates/runecode-cli/` workspace member with `argh`, for tools that must be distributed independently (e.g., a lightweight health-check binary users install system-wide).

This avoids needless complexity: do not build a workspace unless you actually have a standalone tool that cannot share the existing dependency graph.

---

## Parser Comparison

| Parser | Binary overhead (standalone) | Proc-macro | Shell completions | POSIX compliant | Recommendation |
|---|---|---|---|---|---|
| `clap` derive | ~300–500 KB | Yes | Yes (via `clap_complete`) | Yes | Use when `clap` is already a dep (zero marginal cost) |
| `argh` | ~50–100 KB | Yes | No (hand-rolled) | Partial | Use for standalone binaries where size matters |
| `pico-args` | ~10 KB | No | No | Yes | Use when a tool has 2–3 flags and no subcommands |
| `lexopt` | ~20 KB | No | No | Yes | Use when POSIX positional arg order matters; no subcommand support |

### Why not switch away from clap entirely

`web_main.rs` already uses `clap` derive (`#[derive(Parser)]`). Removing it from integrated binaries would require rewriting existing working code for no user-visible gain. The release profile (`opt-level = "z"`, `lto = true`, `strip = true`) already squeezes out dead code — the incremental cost of adding another `[[bin]]` that links `clap` is near-zero because the code is already compiled.

### Final recommendation by tier

- **Integrated binaries** (inside `src-tauri/`): **clap derive** — already compiled, consistent ergonomics, autocomplete support if ever needed.
- **Standalone binaries** (independent crate): **argh** — Google-maintained, proc-macro so ergonomics are fine, ~50 KB overhead, stable API.
- **Micro-scripts** (single-purpose, no subcommands): **pico-args** — if you ever need a tiny shim like a path resolver or a migration probe.

---

## Binary Structure Recommendation

### Option A — Monorepo (additional `[[bin]]` in `src-tauri/Cargo.toml`)

Add new `[[bin]]` entries pointing to `src/cli/*.rs` entry points. All share `runecode_lib`, `rusqlite`, `tokio`, `clap`, etc. at zero additional compile cost.

**Pros:** No workspace refactor needed. Shared code reuse is trivial (`use runecode_lib::...`). Single `cargo build --release` command. Existing CI continues to work unchanged.

**Cons:** Every binary transitively links all dependencies including Tauri, `window-vibrancy`, platform-specific crates. On macOS, `cocoa`/`objc` are linked even into CLI tools that never open a window. This inflates binary size for tools that truly do not need those dependencies.

**Verdict:** Correct for the first three tools (`runecode-health`, `runecode-migrate`, `runecode-export`) because they need database access and MCP logic already in the lib. Accept the size trade-off — `strip = true` + `opt-level = "z"` + LTO mitigate it significantly.

### Option B — Cargo Workspace

Convert the repo root to a Cargo workspace:

```
Cargo.toml              ← workspace root
src-tauri/Cargo.toml    ← member: runecode (Tauri app + lib)
crates/runecode-cli/    ← member: standalone CLI crate
```

**Pros:** Standalone CLI crate can declare minimal dependencies (just `argh`, `anyhow`, `tokio` with `rt` feature only, no Tauri). Clean dependency graph. Separate release artifact. Incremental compilation is shared across members.

**Cons:** Requires a workspace migration. The existing `src-tauri/build.rs` uses `tauri-build` which expects to be the root; a workspace root `Cargo.toml` must be added and `src-tauri/` made a member. This is a one-time ~30-minute migration but must be coordinated with the existing CI, which calls `cargo build --release` inside `src-tauri/`.

**Verdict:** The right long-term structure if a standalone lightweight CLI is a shipping goal (e.g., a `runecode-cli` binary users install via `curl | sh` or Homebrew).

### Option C — Standalone separate directory

A `cli/Cargo.toml` with no workspace relationship to `src-tauri/`. Completely independent build.

**Pros:** Zero coupling. Can be extracted to its own repo later.

**Cons:** Cannot share any code from `runecode_lib`. Duplicates database schema, config paths, API client code. Build matrix doubles. Not viable unless the CLI is intentionally decoupled.

**Verdict:** Only if the CLI is a completely separate product. Not recommended for the current scope.

### Decision

**Phase 1 (now):** Option A — add `[[bin]]` entries to `src-tauri/Cargo.toml`. Ship `runecode-health`, `runecode-migrate`, `runecode-export` as part of the existing build.

**Phase 2 (when standalone distribution is needed):** Option B workspace migration. Extract `runecode-daemon` and any user-facing CLI into `crates/runecode-cli/` with `argh`.

---

## CLI Tools Catalog

| Tool | Purpose | Priority | Complexity | Tier | Parser |
|---|---|---|---|---|---|
| `runecode-health` | Check claude binary presence, ruflo/MCP server status, DB connectivity | High | Low | Integrated (`[[bin]]`) | clap |
| `runecode-migrate` | Run/rollback rusqlite migrations headlessly; suitable for CI and upgrade scripts | High | Medium | Integrated (`[[bin]]`) | clap |
| `runecode-export` | Export sessions and projects to JSON or Markdown; wraps existing export commands | Medium | Medium | Integrated (`[[bin]]`) | clap |
| `runecode-daemon` | Background mode: no GUI, runs web server + MCP proxy, responds to signals | Medium | High | Standalone (workspace) | argh |
| `runecode-bench` | Run quantization benchmarks; wraps the bench infrastructure | Low | Medium | Integrated (`[[bin]]`) | clap |
| `runecode-install` | Install/configure ruflo and claude-flow; wraps `install_ruflo` command logic | Low | Low | Integrated (`[[bin]]`) | clap |

### Priority rationale

`runecode-health` and `runecode-migrate` are the highest value because they directly enable headless CI workflows and upgrade automation — use cases the GUI cannot serve. `runecode-export` unlocks scripted data pipelines. The rest are convenience wrappers.

`runecode-daemon` warrants the standalone tier because it is a genuine alternative runtime: users who want a headless server should not have to install a binary that links Tauri's windowing stack.

---

## Cross-Platform Build Matrix

### Native CI per platform (recommended over cross-rs)

`rusqlite` is compiled with the `bundled` feature (SQLite is compiled from C source). This makes cross-compilation with `cross-rs` unreliable: it requires a C cross-toolchain matching the SQLite bundled build. Native runners avoid this entirely.

```yaml
# .github/workflows/cli-release.yml (excerpt)
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            suffix: linux-x86_64
            rustflags: "-C target-feature=+crt-static"
          - os: ubuntu-latest
            target: aarch64-unknown-linux-gnu
            suffix: linux-aarch64
            rustflags: "-C target-feature=+crt-static"
            cross: true          # one exception: Linux ARM needs cross-rs or QEMU runner
          - os: macos-latest
            target: x86_64-apple-darwin
            suffix: darwin-x86_64
            rustflags: ""
          - os: macos-latest
            target: aarch64-apple-darwin
            suffix: darwin-arm64
            rustflags: ""
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            suffix: windows-x86_64
            ext: .exe
            rustflags: "-C target-feature=+crt-static"

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - name: Build CLI binaries
        env:
          RUSTFLAGS: ${{ matrix.rustflags }}
        run: |
          cargo build --release \
            --manifest-path src-tauri/Cargo.toml \
            --bin runecode-health \
            --bin runecode-migrate \
            --bin runecode-export \
            --target ${{ matrix.target }}

      - name: Rename artifacts
        shell: bash
        run: |
          for bin in runecode-health runecode-migrate runecode-export; do
            src="src-tauri/target/${{ matrix.target }}/release/${bin}${{ matrix.ext }}"
            dst="${bin}-${{ matrix.suffix }}${{ matrix.ext }}"
            mv "$src" "$dst"
          done

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: cli-${{ matrix.suffix }}
          path: runecode-*-${{ matrix.suffix }}*
```

### Static linking notes

- **Linux x86_64/aarch64:** `RUSTFLAGS="-C target-feature=+crt-static"` links glibc statically. Combine with `musl` target (`x86_64-unknown-linux-musl`) for true static binaries that run on any Linux: `rustup target add x86_64-unknown-linux-musl`. Note that `rusqlite` bundled works fine with musl.
- **macOS:** No static linking available for system frameworks. Binaries are dynamically linked against `libSystem`. Universal binary (fat binary for x86_64 + arm64): use `lipo` to merge after building both targets, or use `cargo-bundle` which handles this.
- **Windows MSVC:** `target-feature=+crt-static` statically links the MSVC CRT. Required for distribution to machines that may not have the VC++ redistributable.
- **Windows GNU toolchain:** Avoid — `rusqlite` bundled has known issues with the MinGW toolchain on Windows.

### Binary naming convention

```
runecode-health-linux-x86_64
runecode-health-linux-aarch64
runecode-health-darwin-x86_64
runecode-health-darwin-arm64
runecode-health-windows-x86_64.exe
runecode-migrate-linux-x86_64
... (same pattern for each tool)
```

---

## Example: runecode-cli binary with argh (standalone tier skeleton)

This is the skeleton for the Phase 2 standalone `runecode-daemon` (or a combined `runecode-cli` multi-tool binary). It lives in `crates/runecode-cli/src/main.rs`.

```rust
// crates/runecode-cli/src/main.rs
//
// Standalone CLI — minimal deps, no Tauri, argh parser.
// Entry point for headless / daemon mode.

use argh::FromArgs;

/// RuneCode CLI — headless operations and daemon mode.
#[derive(FromArgs, Debug)]
struct RootArgs {
    #[argh(subcommand)]
    command: Command,
}

#[derive(FromArgs, Debug)]
#[argh(subcommand)]
enum Command {
    Daemon(DaemonArgs),
    Health(HealthArgs),
}

/// Run RuneCode as a background daemon (no GUI).
#[derive(FromArgs, Debug)]
#[argh(subcommand, name = "daemon")]
struct DaemonArgs {
    /// port for the web server (default: 8080)
    #[argh(option, short = 'p', default = "8080")]
    port: u16,

    /// host to bind (default: 127.0.0.1)
    #[argh(option, short = 'H', default = "String::from(\"127.0.0.1\")")]
    host: String,

    /// write PID file to this path
    #[argh(option)]
    pid_file: Option<String>,
}

/// Check health of RuneCode dependencies.
#[derive(FromArgs, Debug)]
#[argh(subcommand, name = "health")]
struct HealthArgs {
    /// output as JSON (default: human-readable)
    #[argh(switch)]
    json: bool,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    env_logger::init();

    let args: RootArgs = argh::from_env();

    match args.command {
        Command::Daemon(a) => run_daemon(a).await,
        Command::Health(a) => run_health(a).await,
    }
}

async fn run_daemon(args: DaemonArgs) -> anyhow::Result<()> {
    if let Some(pid_path) = &args.pid_file {
        std::fs::write(pid_path, std::process::id().to_string())?;
    }
    println!("RuneCode daemon starting on {}:{}", args.host, args.port);
    // delegate to shared web_server logic (if extracted to runecode-core)
    // web_server::start(args.host, args.port).await
    todo!("wire to extracted web_server crate")
}

async fn run_health(args: HealthArgs) -> anyhow::Result<()> {
    let report = check_health().await?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&report)?);
    } else {
        println!("claude binary : {}", status_str(report.claude_ok));
        println!("database      : {}", status_str(report.db_ok));
        println!("ruflo         : {}", status_str(report.ruflo_ok));
    }
    Ok(())
}

#[derive(serde::Serialize)]
struct HealthReport {
    claude_ok: bool,
    db_ok:     bool,
    ruflo_ok:  bool,
}

fn status_str(ok: bool) -> &'static str {
    if ok { "OK" } else { "FAIL" }
}

async fn check_health() -> anyhow::Result<HealthReport> {
    let claude_ok = which::which("claude").is_ok();
    let ruflo_ok  = which::which("ruflo").is_ok()
        || which::which("npx").map(|_| true).unwrap_or(false);
    // lightweight DB probe — open and close, no Tauri handle needed
    let db_path = dirs::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("runecode")
        .join("runecode.db");
    let db_ok = rusqlite::Connection::open(&db_path).is_ok();
    Ok(HealthReport { claude_ok, db_ok, ruflo_ok })
}
```

Note: `tokio::main(flavor = "current_thread")` is used deliberately — the standalone daemon does not need the multi-threaded scheduler for health checks and startup. Switch to `flavor = "multi_thread"` only in `run_daemon` if the web server requires it.

---

## Example: runecode-health integrated binary (Phase 1 skeleton)

This lives at `src-tauri/src/cli/health.rs` and is registered as a `[[bin]]` in `src-tauri/Cargo.toml`. It reuses `runecode_lib` directly.

```rust
// src-tauri/src/cli/health.rs
//
// Integrated health-check binary.
// Shares runecode_lib — clap is already a dependency, zero extra cost.

use clap::Parser;

#[derive(Parser)]
#[command(name = "runecode-health")]
#[command(about = "Check RuneCode runtime dependencies")]
#[command(version)]
struct Args {
    /// Output results as JSON
    #[arg(long)]
    json: bool,

    /// Exit with non-zero code if any check fails (useful in CI)
    #[arg(long)]
    strict: bool,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let claude_ok = which::which("claude").is_ok();
    let ruflo_ok  = which::which("ruflo").is_ok();
    let node_ok   = which::which("node").is_ok();

    // Probe DB using the same path logic as the Tauri app
    let db_path = dirs::data_dir()
        .unwrap_or_default()
        .join("runecode")
        .join("runecode.db");
    let db_ok = rusqlite::Connection::open(&db_path).is_ok();

    let all_ok = claude_ok && ruflo_ok && node_ok && db_ok;

    if args.json {
        println!(
            "{}",
            serde_json::json!({
                "claude": claude_ok,
                "ruflo":  ruflo_ok,
                "node":   node_ok,
                "db":     db_ok,
                "ok":     all_ok
            })
        );
    } else {
        let check = |ok: bool| if ok { "OK  " } else { "FAIL" };
        println!("claude  [{}]", check(claude_ok));
        println!("ruflo   [{}]", check(ruflo_ok));
        println!("node    [{}]", check(node_ok));
        println!("db      [{}]", check(db_ok));
    }

    if args.strict && !all_ok {
        std::process::exit(1);
    }
    Ok(())
}
```

---

## Example: runecode-migrate integrated binary skeleton

```rust
// src-tauri/src/cli/migrate.rs

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "runecode-migrate")]
#[command(about = "Manage RuneCode database migrations")]
struct Args {
    #[command(subcommand)]
    command: MigrateCommand,
}

#[derive(Subcommand)]
enum MigrateCommand {
    /// Apply all pending migrations
    Up,
    /// Roll back the last applied migration
    Down,
    /// Show current migration status
    Status,
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let db_path = dirs::data_dir()
        .unwrap_or_default()
        .join("runecode")
        .join("runecode.db");

    let conn = rusqlite::Connection::open(&db_path)?;

    match args.command {
        MigrateCommand::Up     => migrate_up(&conn)?,
        MigrateCommand::Down   => migrate_down(&conn)?,
        MigrateCommand::Status => migrate_status(&conn)?,
    }
    Ok(())
}

fn migrate_up(conn: &rusqlite::Connection) -> anyhow::Result<()> {
    // Reuse migration logic from runecode_lib once extracted
    println!("Applying pending migrations...");
    let _ = conn;
    todo!("wire to runecode_lib::migrations::up()")
}

fn migrate_down(conn: &rusqlite::Connection) -> anyhow::Result<()> {
    println!("Rolling back last migration...");
    let _ = conn;
    todo!("wire to runecode_lib::migrations::down()")
}

fn migrate_status(conn: &rusqlite::Connection) -> anyhow::Result<()> {
    let _ = conn;
    todo!("wire to runecode_lib::migrations::status()")
}
```

---

## Example: Cargo.toml additions needed

### Phase 1 — integrated binaries (add to `src-tauri/Cargo.toml`)

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

No new dependencies are required for Phase 1. All needed crates (`clap`, `rusqlite`, `tokio`, `serde_json`, `dirs`, `which`, `anyhow`) are already declared.

### Phase 2 — standalone workspace crate (`crates/runecode-cli/Cargo.toml`)

```toml
[package]
name    = "runecode-cli"
version = "0.1.0"
edition = "2021"

[[bin]]
name = "runecode-daemon"
path = "src/main.rs"

[dependencies]
argh       = "0.1"
anyhow     = "1"
tokio      = { version = "1", features = ["rt", "macros", "signal"] }
serde      = { version = "1", features = ["derive"] }
serde_json = "1"
dirs       = "5"
which      = "7"
rusqlite   = { version = "0.32", features = ["bundled"] }
env_logger = "0.11"
log        = "0.4"
# axum only if daemon runs the web server:
# axum     = { version = "0.8", features = ["ws"] }

[profile.release]
strip         = true
opt-level     = "z"
lto           = true
codegen-units = 1
```

### Workspace root `Cargo.toml` (Phase 2 migration)

```toml
[workspace]
resolver = "2"
members  = [
    "src-tauri",
    "crates/runecode-cli",
]
```

The existing `src-tauri/Cargo.toml` requires no changes to become a workspace member; Cargo workspaces are additive.

---

## Migration Path from Current clap Usage

The existing `web_main.rs` uses `clap` derive and is the pattern to replicate for Phase 1 integrated binaries. No migration is needed for that binary.

The migration path is purely additive:

### Step 1 — Create the cli directory and entry points

```
src-tauri/src/cli/
  mod.rs        (optional, only needed if shared CLI utilities emerge)
  health.rs
  migrate.rs
  export.rs
```

### Step 2 — Register [[bin]] entries

Add the three `[[bin]]` blocks shown above to `src-tauri/Cargo.toml`.

### Step 3 — Extract shared logic from runecode_lib

Identify which functions in `commands/` are needed by CLI tools and ensure they are `pub` in `runecode_lib`. The `lib.rs` already exports the crate as `runecode_lib` — CLI entry points can `use runecode_lib::commands::...` directly.

Key extractions needed:
- `commands::agents::init_database` — currently takes a `tauri::AppHandle`. Refactor to accept a `PathBuf` so CLI tools can call it without a Tauri context.
- Migration functions — currently embedded in `init_database`. Extract to `migrations::up(conn)` / `migrations::down(conn)`.
- `commands::ruflo::check_ruflo_installed` — pure `which`-based check, already callable without Tauri.

### Step 4 — Build and verify

```bash
# Build only the CLI binaries (fast, skips Tauri frontend compilation)
cargo build --release \
  --manifest-path src-tauri/Cargo.toml \
  --bin runecode-health \
  --bin runecode-migrate \
  --bin runecode-export

# Run health check
./src-tauri/target/release/runecode-health --json
```

### Step 5 (Phase 2 only) — Workspace migration

1. Create `Cargo.toml` at repo root with `[workspace]` block.
2. Create `crates/runecode-cli/` with its own `Cargo.toml` and `src/main.rs`.
3. Update CI to also build `runecode-daemon` from the workspace.
4. Update `tauri.conf.json` `beforeBuildCommand` if it references `cargo build` directly.

---

## Design Constraints and Trade-offs Summary

| Constraint | Decision | Rationale |
|---|---|---|
| clap already in dep graph | Keep clap for integrated bins | Zero marginal binary cost; consistent ergonomics |
| rusqlite bundled feature | Native CI runners, not cross-rs | Avoids C cross-toolchain complexity |
| Tauri macros in main binary | CLI entry points in `src/cli/*.rs` | Separate files avoid `windows_subsystem = "windows"` cfg leaking into CLI binaries |
| Phase 1 simplicity | Option A (additional [[bin]] entries) | No workspace refactor required; ships in one sprint |
| Phase 2 isolation | Option B (workspace + argh) | Clean dependency graph for a genuinely headless binary |
| All platforms | Native CI matrix | Reliable, maintainable, no cross-compilation toolchain debt |
| Binary naming | `<tool>-<os>-<arch>[.exe]` | Unambiguous, scriptable, no installer required for distribution |

---

*End of document.*
