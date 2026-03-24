use super::cache::{bust_all_caches, bust_status_cache, try_read_cache, write_cache};
use super::{npm_cmd, npx_cmd, wsl_command, RUFLO_STATUS_CACHE_TTL_SECS};
use domain::RuFloStatus;

use super::domain;

// ---------------------------------------------------------------------------
// Installation commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn check_ruflo_installed(wsl_distro: Option<String>) -> RuFloStatus {
    // Return cached result if still within TTL (60 s) to avoid repeated npx/claude calls
    if let Some(cached) =
        try_read_cache::<RuFloStatus>("runecode_ruflo_cache.json", RUFLO_STATUS_CACHE_TTL_SECS)
    {
        return cached;
    }

    // Run the blocking subprocess checks on a dedicated thread with a timeout.
    // Without a timeout, npx.cmd / claude can hang indefinitely when the CLI is not
    // installed or when PATH is incomplete (common in Windows GUI context).
    // Windows needs a longer timeout: Node.js cold-start on HDD can exceed 10 s.
    #[cfg(target_os = "windows")]
    const TIMEOUT_SECS: u64 = 30;
    #[cfg(not(target_os = "windows"))]
    const TIMEOUT_SECS: u64 = 10;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(TIMEOUT_SECS),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();

            // npx --no-install: don't download if not cached, just check presence
            let output = wsl_command(
                npx_cmd(),
                &["--no-install", "@claude-flow/cli", "--version"],
                wsl,
            )
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

            // Check if MCP is active — use wsl_command for PATH/NVM.
            // On Windows without WSL, Claude's batch file needs .cmd extension.
            let claude_prog = if wsl.is_some() {
                "claude"
            } else if cfg!(windows) {
                "claude.cmd"
            } else {
                "claude"
            };
            // Detect claude-flow in `claude mcp list` output.
            // The output format varies by Claude version: plain name, table row, JSON, etc.
            // We match any line that contains the word "claude-flow" (case-insensitive)
            // but reject common false-positives like comment lines.
            let mcp_active = wsl_command(claude_prog, &["mcp", "list"], wsl)
                .output()
                .ok()
                .and_then(|o| {
                    // Prefer stdout; fall back to stderr in case some versions write there
                    let stdout = String::from_utf8_lossy(&o.stdout).into_owned();
                    let stderr = String::from_utf8_lossy(&o.stderr).into_owned();
                    if !stdout.trim().is_empty() {
                        Some(stdout)
                    } else if !stderr.trim().is_empty() {
                        Some(stderr)
                    } else {
                        None
                    }
                })
                .map(|s| {
                    s.lines().any(|line| {
                        let trimmed = line.trim().to_lowercase();
                        // Skip header/separator lines
                        if trimmed.starts_with('#')
                            || trimmed.starts_with('-')
                            || trimmed.starts_with('=')
                        {
                            return false;
                        }
                        // Match "claude-flow" as a word or table cell
                        trimmed == "claude-flow"
                            || trimmed.starts_with("claude-flow ")
                            || trimmed.starts_with("claude-flow\t")
                            || trimmed.contains(" claude-flow ")
                            || trimmed.contains("\tclaude-flow\t")
                            || trimmed.contains("\"claude-flow\"")
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

            RuFloStatus::build(installed, version, mcp_active, slash_command_exists)
        }),
    )
    .await;

    match result {
        Ok(Ok(status)) => {
            write_cache("runecode_ruflo_cache.json", &status);
            status
        }
        // Timed out or task panicked — return "not installed" immediately
        _ => RuFloStatus::build(false, None, false, false),
    }
}

#[tauri::command]
pub async fn install_ruflo(app: tauri::AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    use std::io::BufRead;
    use tauri::Emitter;

    // Build the command — use WSL wrapper when a distro is specified
    let mut child = {
        let wsl = wsl_distro.as_deref();
        let mut cmd = wsl_command(
            npm_cmd(),
            &[
                "install",
                "-g",
                "@claude-flow/cli@latest",
                "--legacy-peer-deps",
                "--no-fund",
            ],
            wsl,
        );
        cmd.stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        cmd.spawn()
            .map_err(|e| format!("Failed to start npm: {e}"))?
    };

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

    // Collect stderr — filter out `npm warn` lines so only actual errors surface
    let stderr_lines = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default();
    let stderr_output: String = stderr_lines
        .iter()
        .filter(|l| !l.starts_with("npm warn") && !l.starts_with("npm notice"))
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");

    if status.success() {
        bust_all_caches();
        Ok("RuFlo installed successfully".to_string())
    } else if !stderr_output.is_empty() {
        Err(format!("npm install failed: {}", stderr_output))
    } else {
        Err("npm install failed — check terminal output".to_string())
    }
}

