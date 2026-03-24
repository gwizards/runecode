/// `/api/checkpoints/*` route handlers — wired to the real CheckpointManager.

use axum::extract::{Path, Query, State as AxumState};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::checkpoint::storage::CheckpointStorage;
use crate::checkpoint::{CheckpointPaths, CheckpointStrategy};
use crate::web_server::AppState;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Extract common checkpoint params from query parameters.
pub fn extract_checkpoint_params(
    params: &std::collections::HashMap<String, String>,
) -> (String, String, String) {
    let session_id = params.get("sessionId").cloned().unwrap_or_default();
    let project_id = params.get("projectId").cloned().unwrap_or_default();
    let project_path = params.get("projectPath").cloned().unwrap_or_default();
    (session_id, project_id, project_path)
}

/// Validate a `session_id`: alphanumeric plus `-` and `_`, max 128 chars.
///
/// Empty strings pass (callers that require a non-empty session_id check separately).
fn validate_session_id(
    session_id: &str,
) -> Result<(), (StatusCode, axum::Json<serde_json::Value>)> {
    if session_id.is_empty() {
        return Ok(());
    }
    if session_id.len() > 128
        || !session_id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err((
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"error": "Invalid session_id"})),
        ));
    }
    Ok(())
}

/// Canonicalize `project_path` and verify it is within the user's home directory.
///
/// Returns the canonical `PathBuf` on success, or `Err((StatusCode, Json))` for early return.
fn guard_project_path(
    project_path: &str,
) -> Result<std::path::PathBuf, (StatusCode, axum::Json<serde_json::Value>)> {
    let pp = std::path::PathBuf::from(project_path);
    let canonical_pp = pp.canonicalize().map_err(|_| {
        (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({"error": "Invalid project path"})),
        )
    })?;

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let home_path = std::path::PathBuf::from(&home)
        .canonicalize()
        .unwrap_or_else(|_| std::path::PathBuf::from(&home));

    if !canonical_pp.starts_with(&home_path) {
        return Err((
            StatusCode::FORBIDDEN,
            axum::Json(serde_json::json!({"error": "Path outside home directory"})),
        ));
    }

    Ok(canonical_pp)
}

// ---------------------------------------------------------------------------
// List checkpoints
// ---------------------------------------------------------------------------

pub async fn list_checkpoints_handler(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": [], "error": null
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": [], "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": [],
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => {
            let checkpoints = mgr.list_checkpoints().await;
            axum::Json(serde_json::json!({
                "success": true, "data": checkpoints, "error": null
            }))
        }
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": [],
            "error": format!("Failed to list checkpoints: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Create checkpoint
// ---------------------------------------------------------------------------

pub async fn create_checkpoint_handler(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let description = params.get("description").cloned();

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId and projectPath are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => match mgr.create_checkpoint(description, None).await {
            Ok(result) => axum::Json(serde_json::json!({
                "success": true, "data": result, "error": null
            })),
            Err(e) => axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": format!("Failed to create checkpoint: {}", e)
            })),
        },
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to init checkpoint manager: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Restore checkpoint
// ---------------------------------------------------------------------------

pub async fn restore_checkpoint_handler(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let checkpoint_id = params.get("checkpointId").cloned().unwrap_or_default();

    if session_id.is_empty() || project_path.is_empty() || checkpoint_id.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId, projectPath, and checkpointId are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => match mgr.restore_checkpoint(&checkpoint_id).await {
            Ok(result) => axum::Json(serde_json::json!({
                "success": true, "data": result, "error": null
            })),
            Err(e) => axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": format!("Failed to restore checkpoint: {}", e)
            })),
        },
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to init checkpoint manager: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Get single checkpoint
// ---------------------------------------------------------------------------

