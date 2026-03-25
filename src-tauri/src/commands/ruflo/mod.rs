pub mod domain;
pub mod repository;

mod cache;
pub mod config;
pub mod installation;
pub mod swarm;


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
// WSL-aware command builder.
// When running on Windows with a WSL distro active, binaries like npm, npx,
// and claude live inside WSL and must be invoked via `wsl -d <distro> -e /bin/bash -lc <cmd>`.
// On non-Windows or when wsl_distro is None, this falls back to the native
// command using create_command_with_env (which inherits PATH/NVM).
// ---------------------------------------------------------------------------
fn wsl_command(program: &str, args: &[&str], wsl_distro: Option<&str>) -> std::process::Command {
    #[cfg(target_os = "windows")]
    if let Some(distro) = wsl_distro {
        // Inside WSL, .cmd extensions don't exist — strip them.
        let prog = program.strip_suffix(".cmd").unwrap_or(program);

        // Smart rewrite: when calling `npx [--no-install] @claude-flow/cli <subcommands>`,
        // replace with `claude-flow <subcommands>` directly. npx --no-install misses
        // globally installed packages in WSL, and npx without --no-install downloads
        // on every call. The global binary is faster and more reliable.
        let (effective_prog, effective_args): (String, Vec<String>) = {
            let is_npx = prog == "npx" || prog == "npx.cmd";
            let cf_idx = args.iter().position(|a| *a == "@claude-flow/cli");
            if let Some(idx) = cf_idx.filter(|_| is_npx) {
                // Skip npx flags (--no-install, etc.) and @claude-flow/cli, keep the rest
                let remaining: Vec<String> = args.iter()
                    .skip(idx + 1)
                    .map(|s| s.to_string())
                    .collect();
                ("claude-flow".to_string(), remaining)
            } else {
                (prog.to_string(), args.iter().map(|s| s.to_string()).collect())
            }
        };

        // Use bash -lc to ensure login shell loads nvm/PATH properly.
        let full_cmd = if effective_args.is_empty() {
            effective_prog
        } else {
            format!("{} {}", effective_prog, effective_args.iter().map(|a| {
                if a.contains(' ') { format!("\"{}\"", a) } else { a.clone() }
            }).collect::<Vec<_>>().join(" "))
        };
        let mut cmd = crate::claude_binary::silent_command("wsl");
        cmd.arg("-d").arg(distro).arg("-e").arg("/bin/bash").arg("-lc").arg(&full_cmd);
        return cmd;
    }

    // Suppress unused-variable warning on non-Windows where the cfg block is compiled out
    let _ = wsl_distro;

    let mut cmd = crate::claude_binary::create_command_with_env(program);
    for arg in args {
        cmd.arg(arg);
    }
    cmd
}

// ---------------------------------------------------------------------------
// Cache TTLs
// ---------------------------------------------------------------------------
const RUFLO_STATUS_CACHE_TTL_SECS: u64 = 60;
const RUFLO_SWARM_CACHE_TTL_SECS: u64 = 10;

// ---------------------------------------------------------------------------
// Re-export all public commands so callers use the same path as before
// ---------------------------------------------------------------------------
#[allow(unused_imports)]
pub use config::{create_ddd_optimization_command, create_ruflo_slash_command};
#[allow(unused_imports)]
pub use installation::{
    activate_ruflo_mcp, check_ruflo_installed, deactivate_ruflo_mcp, install_ruflo,
    uninstall_ruflo,
};
#[allow(unused_imports)]
pub use swarm::{
    consolidate_ruflo_memory, get_ruflo_memory_stats, get_ruflo_project_status,
    get_ruflo_swarm_status, init_ruflo_project, set_ruflo_memory_backend,
    sync_ruflo_memory_local,
};