#[tauri::command]
pub async fn uninstall_ruflo(wsl_distro: Option<String>) -> Result<String, String> {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(120),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(npm_cmd(), &["uninstall", "-g", "@claude-flow/cli"], wsl)
                .output()
        }),
    )
    .await;

    let output = match result {
        Err(_timeout) => return Err("npm uninstall timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn npm uninstall: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run npm uninstall: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if output.status.success() {
        bust_all_caches();
        Ok("RuFlo uninstalled successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("npm uninstall failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn activate_ruflo_mcp(app: tauri::AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    use tauri::Emitter;
    // On Windows, Claude's MCP config stores the command that it will later
    // spawn. "npx" (no extension) fails on Windows because CreateProcess
    // cannot run batch files. Use "npx.cmd" so the stored config works.
    // When routing through WSL, use plain "npx" since WSL resolves it natively.
    let npx = if wsl_distro.is_some() {
        "npx"
    } else if cfg!(windows) {
        "npx.cmd"
    } else {
        "npx"
    };
    let claude_prog = if wsl_distro.is_some() {
        "claude"
    } else if cfg!(windows) {
        "claude.cmd"
    } else {
        "claude"
    };

    #[cfg(target_os = "windows")]
    const MCP_TIMEOUT_SECS: u64 = 60;
    #[cfg(not(target_os = "windows"))]
    const MCP_TIMEOUT_SECS: u64 = 30;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(MCP_TIMEOUT_SECS),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(
                claude_prog,
                &["mcp", "add", "claude-flow", "--", npx, "-y", "@claude-flow/cli@latest"],
                wsl,
            )
            .output()
        }),
    )
    .await;

    // Always bust the status cache on any activation attempt so the next
    // check_ruflo_installed call re-runs fresh instead of returning stale data.
    bust_status_cache();

    let output = match result {
        Err(_timeout) => {
            return Err(format!(
                "MCP activation timed out after {MCP_TIMEOUT_SECS}s"
            ))
        }
        Ok(Err(e)) => return Err(format!("Failed to spawn claude mcp add: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run claude mcp add: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if output.status.success() {
        // Auto-create the slash command file if it doesn't exist yet
        if let Some(home) = dirs::home_dir() {
            let slash_cmd_path = home.join(".claude").join("commands").join("setup-ruflo.md");
            if !slash_cmd_path.exists() {
                let _ = super::create_ruflo_slash_command();
            }
        }
        let _ = app.emit("ruflo-mcp-changed", "activated");
        let msg = if stdout.is_empty() {
            "MCP server activated".to_string()
        } else {
            stdout
        };
        Ok(msg)
    } else {
        let detail = [stdout, stderr]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!(
            "MCP activation failed: {}",
            if detail.is_empty() {
                "no output (exit status non-zero)".to_string()
            } else {
                detail
            }
        ))
    }
}

#[tauri::command]
pub async fn deactivate_ruflo_mcp(app: tauri::AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    use tauri::Emitter;
    let claude_prog = if wsl_distro.is_some() {
        "claude"
    } else if cfg!(windows) {
        "claude.cmd"
    } else {
        "claude"
    };

    #[cfg(target_os = "windows")]
    const DEACT_TIMEOUT_SECS: u64 = 30;
    #[cfg(not(target_os = "windows"))]
    const DEACT_TIMEOUT_SECS: u64 = 15;

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(DEACT_TIMEOUT_SECS),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(claude_prog, &["mcp", "remove", "claude-flow"], wsl)
                .output()
        }),
    )
    .await;

    // Always bust both caches regardless of outcome
    bust_all_caches();

    let output = match result {
        Err(_timeout) => return Err("claude mcp remove timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn claude mcp remove: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run claude mcp remove: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if output.status.success() {
        let _ = app.emit("ruflo-mcp-changed", "deactivated");
        Ok("MCP server deactivated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let detail = [stdout, stderr]
            .into_iter()
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("\n");
        Err(format!(
            "MCP deactivation failed: {}",
            if detail.is_empty() {
                "no output".to_string()
            } else {
                detail
            }
        ))
    }
}
