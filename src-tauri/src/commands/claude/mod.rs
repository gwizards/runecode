use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

pub mod checkpoint;
pub mod checkpoint_ops;
pub mod execution;
pub mod filesystem;
pub mod hooks;
pub mod project;
pub mod settings;
pub(self) mod process;

#[cfg(test)]
mod tests;

#[allow(unused_imports)]
pub use checkpoint::*;
#[allow(unused_imports)]
pub use checkpoint_ops::*;
#[allow(unused_imports)]
pub use execution::*;
#[allow(unused_imports)]
pub use filesystem::*;
#[allow(unused_imports)]
pub use hooks::*;
#[allow(unused_imports)]
pub use project::*;
#[allow(unused_imports)]
pub use settings::*;

// ─── Shared state ────────────────────────────────────────────────────────────

/// Global state to track current Claude process
pub struct ClaudeProcessState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl Default for ClaudeProcessState {
    fn default() -> Self {
        Self {
            current_process: Arc::new(Mutex::new(None)),
        }
    }
}

/// Holds the per-process startup secret used to authenticate frontend HTTP requests.
pub struct StartupSecret(pub String);

// ─── Shared types ─────────────────────────────────────────────────────────────

/// Represents a project in the ~/.claude/projects directory
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub path: String,
    pub sessions: Vec<String>,
    pub created_at: u64,
    pub most_recent_session: Option<u64>,
}

/// Represents a session with its metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub project_id: String,
    pub project_path: String,
    pub todo_data: Option<serde_json::Value>,
    pub created_at: u64,
    pub first_message: Option<String>,
    pub message_timestamp: Option<String>,
}

/// Represents a message entry in the JSONL file
#[derive(Debug, Deserialize)]
pub(super) struct JsonlEntry {
    #[serde(rename = "type")]
    #[allow(dead_code)]
    pub(super) entry_type: Option<String>,
    pub(super) message: Option<MessageContent>,
    pub(super) timestamp: Option<String>,
}

/// Represents the message content
#[derive(Debug, Deserialize)]
pub(super) struct MessageContent {
    pub(super) role: Option<String>,
    pub(super) content: Option<String>,
}

/// Represents the settings from ~/.claude/settings.json
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeSettings {
    #[serde(flatten)]
    pub data: serde_json::Value,
}

impl Default for ClaudeSettings {
    fn default() -> Self {
        Self {
            data: serde_json::json!({}),
        }
    }
}

/// Represents the Claude Code version status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeVersionStatus {
    pub is_installed: bool,
    pub version: Option<String>,
    pub output: String,
}

/// Represents a CLAUDE.md file found in the project
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClaudeMdFile {
    pub relative_path: String,
    pub absolute_path: String,
    pub size: u64,
    pub modified: u64,
}

/// Represents a file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub extension: Option<String>,
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

/// Finds the full path to the claude binary.
pub(super) fn find_claude_binary(app_handle: &tauri::AppHandle) -> Result<String, String> {
    crate::claude_binary::find_claude_binary(app_handle)
}

/// Gets the path to the ~/.claude directory
pub(super) fn get_claude_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .context("Could not find home directory")?
        .join(".claude")
        .canonicalize()
        .context("Could not find ~/.claude directory")
}

/// Guard: canonicalize `path` and verify it is within the user's home directory.
pub(crate) fn guard_path_within_home(path: &PathBuf) -> Result<PathBuf, String> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    if home.is_empty() {
        return Err("Cannot determine home directory".to_string());
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    // Canonicalize home too so both paths have the same form on all platforms.
    // On Windows, canonicalize() adds a \\?\ prefix; comparing a prefixed path
    // against a raw env-var string would always fail.
    let home_canonical = std::path::PathBuf::from(&home)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(&home));
    if !canonical.starts_with(&home_canonical) {
        return Err("Path is outside the user's home directory".to_string());
    }
    Ok(canonical)
}

/// Validate that `id` contains only safe path-component characters.
pub(super) fn validate_path_component(id: &str, label: &str) -> Result<(), String> {
    if id.is_empty() {
        return Err(format!("{} must not be empty", label));
    }
    if id.contains('/') || id.contains('\\') || id.contains("..") || id.contains('\0') {
        return Err(format!("{} contains invalid characters", label));
    }
    Ok(())
}

