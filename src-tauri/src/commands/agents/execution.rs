use anyhow::Result;
use chrono;
use log::{debug, error, info, warn};
use rusqlite::{params, Connection};
use serde_json::Value as JsonValue;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::ChildStdout;
use tokio::process::ChildStderr;

use super::{create_command_with_env, find_claude_binary, AgentDb};
use crate::commands::agents::db::get_agent;
use crate::process::ProcessRegistry;

// ─────────────────────────────────────────────────────────────────────────────
// Binary path settings
// ─────────────────────────────────────────────────────────────────────────────

/// Get the stored Claude binary path from settings
#[tauri::command]
pub async fn get_claude_binary_path(db: State<'_, AgentDb>) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    match conn.query_row(
        "SELECT value FROM app_settings WHERE key = 'claude_binary_path'",
        [],
        |row| row.get::<_, String>(0),
    ) {
        Ok(path) => Ok(Some(path)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get Claude binary path: {}", e)),
    }
}

/// Set the Claude binary path in settings
#[tauri::command]
pub async fn set_claude_binary_path(db: State<'_, AgentDb>, path: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata = std::fs::metadata(&path_buf)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;
        if metadata.permissions().mode() & 0o111 == 0 {
            return Err(format!("File is not executable: {}", path));
        }
    }
    conn.execute(
        "INSERT INTO app_settings (key, value) VALUES ('claude_binary_path', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1",
        params![path],
    )
    .map_err(|e| format!("Failed to save Claude binary path: {}", e))?;
    Ok(())
}

