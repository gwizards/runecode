/// Environment-aware Command construction and standard path discovery for Claude binaries.
///
/// Split from `claude_binary.rs` to stay within the 500-line file budget.

use log::{debug, info, warn};
use std::path::PathBuf;
use std::process::Command;

use super::claude_binary::{silent_command, ClaudeInstallation, InstallationType};

/// Normalizes path separators and checks whether `path` contains the given
/// `component` substring. Backslashes are replaced with forward slashes before
/// comparison so that the check works on both Windows and Unix paths.
fn path_contains_component(path: &str, component: &str) -> bool {
    let normalized = path.replace('\\', "/");
    normalized.contains(component)
}

/// Helper function to create a Command with proper environment variables
/// This ensures commands like Claude can find Node.js and other dependencies
pub fn create_command_with_env(program: &str) -> Command {
    let mut cmd = silent_command(program);

    info!("Creating command for: {}", program);

    // Inherit essential environment variables from parent process
    for (key, value) in std::env::vars() {
        // Pass through PATH and other essential environment variables
        if key == "PATH"
            || key == "HOME"
            || key == "USER"
            || key == "SHELL"
            || key == "LANG"
            || key == "LC_ALL"
            || key.starts_with("LC_")
            || key == "NODE_PATH"
            || key == "NVM_DIR"
            || key == "NVM_BIN"
            || key == "HOMEBREW_PREFIX"
            || key == "HOMEBREW_CELLAR"
            // Add proxy environment variables (only uppercase)
            || key == "HTTP_PROXY"
            || key == "HTTPS_PROXY"
            || key == "NO_PROXY"
            || key == "ALL_PROXY"
            // Windows-specific paths (no-op on non-Windows)
            || key == "USERPROFILE"
            || key == "APPDATA"
            || key == "LOCALAPPDATA"
            || key == "SYSTEMROOT"
            // Additional Windows env vars needed for npm/npx/Node.js
            || key == "COMSPEC"
            || key == "TEMP"
            || key == "TMP"
            || key == "SystemDrive"
            || key == "USERNAME"
            || key == "PATHEXT"
            // Lowercase proxy vars (Linux/macOS convention)
            || key == "http_proxy"
            || key == "https_proxy"
            || key == "no_proxy"
            || key == "all_proxy"
        {
            debug!("Inheriting env var: {}={}", key, value);
            cmd.env(&key, &value);
        }
    }

    // Log proxy-related environment variables for debugging
    info!("Command will use proxy settings:");
    if let Ok(http_proxy) = std::env::var("HTTP_PROXY") {
        info!("  HTTP_PROXY={}", http_proxy);
    }
    if let Ok(https_proxy) = std::env::var("HTTPS_PROXY") {
        info!("  HTTPS_PROXY={}", https_proxy);
    }

    // Add NVM support if the program is in an NVM directory
    if path_contains_component(program, "/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            // Ensure the Node.js bin directory is in PATH
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                let sep = if cfg!(windows) { ";" } else { ":" };
                let new_path = format!("{}{}{}", node_bin_str, sep, current_path);
                debug!("Adding NVM bin directory to PATH: {}", node_bin_str);
                cmd.env("PATH", new_path);
            }
        }
    }

    // Add Homebrew support if the program is in a Homebrew directory (macOS only)
    #[cfg(target_os = "macos")]
    if path_contains_component(program, "/homebrew/")
        || path_contains_component(program, "/opt/homebrew/")
    {
        if let Some(program_dir) = std::path::Path::new(program).parent() {
            // Ensure the Homebrew bin directory is in PATH
            let current_path = std::env::var("PATH").unwrap_or_default();
            let homebrew_bin_str = program_dir.to_string_lossy();
            if !current_path.contains(&homebrew_bin_str.as_ref()) {
                let new_path = format!("{}:{}", homebrew_bin_str, current_path);
                debug!(
                    "Adding Homebrew bin directory to PATH: {}",
                    homebrew_bin_str
                );
                cmd.env("PATH", new_path);
            }
        }
    }

    // Windows: ensure %APPDATA%\npm is in PATH.
    // Global npm packages (including @claude-flow/cli, claude, npx) are installed
    // there, but GUI apps on Windows inherit the registry PATH which typically does
    // NOT include it — only interactive shells (cmd/PowerShell) add it via profile.
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let npm_global_bin = format!("{}\\npm", appdata);
            let current_path = std::env::var("PATH").unwrap_or_default();
            if !current_path.contains(&npm_global_bin) {
                let new_path = format!("{};{}", npm_global_bin, current_path);
                debug!("Prepending %APPDATA%\\npm to PATH for npm/npx resolution");
                cmd.env("PATH", new_path);
            }
        }
    }

    // Linux: prepend common user-local bin directories.
    // GUI apps launched from a desktop environment inherit a stripped PATH
    // (/usr/bin:/bin) that omits ~/.local/bin, NVM bins, volta, fnm, etc.
    // We inject them here so npx/@claude-flow/cli/claude resolve correctly.
    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let mut extra: Vec<String> = Vec::new();

            // Active NVM version bin (highest priority — user's chosen node)
            if let Ok(nvm_bin) = std::env::var("NVM_BIN") {
                if !current_path.contains(&nvm_bin) {
                    extra.push(nvm_bin);
                }
            }
            // Standard user-local directories
            for candidate in &[
                format!("{}/.local/bin", home),
                format!("{}/.npm-global/bin", home),
                format!("{}/.volta/bin", home),
                format!("{}/.fnm/aliases/default/bin", home),
                format!("{}/.bun/bin", home),
                format!("{}/.cargo/bin", home),
                "/usr/local/bin".to_string(),
            ] {
                if std::path::Path::new(candidate).exists()
                    && !current_path.contains(candidate.as_str())
                {
                    extra.push(candidate.clone());
                }
            }

            if !extra.is_empty() {
                let new_path = format!("{}:{}", extra.join(":"), current_path);
                debug!("Linux: augmenting PATH with: {}", extra.join(":"));
                cmd.env("PATH", new_path);
            }
        }
    }

    cmd
}

