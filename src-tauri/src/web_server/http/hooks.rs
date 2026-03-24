/// `/api/hooks/*` and `/api/settings/proxy` route handlers — stubs for web mode.

use axum::extract::Query;

use crate::web_server::ApiResponse;

pub async fn get_hooks_config(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::success(serde_json::json!({
        "hooks": {}
    })))
}

pub async fn update_hooks_config(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<String>> {
    axum::Json(ApiResponse::error(
        "Hook configuration is not available in web mode".to_string(),
    ))
}

pub async fn validate_hook_command(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::success(serde_json::json!({
        "valid": true,
        "message": "Validation not available in web mode"
    })))
}

pub async fn get_proxy_settings() -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::success(serde_json::json!({
        "enabled": false,
        "http_proxy": null,
        "https_proxy": null,
        "no_proxy": null,
        "all_proxy": null
    })))
}

pub async fn save_proxy_settings(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> axum::Json<ApiResponse<String>> {
    axum::Json(ApiResponse::error(
        "Proxy settings are not available in web mode".to_string(),
    ))
}