/// Normalizes path separators and checks whether `path` contains the given
/// `component` substring.  Backslashes are replaced with forward slashes so
/// the check works on both Windows and Unix paths.
fn path_contains_component(path: &str, component: &str) -> bool {
    let normalized = path.replace('\\', "/");
    normalized.contains(component)
}

/// Creates a tokio Command with the subset of env-vars that Claude/Node need.
pub(super) fn create_command_with_env(program: &str) -> Command {
    let mut tokio_cmd = Command::new(program);
    let path_sep = if cfg!(windows) { ";" } else { ":" };

    for (key, value) in std::env::vars() {
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
        {
            log::debug!("Inheriting env var: {}={}", key, value);
            tokio_cmd.env(&key, &value);
        }
    }

    if path_contains_component(program, "/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                tokio_cmd.env("PATH", format!("{}{}{}", node_bin_str, path_sep, current_path));
            }
        }
    }

    if path_contains_component(program, "/homebrew/")
        || path_contains_component(program, "/opt/homebrew/")
    {
        if let Some(program_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let homebrew_bin_str = program_dir.to_string_lossy();
            if !current_path.contains(&homebrew_bin_str.as_ref()) {
                log::debug!("Adding Homebrew bin directory to PATH: {}", homebrew_bin_str);
                tokio_cmd.env("PATH", format!("{}{}{}", homebrew_bin_str, path_sep, current_path));
            }
        }
    }

    tokio_cmd
}

