pub mod domain;
pub mod repository;

mod cache;
pub mod config;
pub mod installation;
pub mod swarm;

use domain::{AgentStatus, RuFloAgent, RuFloProjectStatus, RuFloStatus, RuFloSwarmStatus};

// ---------------------------------------------------------------------------
// Windows: npm/npx are batch files (.cmd), not executables.
// Command::new("npm") fails on Windows because CreateProcess cannot run .cmd
// files directly — you must use the full name with extension.
// On Unix, "npm" and "npx" are shell scripts / symlinks that resolve normally.
// ---------------------------------------------------------------------------
#[inline]
fn npm_cmd() -> &'static str {
    if cfg!(windows) {
        "npm.cmd"
    } else {
        "npm"
    }
}

#[inline]
fn npx_cmd() -> &'static str {
    if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    }
}

// ---------------------------------------------------------------------------
// Cache TTLs
// ---------------------------------------------------------------------------
const RUFLO_STATUS_CACHE_TTL_SECS: u64 = 60;
const RUFLO_SWARM_CACHE_TTL_SECS: u64 = 10;

// ---------------------------------------------------------------------------
// Re-export all public commands so callers use the same path as before
// ---------------------------------------------------------------------------
pub use config::{create_ddd_optimization_command, create_ruflo_slash_command};
pub use installation::{
    activate_ruflo_mcp, check_ruflo_installed, deactivate_ruflo_mcp, install_ruflo,
    uninstall_ruflo,
};
pub use swarm::{
    consolidate_ruflo_memory, get_ruflo_memory_stats, get_ruflo_project_status,
    get_ruflo_swarm_status, init_ruflo_project, set_ruflo_memory_backend,
    sync_ruflo_memory_local,
};
