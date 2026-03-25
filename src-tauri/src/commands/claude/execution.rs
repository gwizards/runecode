use std::io::BufRead;
use std::path::PathBuf;

use tauri::{AppHandle, Emitter, Manager};

use crate::claude_binary::silent_command;

use super::{
    create_system_command_wsl, find_claude_binary, get_claude_dir, guard_path_within_home,
    validate_path_component, ClaudeProcessState,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

fn maybe_add_bypass_flag(args: &mut Vec<String>, permission_mode: &str) {
    if permission_mode == "bypassPermissions" {
        args.push("--dangerously-skip-permissions".to_string());
    }
}

fn validate_model(model: &str) -> Result<(), String> {
    if model.is_empty() || model.len() > 128 {
        return Err("Invalid model name".to_string());
    }
    if !model
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.' | '_' | '/'))
    {
        return Err(format!("Model name '{}' contains invalid characters", model));
    }
    Ok(())
}

// ─── Commands ─────────────────────────────────────────────────────────────────

/// Opens a new Claude Code session by executing the claude command
#[tauri::command]
pub async fn open_new_session(app: AppHandle, path: Option<String>) -> Result<String, String> {
    log::info!("Opening new Claude Code session at path: {:?}", path);

    #[cfg(not(debug_assertions))]
    let _claude_path = find_claude_binary(&app)?;
    #[cfg(debug_assertions)]
    let claude_path = find_claude_binary(&app)?;

    #[cfg(not(debug_assertions))]
    {
        log::error!("Cannot spawn processes directly in production builds");
        return Err("Direct process spawning is not available in production builds. Please use Claude Code directly or use the integrated execution commands.".to_string());
    }

    #[cfg(debug_assertions)]
    {
        let mut cmd = silent_command(&claude_path);
        if let Some(project_path) = path {
            let guarded = guard_path_within_home(&PathBuf::from(&project_path))?;
            cmd.current_dir(&guarded);
        }
        match cmd.spawn() {
            Ok(mut child) => {
                log::info!("Successfully launched Claude Code");
                std::thread::spawn(move || { let _ = child.wait(); });
                Ok("Claude Code session started".to_string())
            }
            Err(e) => {
                log::error!("Failed to launch Claude Code: {}", e);
                Err(format!("Failed to launch Claude Code: {}", e))
            }
        }
    }
}

/// Loads the JSONL history for a specific session.
/// When `wsl_distro` is provided (Windows only), reads the session file from
/// inside the specified WSL distribution.
#[tauri::command]
pub async fn load_session_history(
    session_id: String,
    project_id: String,
    wsl_distro: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!(
        "Loading session history for session: {} in project: {}",
        session_id, project_id
    );

    validate_path_component(&project_id, "project_id")?;
    validate_path_component(&session_id, "session_id")?;

    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            return load_session_history_wsl(&session_id, &project_id, distro).await;
        }
    }
    let _ = wsl_distro; // suppress unused warning on non-Windows

    let claude_dir = get_claude_dir().map_err(|e| e.to_string())?;
    let session_path = claude_dir
        .join("projects")
        .join(&project_id)
        .join(format!("{}.jsonl", session_id));

    if !session_path.exists() {
        return Err(format!("Session file not found: {}", session_id));
    }

    let canonical = session_path
        .canonicalize()
        .map_err(|e| format!("Session path error: {e}"))?;
    let projects_root = claude_dir.join("projects");
    if !canonical.starts_with(&projects_root) {
        return Err(format!(
            "Session '{}' not found under projects root",
            session_id
        ));
    }

    let messages = tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;
        let reader = std::io::BufReader::new(file);
        let mut messages = Vec::new();
        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    messages.push(json);
                }
            }
        }
        Ok::<_, String>(messages)
    })
    .await
    .map_err(|e| e.to_string())??;

    Ok(messages)
}

