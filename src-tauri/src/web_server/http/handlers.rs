//! Route handler functions for the web server.
//!
//! These handlers are used by the Axum router defined in [`super::super`] and
//! cover projects, auth, settings, resources, integrations, slash commands, and
//! miscellaneous endpoints.

use axum::extract::{Path, Query};
use axum::response::{IntoResponse, Json};
use std::time::Duration;

use crate::claude_binary::silent_command;
use crate::commands;
use crate::web_server::ApiResponse;

// ---------------------------------------------------------------------------
// Project and auth handlers
// ---------------------------------------------------------------------------

pub async fn get_projects(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<Vec<commands::claude::Project>>> {
    let wsl_distro = params.get("wslDistro").or(params.get("wsl_distro")).cloned();
    match commands::claude::list_projects(wsl_distro).await {
        Ok(projects) => Json(ApiResponse::success(projects)),
        Err(e) => Json(ApiResponse::error(e.to_string())),
    }
}

pub async fn get_sessions(
    Path(project_id): Path<String>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<Vec<commands::claude::Session>>> {
    let wsl_distro = params.get("wslDistro").or(params.get("wsl_distro")).cloned();
    match commands::claude::get_project_sessions(project_id, wsl_distro).await {
        Ok(sessions) => Json(ApiResponse::success(sessions)),
        Err(e) => Json(ApiResponse::error(e.to_string())),
    }
}

pub async fn get_auth_status() -> impl IntoResponse {
    let default_response = serde_json::json!({
        "loggedIn": false,
        "subscriptionType": "unknown"
    });

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            silent_command("claude")
                .args(["auth", "status"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            match serde_json::from_str::<serde_json::Value>(&stdout) {
                Ok(json) => axum::Json(ApiResponse::success(json)).into_response(),
                Err(_) => axum::Json(ApiResponse::success(default_response)).into_response(),
            }
        }
        _ => axum::Json(ApiResponse::success(default_response)).into_response(),
    }
}

// ---------------------------------------------------------------------------
// Settings handlers
// ---------------------------------------------------------------------------

pub async fn get_claude_settings() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "data": {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 8192,
            "temperature": 0.0,
            "auto_save": true,
            "theme": "dark"
        }
    })))
}

pub async fn check_claude_version() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "status": "ok",
        "version": "web-mode",
        "message": "Running in web server mode"
    })))
}

pub async fn list_claude_installations(
) -> Json<ApiResponse<Vec<crate::claude_binary::ClaudeInstallation>>> {
    let installations =
        tokio::task::spawn_blocking(crate::claude_binary::discover_claude_installations)
            .await
            .unwrap_or_default();

    if installations.is_empty() {
        Json(ApiResponse::error(
            "No Claude Code installations found on the system".to_string(),
        ))
    } else {
        Json(ApiResponse::success(installations))
    }
}

pub async fn get_claude_binary_path_web() -> impl IntoResponse {
    match crate::web_server::find_claude_binary_web() {
        Ok(path) => axum::Json(serde_json::json!({
            "success": true,
            "data": { "path": path },
            "error": null
        })),
        Err(e) => axum::Json(serde_json::json!({
            "success": true,
            "data": { "path": null },
            "error": e
        })),
    }
}

pub async fn get_system_prompt() -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(
        "You are Claude, an AI assistant created by Anthropic. \
         You are running in web server mode."
            .to_string(),
    ))
}

pub async fn save_claude_settings_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Saving settings is not yet available in web mode".to_string(),
    ))
}

pub async fn save_system_prompt_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Saving system prompt is not yet available in web mode".to_string(),
    ))
}

