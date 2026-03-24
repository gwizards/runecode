/// `/api/checkpoints/*` route handlers — wired to the real CheckpointManager.

use axum::extract::{Path, Query, State as AxumState};
use axum::http::StatusCode;
use axum::response::IntoResponse;

use crate::web_server::AppState;

// Re-export all handlers from the diff/session submodule so that
// `use http::checkpoints::*` in web_server.rs continues to work.
pub use super::checkpoints_diff::*;

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
pub fn validate_session_id(
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
pub fn guard_project_path(
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
// Clear checkpoint manager
// ---------------------------------------------------------------------------

pub async fn clear_checkpoint_manager(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let session_id = params.get("sessionId").cloned().unwrap_or_default();
    if !session_id.is_empty() {
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
