/// `/api/agents/*` route handlers — stubs for web mode.

use axum::extract::{Path, Query};
use axum::response::Json;

use crate::web_server::ApiResponse;

pub async fn get_agents() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn get_live_agents() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!([]))
}

pub async fn get_agent_by_id(Path(_id): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent not found".to_string()))
}

pub async fn update_agent(
    Path(_id): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent management is not yet available in web mode".to_string(),
    ))
}

pub async fn delete_agent_handler(
    Path(_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent management is not yet available in web mode".to_string(),
    ))
}

pub async fn create_agent_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent creation is not yet available in web mode".to_string(),
    ))
}

pub async fn export_agent(Path(_id): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error("Agent not found".to_string()))
}

pub async fn import_agent_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent import is not yet available in web mode".to_string(),
    ))
}

pub async fn import_agent_from_file_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent import is not yet available in web mode".to_string(),
    ))
}

pub async fn fetch_github_agents() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn fetch_github_agent_content(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "GitHub agent fetching is not yet available in web mode".to_string(),
    ))
}

pub async fn import_agent_from_github_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "GitHub agent import is not yet available in web mode".to_string(),
    ))
}

pub async fn execute_agent_handler(
    Path(_agent_id): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent execution is not yet available in web mode".to_string(),
    ))
}

pub async fn list_agent_runs() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn get_agent_run(Path(_id): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent run not found".to_string()))
}

pub async fn get_agent_run_metrics(
    Path(_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent run not found".to_string()))
}

pub async fn kill_agent_session(Path(_run_id): Path<String>) -> Json<ApiResponse<bool>> {
    Json(ApiResponse::error(
        "Agent session management is not available in web mode".to_string(),
    ))
}

pub async fn get_agent_session_status(
    Path(_run_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!(null)))
}

pub async fn cleanup_finished_processes() -> Json<ApiResponse<Vec<i64>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn get_agent_session_output(Path(_run_id): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(String::new()))
}

pub async fn get_live_agent_session_output(
    Path(_run_id): Path<String>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(String::new()))
}

pub async fn stream_agent_session_output(Path(_run_id): Path<String>) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Streaming not available in web mode".to_string(),
    ))
}

pub async fn load_agent_session_history(
    Path(_session_id): Path<String>,
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}
