use super::cache::{bust_all_caches, try_read_cache, write_cache};
use super::{npx_cmd, wsl_command, RUFLO_SWARM_CACHE_TTL_SECS};
use super::domain::{AgentStatus, RuFloAgent, RuFloProjectStatus, RuFloSwarmStatus};

// ---------------------------------------------------------------------------
// Swarm / project status commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_ruflo_swarm_status(wsl_distro: Option<String>) -> RuFloSwarmStatus {
    // Use a separate cache file per platform mode (Windows native vs WSL distro)
    let swarm_cache_key = match wsl_distro.as_deref() {
        Some(d) => format!("runecode_swarm_cache_wsl_{}.json", d),
        None => "runecode_swarm_cache.json".to_string(),
    };
    if let Some(cached) =
        try_read_cache::<RuFloSwarmStatus>(&swarm_cache_key, RUFLO_SWARM_CACHE_TTL_SECS)
    {
        return cached;
    }

    let wsl_for_agents = wsl_distro.clone();
    let agents_output = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_for_agents.as_deref();
            // wsl_command() auto-rewrites npx @claude-flow/cli → claude-flow in WSL mode
            wsl_command(
                npx_cmd(),
                &["--no-install", "@claude-flow/cli", "agent", "list", "--json"],
                wsl,
            )
            .output()
        }),
    )
    .await
    .ok()
    .and_then(|r| r.ok())
    .and_then(|r| r.ok());

    let (agents, parse_error) = match agents_output.as_ref() {
        Some(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                Ok(v) => {
                    let agents = v
                        .as_array()
                        .cloned()
                        .unwrap_or_default()
                        .iter()
                        .map(|a| RuFloAgent {
                            id: a["id"].as_str().unwrap_or("").to_string(),
                            name: a["name"].as_str().unwrap_or("agent").to_string(),
                            agent_type: serde_json::from_value(a["type"].clone())
                                .unwrap_or(
                                    crate::commands::ruflo::domain::agent::AgentType::Custom,
                                ),
                            status: serde_json::from_value(a["status"].clone())
                                .unwrap_or(AgentStatus::Unknown),
                            capabilities: vec![],
                        })
                        .collect::<Vec<_>>();
                    (agents, None)
                }
                Err(e) => {
                    log::warn!("Failed to parse agent list JSON: {}", e);
                    (vec![], Some(format!("parse error: {}", e)))
                }
            }
        }
        Some(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            log::warn!("agent list command failed: {}", stderr);
            (vec![], Some(stderr.to_string()))
        }
        None => (vec![], Some("command not found".to_string())),
    };

    let _ = parse_error; // logged above; callers see empty agents

    let swarm_active = !agents.is_empty() && agents.iter().any(|a| a.status.is_active());

    let wsl_for_memory = wsl_distro;
    let memory_entries = tokio::time::timeout(
        std::time::Duration::from_secs(8),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_for_memory.as_deref();
            wsl_command(
                npx_cmd(),
                &["--no-install", "@claude-flow/cli", "memory", "list", "--json"],
                wsl,
            )
            .output()
        }),
    )
    .await
    .ok()
    .and_then(|r| r.ok())
    .and_then(|r| r.ok())
    .and_then(|o| String::from_utf8(o.stdout).ok())
    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
    .and_then(|v| v.as_array().map(|a| a.len()))
    .unwrap_or(0);

    let result = RuFloSwarmStatus {
        swarm_active,
        agents,
        memory_entries,
    };
    write_cache(&swarm_cache_key, &result);
    result
}

