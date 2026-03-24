/// Continue, resume, and agent-mode execution handlers for Claude WebSocket sessions.
///
/// Split from `executor.rs` to stay within the 500-line file budget.

use log::{debug, error};
use serde_json::json;

use crate::web_server::AppState;

use super::executor::{send_to_session, validate_model};

// ---------------------------------------------------------------------------
// continue_claude_command
// ---------------------------------------------------------------------------

pub async fn continue_claude_command(
    project_path: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    // Guard project_path against directory traversal outside home
    let guarded_project_path =
        crate::path_guard::require_within_home(std::path::Path::new(&project_path))
            .map_err(|e| format!("project_path rejected: {e}"))?;
    let project_path = guarded_project_path.to_string_lossy().into_owned();

    validate_model(&model)?;

    send_to_session(
        &state,
        &session_id,
        json!({
            "type": "start",
            "message": "Continuing Claude session..."
        })
        .to_string(),
    )
    .await;

    let claude_path =
        crate::web_server::find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;

    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<&str> = vec![
        "-c", // Continue flag
        "-p", &prompt,
    ];
    if !model.is_empty() {
        args.push("--model");
        args.push(&model);
    }
    args.extend_from_slice(&["--output-format", "stream-json", "--verbose"]);
    if bypass_permissions {
        args.push("--dangerously-skip-permissions");
    }
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state
            .active_pids
            .lock()
            .await
            .insert(session_id.clone(), pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stdout_reader = BufReader::new(stdout);

    let mut lines = stdout_reader.lines();
    while let Some(line_result) = lines.next_line().await.transpose() {
        match line_result {
            Ok(line) => {
                send_to_session(
                    &state,
                    &session_id,
                    json!({ "type": "output", "content": line }).to_string(),
                )
                .await;
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

    let exit_status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for Claude: {}", e))?;
    state.active_pids.lock().await.remove(&session_id);
    if !exit_status.success() {
        return Err(format!(
            "Claude execution failed with exit code: {:?}",
            exit_status.code()
        ));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// resume_claude_command
// ---------------------------------------------------------------------------

pub async fn resume_claude_command(
    project_path: String,
    claude_session_id: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    // Guard project_path and validate session id component
    let guarded_project_path =
        crate::path_guard::require_within_home(std::path::Path::new(&project_path))
            .map_err(|e| format!("project_path rejected: {e}"))?;
    let project_path = guarded_project_path.to_string_lossy().into_owned();

    // Validate claude_session_id is a safe single path component (no traversal, no shell meta)
    if claude_session_id.contains('/')
        || claude_session_id.contains('\\')
        || claude_session_id.contains("..")
        || claude_session_id.contains('\0')
        || claude_session_id.is_empty()
    {
        return Err("claude_session_id contains invalid characters".to_string());
    }

    debug!(
        "[resume_claude_command] Starting with project_path: {}, claude_session_id: {}, prompt: {}, model: {}",
        project_path, claude_session_id, prompt, model
    );

    send_to_session(
        &state,
        &session_id,
        json!({
            "type": "start",
            "message": "Resuming Claude session..."
        })
        .to_string(),
    )
    .await;

    debug!("[resume_claude_command] Finding Claude binary...");
    let claude_path =
        crate::web_server::find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;
    debug!(
        "[resume_claude_command] Found Claude binary: {}",
        claude_path
    );

    debug!("[resume_claude_command] Creating command...");
    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<&str> = vec!["--resume", &claude_session_id, "-p", &prompt];
    if !model.is_empty() {
        args.push("--model");
        args.push(&model);
    }
    args.extend_from_slice(&["--output-format", "stream-json", "--verbose"]);
    if bypass_permissions {
        args.push("--dangerously-skip-permissions");
    }
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    debug!(
        "[resume_claude_command] Command: {} {:?} (in dir: {})",
        claude_path, args, project_path
    );

    debug!("[resume_claude_command] Spawning process...");
    let mut child = cmd.spawn().map_err(|e| {
        let error = format!("Failed to spawn Claude: {}", e);
        error!("[resume_claude_command] Spawn error: {}", error);
        error
    })?;
    debug!("[resume_claude_command] Process spawned successfully");

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state
            .active_pids
            .lock()
            .await
            .insert(session_id.clone(), pid);
        debug!(
            "[resume_claude_command] Registered PID {} for session {}",
            pid, session_id
        );
    }

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stdout_reader = BufReader::new(stdout);

    let mut lines = stdout_reader.lines();
    while let Some(line_result) = lines.next_line().await.transpose() {
        match line_result {
            Ok(line) => {
                send_to_session(
                    &state,
                    &session_id,
                    json!({ "type": "output", "content": line }).to_string(),
                )
                .await;
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

    let exit_status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for Claude: {}", e))?;
    state.active_pids.lock().await.remove(&session_id);
    if !exit_status.success() {
        return Err(format!(
            "Claude execution failed with exit code: {:?}",
            exit_status.code()
        ));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// execute_claude_agent_command
// ---------------------------------------------------------------------------

/// Spawn Claude as a named agent using the `--agent` flag.
pub async fn execute_claude_agent_command(
    project_path: String,
    agent_name: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    // Guard project_path against directory traversal outside home
    let guarded_project_path =
        crate::path_guard::require_within_home(std::path::Path::new(&project_path))
            .map_err(|e| format!("project_path rejected: {e}"))?;
    let project_path = guarded_project_path.to_string_lossy().into_owned();

    validate_model(&model)?;

    log::info!(
        "[WS] execute_claude_agent_command -- agent: {}  project: {}",
        agent_name,
        project_path
    );

    send_to_session(
        &state,
        &session_id,
        json!({
            "type": "start",
            "message": format!("Starting agent session: {}", agent_name)
        })
        .to_string(),
    )
    .await;

    let claude_path =
        crate::web_server::find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;

    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<String> = vec![
        "--agent".to_string(),
        agent_name.clone(),
        "-p".to_string(),
        prompt.clone(),
    ];
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

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude agent: {}", e))?;

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state
            .active_pids
            .lock()
            .await
            .insert(session_id.clone(), pid);
        debug!(
            "[WS] Agent PID {} registered for session {}",
            pid, session_id
        );
    }

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stderr = child.stderr.take();
    let stdout_reader = BufReader::new(stdout);

    // Drain stderr into the session channel.
    let st_err = state.clone();
    let sid_err = session_id.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let mut lines = BufReader::new(stderr).lines();
            while let Some(line_result) = lines.next_line().await.transpose() {
                match line_result {
                    Ok(line) => {
                        send_to_session(
                            &st_err,
                            &sid_err,
                            json!({ "type": "output", "content": format!("[stderr] {}", line) })
                                .to_string(),
                        )
                        .await;
                    }
                    Err(e) => {
                        error!("I/O error reading Claude agent stderr: {e}");
                        break;
                    }
                }
            }
        }
    });

    let mut lines = stdout_reader.lines();
    while let Some(line_result) = lines.next_line().await.transpose() {
        match line_result {
            Ok(line) => {
                send_to_session(
                    &state,
                    &session_id,
                    json!({ "type": "output", "content": line }).to_string(),
                )
                .await;
            }
            Err(e) => {
                error!("I/O error reading Claude agent output: {e}");
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

    let _ = stderr_task.await;
    let exit_status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for Claude agent: {}", e))?;
    state.active_pids.lock().await.remove(&session_id);

    if !exit_status.success() {
        return Err(format!(
            "Claude agent execution failed with exit code: {:?}",
            exit_status.code()
        ));
    }

    Ok(())
}
