use anyhow::Result;
use log::{debug, info, warn};
use rusqlite::params;
use std::io::{BufRead, BufReader};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::claude_binary::silent_command;

use super::AgentDb;
use crate::commands::agents::db::{get_agent_run, read_session_jsonl};

// ─────────────────────────────────────────────────────────────────────────────
// Session management commands
// ─────────────────────────────────────────────────────────────────────────────

/// List all currently running agent sessions
#[tauri::command]
pub async fn list_running_sessions(
    db: State<'_, AgentDb>,
    registry: State<'_, crate::process::ProcessRegistryState>,
) -> Result<Vec<super::AgentRun>, String> {
    let mut runs = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT id, agent_id, agent_name, agent_icon, task, model, project_path, \
                 session_id, status, pid, process_started_at, created_at, completed_at \
                 FROM agent_runs WHERE status = 'running' ORDER BY process_started_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let collected = stmt
            .query_map([], |row| {
                Ok(super::AgentRun {
                    id: Some(row.get(0)?),
                    agent_id: row.get(1)?,
                    agent_name: row.get(2)?,
                    agent_icon: row.get(3)?,
                    task: row.get(4)?,
                    model: row.get(5)?,
                    project_path: row.get(6)?,
                    session_id: row.get(7)?,
                    status: row
                        .get::<_, String>(8)
                        .unwrap_or_else(|_| "pending".to_string()),
                    pid: row
                        .get::<_, Option<i64>>(9)
                        .ok()
                        .flatten()
                        .map(|p| {
                            if p >= 0 && p <= u32::MAX as i64 {
                                p as u32
                            } else {
                                0
                            }
                        }),
                    process_started_at: row.get(10)?,
                    created_at: row.get(11)?,
                    completed_at: row.get(12)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        collected
    };

    // Cross-check with the process registry to ensure accuracy
    let registry_processes = registry.0.get_running_agent_processes()?;
    let registry_run_ids: std::collections::HashSet<i64> =
        registry_processes.iter().map(|p| p.run_id).collect();

    runs.retain(|run| {
        if let Some(run_id) = run.id {
            registry_run_ids.contains(&run_id)
        } else {
            false
        }
    });

    Ok(runs)
}

/// Kill a running agent session
#[tauri::command]
pub async fn kill_agent_session(
    app: AppHandle,
    db: State<'_, AgentDb>,
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<bool, String> {
    info!("Attempting to kill agent session {}", run_id);

    let killed_via_registry = match registry.0.kill_process(run_id).await {
        Ok(true) => {
            info!("Successfully killed process {} via registry", run_id);
            true
        }
        Ok(false) => {
            warn!("Process {} not found in registry", run_id);
            false
        }
        Err(e) => {
            warn!("Failed to kill process {} via registry: {}", run_id, e);
            false
        }
    };

    if !killed_via_registry {
        let pid_result = {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            conn.query_row(
                "SELECT pid FROM agent_runs WHERE id = ?1 AND status = 'running'",
                params![run_id],
                |row| row.get::<_, Option<i64>>(0),
            )
            .map_err(|e| e.to_string())?
        };

        if let Some(pid) = pid_result {
            info!("Attempting fallback kill for PID {} from database", pid);
            let safe_pid = match pid {
                p if p >= 0 && p <= u32::MAX as i64 => p as u32,
                p => return Err(format!("Invalid PID: {}", p)),
            };
            let _ = registry.0.kill_process_by_pid(run_id, safe_pid).await?;
        }
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let updated = conn
        .execute(
            "UPDATE agent_runs SET status = 'cancelled', \
             completed_at = CURRENT_TIMESTAMP WHERE id = ?1 AND status = 'running'",
            params![run_id],
        )
        .map_err(|e| e.to_string())?;

    let _ = app.emit(&format!("agent-cancelled:{}", run_id), true);

    Ok(updated > 0 || killed_via_registry)
}

/// Get the status of a specific agent session
#[tauri::command]
pub async fn get_session_status(
    db: State<'_, AgentDb>,
    run_id: i64,
) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    match conn.query_row(
        "SELECT status FROM agent_runs WHERE id = ?1",
        params![run_id],
        |row| row.get::<_, String>(0),
    ) {
        Ok(status) => Ok(Some(status)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Cleanup finished processes and update their status
#[tauri::command]
pub async fn cleanup_finished_processes(db: State<'_, AgentDb>) -> Result<Vec<i64>, String> {
    let running_processes = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, pid FROM agent_runs WHERE status = 'running' AND pid IS NOT NULL",
            )
            .map_err(|e| e.to_string())?;
        let collected = stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        collected
    };

    let mut cleaned_up = Vec::new();

    for (run_id, pid) in running_processes {
        let is_running = tokio::time::timeout(
            std::time::Duration::from_secs(5),
            tokio::task::spawn_blocking(move || {
                if cfg!(target_os = "windows") {
                    match silent_command("tasklist")
                        .args(["/FI", &format!("PID eq {}", pid)])
                        .args(["/FO", "CSV"])
                        .output()
                    {
                        Ok(output) => {
                            let output_str = String::from_utf8_lossy(&output.stdout);
                            output_str.lines().count() > 1
                        }
                        Err(_) => false,
                    }
                } else {
                    match silent_command("kill")
                        .args(["-0", &pid.to_string()])
                        .output()
                    {
                        Ok(output) => output.status.success(),
                        Err(_) => false,
                    }
                }
            }),
        )
        .await
        .map_err(|_| format!("process check timed out for PID {}", pid))?
        .map_err(|e| format!("spawn_blocking error for PID {}: {}", pid, e))?;

        if !is_running {
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let updated = conn
                .execute(
                    "UPDATE agent_runs SET status = 'completed', \
                     completed_at = CURRENT_TIMESTAMP WHERE id = ?1",
                    params![run_id],
                )
                .map_err(|e| e.to_string())?;

            if updated > 0 {
                cleaned_up.push(run_id);
                info!(
                    "Marked agent run {} as completed (PID {} no longer running)",
                    run_id, pid
                );
            }
        }
    }

    Ok(cleaned_up)
}

/// Get live output from a running process
#[tauri::command]
pub async fn get_live_session_output(
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<String, String> {
    registry.0.get_live_output(run_id)
}

/// Get real-time output for a running session by reading its JSONL file with live output fallback
#[tauri::command]
pub async fn get_session_output(
    db: State<'_, AgentDb>,
    registry: State<'_, crate::process::ProcessRegistryState>,
    run_id: i64,
) -> Result<String, String> {
    let run = get_agent_run(db, run_id).await?;

    if run.session_id.is_empty() {
        let live_output = registry.0.get_live_output(run_id)?;
        if !live_output.is_empty() {
            return Ok(live_output);
        }
        return Ok(String::new());
    }

    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        log::error!("Projects directory not found at: {:?}", projects_dir);
        return Err("Projects directory not found".to_string());
    }

    let mut session_file_path = None;
    log::info!(
        "Searching for session file {} in all project directories",
        run.session_id
    );

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                let potential_session_file =
                    path.join(format!("{}.jsonl", run.session_id));
                if potential_session_file.exists() {
                    log::info!("Found session file at: {:?}", potential_session_file);
                    session_file_path = Some(potential_session_file);
                    break;
                }
            }
        }
    } else {
        log::error!("Failed to read projects directory");
    }

    if let Some(session_path) = session_file_path {
        match tokio::fs::read_to_string(&session_path).await {
            Ok(content) => Ok(content),
            Err(e) => {
                log::error!(
                    "Failed to read session file {}: {}",
                    session_path.display(),
                    e
                );
                let live_output = registry.0.get_live_output(run_id)?;
                Ok(live_output)
            }
        }
    } else {
        log::warn!(
            "Session file not found for {}, trying legacy method",
            run.session_id
        );
        match read_session_jsonl(&run.session_id, &run.project_path).await {
            Ok(content) => Ok(content),
            Err(_) => {
                let live_output = registry.0.get_live_output(run_id)?;
                Ok(live_output)
            }
        }
    }
}

/// Stream real-time session output by watching the JSONL file
#[tauri::command]
pub async fn stream_session_output(
    app: AppHandle,
    db: State<'_, AgentDb>,
    run_id: i64,
) -> Result<(), String> {
    let run = get_agent_run(db, run_id).await?;

    if run.session_id.is_empty() {
        return Err("Session not started yet".to_string());
    }

    let session_id = run.session_id.clone();
    let project_path = run.project_path.clone();

    tokio::spawn(async move {
        let claude_dir = match dirs::home_dir() {
            Some(home) => home.join(".claude").join("projects"),
            None => return,
        };

        let encoded_project = project_path.replace('/', "-");
        let project_dir = claude_dir.join(&encoded_project);
        let session_file = project_dir.join(format!("{}.jsonl", session_id));

        let mut last_size = 0u64;

        loop {
            if session_file.exists() {
                if let Ok(metadata) = tokio::fs::metadata(&session_file).await {
                    let current_size = metadata.len();

                    if current_size > last_size {
                        if let Ok(content) = tokio::fs::read_to_string(&session_file).await {
                            let _ = app.emit(
                                "session-output-update",
                                &format!("{}:{}", run_id, content),
                            );
                        }
                        last_size = current_size;
                    }
                }
            } else {
                tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                continue;
            }

            if let Ok(app_dir) = app.path().app_data_dir() {
                if let Ok(conn) = rusqlite::Connection::open(app_dir.join("agents.db")) {
                    if let Ok(status) = conn.query_row(
                        "SELECT status FROM agent_runs WHERE id = ?1",
                        rusqlite::params![run_id],
                        |row| row.get::<_, String>(0),
                    ) {
                        if status != "running" {
                            debug!(
                                "Session {} is no longer running, stopping stream",
                                run_id
                            );
                            break;
                        }
                    } else {
                        debug!(
                            "Could not query session status for {}, continuing stream",
                            run_id
                        );
                    }
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        debug!("Stopped streaming for session {}", run_id);
    });

    Ok(())
}

/// Load agent session history from JSONL file
#[tauri::command]
pub async fn load_agent_session_history(
    session_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    log::info!("Loading agent session history for session: {}", session_id);

    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let projects_dir = claude_dir.join("projects");

    if !projects_dir.exists() {
        log::error!("Projects directory not found at: {:?}", projects_dir);
        return Err("Projects directory not found".to_string());
    }

    let mut session_file_path = None;
    log::info!(
        "Searching for session file {} in all project directories",
        session_id
    );

    if let Ok(entries) = std::fs::read_dir(&projects_dir) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                let potential_session_file = path.join(format!("{}.jsonl", session_id));
                if potential_session_file.exists() {
                    log::info!("Found session file at: {:?}", potential_session_file);
                    session_file_path = Some(potential_session_file);
                    break;
                }
            }
        }
    } else {
        log::error!("Failed to read projects directory");
    }

    if let Some(session_path) = session_file_path {
        let file = std::fs::File::open(&session_path)
            .map_err(|e| format!("Failed to open session file: {}", e))?;

        let reader = BufReader::new(file);
        let mut messages = Vec::new();

        for line in reader.lines() {
            if let Ok(line) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) {
                    messages.push(json);
                }
            }
        }

        Ok(messages)
    } else {
        Err(format!("Session file not found: {}", session_id))
    }
}