/// Reads a session JSONL file from inside a WSL distribution.
#[cfg(target_os = "windows")]
async fn load_session_history_wsl(
    session_id: &str,
    project_id: &str,
    distro: &str,
) -> Result<Vec<serde_json::Value>, String> {
    let sid = session_id.to_string();
    let pid = project_id.to_string();
    let d = distro.to_string();
    tokio::task::spawn_blocking(move || {
        let output = crate::claude_binary::silent_command("wsl")
            .args([
                "-d",
                &d,
                "-e",
                "/bin/bash",
                "-c",
                &format!(
                    "cat \"$HOME/.claude/projects/{}/{}.jsonl\"",
                    pid, sid
                ),
            ])
            .output()
            .map_err(|e| format!("WSL load_session_history: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Session file not found in WSL: {} ({})", sid, stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut messages = Vec::new();
        for line in stdout.lines() {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(line) {
                messages.push(json);
            }
        }
        Ok(messages)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Execute a new interactive Claude Code session with streaming output
#[tauri::command]
pub async fn execute_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Starting new Claude Code session in: {} with model: {} (wsl_distro: {:?})",
        project_path, model, wsl_distro
    );
    guard_path_within_home(&std::path::PathBuf::from(&project_path))?;
    validate_model(&model)?;
    let claude_path = find_claude_binary(&app)?;
    let mut args = vec![
        "-p".to_string(), prompt.clone(),
        "--model".to_string(), model.clone(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    maybe_add_bypass_flag(&mut args, permission_mode.as_deref().unwrap_or("default"));
    let cmd = create_system_command_wsl(&claude_path, args, &project_path, wsl_distro.as_deref());
    super::process::spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Continue an existing Claude Code conversation with streaming output
#[tauri::command]
pub async fn continue_claude_code(
    app: AppHandle,
    project_path: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Continuing Claude Code conversation in: {} with model: {} (wsl_distro: {:?})",
        project_path, model, wsl_distro
    );
    guard_path_within_home(&std::path::PathBuf::from(&project_path))?;
    validate_model(&model)?;
    let claude_path = find_claude_binary(&app)?;
    let mut args = vec![
        "-c".to_string(),
        "-p".to_string(), prompt.clone(),
        "--model".to_string(), model.clone(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    maybe_add_bypass_flag(&mut args, permission_mode.as_deref().unwrap_or("default"));
    let cmd = create_system_command_wsl(&claude_path, args, &project_path, wsl_distro.as_deref());
    super::process::spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Resume an existing Claude Code session by ID with streaming output
#[tauri::command]
pub async fn resume_claude_code(
    app: AppHandle,
    project_path: String,
    session_id: String,
    prompt: String,
    model: String,
    permission_mode: Option<String>,
    wsl_distro: Option<String>,
) -> Result<(), String> {
    log::info!(
        "Resuming Claude Code session: {} in: {} with model: {} (wsl_distro: {:?})",
        session_id, project_path, model, wsl_distro
    );
    validate_path_component(&session_id, "session_id")?;
    guard_path_within_home(&std::path::PathBuf::from(&project_path))?;
    validate_model(&model)?;
    let claude_path = find_claude_binary(&app)?;
    let mut args = vec![
        "--resume".to_string(), session_id.clone(),
        "-p".to_string(), prompt.clone(),
        "--model".to_string(), model.clone(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    maybe_add_bypass_flag(&mut args, permission_mode.as_deref().unwrap_or("default"));
    let cmd = create_system_command_wsl(&claude_path, args, &project_path, wsl_distro.as_deref());
    super::process::spawn_claude_process(app, cmd, prompt, model, project_path).await
}

/// Cancel the currently running Claude Code execution
#[tauri::command]
pub async fn cancel_claude_execution(
    app: AppHandle,
    session_id: Option<String>,
) -> Result<(), String> {
    log::info!("Cancelling Claude Code execution for session: {:?}", session_id);

    let mut killed = false;
    let mut attempted_methods = Vec::new();

    // Method 1: ProcessRegistry
    if let Some(sid) = &session_id {
        let registry = app.state::<crate::process::ProcessRegistryState>();
        match registry.0.get_claude_session_by_id(sid) {
            Ok(Some(process_info)) => {
                log::info!(
                    "Found process in registry for session {}: run_id={}, PID={}",
                    sid, process_info.run_id, process_info.pid
                );
                match registry.0.kill_process(process_info.run_id).await {
                    Ok(true) => { log::info!("Successfully killed process via registry"); killed = true; }
                    Ok(false) => { log::warn!("Registry kill returned false"); }
                    Err(e) => { log::warn!("Failed to kill via registry: {}", e); }
                }
                attempted_methods.push("registry");
            }
            Ok(None) => log::warn!("Session {} not found in ProcessRegistry", sid),
            Err(e) => log::error!("Error querying ProcessRegistry: {}", e),
        }
    }

    // Method 2: ClaudeProcessState
    if !killed {
        let claude_state = app.state::<ClaudeProcessState>();
        let mut current_process = claude_state.current_process.lock().await;
        if let Some(mut child) = current_process.take() {
            let pid = child.id();
            log::info!("Attempting to kill Claude process via ClaudeProcessState with PID: {:?}", pid);
            match child.kill().await {
                Ok(_) => {
                    log::info!("Successfully killed Claude process via ClaudeProcessState");
                    killed = true;
                }
                Err(e) => {
                    log::error!("Failed to kill Claude process via ClaudeProcessState: {}", e);
                    // Method 3: system kill fallback
                    if let Some(pid) = pid {
                        log::info!("Attempting system kill as last resort for PID: {}", pid);
                        let kill_result = tokio::task::spawn_blocking(move || {
                            if cfg!(target_os = "windows") {
                                silent_command("taskkill")
                                    .args(["/F", "/PID", &pid.to_string()]).output()
                            } else {
                                silent_command("kill")
                                    .args(["-KILL", &pid.to_string()]).output()
                            }
                        }).await;
                        match kill_result {
                            Ok(Ok(output)) if output.status.success() => {
                                log::info!("Successfully killed process via system command");
                                killed = true;
                            }
                            Ok(Ok(output)) => {
                                log::error!("System kill failed: {}", String::from_utf8_lossy(&output.stderr));
                            }
                            Ok(Err(e)) => log::error!("Failed to execute system kill command: {}", e),
                            Err(e) => log::error!("spawn_blocking join error during system kill: {}", e),
                        }
                    }
                }
            }
            attempted_methods.push("claude_state");
        } else {
            log::warn!("No active Claude process in ClaudeProcessState");
        }
    }

    if !killed && attempted_methods.is_empty() {
        log::warn!("No active Claude process found to cancel");
    }

    if let Some(sid) = session_id {
        let _ = app.emit(&format!("claude-cancelled:{}", sid), true);
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        let _ = app.emit(&format!("claude-complete:{}", sid), false);
    }
    let _ = app.emit("claude-cancelled", true);
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    let _ = app.emit("claude-complete", false);

    if killed {
        log::info!("Claude process cancellation completed successfully");
    } else if !attempted_methods.is_empty() {
        log::warn!(
            "Claude process cancellation attempted but process may have already exited. Attempted methods: {:?}",
            attempted_methods
        );
    }

    Ok(())
}

/// Get all running Claude sessions
#[tauri::command]
pub async fn list_running_claude_sessions(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<crate::process::ProcessInfo>, String> {
    registry.0.get_running_claude_sessions()
}

/// Get live output from a Claude session
#[tauri::command]
pub async fn get_claude_session_output(
    registry: tauri::State<'_, crate::process::ProcessRegistryState>,
    session_id: String,
) -> Result<String, String> {
    if let Some(process_info) = registry.0.get_claude_session_by_id(&session_id)? {
        registry.0.get_live_output(process_info.run_id)
    } else {
        Ok(String::new())
    }
}
