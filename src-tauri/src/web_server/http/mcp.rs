/// `/api/mcp/*` route handlers — stubs for web mode.

use axum::extract::{Path, Query};
use axum::response::Json;

use crate::web_server::ApiResponse;

pub async fn mcp_list() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn mcp_get_server(Path(_name): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("MCP server not found".to_string()))
}

pub async fn mcp_remove_server(Path(_name): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

pub async fn mcp_add_server(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

pub async fn mcp_add_json(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

pub async fn mcp_import_claude_desktop(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP import is not available in web mode".to_string(),
    ))
}

pub async fn mcp_serve() -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP serve is not available in web mode".to_string(),
    ))
}

pub async fn mcp_test_connection(Path(_name): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP connection testing is not available in web mode".to_string(),
    ))
}

pub async fn mcp_reset_choices() -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP reset is not available in web mode".to_string(),
    ))
}

pub async fn mcp_get_status() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({})))
}

pub async fn mcp_read_project_config(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "mcpServers": {}
    })))
}

pub async fn mcp_save_project_config(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP project config save is not available in web mode".to_string(),
    ))
}
