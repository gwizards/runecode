/// `/api/sessions/*` route handlers.

use axum::extract::{Path, Query, State as AxumState};
use axum::response::Json;
use log::{debug, warn};

use crate::commands;
use crate::web_server::{ApiResponse, AppState};

pub async fn load_session_history(
    Path((session_id, project_id)): Path<(String, String)>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    let limit = params.get("limit").and_then(|l| l.parse::<usize>().ok());
    match commands::claude::load_session_history(session_id, project_id).await {
        Ok(history) => {
            let result = if let Some(limit) = limit {
                let len = history.len();
                if limit < len {
                    history.into_iter().skip(len - limit).collect()
                } else {
                    history
                }
            } else {
                history
            };
            Json(ApiResponse::success(result))
        }
        Err(e) => Json(ApiResponse::error(e.to_string())),
    }
}

pub async fn list_running_claude_sessions() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Execute Claude code — redirects to WebSocket in web mode.
pub async fn execute_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Claude execution in web mode uses the WebSocket endpoint at /ws/claude. \
         Connect via WebSocket to stream Claude sessions."
            .to_string(),
    ))
}

/// Continue Claude code — redirects to WebSocket in web mode.
pub async fn continue_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Claude continuation in web mode uses the WebSocket endpoint at /ws/claude. \
         Connect via WebSocket to stream Claude sessions."
            .to_string(),
    ))
}

/// Resume Claude code — redirects to WebSocket in web mode.
pub async fn resume_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Claude resume in web mode uses the WebSocket endpoint at /ws/claude. \
         Connect via WebSocket to stream Claude sessions."
            .to_string(),
    ))
}

pub async fn cancel_claude_execution(
    Path(session_id): Path<String>,
    AxumState(state): AxumState<AppState>,
) -> Json<ApiResponse<()>> {
    debug!("[TRACE] Cancel request for session: {}", session_id);
    let maybe_sender = {
        let sessions = state.active_sessions.lock().await;
        sessions.get(&session_id).cloned()
    };
    if let Some(sender) = maybe_sender {
        let _ = sender.send("__CANCEL__".to_string()).await;
        debug!("[TRACE] Cancel signal sent to session: {}", session_id);
    } else {
        warn!(
            "[TRACE] Session not found for cancel: {}",
            session_id
        );
    }
    Json(ApiResponse::success(()))
}

pub async fn get_claude_session_output(
    Path(session_id): Path<String>,
) -> Json<ApiResponse<String>> {
    debug!("[TRACE] Output request for session: {}", session_id);
    Json(ApiResponse::success(
        "Output available via WebSocket only".to_string(),
    ))
}

pub async fn open_new_session() -> Json<ApiResponse<String>> {
    let session_id = format!("web-session-{}", chrono::Utc::now().timestamp());
    Json(ApiResponse::success(session_id))
}
