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

/// Creates a tokio Command with the subset of env-vars that Claude/Node need.
pub(super) fn create_command_with_env(program: &str) -> Command {
    let mut tokio_cmd = Command::new(program);

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

    if program.contains("/.nvm/versions/node/") {
        if let Some(node_bin_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let node_bin_str = node_bin_dir.to_string_lossy();
            if !current_path.contains(&node_bin_str.as_ref()) {
                tokio_cmd.env("PATH", format!("{}:{}", node_bin_str, current_path));
            }
        }
    }

    if program.contains("/homebrew/") || program.contains("/opt/homebrew/") {
        if let Some(program_dir) = std::path::Path::new(program).parent() {
            let current_path = std::env::var("PATH").unwrap_or_default();
            let homebrew_bin_str = program_dir.to_string_lossy();
            if !current_path.contains(&homebrew_bin_str.as_ref()) {
                log::debug!("Adding Homebrew bin directory to PATH: {}", homebrew_bin_str);
                tokio_cmd.env("PATH", format!("{}:{}", homebrew_bin_str, current_path));
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

/// Checks if Claude Code is installed and gets its version
#[tauri::command]
pub async fn check_claude_version(app: tauri::AppHandle) -> Result<ClaudeVersionStatus, String> {
    log::info!("Checking Claude Code version");

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
                std::process::Command::new(claude_path).arg("--version").output()
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