pub async fn get_checkpoint_handler(
    AxumState(state): AxumState<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId and projectPath are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => {
            let checkpoints = mgr.list_checkpoints().await;
            let found = checkpoints.into_iter().find(|c| c.id == id);
            axum::Json(serde_json::json!({
                "success": true, "data": found, "error": null
            }))
        }
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to get checkpoint: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Get checkpoint diff
// ---------------------------------------------------------------------------

pub async fn get_checkpoint_diff_handler(
    AxumState(_state): AxumState<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let from_checkpoint_id = params.get("fromCheckpointId").cloned().unwrap_or_default();
    let to_checkpoint_id = if id == "diff" {
        params.get("toCheckpointId").cloned().unwrap_or_default()
    } else {
        id.clone()
    };

    if session_id.is_empty() || project_path.is_empty() || to_checkpoint_id.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId, projectPath, and checkpoint ID are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    // Wrap all disk I/O in spawn_blocking so the async executor is not stalled.
    let result = tokio::task::spawn_blocking(move || {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
        let claude_dir = std::path::PathBuf::from(&home).join(".claude");
        let storage = CheckpointStorage::new(claude_dir);

        storage
            .load_checkpoint(&project_id, &session_id, &to_checkpoint_id)
            .map(|(_cp, snapshots, _msgs)| {
                let mut modified_files = Vec::<serde_json::Value>::new();
                let mut added_files = Vec::<String>::new();
                let mut deleted_files = Vec::<String>::new();

                for snapshot in &snapshots {
                    let full_path = canonical_pp.join(&snapshot.file_path);
                    if snapshot.is_deleted {
                        if full_path.exists() {
                            deleted_files
                                .push(snapshot.file_path.to_string_lossy().to_string());
                        }
                    } else if full_path.exists() {
                        let current =
                            std::fs::read_to_string(&full_path).unwrap_or_default();
                        let hash = CheckpointStorage::calculate_file_hash(&current);
                        if hash != snapshot.hash {
                            modified_files.push(serde_json::json!({
                                "path": snapshot.file_path,
                                "additions": 0, "deletions": 0, "diffContent": null
                            }));
                        }
                    } else {
                        added_files
                            .push(snapshot.file_path.to_string_lossy().to_string());
                    }
                }
                (
                    from_checkpoint_id,
                    to_checkpoint_id,
                    modified_files,
                    added_files,
                    deleted_files,
                )
            })
    })
    .await;

    match result {
        Ok(Ok((from_id, to_id, modified_files, added_files, deleted_files))) => {
            axum::Json(serde_json::json!({
                "success": true,
                "data": {
                    "fromCheckpointId": from_id,
                    "toCheckpointId": to_id,
                    "modifiedFiles": modified_files,
                    "addedFiles": added_files,
                    "deletedFiles": deleted_files,
                    "tokenDelta": 0
                },
                "error": null
            }))
        }
        Ok(Err(e)) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to get checkpoint diff: {}", e)
        })),
        Err(_) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "Checkpoint diff task was cancelled"
        })),
    }
}

// ---------------------------------------------------------------------------
// Fork from checkpoint
// ---------------------------------------------------------------------------

pub async fn fork_from_checkpoint(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let checkpoint_id = params.get("checkpointId").cloned().unwrap_or_default();
    let description = params.get("description").cloned();

    if session_id.is_empty() || project_path.is_empty() || checkpoint_id.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId, projectPath, and checkpointId are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => match mgr.fork_from_checkpoint(&checkpoint_id, description).await {
            Ok(result) => axum::Json(serde_json::json!({
                "success": true, "data": result, "error": null
            })),
            Err(e) => axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": format!("Failed to fork from checkpoint: {}", e)
            })),
        },
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to init checkpoint manager: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Session timeline
// ---------------------------------------------------------------------------

pub async fn get_session_timeline(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true,
            "data": {
                "sessionId": "",
                "rootNode": null,
                "currentCheckpointId": null,
                "autoCheckpointEnabled": false,
                "checkpointStrategy": "smart",
                "totalCheckpoints": 0
            },
            "error": null
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => {
            let timeline = mgr.get_timeline().await;
            axum::Json(serde_json::json!({
                "success": true, "data": timeline, "error": null
            }))
        }
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to get session timeline: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Update checkpoint settings
// ---------------------------------------------------------------------------

pub async fn update_checkpoint_settings(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let auto_enabled = params
        .get("autoCheckpointEnabled")
        .map(|v| v == "true")
        .unwrap_or(false);
    let strategy_str = params
        .get("checkpointStrategy")
        .cloned()
        .unwrap_or_else(|| "smart".to_string());
    let strategy = match strategy_str.as_str() {
        "manual" => CheckpointStrategy::Manual,
        "per_prompt" => CheckpointStrategy::PerPrompt,
        "per_tool_use" => CheckpointStrategy::PerToolUse,
        _ => CheckpointStrategy::Smart,
    };

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId and projectPath are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => match mgr.update_settings(auto_enabled, strategy).await {
            Ok(_) => axum::Json(serde_json::json!({
                "success": true, "data": null, "error": null
            })),
            Err(e) => axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": format!("Failed to update settings: {}", e)
            })),
        },
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to init checkpoint manager: {}", e)
        })),
    }
}

// ---------------------------------------------------------------------------
// Track checkpoint message
// ---------------------------------------------------------------------------

