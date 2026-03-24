use std::fs;
use std::path::PathBuf;

use super::{guard_path_within_home, FileEntry};

/// Lists files and directories in a given path (restricted to user's home directory).
///
/// When `wsl_distro` is provided on Windows, the listing is performed inside the
/// specified WSL distribution via `wsl -d <distro> -- ls -la <path>`.
#[tauri::command]
pub async fn list_directory_contents(
    directory_path: String,
    wsl_distro: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    log::info!("Listing directory contents: '{}'", directory_path);

    if directory_path.trim().is_empty() {
        log::error!("Directory path is empty or whitespace");
        return Err("Directory path cannot be empty".to_string());
    }

    // WSL path: list directory inside the WSL distribution
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            crate::commands::wsl::validate_distro_name(distro)?;
            return list_directory_via_wsl(distro, &directory_path).await;
        }
    }
    let _ = &wsl_distro; // suppress unused warning on non-Windows

    let path = PathBuf::from(&directory_path);

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    if !home.is_empty() {
        let canonical = path
            .canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;
        if !canonical.starts_with(&home) && !canonical.starts_with(std::env::temp_dir()) {
            return Err(
                "Directory listing is restricted to the user's home directory".to_string(),
            );
        }
    }
    log::debug!("Resolved path: {:?}", path);

    if !path.exists() {
        log::error!("Path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", directory_path));
    }

    if !path.is_dir() {
        log::error!("Path is not a directory: {:?}", path);
        return Err(format!("Path is not a directory: {}", directory_path));
    }

    let mut entries = tokio::task::spawn_blocking(move || {
        let dir_entries =
            fs::read_dir(&path).map_err(|e| format!("Failed to read directory: {}", e))?;

        let mut entries = Vec::new();

        for entry in dir_entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let entry_path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|e| format!("Failed to read metadata: {}", e))?;

            // Skip hidden files/directories unless they are .claude directories
            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') && name != ".claude" {
                    continue;
                }
            }

            let name = entry_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("")
                .to_string();

            let extension = if metadata.is_file() {
                entry_path
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_string())
            } else {
                None
            };

            entries.push(FileEntry {
                name,
                path: entry_path.to_string_lossy().to_string(),
                is_directory: metadata.is_dir(),
                size: metadata.len(),
                extension,
            });
        }

        Ok::<_, String>(entries)
    })
    .await
    .map_err(|e| e.to_string())??;

    // Sort: directories first, then files, alphabetically within each group
    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Lists directory contents inside a WSL distribution.
