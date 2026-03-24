use std::sync::{Arc, Mutex};

use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::ClaudeProcessState;

/// Spawns a Claude process and wires up streaming stdout/stderr to Tauri events.
pub(super) async fn spawn_claude_process(
    app: AppHandle,
    mut cmd: Command,
    prompt: String,
    model: String,
    project_path: String,
) -> Result<(), String> {
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to get stderr")?;
    let pid = child.id().unwrap_or(0);
    log::info!("Spawned Claude process with PID: {:?}", pid);

    let stdout_reader = BufReader::new(stdout);
    let stderr_reader = BufReader::new(stderr);

    let session_id_holder: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let run_id_holder: Arc<Mutex<Option<i64>>> = Arc::new(Mutex::new(None));

    // Store child in global state (backward compat), replacing any existing process.
    let claude_state = app.state::<ClaudeProcessState>();
    {
        let mut current = claude_state.current_process.lock().await;
        if let Some(mut existing) = current.take() {
            log::warn!("Killing existing Claude process before starting new one");
            let _ = existing.kill().await;
        }
        *current = Some(child);
    }

    let app_handle = app.clone();
    let sid_clone = session_id_holder.clone();
    let rid_clone = run_id_holder.clone();
    let registry = app.state::<crate::process::ProcessRegistryState>();
    let reg_clone = registry.0.clone();
    let path_clone = project_path.clone();
    let prompt_clone = prompt.clone();
    let model_clone = model.clone();

    let stdout_task = tokio::spawn(async move {
        let mut lines = stdout_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::debug!("Claude stdout: {}", line);
            // Extract session ID from the init message and register with ProcessRegistry.
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&line) {
                if msg["type"] == "system" && msg["subtype"] == "init" {
                    if let Some(csid) = msg["session_id"].as_str() {
                        let mut guard = sid_clone.lock().unwrap_or_else(|e| e.into_inner());
                        if guard.is_none() {
                            *guard = Some(csid.to_string());
                            log::info!("Extracted Claude session ID: {}", csid);
                            match reg_clone.register_claude_session(
                                csid.to_string(), pid,
                                path_clone.clone(), prompt_clone.clone(), model_clone.clone(),
                            ) {
                                Ok(run_id) => {
                                    log::info!("Registered Claude session with run_id: {}", run_id);
                                    *rid_clone.lock().unwrap_or_else(|e| e.into_inner()) = Some(run_id);
                                }
                                Err(e) => log::error!("Failed to register Claude session: {}", e),
                            }
                        }
                    }
                }
            }
            if let Some(run_id) = *rid_clone.lock().unwrap_or_else(|e| e.into_inner()) {
                let _ = reg_clone.append_live_output(run_id, &line);
            }
            if let Some(ref sid) = *sid_clone.lock().unwrap_or_else(|e| e.into_inner()) {
                let _ = app_handle.emit(&format!("claude-output:{}", sid), &line);
            }
            let _ = app_handle.emit("claude-output", &line);
        }
    });

    let app_stderr = app.clone();
    let sid_clone2 = session_id_holder.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = stderr_reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            log::error!("Claude stderr: {}", line);
            if let Some(ref sid) = *sid_clone2.lock().unwrap_or_else(|e| e.into_inner()) {
                let _ = app_stderr.emit(&format!("claude-error:{}", sid), &line);
            }
            let _ = app_stderr.emit("claude-error", &line);
        }
    });

    let app_wait = app.clone();
    let state_wait = claude_state.current_process.clone();
    let sid_clone3 = session_id_holder.clone();
    let rid_clone2 = run_id_holder.clone();
    let reg_clone2 = registry.0.clone();
    tokio::spawn(async move {
        let _ = stdout_task.await;
        let _ = stderr_task.await;

        let mut current = state_wait.lock().await;
        if let Some(mut child) = current.take() {
            let delay = tokio::time::Duration::from_millis(100);
            match child.wait().await {
                Ok(status) => {
                    log::info!("Claude process exited with status: {}", status);
                    tokio::time::sleep(delay).await;
                    if let Some(ref sid) = *sid_clone3.lock().unwrap_or_else(|e| e.into_inner()) {
                        let _ = app_wait.emit(&format!("claude-complete:{}", sid), status.success());
                    }
                    let _ = app_wait.emit("claude-complete", status.success());
                }
                Err(e) => {
                    log::error!("Failed to wait for Claude process: {}", e);
                    tokio::time::sleep(delay).await;
                    if let Some(ref sid) = *sid_clone3.lock().unwrap_or_else(|e| e.into_inner()) {
                        let _ = app_wait.emit(&format!("claude-complete:{}", sid), false);
                    }
                    let _ = app_wait.emit("claude-complete", false);
                }
            }
        }

        if let Some(run_id) = *rid_clone2.lock().unwrap_or_else(|e| e.into_inner()) {
            let _ = reg_clone2.unregister_process(run_id);
        }
        *current = None;
    });

    Ok(())
}