pub async fn set_claude_binary_path(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Setting binary path is not available in web mode".to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Resource and integration handlers
// ---------------------------------------------------------------------------

pub async fn get_resources() -> impl IntoResponse {
    match tokio::task::spawn_blocking(|| crate::commands::resources::get_system_resources()).await {
        Ok(r) => axum::Json(serde_json::to_value(r).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!({
            "cpuPercent": 0.0, "ramPercent": 0.0,
            "ramUsedGb": 0.0,  "ramTotalGb": 0.0
        }))
        .into_response(),
    }
}

pub async fn get_integrations() -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let config_path = format!("{}/.runecode/integrations.json", home);
        match std::fs::read_to_string(&config_path) {
            Ok(content) => serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|_| serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        }
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({}));
    axum::Json(result)
}

pub async fn save_integrations(
    axum::Json(config): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(move || {
        let home = std::env::var("HOME").unwrap_or_default();
        let dir_path = format!("{}/.runecode", home);
        let config_path = format!("{}/integrations.json", dir_path);
        let _ = std::fs::create_dir_all(&dir_path);
        match serde_json::to_string_pretty(&config) {
            Ok(content) => match std::fs::write(&config_path, content) {
                Ok(_) => Ok(()),
                Err(e) => Err((axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
            },
            Err(e) => Err((axum::http::StatusCode::BAD_REQUEST, e.to_string())),
        }
    })
    .await;

    match result {
        Ok(Ok(())) => axum::http::StatusCode::OK.into_response(),
        Ok(Err((status, msg))) => (status, msg).into_response(),
        Err(_) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Task failed".to_string(),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Slash command handlers (stubs)
// ---------------------------------------------------------------------------

pub async fn list_slash_commands(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

pub async fn get_slash_command(
    Path(_command_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Slash command not found".to_string()))
}

pub async fn save_slash_command(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Slash command management is not yet available in web mode".to_string(),
    ))
}

pub async fn delete_slash_command(
    Path(_command_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Slash command management is not yet available in web mode".to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Project handlers
// ---------------------------------------------------------------------------

pub async fn init_project(axum::Json(body): axum::Json<serde_json::Value>) -> impl IntoResponse {
    let path = body
        .get("path")
        .and_then(|p| p.as_str())
        .unwrap_or_default()
        .to_string();
    let name = body
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("New Project")
        .to_string();

    let result = tokio::task::spawn_blocking(move || {
        crate::commands::project_info::initialize_project(path, name)
    })
    .await;

    match result {
        Ok(Ok(_)) => axum::http::StatusCode::OK.into_response(),
        Ok(Err(e)) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(_) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            "Task failed".to_string(),
        )
            .into_response(),
    }
}

pub async fn get_project_info(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let project_path = match params.get("path") {
        Some(p) if !p.is_empty() => p.clone(),
        _ => {
            return axum::Json(serde_json::json!({"error": "Missing 'path' query parameter"}))
                .into_response();
        }
    };

    let wsl_distro = params.get("wslDistro").cloned().filter(|s| !s.is_empty());

    let result = if let Some(distro) = wsl_distro {
        // WSL mode — skip path guard (Linux path cannot be canonicalized on Windows)
        if !project_path.starts_with('/') {
            return axum::Json(serde_json::json!({
                "error": "WSL project path must be an absolute Linux path"
            }))
            .into_response();
        }
        tokio::task::spawn_blocking(move || {
            crate::commands::project_info::collect_project_info_wsl(&project_path, &distro)
        })
        .await
    } else {
        if let Err(e) =
            crate::path_guard::require_within_home(std::path::Path::new(&project_path))
        {
            return axum::Json(serde_json::json!({
                "error": format!("Path outside home directory: {}", e)
            }))
            .into_response();
        }
        tokio::task::spawn_blocking(move || {
            crate::commands::project_info::collect_project_info(&project_path)
        })
        .await
    };

    match result {
        Ok(info) => axum::Json(serde_json::to_value(info).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!({"error": "Task failed"})).into_response(),
    }
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

pub async fn noop_ok() -> impl IntoResponse {
    axum::Json(serde_json::json!({ "success": true, "data": null, "error": null }))
}