#[cfg(target_os = "windows")]
async fn list_directory_via_wsl(distro: &str, directory_path: &str) -> Result<Vec<FileEntry>, String> {
    let distro = distro.to_string();
    let dir_path = directory_path.to_string();

    let output = tokio::task::spawn_blocking(move || {
        crate::claude_binary::silent_command("wsl")
            .args(["-d", &distro, "--", "ls", "-la", &dir_path])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("WSL ls failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("WSL ls failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    // Parse `ls -la` output — skip the "total N" header line
    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("total") {
            continue;
        }
        let parts: Vec<&str> = trimmed.splitn(9, char::is_whitespace).collect();
        if parts.len() < 9 {
            continue;
        }
        let name = parts[8].trim().to_string();
        if name == "." || name == ".." {
            continue;
        }
        // Skip hidden files unless .claude
        if name.starts_with('.') && name != ".claude" {
            continue;
        }
        let is_directory = trimmed.starts_with('d');
        let size: u64 = parts[4].parse().unwrap_or(0);
        let extension = if !is_directory {
            std::path::Path::new(&name)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };
        let full_path = if directory_path.ends_with('/') {
            format!("{}{}", directory_path, name)
        } else {
            format!("{}/{}", directory_path, name)
        };
        entries.push(FileEntry {
            name,
            path: full_path,
            is_directory,
            size,
            extension,
        });
    }

    entries.sort_by(|a, b| match (a.is_directory, b.is_directory) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

/// Search for files and directories matching a pattern.
///
/// When `wsl_distro` is provided on Windows, the search is performed inside the
/// specified WSL distribution via `wsl -d <distro> -- find <path> -iname '*query*'`.
#[tauri::command]
pub async fn search_files(
    base_path: String,
    query: String,
    wsl_distro: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    log::info!("Searching files in '{}' for: '{}'", base_path, query);

    if base_path.trim().is_empty() {
        log::error!("Base path is empty or whitespace");
        return Err("Base path cannot be empty".to_string());
    }

    if query.trim().is_empty() {
        log::warn!("Search query is empty, returning empty results");
        return Ok(Vec::new());
    }

    // WSL path: search inside the WSL distribution
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            crate::commands::wsl::validate_distro_name(distro)?;
            return search_files_via_wsl(distro, &base_path, &query).await;
        }
    }
    let _ = &wsl_distro; // suppress unused warning on non-Windows

    let path = PathBuf::from(&base_path);

    if !path.exists() {
        log::error!("Base path does not exist: {:?}", path);
        return Err(format!("Path does not exist: {}", base_path));
    }

    let canonical_path = guard_path_within_home(&path)?;
    log::debug!("Resolved search base path: {:?}", canonical_path);

    let query_lower = query.to_lowercase();

    let mut results = tokio::task::spawn_blocking(move || {
        let mut results = Vec::new();
        search_files_recursive(&canonical_path, &canonical_path, &query_lower, &mut results, 0)?;
        Ok::<_, String>(results)
    })
    .await
    .map_err(|e| e.to_string())??;

    let query_lower = query.to_lowercase();

    results.sort_by(|a, b| {
        let a_exact = a.name.to_lowercase() == query_lower;
        let b_exact = b.name.to_lowercase() == query_lower;

        match (a_exact, b_exact) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        }
    });

    results.truncate(50);

    Ok(results)
}

fn search_files_recursive(
    current_path: &PathBuf,
    base_path: &PathBuf,
    query: &str,
    results: &mut Vec<FileEntry>,
    depth: usize,
) -> Result<(), String> {
    if depth > 5 || results.len() >= 50 {
        return Ok(());
    }

    let entries = fs::read_dir(current_path)
        .map_err(|e| format!("Failed to read directory {:?}: {}", current_path, e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let entry_path = entry.path();

        if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') {
                continue;
            }

            if name.to_lowercase().contains(query) {
                let metadata = entry
                    .metadata()
                    .map_err(|e| format!("Failed to read metadata: {}", e))?;

                let extension = if metadata.is_file() {
                    entry_path
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_string())
                } else {
                    None
                };

                results.push(FileEntry {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    is_directory: metadata.is_dir(),
                    size: metadata.len(),
                    extension,
                });
            }
        }

        if entry_path.is_dir() {
            if let Some(dir_name) = entry_path.file_name().and_then(|n| n.to_str()) {
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
            search_files_recursive(&entry_path, base_path, query, results, depth + 1)?;
        }
    }

    Ok(())
}

/// Searches for files inside a WSL distribution using `find`.
#[cfg(target_os = "windows")]
async fn search_files_via_wsl(
    distro: &str,
    base_path: &str,
    query: &str,
) -> Result<Vec<FileEntry>, String> {
    let distro = distro.to_string();
    let base = base_path.to_string();
    // Use find with -iname for case-insensitive glob match, limit depth to 5
    let pattern = format!("*{}*", query);
    let find_cmd = format!(
        "find {} -maxdepth 5 -iname '{}' -not -path '*/node_modules/*' -not -path '*/.git/*' -not -path '*/target/*' 2>/dev/null | head -50",
        shell_escape(&base),
        shell_escape(&pattern),
    );

    let output = tokio::task::spawn_blocking(move || {
        crate::claude_binary::silent_command("wsl")
            .args(["-d", &distro, "--", "sh", "-c", &find_cmd])
            .output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("WSL find failed: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut results = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let p = std::path::Path::new(trimmed);
        let name = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() || (name.starts_with('.') && name != ".claude") {
            continue;
        }
        // Heuristic: paths ending with / are directories; otherwise check name for extension
        let is_directory = trimmed.ends_with('/');
        let extension = if !is_directory {
            p.extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_string())
        } else {
            None
        };
        results.push(FileEntry {
            name,
            path: trimmed.to_string(),
            is_directory,
            size: 0,
            extension,
        });
    }

    Ok(results)
}

/// Minimal shell escaping for single-quoted strings used in WSL commands.
#[cfg(target_os = "windows")]
fn shell_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}