/// Creates a system binary command with given arguments, piping stdout+stderr.
pub(super) fn create_system_command(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
) -> Command {
    use std::process::Stdio;
    let mut cmd = create_command_with_env(claude_path);
    for arg in args {
        cmd.arg(arg);
    }
    cmd.current_dir(project_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

/// Creates a system command that may be wrapped to run inside WSL.
///
/// When `wsl_distro` is `Some(distro)` on Windows, the command is rewritten to
/// `wsl -d <distro> --cd <wsl_path> -- <program> <args...>` so that Claude Code
/// executes inside the specified WSL distribution.  On non-Windows platforms or
/// when no distro is given, the command is built normally.
pub(crate) fn create_system_command_wsl(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
    wsl_distro: Option<&str>,
) -> Command {
    let (program, final_args, work_dir) = maybe_wrap_wsl(claude_path, &args, project_path, wsl_distro);
    create_system_command(&program, final_args, &work_dir)
}

/// Wraps a Claude command to execute inside WSL if a WSL distro is specified.
/// On non-Windows or when no distro is given, returns the command unchanged.
pub(crate) fn maybe_wrap_wsl(
    program: &str,
    args: &[String],
    project_path: &str,
    wsl_distro: Option<&str>,
) -> (String, Vec<String>, String) {
    #[cfg(target_os = "windows")]
    if let Some(distro) = wsl_distro {
        if !distro.is_empty() {
            // Convert Windows path to WSL path: C:\Users\foo -> /mnt/c/Users/foo
            let wsl_path = windows_to_wsl_path(project_path);
            let mut wsl_args = vec![
                "-d".to_string(),
                distro.to_string(),
                "--cd".to_string(),
                wsl_path.clone(),
                "--".to_string(),
                program.to_string(),
            ];
            wsl_args.extend(args.iter().cloned());
            return ("wsl".to_string(), wsl_args, wsl_path);
        }
    }
    let _ = wsl_distro; // suppress unused warning on non-Windows
    (program.to_string(), args.to_vec(), project_path.to_string())
}

/// Converts a Windows-style path to a WSL-compatible `/mnt/` path.
///
/// Example: `C:\Users\foo\project` becomes `/mnt/c/Users/foo/project`.
/// If the path does not start with a drive letter, slashes are normalised but
/// no `/mnt/` prefix is added.
#[cfg(target_os = "windows")]
fn windows_to_wsl_path(win_path: &str) -> String {
    let path = win_path.replace('\\', "/");
    if path.len() >= 2 && path.as_bytes()[1] == b':' {
        let drive = (path.as_bytes()[0] as char).to_ascii_lowercase();
        format!("/mnt/{}{}", drive, &path[2..])
    } else {
        path
    }
}

/// Checks if Claude Code is installed and gets its version.
///
/// When `wsl_distro` is provided on Windows, the version check runs inside the
/// specified WSL distribution (`wsl -d <distro> -- claude --version`).
#[tauri::command]
pub async fn check_claude_version(
    app: tauri::AppHandle,
    wsl_distro: Option<String>,
) -> Result<ClaudeVersionStatus, String> {
    log::info!("Checking Claude Code version");

    // WSL path: check claude inside the WSL distribution
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            let distro_owned = distro.clone();
            let output = tokio::time::timeout(
                std::time::Duration::from_secs(10),
                tokio::task::spawn_blocking(move || {
                    crate::claude_binary::silent_command("wsl")
                        .args(["-d", &distro_owned, "--", "claude", "--version"])
                        .output()
                }),
            )
            .await
            .map_err(|_| "check_claude_version (WSL) timed out".to_string())?
            .map_err(|e| format!("spawn_blocking failed: {}", e))?;

            return match output {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                    let version = regex::Regex::new(
                        r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)",
                    )
                    .ok()
                    .and_then(|re| re.captures(&stdout))
                    .and_then(|c| c.get(1))
                    .map(|m| m.as_str().to_string());
                    let full_output = if stderr.is_empty() {
                        stdout.clone()
                    } else {
                        format!("{}\n{}", stdout, stderr)
                    };
                    let is_valid =
                        stdout.contains("(Claude Code)") || stdout.contains("Claude Code");
                    Ok(ClaudeVersionStatus {
                        is_installed: is_valid && output.status.success(),
                        version,
                        output: full_output.trim().to_string(),
                    })
                }
                Err(e) => {
                    log::error!("Failed to run claude command in WSL: {}", e);
                    Ok(ClaudeVersionStatus {
                        is_installed: false,
                        version: None,
                        output: format!("WSL command not found: {}", e),
                    })
                }
            };
        }
    }
    let _ = &wsl_distro; // suppress unused warning on non-Windows

    let claude_path = match find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            return Ok(ClaudeVersionStatus { is_installed: false, version: None, output: e });
        }
    };

    log::debug!("Claude path: {}", claude_path);

    #[cfg(not(debug_assertions))]
    {
        log::warn!("Cannot check claude version in production build");
        if claude_path != "claude" && PathBuf::from(&claude_path).exists() {
            return Ok(ClaudeVersionStatus {
                is_installed: true,
                version: None,
                output: "Claude binary found at: ".to_string() + &claude_path,
            });
        }
        return Ok(ClaudeVersionStatus {
            is_installed: false,
            version: None,
            output: "Cannot verify Claude installation in production build. Please ensure Claude Code is installed.".to_string(),
        });
    }

    #[cfg(debug_assertions)]
    {
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            tokio::task::spawn_blocking(move || {
                crate::claude_binary::silent_command(&claude_path).arg("--version").output()
            }),
        )
        .await
        .map_err(|_| "check_claude_version timed out".to_string())?
        .map_err(|e| format!("spawn_blocking failed: {}", e))?;

        match output {
            Ok(output) => {
                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                let version = regex::Regex::new(
                    r"(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)",
                )
                .ok()
                .and_then(|re| re.captures(&stdout))
                .and_then(|c| c.get(1))
                .map(|m| m.as_str().to_string());
                let full_output = if stderr.is_empty() {
                    stdout.clone()
                } else {
                    format!("{}\n{}", stdout, stderr)
                };
                let is_valid = stdout.contains("(Claude Code)") || stdout.contains("Claude Code");
                Ok(ClaudeVersionStatus {
                    is_installed: is_valid && output.status.success(),
                    version,
                    output: full_output.trim().to_string(),
                })
            }
            Err(e) => {
                log::error!("Failed to run claude command: {}", e);
                Ok(ClaudeVersionStatus {
                    is_installed: false,
                    version: None,
                    output: format!("Command not found: {}", e),
                })
            }
        }
    }
}