// ---------------------------------------------------------------------------
// Standard installation path discovery
// ---------------------------------------------------------------------------

/// Get Claude version by running --version command
fn get_claude_version(path: &str) -> Option<String> {
    match silent_command(path).arg("--version").output() {
        Ok(output) if output.status.success() => extract_version_from_output(&output.stdout),
        Ok(_) => None,
        Err(e) => {
            warn!("Failed to get version for {}: {}", path, e);
            None
        }
    }
}

/// Extract version string from command output
fn extract_version_from_output(stdout: &[u8]) -> Option<String> {
    let output_str = String::from_utf8_lossy(stdout);
    let version_regex =
        regex::Regex::new(r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)").ok()?;
    version_regex
        .captures(&output_str)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().to_string())
}

/// Check standard installation paths (Unix)
#[cfg(unix)]
pub(crate) fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();

    let mut paths_to_check: Vec<(String, String)> = vec![
        ("/usr/local/bin/claude".to_string(), "system".to_string()),
        ("/opt/homebrew/bin/claude".to_string(), "homebrew".to_string()),
        ("/usr/bin/claude".to_string(), "system".to_string()),
        ("/bin/claude".to_string(), "system".to_string()),
        ("/snap/bin/claude".to_string(), "snap".to_string()),
    ];

    if let Ok(home) = std::env::var("HOME") {
        paths_to_check.extend(vec![
            (format!("{}/.claude/local/claude", home), "claude-local".to_string()),
            (format!("{}/.local/bin/claude", home), "local-bin".to_string()),
            (format!("{}/.npm-global/bin/claude", home), "npm-global".to_string()),
            (format!("{}/.yarn/bin/claude", home), "yarn".to_string()),
            (format!("{}/.bun/bin/claude", home), "bun".to_string()),
            (format!("{}/bin/claude", home), "home-bin".to_string()),
            (format!("{}/.volta/bin/claude", home), "volta".to_string()),
            (format!("{}/.fnm/aliases/default/bin/claude", home), "fnm".to_string()),
            (format!("{}/.pnpm-global/bin/claude", home), "pnpm-global".to_string()),
            (format!("{}/node_modules/.bin/claude", home), "node-modules".to_string()),
            (format!("{}/.config/yarn/global/node_modules/.bin/claude", home), "yarn-global".to_string()),
        ]);
    }

    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);
            let version = get_claude_version(&path);
            installations.push(ClaudeInstallation {
                path, version, source,
                installation_type: InstallationType::System,
            });
        }
    }

    if let Ok(output) = silent_command("claude").arg("--version").output() {
        if output.status.success() {
            debug!("claude is available in PATH");
            let version = extract_version_from_output(&output.stdout);
            installations.push(ClaudeInstallation {
                path: "claude".to_string(), version,
                source: "PATH".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}

/// Check standard installation paths (Windows)
#[cfg(windows)]
pub(crate) fn find_standard_installations() -> Vec<ClaudeInstallation> {
    let mut installations = Vec::new();
    let mut paths_to_check: Vec<(String, String)> = vec![];

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        paths_to_check.extend(vec![
            (format!("{}\\.claude\\local\\claude.exe", user_profile), "claude-local".to_string()),
            (format!("{}\\.local\\bin\\claude.exe", user_profile), "local-bin".to_string()),
            (format!("{}\\AppData\\Roaming\\npm\\claude.cmd", user_profile), "npm-global".to_string()),
            (format!("{}\\.yarn\\bin\\claude.cmd", user_profile), "yarn".to_string()),
            (format!("{}\\.bun\\bin\\claude.exe", user_profile), "bun".to_string()),
            (format!("{}\\.volta\\bin\\claude.exe", user_profile), "volta".to_string()),
            (format!("{}\\scoop\\shims\\claude.exe", user_profile), "scoop".to_string()),
        ]);
    }

    for (path, source) in paths_to_check {
        let path_buf = PathBuf::from(&path);
        if path_buf.exists() && path_buf.is_file() {
            debug!("Found claude at standard path: {} ({})", path, source);
            let version = get_claude_version(&path);
            installations.push(ClaudeInstallation {
                path, version, source,
                installation_type: InstallationType::System,
            });
        }
    }

    if let Ok(output) = silent_command("claude.exe").arg("--version").output() {
        if output.status.success() {
            debug!("claude.exe is available in PATH");
            let version = extract_version_from_output(&output.stdout);
            installations.push(ClaudeInstallation {
                path: "claude.exe".to_string(), version,
                source: "PATH".to_string(),
                installation_type: InstallationType::System,
            });
        }
    }

    installations
}