/// List all available Claude installations on the system
#[tauri::command]
pub async fn list_claude_installations(
    _app: AppHandle,
) -> Result<Vec<crate::claude_binary::ClaudeInstallation>, String> {
    let installations = crate::claude_binary::discover_claude_installations();
    if installations.is_empty() {
        return Err("No Claude Code installations found on the system".to_string());
    }
    Ok(installations)
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute agent
// ─────────────────────────────────────────────────────────────────────────────

/// Execute a CC agent with streaming output
#[tauri::command]
pub async fn execute_agent(
    app: AppHandle,
    agent_id: i64,
    project_path: String,
    task: String,
    model: Option<String>,
    permission_mode: Option<String>,
    db: State<'_, AgentDb>,
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<i64, String> {
    info!("Executing agent {} with task: {}", agent_id, task);

    let canonical_project_path = crate::commands::claude::guard_path_within_home(
        &std::path::PathBuf::from(&project_path),
    )?;
    let project_path = canonical_project_path.to_string_lossy().into_owned();

    let agent = get_agent(db.clone(), agent_id).await?;
    let execution_model = model.unwrap_or(agent.model.clone());

    const ALLOWED_MODELS: &[&str] = &[
        "claude-opus-4-5", "claude-opus-4-6", "claude-sonnet-4-5", "claude-sonnet-4-6",
        "claude-haiku-4-5", "claude-haiku-4-5-20251001",
    ];
    if !execution_model.is_empty()
        && !ALLOWED_MODELS.iter().any(|m| execution_model.starts_with(m))
    {
        return Err(format!("Invalid model: {}", execution_model));
    }

    // Write hooks to .claude/settings.json if needed
    if let Some(hooks_json) = &agent.hooks {
        let claude_dir = std::path::Path::new(&project_path).join(".claude");
        let settings_path = claude_dir.join("settings.json");
        if !claude_dir.exists() {
            std::fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
        }
        if !settings_path.exists() {
            let hooks: serde_json::Value = serde_json::from_str(hooks_json)
                .map_err(|e| format!("Failed to parse agent hooks: {}", e))?;
            let settings_content = serde_json::to_string_pretty(&serde_json::json!({ "hooks": hooks }))
                .map_err(|e| format!("Failed to serialize settings: {}", e))?;
            std::fs::write(&settings_path, settings_content)
                .map_err(|e| format!("Failed to write settings.json: {}", e))?;
        }
    }

    // Create a new run record
    let run_id = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO agent_runs (agent_id, agent_name, agent_icon, task, model, \
             project_path, session_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![agent_id, agent.name, agent.icon, task, execution_model, project_path, ""],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    };

    info!("Running agent '{}'", agent.name);
    let claude_path = find_claude_binary(&app).map_err(|e| {
        error!("Failed to find claude binary: {}", e);
        e
    })?;

    let mut args = vec![
        "-p".to_string(), task.clone(),
        "--system-prompt".to_string(), agent.system_prompt.clone(),
        "--model".to_string(), execution_model.clone(),
        "--output-format".to_string(), "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    if permission_mode.as_deref() == Some("bypassPermissions") {
        args.push("--dangerously-skip-permissions".to_string());
    }

    spawn_agent_system(app, run_id, agent_id, agent.name.clone(),
        claude_path, args, project_path, task, execution_model, db, registry).await
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/// Creates a system binary command for agent execution
pub(crate) fn create_agent_system_command(
    claude_path: &str,
    args: Vec<String>,
    project_path: &str,
) -> tokio::process::Command {
    let mut cmd = create_command_with_env(claude_path);
    for arg in args { cmd.arg(arg); }
    cmd.current_dir(project_path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd
}

/// Read stdout lines from the child process and emit events
async fn read_stdout(
    stdout: ChildStdout,
    app_handle: AppHandle,
    run_id: i64,
    registry_clone: Arc<ProcessRegistry>,
    session_id_clone: Arc<Mutex<String>>,
    db_path: PathBuf,
    first_output: Arc<AtomicBool>,
) {
    let mut lines = TokioBufReader::new(stdout).lines();
    let mut line_count = 0;

    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        if !first_output.load(Ordering::Relaxed) {
            info!("First output received from Claude process: {}", line);
            first_output.store(true, Ordering::Relaxed);
        }
        if line_count <= 5 { info!("stdout[{}]: {}", line_count, line); }
        else { debug!("stdout[{}]: {}", line_count, line); }

        let _ = registry_clone.append_live_output(run_id, &line);

        // Extract session ID from init message
        if let Ok(json) = serde_json::from_str::<JsonValue>(&line) {
            if json.get("type").and_then(|t| t.as_str()) == Some("system")
                && json.get("subtype").and_then(|s| s.as_str()) == Some("init")
            {
                if let Some(sid) = json.get("session_id").and_then(|s| s.as_str()) {
                    if let Ok(mut cur) = session_id_clone.lock() {
                        if cur.is_empty() {
                            *cur = sid.to_string();
                            info!("Extracted session ID: {}", sid);
                            if let Ok(conn) = Connection::open(&db_path) {
                                match conn.execute(
                                    "UPDATE agent_runs SET session_id = ?1 WHERE id = ?2",
                                    params![sid, run_id],
                                ) {
                                    Ok(n) if n > 0 => info!("Updated run {} with session ID", run_id),
                                    Ok(_) => warn!("No rows updated for session ID on run {}", run_id),
                                    Err(e) => error!("Failed to update session ID: {}", e),
                                }
                            }
                        }
                    }
                }
            }
        }

        let _ = app_handle.emit(&format!("agent-output:{}", run_id), &line);
        let _ = app_handle.emit("agent-output", &line);
    }
    info!("Finished reading Claude stdout. Total lines: {}", line_count);
}

/// Read stderr lines from the child process and emit events
async fn read_stderr(stderr: ChildStderr, app_handle: AppHandle, run_id: i64) {
    let mut lines = TokioBufReader::new(stderr).lines();
    let mut error_count = 0;
    while let Ok(Some(line)) = lines.next_line().await {
        error_count += 1;
        error!("stderr[{}]: {}", error_count, line);
        let _ = app_handle.emit(&format!("agent-error:{}", run_id), &line);
        let _ = app_handle.emit("agent-error", &line);
    }
    if error_count > 0 { warn!("Finished reading Claude stderr. {} error lines.", error_count); }
    else { info!("Finished reading Claude stderr. No errors."); }
}

/// Spawn agent using system binary command
pub(crate) async fn spawn_agent_system(
    app: AppHandle,
    run_id: i64,
    agent_id: i64,
    agent_name: String,
    claude_path: String,
    args: Vec<String>,
    project_path: String,
    task: String,
    execution_model: String,
    db: State<'_, AgentDb>,
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<i64, String> {
    let mut cmd = create_agent_system_command(&claude_path, args, &project_path);

    info!("Spawning Claude system process...");
    let mut child = cmd.spawn().map_err(|e| {
        error!("Failed to spawn Claude process: {}", e);
        let _ = app.emit("agent-lifecycle", serde_json::json!({
            "event": "failed", "agent_id": agent_id, "agent_name": agent_name,
            "run_id": run_id, "error": format!("Failed to spawn Claude: {}", e),
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
        format!("Failed to spawn Claude: {}", e)
    })?;

    let pid = child.id().unwrap_or(0);
    info!("Claude process spawned with PID: {}", pid);

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE agent_runs SET status = 'running', pid = ?1, process_started_at = ?2 WHERE id = ?3",
            params![pid as i64, chrono::Utc::now().to_rfc3339(), run_id],
        ).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("agent-lifecycle", serde_json::json!({
        "event": "started", "agent_id": agent_id, "agent_name": agent_name,
        "run_id": run_id, "timestamp": chrono::Utc::now().timestamp_millis()
    }));

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;

    let db_path = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {e}"))?.join("agents.db");

    let session_id: Arc<Mutex<String>> = Arc::new(Mutex::new(String::new()));
    let start_time = std::time::Instant::now();
    let first_output = Arc::new(AtomicBool::new(false));

    let stdout_task = tokio::spawn(read_stdout(
        stdout, app.clone(), run_id, registry.0.clone(),
        session_id.clone(), db_path.clone(), first_output.clone(),
    ));
    let stderr_task = tokio::spawn(read_stderr(stderr, app.clone(), run_id));

    registry.0.register_process(
        run_id, agent_id, agent_name, pid,
        project_path, task, execution_model, child,
    ).map_err(|e| format!("Failed to register process: {}", e))?;

    let db_path_mon = db_path.clone();
    let registry_mon = registry.0.clone();

    tokio::spawn(async move {
        // Wait for first output with 30s timeout
        for i in 0..300 {
            if first_output.load(Ordering::Relaxed) {
                info!("Output detected after {}ms", i * 100); break;
            }
            if i == 299 {
                warn!("TIMEOUT: No output after 30s. Killing PID {}", pid);
                kill_process_by_pid(pid).await;
                if let Ok(conn) = Connection::open(&db_path_mon) {
                    let _ = conn.execute(
                        "UPDATE agent_runs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
                        params![run_id],
                    );
                }
                let _ = app.emit("agent-lifecycle", serde_json::json!({
                    "event": "failed", "agent_id": agent_id, "run_id": run_id,
                    "error": "Process timed out waiting for output after 30 seconds",
                    "timestamp": chrono::Utc::now().timestamp_millis()
                }));
                let _ = registry_mon.unregister_process(run_id);
                let _ = app.emit("agent-complete", false);
                let _ = app.emit(&format!("agent-complete:{}", run_id), false);
                return;
            }
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }

        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let duration_ms = i64::try_from(start_time.elapsed().as_millis()).unwrap_or(i64::MAX);
        info!("Process execution took {} ms", duration_ms);

        let extracted_session_id = session_id.lock().map(|s| s.clone()).unwrap_or_default();

        if let Ok(conn) = Connection::open(&db_path_mon) {
            match conn.execute(
                "UPDATE agent_runs SET session_id = ?1, status = 'completed', \
                 completed_at = CURRENT_TIMESTAMP WHERE id = ?2",
                params![extracted_session_id, run_id],
            ) {
                Ok(n) if n > 0 => info!("Updated run {} with session ID {}", run_id, extracted_session_id),
                Ok(_) => warn!("No rows affected updating run {} session ID", run_id),
                Err(e) => error!("Failed to update run {} session ID: {}", run_id, e),
            }
        }

        let _ = registry_mon.unregister_process(run_id);
        let _ = app.emit("agent-lifecycle", serde_json::json!({
            "event": "completed", "agent_id": agent_id, "run_id": run_id,
            "timestamp": chrono::Utc::now().timestamp_millis()
        }));
        let _ = app.emit("agent-complete", true);
        let _ = app.emit(&format!("agent-complete:{}", run_id), true);
    });

    Ok(run_id)
}

/// Kill a process by PID, trying TERM first then KILL
async fn kill_process_by_pid(pid: u32) {
    let pid_s = pid.to_string();
    let result = tokio::task::spawn_blocking(move || {
        std::process::Command::new("kill").arg("-TERM").arg(&pid_s).output()
    })
    .await;
    match result {
        Ok(Ok(out)) if out.status.success() => { warn!("Sent TERM to PID {}", pid); }
        _ => {
            let pid_s2 = pid.to_string();
            let _ = tokio::task::spawn_blocking(move || {
                std::process::Command::new("kill").arg("-KILL").arg(&pid_s2).output()
            }).await;
        }
    }
}