#[tauri::command]
pub fn get_ruflo_project_status(path: String) -> RuFloProjectStatus {
    let raw_path = std::path::Path::new(&path);
    let base = match std::fs::canonicalize(raw_path) {
        Ok(p) => p,
        Err(_) => return RuFloProjectStatus::default(),
    };
    // Verify within home directory
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return RuFloProjectStatus::default(),
    };
    if !base.starts_with(&home) {
        log::warn!(
            "get_ruflo_project_status: path {} is outside home dir",
            base.display()
        );
        return RuFloProjectStatus::default();
    }
    let tasks_dir = base.join("tasks");

    let initialized = tasks_dir.join("pending").exists()
        && tasks_dir.join("completed").exists()
        && tasks_dir.join("blocked").exists();

    let count_md = |subdir: &str| -> usize {
        std::fs::read_dir(tasks_dir.join(subdir))
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        e.path().extension().and_then(|x| x.to_str()) == Some("md")
                    })
                    .count()
            })
            .unwrap_or(0)
    };

    RuFloProjectStatus {
        initialized,
        pending: count_md("pending"),
        completed: count_md("completed"),
        blocked: count_md("blocked"),
    }
}

#[tauri::command]
pub async fn init_ruflo_project(
    app: tauri::AppHandle,
    path: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;
    // In WSL mode, the path is a Linux path (e.g. /home/user/project) that
    // doesn't exist on the Windows filesystem. Skip native validation.
    #[cfg(target_os = "windows")]
    let is_wsl = wsl_distro.is_some();
    #[cfg(not(target_os = "windows"))]
    let is_wsl = false;

    let project_path = if is_wsl {
        std::path::PathBuf::from(&path)
    } else {
        let p = std::path::Path::new(&path);
        if !p.exists() {
            return Err(format!("Project path does not exist: {}", p.display()));
        }
        if !p.is_dir() {
            return Err(format!("Project path is not a directory: {}", p.display()));
        }
        std::fs::canonicalize(p).map_err(|e| format!("Cannot resolve project path: {}", e))?
    };
    // Security: prevent path traversal into system directories.
    // On Windows, drives other than the home drive are allowed (D:\Projects, etc.)
    // because home is C:\Users\<name> and projects may live on any drive.
    // On Unix, allow any path under / but block known system roots.
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let is_allowed = if cfg!(target_os = "windows") {
        // Allow any absolute path that isn't a Windows system directory
        let p = project_path.to_string_lossy().to_lowercase();
        !p.starts_with("c:\\windows") && !p.starts_with("c:\\program files")
    } else {
        // On Unix: require path under home, or under common project roots
        project_path.starts_with(&home)
            || project_path.starts_with("/opt")
            || project_path.starts_with("/srv")
            || project_path.starts_with("/var/www")
            || project_path.starts_with("/workspace")
            || project_path.starts_with("/workspaces") // GitHub Codespaces
    };
    if !is_allowed {
        return Err(format!(
            "Project path '{}' is not allowed. Use a path within your home directory or a workspace directory.",
            project_path.display()
        ));
    }

    let wsl = wsl_distro.as_deref();
    let mut cmd = wsl_command(npx_cmd(), &["@claude-flow/cli", "init"], wsl);
    cmd.current_dir(&project_path);
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to run ruflo init: {e}"))?;

    if output.status.success() {
        let _ = app.emit(
            "ruflo-project-changed",
            project_path.to_string_lossy().as_ref(),
        );
        Ok("RuFlo initialized in project".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("ruflo init failed: {stderr}"))
    }
}

// ---------------------------------------------------------------------------
// Memory management commands
// ---------------------------------------------------------------------------

/// Get memory statistics from the claude-flow CLI
#[tauri::command]
pub async fn get_ruflo_memory_stats(wsl_distro: Option<String>) -> Result<serde_json::Value, String> {
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(
                npx_cmd(),
                &["-y", "@claude-flow/cli@latest", "memory", "stats", "--json"],
                wsl,
            )
            .output()
        }),
    )
    .await;

    let output = match result {
        Err(_timeout) => return Err("memory stats timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn memory stats: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run memory stats: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut val: serde_json::Value = serde_json::from_str(stdout.trim())
            .unwrap_or_else(|_| serde_json::json!({ "raw": stdout.trim() }));
        // Inject agentdb as the default backend when the CLI omits it
        if let Some(obj) = val.as_object_mut() {
            obj.entry("backend")
                .or_insert_with(|| serde_json::json!("agentdb"));
        }
        Ok(val)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory stats failed: {stderr}"))
    }
}

