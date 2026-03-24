/// `/api/storage/*` route handlers — stubs for web mode (no local SQLite in browser).

use axum::{extract::Path, response::IntoResponse};
use serde_json::json;

use crate::web_server::ApiResponse;

pub async fn get_storage_table(
    axum::extract::Path(_table_name): axum::extract::Path<String>,
) -> impl IntoResponse {
    axum::Json(json!({
        "success": true,
        "data": { "rows": [], "total": 0, "page": 1, "pageSize": 1000 },
        "error": null
    }))
}

pub async fn storage_list_tables() -> axum::Json<ApiResponse<Vec<serde_json::Value>>> {
    axum::Json(ApiResponse::success(vec![]))
}

pub async fn storage_update_row(
    Path((_table, _id)): Path<(String, String)>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<()>> {
    axum::Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

pub async fn storage_delete_row(
    Path((_table, _id)): Path<(String, String)>,
) -> axum::Json<ApiResponse<()>> {
    axum::Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

pub async fn storage_insert_row(
    Path(_table): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

pub async fn storage_execute_sql(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::error(
        "SQL execution is not available in web mode".to_string(),
    ))
}

pub async fn storage_reset_database() -> axum::Json<ApiResponse<()>> {
    axum::Json(ApiResponse::error(
        "Database reset is not available in web mode".to_string(),
    ))
}