pub async fn track_checkpoint_message(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let message = params.get("message").cloned().unwrap_or_default();

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": null, "error": null
        }));
    }

    if validate_session_id(&session_id).is_err() {
        return axum::Json(serde_json::json!({
            "success": true, "data": null, "error": null
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err(_) => {
            return axum::Json(serde_json::json!({
                "success": true, "data": null, "error": null
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    if let Ok(mgr) = cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        let _ = mgr.track_message(message).await;
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

// ---------------------------------------------------------------------------
// Check auto checkpoint
// ---------------------------------------------------------------------------

pub async fn check_auto_checkpoint(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let message = params.get("message").cloned().unwrap_or_default();

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": false, "error": null
        }));
    }

    if validate_session_id(&session_id).is_err() {
        return axum::Json(serde_json::json!({
            "success": true, "data": false, "error": null
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err(_) => {
            return axum::Json(serde_json::json!({
                "success": true, "data": false, "error": null
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => {
            let should = mgr.should_auto_checkpoint(&message).await;
            axum::Json(serde_json::json!({
                "success": true, "data": should, "error": null
            }))
        }
        Err(_) => axum::Json(serde_json::json!({
            "success": true, "data": false, "error": null
        })),
    }
}

// ---------------------------------------------------------------------------
// Cleanup old checkpoints
// ---------------------------------------------------------------------------

pub async fn cleanup_old_checkpoints(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let keep_count: usize = params
        .get("keepCount")
        .and_then(|v| v.parse().ok())
        .unwrap_or(10);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": 0, "error": null
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": 0, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": 0,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs
        .get_or_create_manager(session_id.clone(), project_id.clone(), canonical_pp)
        .await
    {
        Ok(mgr) => {
            match mgr
                .storage
                .cleanup_old_checkpoints(&project_id, &session_id, keep_count)
            {
                Ok(count) => axum::Json(serde_json::json!({
                    "success": true, "data": count, "error": null
                })),
                Err(e) => axum::Json(serde_json::json!({
                    "success": false, "data": 0,
                    "error": format!("Failed to cleanup checkpoints: {}", e)
                })),
            }
        }
        Err(_) => axum::Json(serde_json::json!({
            "success": true, "data": 0, "error": null
        })),
    }
}

// ---------------------------------------------------------------------------
// Get checkpoint settings
// ---------------------------------------------------------------------------

pub async fn get_checkpoint_settings(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true,
            "data": {
                "enabled": false,
                "auto_checkpoint": false,
                "interval_messages": 10
            },
            "error": null
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err((_status, err_json)) => {
            return axum::Json(serde_json::json!({
                "success": false, "data": null,
                "error": err_json["error"]
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    match cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        Ok(mgr) => {
            let timeline = mgr.get_timeline().await;
            axum::Json(serde_json::json!({
                "success": true,
                "data": {
                    "enabled": true,
                    "auto_checkpoint": timeline.auto_checkpoint_enabled,
                    "checkpoint_strategy": timeline.checkpoint_strategy,
                    "interval_messages": 10
                },
                "error": null
            }))
        }
        Err(_) => axum::Json(serde_json::json!({
            "success": true,
            "data": {
                "enabled": false,
                "auto_checkpoint": false,
                "interval_messages": 10
            },
            "error": null
        })),
    }
}

// ---------------------------------------------------------------------------
// Delete checkpoint
// ---------------------------------------------------------------------------

pub async fn delete_checkpoint(
    AxumState(state): AxumState<AppState>,
    Path(id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, _project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_id.is_empty() {
        return axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": "sessionId and projectId are required"
        }));
    }

    if let Err((_status, err_json)) = validate_session_id(&session_id) {
        return axum::Json(serde_json::json!({
            "success": false, "data": null, "error": err_json["error"]
        }));
    }

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let claude_dir = std::path::PathBuf::from(&home).join(".claude");
    let paths = CheckpointPaths::new(&claude_dir, &project_id, &session_id);

    let checkpoint_dir = paths.checkpoint_dir(&id);
    let refs_dir = paths.files_dir.join("refs").join(&id);

    // Wrap remove_dir_all in spawn_blocking — directory removal can block on disk I/O.
    let _ = tokio::task::spawn_blocking(move || {
        let _ = std::fs::remove_dir_all(&checkpoint_dir);
        let _ = std::fs::remove_dir_all(&refs_dir);
    })
    .await;

    // Evict cached manager so it reloads from disk
    state
        .checkpoint_state
        .remove_manager(&session_id)
        .await;

    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

// ---------------------------------------------------------------------------
// Clear checkpoint manager
// ---------------------------------------------------------------------------

pub async fn clear_checkpoint_manager(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let session_id = params.get("sessionId").cloned().unwrap_or_default();
    if !session_id.is_empty() {
        // Silently ignore invalid session_ids for this eviction-only endpoint.
        if validate_session_id(&session_id).is_ok() {
            state
                .checkpoint_state
                .remove_manager(&session_id)
                .await;
        }
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

// ---------------------------------------------------------------------------
// Track session messages
// ---------------------------------------------------------------------------

pub async fn track_session_messages(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);
    let messages = params.get("messages").cloned().unwrap_or_default();

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": null, "error": null
        }));
    }

    if validate_session_id(&session_id).is_err() {
        return axum::Json(serde_json::json!({
            "success": true, "data": null, "error": null
        }));
    }

    let canonical_pp = match guard_project_path(&project_path) {
        Ok(p) => p,
        Err(_) => {
            return axum::Json(serde_json::json!({
                "success": true, "data": null, "error": null
            }));
        }
    };

    let cs = state.checkpoint_state.clone();
    if let Ok(mgr) = cs.get_or_create_manager(session_id, project_id, canonical_pp).await {
        for line in messages.lines() {
            let _ = mgr.track_message(line.to_string()).await;
        }
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}