/// Sync memory to local file (export as JSON)
#[tauri::command]
pub async fn sync_ruflo_memory_local(
    app: tauri::AppHandle,
    output_path: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;
    // Validate path is within home dir
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let resolved = std::path::Path::new(&output_path);
    let canonical_parent = resolved
        .parent()
        .and_then(|p| std::fs::canonicalize(p).ok())
        .ok_or("Cannot resolve output path")?;
    if !canonical_parent.starts_with(&home) {
        return Err("Output path must be within home directory".to_string());
    }

    let output_path_clone = output_path.clone();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(
                npx_cmd(),
                &[
                    "-y",
                    "@claude-flow/cli@latest",
                    "memory",
                    "export",
                    "--format",
                    "json",
                    "--output",
                    &output_path_clone,
                ],
                wsl,
            )
            .output()
        }),
    )
    .await;

    let output = match result {
        Err(_timeout) => return Err("memory export timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn memory export: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run memory export: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if output.status.success() {
        let _ = app.emit("ruflo-memory-changed", "synced");
        Ok(format!("Memory synced to {}", output_path))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory export failed: {stderr}"))
    }
}

/// Consolidate memory (compress + cleanup stale entries)
#[tauri::command]
pub async fn consolidate_ruflo_memory(
    app: tauri::AppHandle,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;

    let wsl_for_compress = wsl_distro.clone();
    // Run compress first
    let compress_result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_for_compress.as_deref();
            wsl_command(
                npx_cmd(),
                &["-y", "@claude-flow/cli@latest", "memory", "compress"],
                wsl,
            )
            .output()
        }),
    )
    .await;

    let compress = match compress_result {
        Err(_timeout) => return Err("memory compress timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn memory compress: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run memory compress: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if !compress.status.success() {
        let stderr = String::from_utf8_lossy(&compress.stderr);
        return Err(format!("memory compress failed: {stderr}"));
    }

    // Then cleanup stale entries
    let cleanup_result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(
                npx_cmd(),
                &["-y", "@claude-flow/cli@latest", "memory", "cleanup"],
                wsl,
            )
            .output()
        }),
    )
    .await;

    let cleanup = match cleanup_result {
        Err(_timeout) => return Err("memory cleanup timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn memory cleanup: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run memory cleanup: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    if cleanup.status.success() {
        let _ = app.emit("ruflo-memory-changed", "consolidated");
        Ok("Memory consolidated (compressed + cleaned up stale entries)".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&cleanup.stderr);
        Err(format!("memory cleanup failed: {stderr}"))
    }
}

/// Set memory backend (agentdb, hnsw, or hybrid)
#[tauri::command]
pub async fn set_ruflo_memory_backend(
    app: tauri::AppHandle,
    backend: String,
    wsl_distro: Option<String>,
) -> Result<String, String> {
    use tauri::Emitter;
    // Validate backend value
    if !["agentdb", "hnsw", "hybrid"].contains(&backend.as_str()) {
        return Err(format!(
            "Invalid backend '{}'. Must be: agentdb, hnsw, hybrid",
            backend
        ));
    }

    let backend_clone = backend.clone();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(15),
        tokio::task::spawn_blocking(move || {
            let wsl = wsl_distro.as_deref();
            wsl_command(
                npx_cmd(),
                &[
                    "-y",
                    "@claude-flow/cli@latest",
                    "memory",
                    "configure",
                    "--backend",
                    &backend_clone,
                ],
                wsl,
            )
            .output()
        }),
    )
    .await;

    let output = match result {
        Err(_timeout) => return Err("memory configure timed out".to_string()),
        Ok(Err(e)) => return Err(format!("Failed to spawn memory configure: {e}")),
        Ok(Ok(Err(e))) => return Err(format!("Failed to run memory configure: {e}")),
        Ok(Ok(Ok(o))) => o,
    };

    // Bust both caches after any successful backend change
    if output.status.success() {
        bust_all_caches();
        let _ = app.emit("ruflo-memory-changed", backend.as_str());
        Ok(format!("Memory backend set to {}", backend))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("memory configure failed: {stderr}"))
    }
}
