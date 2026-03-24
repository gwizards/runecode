/// Claude process execution functions for WebSocket streaming.
///
/// Contains the core functions that spawn Claude child processes and stream
/// their output back to the WebSocket session channel.

use log::{debug, error, warn};
use serde_json::json;
use std::time::Duration;

use crate::web_server::AppState;

// Re-export all handlers from the resume/agent submodule so that
// `use super::executor::*` in handler.rs continues to work.
pub use super::executor_resume::*;

// ---------------------------------------------------------------------------
// Allowed models whitelist (defence-in-depth)
// ---------------------------------------------------------------------------

const ALLOWED_MODELS: &[&str] = &[
    "claude-opus-4-5",
    "claude-opus-4-6",
    "claude-sonnet-4-5",
    "claude-sonnet-4-6",
    "claude-haiku-4-5",
    "claude-haiku-4-5-20251001",
];

pub fn validate_model(model: &str) -> Result<(), String> {
    if !model.is_empty() && !ALLOWED_MODELS.iter().any(|m| model.starts_with(m)) {
        return Err(format!("Invalid model: {}", model));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// send_to_session
// ---------------------------------------------------------------------------

pub async fn send_to_session(state: &AppState, session_id: &str, message: String) {
    debug!("[TRACE] send_to_session called for session: {}", session_id);
    debug!("[TRACE] Message: {}", message);

    let sessions = state.active_sessions.lock().await;
    if let Some(sender) = sessions.get(session_id) {
        debug!("[TRACE] Found session in active sessions, sending message...");
        match sender.send(message).await {
            Ok(_) => debug!("[TRACE] Message sent successfully"),
            Err(e) => warn!("[TRACE] Failed to send message: {}", e),
        }
    } else {
        warn!(
            "[TRACE] Session {} not found in active sessions",
            session_id
        );
        debug!(
            "[TRACE] Active sessions: {:?}",
            sessions.keys().collect::<Vec<_>>()
        );
    }
}

// ---------------------------------------------------------------------------
// interrupt_session_process
// ---------------------------------------------------------------------------

/// Send SIGTERM to the Claude child process tracked for `ws_session_id`.
/// On UNIX: SIGTERM immediately, then SIGKILL after 3 s if still alive.
/// On Windows: `taskkill /F /PID <pid>`.
pub async fn interrupt_session_process(state: &AppState, ws_session_id: &str) {
    let pid_opt = state.active_pids.lock().await.get(ws_session_id).copied();
    let Some(pid) = pid_opt else {
        warn!(
            "[WS] interrupt_session_process: no PID for {}",
            ws_session_id
        );
        return;
    };
    log::info!(
        "[WS] Interrupting PID {} for session {}",
        pid,
        ws_session_id
    );

    #[cfg(unix)]
    {
        // SIGTERM first.
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
        // Spawn a watchdog that escalates to SIGKILL after 3 s.
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let still_alive = unsafe { libc::kill(pid as libc::pid_t, 0) } == 0;
            if still_alive {
                unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
                warn!("[WS] SIGKILL sent to PID {} (escalation after timeout)", pid);
            } else {
                debug!("[WS] PID {} already exited; skipping SIGKILL", pid);
            }
        });
    }

    #[cfg(windows)]
    {
        let _ = crate::claude_binary::silent_command("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .status();
        log::info!("[WS] taskkill /F /PID {}", pid);
    }
}

// ---------------------------------------------------------------------------
// ws_send_completion
// ---------------------------------------------------------------------------

/// Serialise and send the turn-completion event over the session channel.
pub async fn ws_send_completion(
    state: &AppState,
    ws_session_id: &str,
    result: Result<(), String>,
) {
    debug!(
        "[WS] ws_send_completion for {}: {:?}",
        ws_session_id, result
    );
    let msg = match result {
        Ok(_) => json!({ "type": "completion", "status": "success" }),
        Err(e) => json!({ "type": "completion", "status": "error", "error": e }),
    };
    let sessions = state.active_sessions.lock().await;
    if let Some(tx) = sessions.get(ws_session_id) {
        let _ = tx.send(msg.to_string()).await;
    }
}

// ---------------------------------------------------------------------------
// execute_claude_command
// ---------------------------------------------------------------------------

pub async fn execute_claude_command(
    project_path: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    debug!(
        "[TRACE] execute_claude_command called: project_path={} prompt_len={} model={} session_id={}",
        project_path,
        prompt.len(),
        model,
        session_id
    );

    // Guard project_path against directory traversal outside home
    let guarded_project_path =
        crate::path_guard::require_within_home(std::path::Path::new(&project_path))
            .map_err(|e| format!("project_path rejected: {e}"))?;
    let project_path = guarded_project_path.to_string_lossy().into_owned();

    validate_model(&model)?;

    // Send initial message
    debug!("[TRACE] Sending initial start message");
    send_to_session(
        &state,
        &session_id,
        json!({
            "type": "start",
            "message": "Starting Claude execution..."
        })
        .to_string(),
    )
    .await;

    // Find Claude binary (simplified for web mode)
    debug!("[TRACE] Finding Claude binary...");
    let claude_path = crate::web_server::find_claude_binary_web().map_err(|e| {
        let error = format!("Claude binary not found: {}", e);
        error!("[TRACE] Error finding Claude binary: {}", error);
        error
    })?;
    debug!("[TRACE] Found Claude binary: {}", claude_path);

    // Create Claude command
    debug!("[TRACE] Creating Claude command...");
    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<String> = vec!["-p".to_string(), prompt.clone()];
    if !model.is_empty() {
        args.push("--model".to_string());
        args.push(model.clone());
    }
    args.extend_from_slice(&[
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ]);
    if bypass_permissions {
        args.push("--dangerously-skip-permissions".to_string());
    }
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    debug!(
        "[TRACE] Command: {} {:?} (in dir: {})",
        claude_path, args, project_path
    );

    // Spawn Claude process
    debug!("[TRACE] Spawning Claude process...");
    let mut child = cmd.spawn().map_err(|e| {
        let error = format!("Failed to spawn Claude: {}", e);
        error!("[TRACE] Spawn error: {}", error);
        error
    })?;
    debug!("[TRACE] Claude process spawned successfully");

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state
            .active_pids
            .lock()
            .await
            .insert(session_id.clone(), pid);
        debug!(
            "[TRACE] Registered PID {} for session {}",
            pid, session_id
        );
    }

    // Get stdout and stderr for streaming
    let stdout = child.stdout.take().ok_or_else(|| {
        error!("[TRACE] Failed to get stdout from child process");
        "Failed to get stdout".to_string()
    })?;
    let stderr = child.stderr.take();
    let stdout_reader = BufReader::new(stdout);

    // Spawn stderr reader to capture error output
    let state_for_stderr = state.clone();
    let session_id_for_stderr = session_id.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let stderr_reader = BufReader::new(stderr);
            let mut lines = stderr_reader.lines();
            while let Some(line_result) = lines.next_line().await.transpose() {
                match line_result {
                    Ok(line) => {
                        debug!("[TRACE] Claude stderr: {}", line);
                        let message =
                            json!({ "type": "output", "content": format!("[stderr] {}", line) })
                                .to_string();
                        send_to_session(&state_for_stderr, &session_id_for_stderr, message).await;
                    }
                    Err(e) => {
                        error!("I/O error reading Claude stderr: {e}");
                        break;
                    }
                }
            }
        }
    });

    debug!("[TRACE] Starting to read Claude output...");
    let mut lines = stdout_reader.lines();
    let mut line_count = 0;
    while let Some(line_result) = lines.next_line().await.transpose() {
        match line_result {
            Ok(line) => {
                line_count += 1;
                debug!("[TRACE] Claude output line {}: {}", line_count, line);

                let message =
                    json!({ "type": "output", "content": line }).to_string();
                send_to_session(&state, &session_id, message).await;
            }
            Err(e) => {
                error!("I/O error reading Claude output: {e}");
                send_to_session(
                    &state,
                    &session_id,
                    json!({ "type": "error", "content": format!("I/O error: {e}") }).to_string(),
                )
                .await;
                break;
            }
        }
    }

    debug!(
        "[TRACE] Finished reading Claude output ({} lines total)",
        line_count
    );

    let _ = stderr_task.await;
    debug!("[TRACE] Waiting for Claude process to complete...");
    let exit_status = child.wait().await.map_err(|e| {
        let error = format!("Failed to wait for Claude: {}", e);
        error!("[TRACE] Wait error: {}", error);
        error
    })?;

    debug!(
        "[TRACE] Claude process completed with status: {:?}",
        exit_status
    );

    state.active_pids.lock().await.remove(&session_id);

    if !exit_status.success() {
        let error = format!(
            "Claude execution failed with exit code: {:?}",
            exit_status.code()
        );
        error!("[TRACE] Claude execution failed: {}", error);
        return Err(error);
    }

    debug!("[TRACE] execute_claude_command completed successfully");
    Ok(())
}
