use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use super::{get_claude_dir, guard_path_within_home, ClaudeMdFile, ClaudeSettings};

/// Reads the Claude settings file
#[tauri::command]
pub async fn get_claude_settings() -> Result<ClaudeSettings, String> {
    log::info!("Reading Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    if !settings_path.exists() {
        log::warn!("Settings file not found, returning empty settings");
        return Ok(ClaudeSettings {
            data: serde_json::json!({}),
        });
    }

    tokio::task::spawn_blocking(move || {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;

        let data: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

        Ok(ClaudeSettings { data })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves the Claude settings file
#[tauri::command]
pub async fn save_claude_settings(settings: serde_json::Value) -> Result<String, String> {
    log::info!("Saving Claude settings");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let settings_path = claude_dir.join("settings.json");

    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    const MAX_SETTINGS_SIZE: usize = 1024 * 1024; // 1 MB
    if json_string.len() > MAX_SETTINGS_SIZE {
        return Err(format!(
            "Settings payload too large: {} bytes (max 1 MB)",
            json_string.len()
        ));
    }

    tokio::task::spawn_blocking(move || {
        fs::write(&settings_path, json_string)
            .map_err(|e| format!("Failed to write settings file: {}", e))
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok("Settings saved successfully".to_string())
}

/// Reads the CLAUDE.md system prompt file
#[tauri::command]
pub async fn get_system_prompt() -> Result<String, String> {
    log::info!("Reading CLAUDE.md system prompt");

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    if !claude_md_path.exists() {
        log::warn!("CLAUDE.md not found");
        return Ok(String::new());
    }

    tokio::task::spawn_blocking(move || {
        fs::read_to_string(&claude_md_path)
            .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves the CLAUDE.md system prompt file
#[tauri::command]
pub async fn save_system_prompt(content: String) -> Result<String, String> {
    log::info!("Saving CLAUDE.md system prompt");

    const MAX_PROMPT_SIZE: usize = 512 * 1024; // 512 KB
    if content.len() > MAX_PROMPT_SIZE {
        return Err(format!(
            "System prompt too large: {} bytes (max 512 KB)",
            content.len()
        ));
    }

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let claude_md_path = claude_dir.join("CLAUDE.md");

    tokio::task::spawn_blocking(move || {
        fs::write(&claude_md_path, content)
            .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok("System prompt saved successfully".to_string())
}

/// Recursively finds all CLAUDE.md files in a project directory
#[tauri::command]
pub async fn find_claude_md_files(
    project_path: String,
) -> Result<Vec<ClaudeMdFile>, String> {
    log::info!("Finding CLAUDE.md files in project: {}", project_path);

    let path = PathBuf::from(&project_path);
    if !path.exists() {
        // In WSL mode, the path is a Linux path that doesn't exist on Windows.
        // Return empty rather than error — CLAUDE.md browsing for WSL paths
        // would need a separate WSL-aware implementation.
        log::info!("Project path does not exist natively (may be WSL): {}", project_path);
        return Ok(Vec::new());
    }

    let canonical_path = guard_path_within_home(&path)?;

    let mut claude_files = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();
        find_claude_md_recursive(&canonical_path, &canonical_path, &mut files)?;
        Ok::<_, String>(files)
    })
    .await
    .map_err(|e| e.to_string())??;

    claude_files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    log::info!("Found {} CLAUDE.md files", claude_files.len());
    Ok(claude_files)
}

/// Helper: recursively find CLAUDE.md files under a directory
fn find_claude_md_recursive(
    current_path: &PathBuf,
    project_root: &PathBuf,
    claude_files: &mut Vec<ClaudeMdFile>,
) -> Result<(), String> {
    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }
        }

        if path.is_dir() {
            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                if matches!(
                    dir_name,
                    "node_modules"
                        | "target"
                        | ".git"
                        | "dist"
                        | "build"
                        | ".next"
                        | "__pycache__"
                ) {
                    continue;
                }
            }
            find_claude_md_recursive(&path, project_root, claude_files)?;
        } else if path.is_file() {
            if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                if file_name.eq_ignore_ascii_case("CLAUDE.md") {
                    let metadata = fs::metadata(&path)
                        .map_err(|e| format!("Failed to read file metadata: {}", e))?;

                    let relative_path = path
                        .strip_prefix(project_root)
                        .map_err(|e| format!("Failed to get relative path: {}", e))?
                        .to_string_lossy()
                        .to_string();

                    let modified = metadata
                        .modified()
                        .unwrap_or(SystemTime::UNIX_EPOCH)
                        .duration_since(SystemTime::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    claude_files.push(ClaudeMdFile {
                        relative_path,
                        absolute_path: path.to_string_lossy().to_string(),
                        size: metadata.len(),
                        modified,
                    });
                }
            }
        }
    }

    Ok(())
}

/// Validate that a file path points to a CLAUDE.md-like file within the user's home directory
pub(super) fn validate_claude_md_path(file_path: &str) -> Result<PathBuf, String> {
    let path = PathBuf::from(file_path);

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    if !file_name.eq_ignore_ascii_case("CLAUDE.md")
        && !file_name.eq_ignore_ascii_case("AGENTS.md")
        && !file_name.eq_ignore_ascii_case("GEMINI.md")
    {
        return Err(
            "Only CLAUDE.md, AGENTS.md, and GEMINI.md files can be accessed through this command"
                .to_string(),
        );
    }

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();

    if home.is_empty() {
        return Err("Cannot determine home directory".to_string());
    }

    if let Some(parent) = path.parent() {
        if parent.exists() {
            let canonical_parent = parent
                .canonicalize()
                .map_err(|e| format!("Failed to resolve path: {}", e))?;
            if !canonical_parent.starts_with(&home) {
                return Err("File path must be within the user's home directory".to_string());
            }
            Ok(canonical_parent.join(file_name))
        } else {
            let mut ancestor = parent.to_path_buf();
            while !ancestor.exists() {
                ancestor = match ancestor.parent() {
                    Some(p) => p.to_path_buf(),
                    None => return Err("Cannot resolve path ancestry".to_string()),
                };
            }
            let canonical_ancestor = ancestor
                .canonicalize()
                .map_err(|e| format!("Failed to resolve path: {}", e))?;
            if !canonical_ancestor.starts_with(&home) {
                return Err("File path must be within the user's home directory".to_string());
            }
            let remaining = parent.strip_prefix(&ancestor).unwrap_or(parent);
            Ok(canonical_ancestor.join(remaining).join(file_name))
        }
    } else {
        Err("Invalid file path".to_string())
    }
}

/// Reads a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn read_claude_md_file(file_path: String) -> Result<String, String> {
    log::info!("Reading CLAUDE.md file: {}", file_path);

    let path = validate_claude_md_path(&file_path)?;
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    tokio::task::spawn_blocking(move || {
        fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Saves a specific CLAUDE.md file by its absolute path
#[tauri::command]
pub async fn save_claude_md_file(
    file_path: String,
    content: String,
) -> Result<String, String> {
    log::info!("Saving CLAUDE.md file: {}", file_path);

    let path = validate_claude_md_path(&file_path)?;

    tokio::task::spawn_blocking(move || {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create parent directory: {}", e))?;
        }

        fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;

        Ok("File saved successfully".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
