use axum::extract::Query;
use axum::response::IntoResponse;
use std::collections::HashMap;

use crate::commands::docker;

/// Handler for GET /api/resources/docker
/// Accepts optional ?wsl_distro=<name> query parameter.
pub async fn get_docker_handler(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let wsl_distro = params.get("wsl_distro").cloned().filter(|s| !s.is_empty());

    match docker::get_docker_stats(wsl_distro).await {
        Ok(stats) => axum::Json(serde_json::to_value(stats).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!({
            "available": false,
            "running": 0,
            "total": 0,
            "totalCpu": 0.0,
            "totalMemMb": 0.0,
            "containers": []
        }))
        .into_response(),
    }
}

/// Handler for GET /api/resources/processes
/// Accepts optional ?wsl_distro=<name> query parameter.
pub async fn get_processes_handler(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let wsl_distro = params.get("wsl_distro").cloned().filter(|s| !s.is_empty());

    match docker::get_running_processes(wsl_distro).await {
        Ok(data) => axum::Json(data).into_response(),
        Err(_) => {
            axum::Json(serde_json::json!({ "processes": [], "count": 0 })).into_response()
        }
    }
}
