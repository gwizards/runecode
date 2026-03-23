use axum::extract::ws::{Message, WebSocket};
use axum::extract::Query;
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use axum::http::Method;
use axum::{
    extract::{Path, State as AxumState, WebSocketUpgrade},
    response::{IntoResponse, Json, Response},
    routing::{get, post, put},
    Router,
};
use chrono;
use futures_util::{SinkExt, StreamExt};
use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use which;
use std::time::Duration;

#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;

use crate::checkpoint::state::CheckpointState;
use crate::checkpoint::storage::CheckpointStorage;
use crate::checkpoint::{CheckpointPaths, CheckpointStrategy};
use crate::commands;
use crate::ws_types::{WsClientMessage, WsServerMessage};

// Find Claude binary for web mode - use bundled binary first, then system paths
fn find_claude_binary_web() -> Result<String, String> {
    // First try the bundled binary (same location as Tauri app uses)
    let bundled_binary = "src-tauri/binaries/claude-code-x86_64-unknown-linux-gnu";
    if std::path::Path::new(bundled_binary).exists() {
        println!(
            "[find_claude_binary_web] Using bundled binary: {}",
            bundled_binary
        );
        return Ok(bundled_binary.to_string());
    }

    // Try 'which' for PATH-based lookup (handles "claude" and "claude-code")
    for name in &["claude", "claude-code"] {
        if let Ok(path) = which::which(name) {
            let path_str = path.to_string_lossy().to_string();
            println!(
                "[find_claude_binary_web] Found '{}' via PATH: {}",
                name, path_str
            );
            return Ok(path_str);
        }
    }

    // Fall back to well-known filesystem paths (check existence directly)
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = vec![
        format!("{}/.local/bin/claude", home),
        "/usr/local/bin/claude".to_string(),
        "/usr/bin/claude".to_string(),
        "/opt/homebrew/bin/claude".to_string(),
        format!("{}/.claude/local/claude", home),
        format!("{}/.npm-global/bin/claude", home),
    ];

    for candidate in &candidates {
        let path = std::path::Path::new(candidate);
        if path.exists() && path.is_file() {
            println!(
                "[find_claude_binary_web] Using binary at filesystem path: {}",
                candidate
            );
            return Ok(candidate.clone());
        }
    }

    // Last resort: use the full discovery from claude_binary module
    let installations = crate::claude_binary::discover_claude_installations();
    if let Some(best) = installations.into_iter().next() {
        println!(
            "[find_claude_binary_web] Using discovered installation: {} (source: {})",
            best.path, best.source
        );
        return Ok(best.path);
    }

    Err("Claude binary not found in bundled location or system paths".to_string())
}

#[derive(Clone)]
pub struct AppState {
    // Track active WebSocket sessions for Claude execution
    pub active_sessions:
        Arc<Mutex<std::collections::HashMap<String, tokio::sync::mpsc::Sender<String>>>>,
    // Track child process PIDs so we can interrupt them (SIGTERM/SIGKILL or taskkill).
    // Key: WS session_id  Value: OS PID of the running Claude child process.
    pub active_pids: Arc<Mutex<std::collections::HashMap<String, u32>>>,
    // Per-session runtime config (model, permission_mode) mutable via SetModel / SetPermissionMode.
    pub session_config:
        Arc<Mutex<std::collections::HashMap<String, SessionConfig>>>,
    // Checkpoint state for managing checkpoint managers per session
    pub checkpoint_state: CheckpointState,
}

/// Runtime-mutable configuration for a single WS session.
#[derive(Clone, Debug, Default)]
pub struct SessionConfig {
    pub model: Option<String>,
    pub permission_mode: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ClaudeExecutionRequest {
    pub project_path: String,
    pub prompt: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub command_type: String, // "execute", "continue", or "resume"
    pub permission_mode: Option<String>, // "default", "acceptEdits", "bypassPermissions", "plan"
}


#[derive(Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(error: String) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(error),
        }
    }
}

/// Serve embedded frontend assets with SPA fallback
async fn serve_frontend(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match FrontendAssets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                content.data.into_owned(),
            )
                .into_response()
        }
        None => {
            // SPA fallback
            match FrontendAssets::get("index.html") {
                Some(content) => (
                    [(axum::http::header::CONTENT_TYPE, "text/html")],
                    content.data.into_owned(),
                )
                    .into_response(),
                None => axum::http::StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}

/// API endpoint to get projects (equivalent to Tauri command)
async fn get_projects() -> Json<ApiResponse<Vec<commands::claude::Project>>> {
    match commands::claude::list_projects().await {
        Ok(projects) => Json(ApiResponse::success(projects)),
        Err(e) => Json(ApiResponse::error(e.to_string())),
    }
}

/// API endpoint to get sessions for a project
async fn get_sessions(
    Path(project_id): Path<String>,
) -> Json<ApiResponse<Vec<commands::claude::Session>>> {
    match commands::claude::get_project_sessions(project_id).await {
        Ok(sessions) => Json(ApiResponse::success(sessions)),
        Err(e) => Json(ApiResponse::error(e.to_string())),
    }
}

/// Simple agents endpoint - return empty for now (needs DB state)
async fn get_agents() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Get live/running agents - returns empty array until process registry is wired
async fn get_live_agents() -> impl IntoResponse {
    axum::Json(serde_json::json!([]))
}

/// Auth status endpoint - returns Claude auth/plan info
async fn get_auth_status() -> impl IntoResponse {
    let default_response = serde_json::json!({
        "loggedIn": false,
        "subscriptionType": "unknown"
    });

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
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

/// Usage endpoint - returns real usage stats from ~/.claude JSONL files
async fn get_usage(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let days = params
        .get("days")
        .and_then(|d| d.parse::<u32>().ok());
    match tokio::task::spawn_blocking(move || commands::usage::get_usage_stats(days)).await {
        Ok(Ok(stats)) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

/// Usage by date range - returns real filtered usage stats
async fn get_usage_range(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let start = params
        .get("start")
        .cloned()
        .unwrap_or_else(|| {
            (chrono::Local::now() - chrono::Duration::days(30))
                .format("%Y-%m-%d")
                .to_string()
        });
    let end = params
        .get("end")
        .cloned()
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    match tokio::task::spawn_blocking(move || commands::usage::get_usage_by_date_range(start, end)).await {
        Ok(Ok(stats)) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

/// Usage sessions - returns real session-level stats
async fn get_usage_sessions(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let since = params.get("since").cloned();
    let until = params.get("until").cloned();
    let order = params.get("order").cloned();
    match tokio::task::spawn_blocking(move || commands::usage::get_session_stats(since, until, order)).await {
        Ok(Ok(sessions)) => Json(ApiResponse::success(
            serde_json::to_value(sessions).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

/// Usage details - returns real per-entry usage data
async fn get_usage_details(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let project_path = params.get("project_path").cloned();
    let date = params.get("date").cloned();
    match tokio::task::spawn_blocking(move || commands::usage::get_usage_details(project_path, date)).await {
        Ok(Ok(details)) => Json(ApiResponse::success(
            serde_json::to_value(details).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

/// Get 5-hour rolling usage window for Max/Pro plan users
async fn get_usage_window() -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let claude_dir = format!("{}/.claude/projects", home);

        let five_hours_ago = chrono::Utc::now() - chrono::Duration::hours(5);
        let five_hours_ago_ms = five_hours_ago.timestamp_millis();

        let mut total_input = 0u64;
        let mut total_output = 0u64;
        let mut total_cache_creation = 0u64;
        let mut total_cache_read = 0u64;
        let mut message_count = 0u64;

        // Walk all JSONL files, only process recent ones (modified in last 5 hours)
        if let Ok(projects) = std::fs::read_dir(&claude_dir) {
            for project in projects.flatten() {
                if project.file_type().map_or(false, |t| t.is_dir()) {
                    for entry in walkdir::WalkDir::new(project.path())
                        .into_iter()
                        .filter_map(Result::ok)
                        .filter(|e| e.path().extension().map_or(false, |ext| ext == "jsonl"))
                    {
                        let path = entry.path();
                        // Only process files modified recently
                        if let Ok(metadata) = path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let mod_time = modified
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis() as i64;
                                if mod_time < five_hours_ago_ms {
                                    continue; // Skip old files
                                }
                            }
                        }

                        if let Ok(content) = std::fs::read_to_string(path) {
                            for line in content.lines() {
                                if let Ok(json) =
                                    serde_json::from_str::<serde_json::Value>(line)
                                {
                                    // Check timestamp
                                    let timestamp = json
                                        .get("timestamp")
                                        .and_then(|t| t.as_str())
                                        .and_then(|t| {
                                            chrono::DateTime::parse_from_rfc3339(t).ok()
                                        })
                                        .map(|t| t.timestamp_millis())
                                        .unwrap_or(0);

                                    if timestamp < five_hours_ago_ms {
                                        continue;
                                    }

                                    // Extract usage from nested message structure
                                    let usage = json
                                        .get("message")
                                        .and_then(|m| m.get("usage"))
                                        .or_else(|| {
                                            json.get("data")
                                                .and_then(|d| d.get("message"))
                                                .and_then(|m| m.get("message"))
                                                .and_then(|m| m.get("usage"))
                                        });

                                    if let Some(usage) = usage {
                                        total_input += usage
                                            .get("input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_output += usage
                                            .get("output_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_cache_creation += usage
                                            .get("cache_creation_input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_cache_read += usage
                                            .get("cache_read_input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        message_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calculate effective tokens weighted by rate limit impact
        let effective_tokens = (total_input as f64 * 0.2) + (total_output as f64) + (total_cache_creation as f64 * 0.25);
        let estimated_limit: f64 = 5_000_000.0;
        let usage_percent = (effective_tokens / estimated_limit * 100.0).min(100.0);

        serde_json::json!({
            "windowHours": 5,
            "inputTokens": total_input,
            "outputTokens": total_output,
            "cacheCreationTokens": total_cache_creation,
            "cacheReadTokens": total_cache_read,
            "totalTokens": total_input + total_output + total_cache_creation + total_cache_read,
            "effectiveTokens": effective_tokens as u64,
            "estimatedLimitTokens": estimated_limit as u64,
            "usagePercent": usage_percent,
            "rateRelevantTokens": total_input + total_output + total_cache_creation,
            "messageCount": message_count,
            "windowStart": five_hours_ago.to_rfc3339(),
            "windowEnd": chrono::Utc::now().to_rfc3339()
        })
    }).await.unwrap_or_else(|_| serde_json::json!({}));

    axum::Json(result)
}

/// Get usage cost info by running `claude -p "/cost" --output-format json`
async fn get_usage_cost() -> impl IntoResponse {
    let claude_bin = find_claude_binary_web().unwrap_or_else(|_| "claude".to_string());

    let default_response = serde_json::json!({
        "total_cost_usd": 0,
        "result": "Claude binary not available or timed out"
    });

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new(&claude_bin)
                .args(["-p", "/cost", "--output-format", "json"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            match serde_json::from_str::<serde_json::Value>(&stdout) {
                Ok(json) => axum::Json(json).into_response(),
                Err(_) => axum::Json(serde_json::json!({
                    "total_cost_usd": 0,
                    "result": "Unable to parse cost info"
                }))
                .into_response(),
            }
        }
        _ => axum::Json(default_response).into_response(),
    }
}

/// Get Claude settings - return basic defaults for web mode
async fn get_claude_settings() -> Json<ApiResponse<serde_json::Value>> {
    let default_settings = serde_json::json!({
        "data": {
            "model": "claude-3-5-sonnet-20241022",
            "max_tokens": 8192,
            "temperature": 0.0,
            "auto_save": true,
            "theme": "dark"
        }
    });
    Json(ApiResponse::success(default_settings))
}

/// Check Claude version - return mock status for web mode
async fn check_claude_version() -> Json<ApiResponse<serde_json::Value>> {
    let version_status = serde_json::json!({
        "status": "ok",
        "version": "web-mode",
        "message": "Running in web server mode"
    });
    Json(ApiResponse::success(version_status))
}

/// List all available Claude installations on the system
async fn list_claude_installations(
) -> Json<ApiResponse<Vec<crate::claude_binary::ClaudeInstallation>>> {
    let installations = crate::claude_binary::discover_claude_installations();

    if installations.is_empty() {
        Json(ApiResponse::error(
            "No Claude Code installations found on the system".to_string(),
        ))
    } else {
        Json(ApiResponse::success(installations))
    }
}

/// Get Claude binary path for web mode
async fn get_claude_binary_path_web() -> impl IntoResponse {
    match find_claude_binary_web() {
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

/// Get system prompt - return default for web mode
async fn get_system_prompt() -> Json<ApiResponse<String>> {
    let default_prompt =
        "You are Claude, an AI assistant created by Anthropic. You are running in web server mode."
            .to_string();
    Json(ApiResponse::success(default_prompt))
}

/// Open new session - mock for web mode
async fn open_new_session() -> Json<ApiResponse<String>> {
    let session_id = format!("web-session-{}", chrono::Utc::now().timestamp());
    Json(ApiResponse::success(session_id))
}

/// Get system resources
async fn get_resources() -> impl IntoResponse {
    let resources = tokio::task::spawn_blocking(|| {
        crate::commands::resources::get_system_resources()
    }).await;
    match resources {
        Ok(r) => axum::Json(serde_json::to_value(r).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!({
            "cpuPercent": 0.0,
            "ramPercent": 0.0,
            "ramUsedGb": 0.0,
            "ramTotalGb": 0.0
        })).into_response(),
    }
}

/// Get integrations configuration
async fn get_integrations() -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let config_path = format!("{}/.runecode/integrations.json", home);

        match std::fs::read_to_string(&config_path) {
            Ok(content) => serde_json::from_str::<serde_json::Value>(&content)
                .unwrap_or_else(|_| serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        }
    }).await.unwrap_or_else(|_| serde_json::json!({}));

    axum::Json(result)
}

/// Save integrations configuration
async fn save_integrations(axum::Json(config): axum::Json<serde_json::Value>) -> impl IntoResponse {
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
    }).await;

    match result {
        Ok(Ok(())) => axum::http::StatusCode::OK.into_response(),
        Ok(Err((status, msg))) => (status, msg).into_response(),
        Err(_) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Task failed".to_string()).into_response(),
    }
}

/// List slash commands - return empty for web mode
async fn list_slash_commands(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Get a single slash command by ID - stub for web mode
async fn get_slash_command(
    Path(_command_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Slash command not found".to_string()))
}

/// Save (create/update) a slash command - stub for web mode
async fn save_slash_command(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Slash command management is not yet available in web mode".to_string(),
    ))
}

/// Delete a slash command by ID - stub for web mode
async fn delete_slash_command(
    Path(_command_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Slash command management is not yet available in web mode".to_string(),
    ))
}

/// Initialize a new project (create .runecode/project.json)
async fn init_project(axum::Json(body): axum::Json<serde_json::Value>) -> impl IntoResponse {
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
    }).await;

    match result {
        Ok(Ok(_)) => axum::http::StatusCode::OK.into_response(),
        Ok(Err(e)) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
        Err(_) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, "Task failed".to_string()).into_response(),
    }
}

/// Get project info by scanning project directory
async fn get_project_info(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let project_path = match params.get("path") {
        Some(p) => p.clone(),
        None => {
            return axum::Json(serde_json::json!({
                "error": "Missing 'path' query parameter"
            }))
            .into_response();
        }
    };

    let result = tokio::task::spawn_blocking(move || {
        crate::commands::project_info::collect_project_info(&project_path)
    }).await;

    match result {
        Ok(info) => axum::Json(serde_json::to_value(info).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!({"error": "Task failed"})).into_response(),
    }
}

/// Get skills catalog
async fn get_skills_catalog_web() -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(|| {
        crate::commands::skills::get_skills_catalog()
    }).await;

    match result {
        Ok(catalog) => axum::Json(serde_json::to_value(catalog).unwrap_or_default()).into_response(),
        Err(_) => axum::Json(serde_json::json!([])).into_response(),
    }
}

/// Discover built-in commands from the Claude binary
async fn get_builtin_commands() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
                .args(["--help"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let commands = parse_claude_help_output(&stdout);
            axum::Json(ApiResponse::success(commands))
        }
        _ => {
            // Return empty -- frontend will use hardcoded fallback
            axum::Json(ApiResponse::success(serde_json::json!([])))
        }
    }
}

fn parse_claude_help_output(output: &str) -> serde_json::Value {
    let mut commands = Vec::new();
    let mut in_commands_section = false;

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed == "Commands:" {
            in_commands_section = true;
            continue;
        }

        // End of commands section on empty line after we started
        if in_commands_section && trimmed.is_empty() {
            in_commands_section = false;
            continue;
        }

        if in_commands_section && !trimmed.is_empty() {
            // Parse "  command [options]   description" format
            let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
            if let Some(name_part) = parts.first() {
                let name = name_part.split('|').next().unwrap_or(name_part).trim();
                if name.is_empty() {
                    continue;
                }
                let desc = parts.get(1).unwrap_or(&"").trim();
                // Skip [options] in description
                let clean_desc = if desc.starts_with('[') {
                    desc.splitn(2, ']').last().unwrap_or("").trim()
                } else {
                    desc
                };

                commands.push(serde_json::json!({
                    "name": name,
                    "full_command": format!("claude {}", name),
                    "description": clean_desc,
                    "scope": "cli",
                    "type": "subcommand"
                }));
            }
        }

        // Also capture CLI flags as reference
        if trimmed.starts_with("--") || trimmed.starts_with('-') {
            let parts: Vec<&str> = trimmed.splitn(2, "  ").collect();
            if parts.len() == 2 {
                let flag = parts[0]
                    .trim()
                    .split(',')
                    .last()
                    .unwrap_or("")
                    .trim()
                    .split(' ')
                    .next()
                    .unwrap_or("");
                let desc = parts[1].trim();
                if !flag.is_empty() && !desc.is_empty() {
                    commands.push(serde_json::json!({
                        "name": flag.trim_start_matches('-'),
                        "full_command": flag,
                        "description": desc,
                        "scope": "cli",
                        "type": "flag"
                    }));
                }
            }
        }
    }
    serde_json::json!(commands)
}

/// Discover agents from `claude agents` command
async fn get_agents_list() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
                .arg("agents")
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let agents = parse_agents_output(&stdout);
            axum::Json(ApiResponse::success(agents))
        }
        _ => axum::Json(ApiResponse::success(serde_json::json!([]))),
    }
}

fn parse_agents_output(output: &str) -> serde_json::Value {
    let mut agents = Vec::new();
    let mut current_section = "";

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.ends_with("agents") || trimmed.ends_with(':') {
            current_section = if trimmed.contains("Plugin") {
                "plugin"
            } else if trimmed.contains("Built-in") {
                "builtin"
            } else {
                current_section
            };
            continue;
        }
        // Parse "  name · model" format
        if trimmed.contains('\u{00b7}') {
            let parts: Vec<&str> = trimmed.splitn(2, '\u{00b7}').collect();
            let name = parts[0].trim();
            let model = parts.get(1).map(|m| m.trim()).unwrap_or("inherit");
            agents.push(serde_json::json!({
                "name": name,
                "model": model,
                "type": current_section
            }));
        }
    }
    serde_json::json!(agents)
}

/// Discover MCP servers from `claude mcp list` command
async fn get_mcp_servers_list() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
                .args(["mcp", "list"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let servers = parse_mcp_list_output(&stdout);
            axum::Json(ApiResponse::success(servers))
        }
        _ => axum::Json(ApiResponse::success(serde_json::json!([]))),
    }
}

fn parse_mcp_list_output(output: &str) -> serde_json::Value {
    let mut servers = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("Checking") {
            continue;
        }

        // Parse "name: command - status" format
        if let Some(colon_pos) = trimmed.find(':') {
            let name = trimmed[..colon_pos].trim();
            let rest = trimmed[colon_pos + 1..].trim();

            let status = if rest.contains("Connected") {
                "connected"
            } else if rest.contains("Needs") {
                "needs_auth"
            } else if rest.contains('\u{2717}') {
                "error"
            } else {
                "unknown"
            };

            // Extract command (between : and -)
            let command = rest.split(" - ").next().unwrap_or("").trim();

            servers.push(serde_json::json!({
                "name": name,
                "command": command,
                "status": status
            }));
        }
    }
    serde_json::json!(servers)
}

/// MCP list servers - return empty for web mode
async fn mcp_list() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Load session history from JSONL file
async fn load_session_history(
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

/// List running Claude sessions
async fn list_running_claude_sessions() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    // Return empty for web mode - no actual Claude processes in web mode
    Json(ApiResponse::success(vec![]))
}

/// Execute Claude code - redirect to WebSocket in web mode
async fn execute_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Claude execution in web mode uses the WebSocket endpoint at /ws/claude. Connect via WebSocket to stream Claude sessions.".to_string()))
}

/// Continue Claude code - redirect to WebSocket in web mode
async fn continue_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Claude continuation in web mode uses the WebSocket endpoint at /ws/claude. Connect via WebSocket to stream Claude sessions.".to_string()))
}

/// Resume Claude code - redirect to WebSocket in web mode
async fn resume_claude_code() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Claude resume in web mode uses the WebSocket endpoint at /ws/claude. Connect via WebSocket to stream Claude sessions.".to_string()))
}

/// Cancel Claude execution
async fn cancel_claude_execution(
    Path(session_id): Path<String>,
    AxumState(state): AxumState<AppState>,
) -> Json<ApiResponse<()>> {
    println!("[TRACE] Cancel request for session: {}", session_id);
    let sessions = state.active_sessions.lock().await;
    if let Some(sender) = sessions.get(&session_id) {
        let _ = sender.send("__CANCEL__".to_string()).await;
        println!("[TRACE] Cancel signal sent to session: {}", session_id);
    } else {
        println!(
            "[TRACE] Session not found for cancel: {}",
            session_id
        );
    }
    Json(ApiResponse::success(()))
}

/// Get Claude session output
async fn get_claude_session_output(Path(session_id): Path<String>) -> Json<ApiResponse<String>> {
    // In web mode, output is streamed via WebSocket, not stored
    println!("[TRACE] Output request for session: {}", session_id);
    Json(ApiResponse::success(
        "Output available via WebSocket only".to_string(),
    ))
}

/// WebSocket handler for Claude execution with streaming output
async fn claude_websocket(ws: WebSocketUpgrade, AxumState(state): AxumState<AppState>) -> Response {
    ws.on_upgrade(move |socket| claude_websocket_handler(socket, state))
}

async fn claude_websocket_handler(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    // ws_session_id identifies the *WebSocket connection*, not the Claude conversation.
    let ws_session_id = uuid::Uuid::new_v4().to_string();

    println!("[WS] Handler started -- ws_session_id: {}", ws_session_id);

    // Channel for forwarding output lines back to the WebSocket.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(256);

    // Register the sender so execute functions can push output.
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.insert(ws_session_id.clone(), tx);
        println!("[WS] Session registered -- active sessions: {}", sessions.len());
    }

    // Forward task: moves messages from the mpsc channel to the WebSocket sink.
    let ws_sid_fwd = ws_session_id.clone();
    let forward_task = tokio::spawn(async move {
        println!("[WS] Forward task started for {}", ws_sid_fwd);
        while let Some(message) = rx.recv().await {
            if sender.send(Message::Text(message.into())).await.is_err() {
                println!("[WS] Failed to forward -- connection closed for {}", ws_sid_fwd);
                break;
            }
        }
        println!("[WS] Forward task ended for {}", ws_sid_fwd);
    });

    // -- Main message loop -------------------------------------------------
    println!("[WS] Listening for messages");
    'outer: while let Some(msg) = receiver.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                println!("[WS] Receive error: {}", e);
                break 'outer;
            }
        };

        match msg {
            Message::Text(text) => {
                println!("[WS] Text message ({} chars): {}", text.len(), text);

                let client_msg = match serde_json::from_str::<WsClientMessage>(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        println!("[WS] Parse error: {} -- raw: {}", e, text);
                        let err_json = serde_json::to_string(&WsServerMessage::Error {
                            session_id: ws_session_id.clone(),
                            error: format!("Unrecognised message format: {}", e),
                        })
                        .unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(err_json).await;
                        }
                        // Do not break -- connection stays open for subsequent messages.
                        continue 'outer;
                    }
                };

                match client_msg {
                    // -- Init -----------------------------------------------
                    WsClientMessage::Init {
                        project_path,
                        text: prompt,
                        model,
                        session_id: claude_session_id,
                        permission_mode,
                        ..
                    } => {
                        println!("[WS] Init -- project: {}  resume: {:?}", project_path, claude_session_id);
                        {
                            let mut cfg = state.session_config.lock().await;
                            cfg.insert(ws_session_id.clone(), SessionConfig {
                                model: model.clone(),
                                permission_mode: permission_mode.clone(),
                            });
                        }
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        let bypass = permission_mode.as_deref() == Some("bypassPermissions");
                        tokio::spawn(async move {
                            let result = if let Some(csid) = claude_session_id {
                                println!("[WS] Resuming claude session {}", csid);
                                resume_claude_command(
                                    project_path, csid, prompt,
                                    model.unwrap_or_default(), bypass,
                                    ws_sid.clone(), st.clone(),
                                ).await
                            } else {
                                println!("[WS] Executing new session");
                                execute_claude_command(
                                    project_path, prompt,
                                    model.unwrap_or_default(), bypass,
                                    ws_sid.clone(), st.clone(),
                                ).await
                            };
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- InitAgent ------------------------------------------
                    WsClientMessage::InitAgent {
                        agent_name,
                        project_path,
                        text: prompt,
                        model,
                        permission_mode,
                        ..
                    } => {
                        println!("[WS] InitAgent -- agent: {}  project: {}", agent_name, project_path);
                        {
                            let mut cfg = state.session_config.lock().await;
                            cfg.insert(ws_session_id.clone(), SessionConfig {
                                model: model.clone(),
                                permission_mode: permission_mode.clone(),
                            });
                        }
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        let bypass = permission_mode.as_deref() == Some("bypassPermissions");
                        tokio::spawn(async move {
                            let result = execute_claude_agent_command(
                                project_path, agent_name, prompt,
                                model.unwrap_or_default(), bypass,
                                ws_sid.clone(), st.clone(),
                            ).await;
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- Prompt (follow-up turn) -----------------------------
                    WsClientMessage::Prompt { text: prompt, .. } => {
                        println!("[WS] Prompt ({} chars)", prompt.len());
                        let (model, bypass) = {
                            let cfg = state.session_config.lock().await;
                            let c = cfg.get(&ws_session_id).cloned().unwrap_or_default();
                            let bypass = c.permission_mode.as_deref() == Some("bypassPermissions");
                            (c.model.unwrap_or_default(), bypass)
                        };
                        // Use -c (continue) which picks up the last session in the project.
                        // Best-effort: callers that need path-aware continuation should re-init.
                        let project_path = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        tokio::spawn(async move {
                            let result = continue_claude_command(
                                project_path, prompt, model, bypass,
                                ws_sid.clone(), st.clone(),
                            ).await;
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- Interrupt ------------------------------------------
                    WsClientMessage::Interrupt {} => {
                        println!("[WS] Interrupt requested for {}", ws_session_id);
                        interrupt_session_process(&state, &ws_session_id).await;
                        let interrupted = serde_json::to_string(&WsServerMessage::Interrupted {
                            session_id: ws_session_id.clone(),
                        }).unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(interrupted).await;
                        }
                    }

                    // -- RewindFiles (stub -- full impl is follow-up work) ---
                    WsClientMessage::RewindFiles { user_message_id, dry_run } => {
                        let dry = dry_run.unwrap_or(false);
                        println!(
                            "[WS] RewindFiles -- user_message_id: {:?}  dry_run: {}",
                            user_message_id, dry
                        );
                        let ack = serde_json::to_string(&WsServerMessage::RewindAck {
                            session_id: ws_session_id.clone(),
                            user_message_id,
                            dry_run: dry,
                        }).unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(ack).await;
                        }
                    }

                    // -- SetModel -------------------------------------------
                    WsClientMessage::SetModel { model } => {
                        println!("[WS] SetModel -- model: {}", model);
                        {
                            let mut cfg = state.session_config.lock().await;
                            let entry = cfg.entry(ws_session_id.clone()).or_default();
                            entry.model = Some(model.clone());
                        }
                        let changed = serde_json::to_string(&WsServerMessage::ModelChanged {
                            session_id: ws_session_id.clone(),
                            model,
                        }).unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(changed).await;
                        }
                    }

                    // -- SetPermissionMode ----------------------------------
                    WsClientMessage::SetPermissionMode { mode } => {
                        println!("[WS] SetPermissionMode -- mode: {}", mode);
                        {
                            let mut cfg = state.session_config.lock().await;
                            let entry = cfg.entry(ws_session_id.clone()).or_default();
                            entry.permission_mode = Some(mode.clone());
                        }
                        let changed = serde_json::to_string(&WsServerMessage::PermissionModeChanged {
                            session_id: ws_session_id.clone(),
                            mode,
                        }).unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(changed).await;
                        }
                    }

                    // -- StopTask -------------------------------------------
                    WsClientMessage::StopTask { .. } => {
                        println!("[WS] StopTask -- interrupting running process");
                        interrupt_session_process(&state, &ws_session_id).await;
                        // Connection stays open for the next turn.
                    }

                    // -- Close ----------------------------------------------
                    WsClientMessage::Close {} => {
                        println!("[WS] Close received -- cleaning up {}", ws_session_id);
                        interrupt_session_process(&state, &ws_session_id).await;
                        break 'outer;
                    }
                }
            }

            Message::Close(_) => {
                println!("[WS] Protocol close frame received");
                break 'outer;
            }

            _ => {
                // Ping/Pong/Binary -- ignore silently.
            }
        }
    }

    // -- Cleanup -----------------------------------------------------------
    println!("[WS] Message loop ended for {}", ws_session_id);
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.remove(&ws_session_id);
        println!(
            "[WS] Session {} removed -- remaining: {}",
            ws_session_id,
            sessions.len()
        );
    }
    state.active_pids.lock().await.remove(&ws_session_id);
    state.session_config.lock().await.remove(&ws_session_id);

    forward_task.abort();
    println!("[WS] Handler ended for {}", ws_session_id);
}

/// Send SIGTERM to the Claude child process tracked for `ws_session_id`.
/// On UNIX: SIGTERM immediately, then SIGKILL after 3 s if still alive.
/// On Windows: `taskkill /F /PID <pid>`.
async fn interrupt_session_process(state: &AppState, ws_session_id: &str) {
    let pid_opt = state.active_pids.lock().await.get(ws_session_id).copied();
    let Some(pid) = pid_opt else {
        println!("[WS] interrupt_session_process: no PID for {}", ws_session_id);
        return;
    };
    println!("[WS] Interrupting PID {} for session {}", pid, ws_session_id);

    #[cfg(unix)]
    {
        // SIGTERM first.
        unsafe { libc::kill(pid as libc::pid_t, libc::SIGTERM) };
        // Spawn a watchdog that escalates to SIGKILL after 3 s.
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_secs(3)).await;
            unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
            println!("[WS] SIGKILL sent to PID {} (escalation after timeout)", pid);
        });
    }

    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .status();
        println!("[WS] taskkill /F /PID {}", pid);
    }
}

/// Helper: serialise and send the turn-completion event over the session channel.
async fn ws_send_completion(state: &AppState, ws_session_id: &str, result: Result<(), String>) {
    println!("[WS] ws_send_completion for {}: {:?}", ws_session_id, result);
    let msg = match result {
        Ok(_) => json!({ "type": "completion", "status": "success" }),
        Err(e) => json!({ "type": "completion", "status": "error", "error": e }),
    };
    let sessions = state.active_sessions.lock().await;
    if let Some(tx) = sessions.get(ws_session_id) {
        let _ = tx.send(msg.to_string()).await;
    }
}

// Claude command execution functions for WebSocket streaming
async fn execute_claude_command(
    project_path: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

    println!("[TRACE] execute_claude_command called:");
    println!("[TRACE]   project_path: {}", project_path);
    println!("[TRACE]   prompt length: {} chars", prompt.len());
    println!("[TRACE]   model: {}", model);
    println!("[TRACE]   session_id: {}", session_id);

    // Send initial message
    println!("[TRACE] Sending initial start message");
    send_to_session(
        &state,
        &session_id,
        json!({
            "type": "start",
            "message": "Starting Claude execution..."
        })
        .to_string(),
    )
    .await;

    // Find Claude binary (simplified for web mode)
    println!("[TRACE] Finding Claude binary...");
    let claude_path = find_claude_binary_web().map_err(|e| {
        let error = format!("Claude binary not found: {}", e);
        println!("[TRACE] Error finding Claude binary: {}", error);
        error
    })?;
    println!("[TRACE] Found Claude binary: {}", claude_path);

    // Create Claude command
    println!("[TRACE] Creating Claude command...");
    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<String> = vec!["-p".to_string(), prompt.clone()];
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

    println!(
        "[TRACE] Command: {} {:?} (in dir: {})",
        claude_path, args, project_path
    );

    // Spawn Claude process
    println!("[TRACE] Spawning Claude process...");
    let mut child = cmd.spawn().map_err(|e| {
        let error = format!("Failed to spawn Claude: {}", e);
        println!("[TRACE] Spawn error: {}", error);
        error
    })?;
    println!("[TRACE] Claude process spawned successfully");

    // Get stdout and stderr for streaming
    let stdout = child.stdout.take().ok_or_else(|| {
        println!("[TRACE] Failed to get stdout from child process");
        "Failed to get stdout".to_string()
    })?;
    let stderr = child.stderr.take();
    let stdout_reader = BufReader::new(stdout);

    // Spawn stderr reader to capture error output
    let state_for_stderr = state.clone();
    let session_id_for_stderr = session_id.clone();
    let stderr_task = tokio::spawn(async move {
        if let Some(stderr) = stderr {
            let stderr_reader = BufReader::new(stderr);
            let mut lines = stderr_reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                println!("[TRACE] Claude stderr: {}", line);
                let message = json!({
                    "type": "output",
                    "content": format!("[stderr] {}", line)
                })
                .to_string();
                send_to_session(&state_for_stderr, &session_id_for_stderr, message).await;
            }
        }
    });

    println!("[TRACE] Starting to read Claude output...");
    // Stream output line by line
    let mut lines = stdout_reader.lines();
    let mut line_count = 0;
    while let Ok(Some(line)) = lines.next_line().await {
        line_count += 1;
        println!("[TRACE] Claude output line {}: {}", line_count, line);

        // Send each line to WebSocket
        let message = json!({
            "type": "output",
            "content": line
        })
        .to_string();
        send_to_session(&state, &session_id, message).await;
    }

    println!(
        "[TRACE] Finished reading Claude output ({} lines total)",
        line_count
    );

    // Wait for stderr task and process to complete
    let _ = stderr_task.await;
    println!("[TRACE] Waiting for Claude process to complete...");
    let exit_status = child.wait().await.map_err(|e| {
        let error = format!("Failed to wait for Claude: {}", e);
        println!("[TRACE] Wait error: {}", error);
        error
    })?;

    println!(
        "[TRACE] Claude process completed with status: {:?}",
        exit_status
    );

    if !exit_status.success() {
        let error = format!(
            "Claude execution failed with exit code: {:?}",
            exit_status.code()
        );
        println!("[TRACE] Claude execution failed: {}", error);
        return Err(error);
    }

    println!("[TRACE] execute_claude_command completed successfully");
    Ok(())
}

async fn continue_claude_command(
    project_path: String,
    prompt: String,
    model: String,
    bypass_permissions: bool,
    session_id: String,
    state: AppState,
) -> Result<(), String> {
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;

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

    // Find Claude binary
    let claude_path =
        find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;

    // Create continue command
    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<&str> = vec![
        "-c", // Continue flag
        "-p", &prompt,
    ];
    if !model.is_empty() {
        args.push("--model");
        args.push(&model);
    }
    args.extend_from_slice(&[
        "--output-format",
        "stream-json",
        "--verbose",
    ]);
    if bypass_permissions {
        args.push("--dangerously-skip-permissions");
    }
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Spawn and stream output
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state.active_pids.lock().await.insert(session_id.clone(), pid);
    }

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stdout_reader = BufReader::new(stdout);

    let mut lines = stdout_reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        send_to_session(
            &state,
            &session_id,
            json!({
                "type": "output",
                "content": line
            })
            .to_string(),
        )
        .await;
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

async fn resume_claude_command(
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

    println!("[resume_claude_command] Starting with project_path: {}, claude_session_id: {}, prompt: {}, model: {}", 
             project_path, claude_session_id, prompt, model);

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

    // Find Claude binary
    println!("[resume_claude_command] Finding Claude binary...");
    let claude_path =
        find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;
    println!(
        "[resume_claude_command] Found Claude binary: {}",
        claude_path
    );

    // Create resume command
    println!("[resume_claude_command] Creating command...");
    let mut cmd = Command::new(&claude_path);
    let mut args: Vec<&str> = vec!["--resume", &claude_session_id, "-p", &prompt];
    if !model.is_empty() {
        args.push("--model");
        args.push(&model);
    }
    args.extend_from_slice(&[
        "--output-format",
        "stream-json",
        "--verbose",
    ]);
    if bypass_permissions {
        args.push("--dangerously-skip-permissions");
    }
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    println!(
        "[resume_claude_command] Command: {} {:?} (in dir: {})",
        claude_path, args, project_path
    );

    // Spawn and stream output
    println!("[resume_claude_command] Spawning process...");
    let mut child = cmd.spawn().map_err(|e| {
        let error = format!("Failed to spawn Claude: {}", e);
        println!("[resume_claude_command] Spawn error: {}", error);
        error
    })?;
    println!("[resume_claude_command] Process spawned successfully");

    // Register PID for interrupt support.
    if let Some(pid) = child.id() {
        state.active_pids.lock().await.insert(session_id.clone(), pid);
        println!("[resume_claude_command] Registered PID {} for session {}", pid, session_id);
    }

    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let stdout_reader = BufReader::new(stdout);

    let mut lines = stdout_reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        send_to_session(
            &state,
            &session_id,
            json!({
                "type": "output",
                "content": line
            })
            .to_string(),
        )
        .await;
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

/// Spawn Claude as a named agent using the `--agent` flag.
async fn execute_claude_agent_command(
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

    println!(
        "[WS] execute_claude_agent_command -- agent: {}  project: {}",
        agent_name, project_path
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
        find_claude_binary_web().map_err(|e| format!("Claude binary not found: {}", e))?;

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
        state.active_pids.lock().await.insert(session_id.clone(), pid);
        println!("[WS] Agent PID {} registered for session {}", pid, session_id);
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
            while let Ok(Some(line)) = lines.next_line().await {
                send_to_session(
                    &st_err,
                    &sid_err,
                    json!({ "type": "output", "content": format!("[stderr] {}", line) })
                        .to_string(),
                )
                .await;
            }
        }
    });

    let mut lines = stdout_reader.lines();
    while let Ok(Some(line)) = lines.next_line().await {
        send_to_session(
            &state,
            &session_id,
            json!({ "type": "output", "content": line }).to_string(),
        )
        .await;
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

async fn send_to_session(state: &AppState, session_id: &str, message: String) {
    println!("[TRACE] send_to_session called for session: {}", session_id);
    println!("[TRACE] Message: {}", message);

    let sessions = state.active_sessions.lock().await;
    if let Some(sender) = sessions.get(session_id) {
        println!("[TRACE] Found session in active sessions, sending message...");
        match sender.send(message).await {
            Ok(_) => println!("[TRACE] Message sent successfully"),
            Err(e) => println!("[TRACE] Failed to send message: {}", e),
        }
    } else {
        println!(
            "[TRACE] Session {} not found in active sessions",
            session_id
        );
        println!(
            "[TRACE] Active sessions: {:?}",
            sessions.keys().collect::<Vec<_>>()
        );
    }
}

/// Get storage table - return empty data in web mode (no local DB)
async fn get_storage_table(
    axum::extract::Path(_table_name): axum::extract::Path<String>,
) -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "success": true,
        "data": {
            "rows": [],
            "total": 0,
            "page": 1,
            "pageSize": 1000
        },
        "error": null
    }))
}

/// No-op handler returning success JSON — for commands not available in web mode
async fn noop_ok() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "success": true,
        "data": null,
        "error": null
    }))
}

/// Get home directory
async fn get_home_directory() -> impl IntoResponse {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/".to_string());
    axum::Json(serde_json::json!({
        "success": true,
        "data": home,
        "error": null
    }))
}


/// Save Claude settings — stub for web mode
async fn save_claude_settings_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Saving settings is not yet available in web mode".to_string(),
    ))
}

/// Save system prompt — stub for web mode
async fn save_system_prompt_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Saving system prompt is not yet available in web mode".to_string(),
    ))
}

/// Find CLAUDE.md files for a project
async fn find_claude_md_files(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let project_path = params
        .get("projectPath")
        .or(params.get("project_path"))
        .cloned()
        .unwrap_or_default();

    let result = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();
        let home = std::env::var("HOME").unwrap_or_default();

        // Project CLAUDE.md — canonicalize and restrict to HOME
        let project_claude = format!("{}/CLAUDE.md", project_path);
        let project_path_obj = std::path::Path::new(&project_claude);
        if project_path_obj.exists() {
            if let Ok(canonical) = std::fs::canonicalize(project_path_obj) {
                let canonical_str = canonical.to_string_lossy();
                if !home.is_empty() && canonical_str.starts_with(&home) {
                    if let Ok(content) = std::fs::read_to_string(&canonical) {
                        files.push(serde_json::json!({
                            "path": canonical.to_string_lossy(),
                            "content": content,
                            "scope": "project"
                        }));
                    }
                }
            }
        }

        let user_claude = format!("{}/.claude/CLAUDE.md", home);
        if std::path::Path::new(&user_claude).exists() {
            if let Ok(content) = std::fs::read_to_string(&user_claude) {
                files.push(serde_json::json!({
                    "path": user_claude,
                    "content": content,
                    "scope": "user"
                }));
            }
        }

        files
    })
    .await
    .unwrap_or_default();

    axum::Json(serde_json::json!({
        "success": true,
        "data": result,
        "error": null
    }))
}

/// Read a CLAUDE.md file (restricted to CLAUDE.md files only)
async fn read_claude_md_file(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<String>> {
    let file_path = params
        .get("filePath")
        .or(params.get("file_path"))
        .cloned()
        .unwrap_or_default();

    // Validate the file path to prevent arbitrary file reads
    let path = std::path::Path::new(&file_path);
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    if !file_name.eq_ignore_ascii_case("CLAUDE.md")
        && !file_name.eq_ignore_ascii_case("AGENTS.md")
        && !file_name.eq_ignore_ascii_case("GEMINI.md")
    {
        return Json(ApiResponse::error(
            "Only CLAUDE.md, AGENTS.md, and GEMINI.md files can be read through this endpoint"
                .to_string(),
        ));
    }

    // Resolve symlinks and validate the canonical path doesn't escape expected dirs
    let canonical = match std::fs::canonicalize(&file_path) {
        Ok(p) => p,
        Err(e) => return Json(ApiResponse::error(format!("Failed to resolve path: {}", e))),
    };
    let home = std::env::var("HOME").unwrap_or_default();
    if !canonical.starts_with(&home) {
        return Json(ApiResponse::error(
            "File path must be within the user's home directory".to_string(),
        ));
    }

    match std::fs::read_to_string(&canonical) {
        Ok(content) => Json(ApiResponse::success(content)),
        Err(e) => Json(ApiResponse::error(format!("Failed to read file: {}", e))),
    }
}

/// Save a CLAUDE.md file — stub for web mode
async fn save_claude_md_file_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Saving CLAUDE.md files is not yet available in web mode".to_string(),
    ))
}

/// Get a single agent by ID — stub for web mode
async fn get_agent_by_id(Path(_id): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent not found".to_string()))
}

/// Update an agent — stub for web mode
async fn update_agent(
    Path(_id): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent management is not yet available in web mode".to_string(),
    ))
}

/// Delete an agent — stub for web mode
async fn delete_agent_handler(
    Path(_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent management is not yet available in web mode".to_string(),
    ))
}

/// Create agent — stub for web mode
async fn create_agent_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent creation is not yet available in web mode".to_string(),
    ))
}

/// Export an agent — stub for web mode
async fn export_agent(Path(_id): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error("Agent not found".to_string()))
}

/// Import agent — stub for web mode
async fn import_agent_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent import is not yet available in web mode".to_string(),
    ))
}

/// Import agent from file — stub for web mode
async fn import_agent_from_file_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent import is not yet available in web mode".to_string(),
    ))
}

/// Fetch GitHub agents — stub for web mode
async fn fetch_github_agents() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Fetch GitHub agent content — stub for web mode
async fn fetch_github_agent_content(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "GitHub agent fetching is not yet available in web mode".to_string(),
    ))
}

/// Import agent from GitHub — stub for web mode
async fn import_agent_from_github_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "GitHub agent import is not yet available in web mode".to_string(),
    ))
}

/// Execute agent — stub for web mode
async fn execute_agent_handler(
    Path(_agent_id): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Agent execution is not yet available in web mode".to_string(),
    ))
}

/// List agent runs — stub for web mode
async fn list_agent_runs() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Get agent run by ID — stub for web mode
async fn get_agent_run(Path(_id): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent run not found".to_string()))
}

/// Get agent run with real-time metrics — stub for web mode
async fn get_agent_run_metrics(Path(_id): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("Agent run not found".to_string()))
}

/// Kill agent session — stub for web mode
async fn kill_agent_session(Path(_run_id): Path<String>) -> Json<ApiResponse<bool>> {
    Json(ApiResponse::error(
        "Agent session management is not available in web mode".to_string(),
    ))
}

/// Get agent session status — stub for web mode
async fn get_agent_session_status(
    Path(_run_id): Path<String>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!(null)))
}

/// Cleanup finished processes — stub for web mode
async fn cleanup_finished_processes() -> Json<ApiResponse<Vec<i64>>> {
    Json(ApiResponse::success(vec![]))
}

/// Get agent session output — stub for web mode
async fn get_agent_session_output(Path(_run_id): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(String::new()))
}

/// Get live agent session output — stub for web mode
async fn get_live_agent_session_output(Path(_run_id): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::success(String::new()))
}

/// Stream agent session output — stub for web mode
async fn stream_agent_session_output(Path(_run_id): Path<String>) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Streaming not available in web mode".to_string(),
    ))
}

/// Load agent session history — stub for web mode
async fn load_agent_session_history(
    Path(_session_id): Path<String>,
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Storage: list tables — stub for web mode
async fn storage_list_tables() -> Json<ApiResponse<Vec<serde_json::Value>>> {
    Json(ApiResponse::success(vec![]))
}

/// Storage: update row — stub for web mode
async fn storage_update_row(
    Path((_table, _id)): Path<(String, String)>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

/// Storage: delete row — stub for web mode
async fn storage_delete_row(Path((_table, _id)): Path<(String, String)>) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

/// Storage: insert row — stub for web mode
async fn storage_insert_row(
    Path(_table): Path<String>,
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "Storage operations are not available in web mode".to_string(),
    ))
}

/// Storage: execute SQL — stub for web mode
async fn storage_execute_sql(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "SQL execution is not available in web mode".to_string(),
    ))
}

/// Storage: reset database — stub for web mode
async fn storage_reset_database() -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Database reset is not available in web mode".to_string(),
    ))
}

/// Hooks: get config — stub for web mode
async fn get_hooks_config(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "hooks": {}
    })))
}

/// Hooks: update config — stub for web mode
async fn update_hooks_config(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Hook configuration is not available in web mode".to_string(),
    ))
}

/// Hooks: validate command — stub for web mode
async fn validate_hook_command(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "valid": true,
        "message": "Validation not available in web mode"
    })))
}

/// Proxy settings: get — stub for web mode
async fn get_proxy_settings() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "enabled": false,
        "http_proxy": null,
        "https_proxy": null,
        "no_proxy": null,
        "all_proxy": null
    })))
}

/// Proxy settings: save — stub for web mode
async fn save_proxy_settings(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Proxy settings are not available in web mode".to_string(),
    ))
}

/// Set Claude binary path — stub for web mode
async fn set_claude_binary_path(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<()>> {
    Json(ApiResponse::error(
        "Setting binary path is not available in web mode".to_string(),
    ))
}

/// MCP: get single server — stub for web mode
async fn mcp_get_server(Path(_name): Path<String>) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error("MCP server not found".to_string()))
}

/// MCP: remove server — stub for web mode
async fn mcp_remove_server(Path(_name): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

/// MCP: add server — stub for web mode
async fn mcp_add_server(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

/// MCP: add server from JSON — stub for web mode
async fn mcp_add_json(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP server management is not available in web mode".to_string(),
    ))
}

/// MCP: import from Claude Desktop — stub for web mode
async fn mcp_import_claude_desktop(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::error(
        "MCP import is not available in web mode".to_string(),
    ))
}

/// MCP: serve — stub for web mode
async fn mcp_serve() -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP serve is not available in web mode".to_string(),
    ))
}

/// MCP: test connection — stub for web mode
async fn mcp_test_connection(Path(_name): Path<String>) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP connection testing is not available in web mode".to_string(),
    ))
}

/// MCP: reset project choices — stub for web mode
async fn mcp_reset_choices() -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP reset is not available in web mode".to_string(),
    ))
}

/// MCP: get server status — stub for web mode
async fn mcp_get_status() -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({})))
}

/// MCP: read project config — stub for web mode
async fn mcp_read_project_config(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    Json(ApiResponse::success(serde_json::json!({
        "mcpServers": {}
    })))
}

/// MCP: save project config — stub for web mode
async fn mcp_save_project_config(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "MCP project config save is not available in web mode".to_string(),
    ))
}

/// Helper: extract common checkpoint params from query parameters
fn extract_checkpoint_params(
    params: &std::collections::HashMap<String, String>,
) -> (String, String, String) {
    let session_id = params.get("sessionId").cloned().unwrap_or_default();
    let project_id = params.get("projectId").cloned().unwrap_or_default();
    let project_path = params.get("projectPath").cloned().unwrap_or_default();
    (session_id, project_id, project_path)
}

/// List checkpoints for a session
async fn list_checkpoints_handler(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let (session_id, project_id, project_path) = extract_checkpoint_params(&params);

    if session_id.is_empty() || project_path.is_empty() {
        return axum::Json(serde_json::json!({
            "success": true, "data": [], "error": null
        }));
    }

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
        Ok(mgr) => {
            let checkpoints = mgr.list_checkpoints().await;
            axum::Json(serde_json::json!({
                "success": true, "data": checkpoints, "error": null
            }))
        }
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": [], "error": format!("Failed to list checkpoints: {}", e)
        })),
    }
}

/// Create a checkpoint
async fn create_checkpoint_handler(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Restore to a checkpoint
async fn restore_checkpoint_handler(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Get a single checkpoint by ID
async fn get_checkpoint_handler(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Get diff for a checkpoint (compared to current working tree)
async fn get_checkpoint_diff_handler(
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

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/tmp".to_string());
    let claude_dir = std::path::PathBuf::from(&home).join(".claude");
    let storage = CheckpointStorage::new(claude_dir);

    match storage.load_checkpoint(&project_id, &session_id, &to_checkpoint_id) {
        Ok((_cp, snapshots, _msgs)) => {
            let mut modified_files = Vec::<serde_json::Value>::new();
            let mut added_files = Vec::<String>::new();
            let mut deleted_files = Vec::<String>::new();
            let pp = std::path::PathBuf::from(&project_path);

            for snapshot in &snapshots {
                let full_path = pp.join(&snapshot.file_path);
                if snapshot.is_deleted {
                    if full_path.exists() {
                        deleted_files.push(snapshot.file_path.to_string_lossy().to_string());
                    }
                } else if full_path.exists() {
                    let current = std::fs::read_to_string(&full_path).unwrap_or_default();
                    let hash = CheckpointStorage::calculate_file_hash(&current);
                    if hash != snapshot.hash {
                        modified_files.push(serde_json::json!({
                            "path": snapshot.file_path,
                            "additions": 0, "deletions": 0, "diffContent": null
                        }));
                    }
                } else {
                    added_files.push(snapshot.file_path.to_string_lossy().to_string());
                }
            }

            axum::Json(serde_json::json!({
                "success": true,
                "data": {
                    "fromCheckpointId": from_checkpoint_id,
                    "toCheckpointId": to_checkpoint_id,
                    "modifiedFiles": modified_files,
                    "addedFiles": added_files,
                    "deletedFiles": deleted_files,
                    "tokenDelta": 0
                },
                "error": null
            }))
        }
        Err(e) => axum::Json(serde_json::json!({
            "success": false, "data": null,
            "error": format!("Failed to get checkpoint diff: {}", e)
        })),
    }
}

/// Checkpoint: fork from a checkpoint
async fn fork_from_checkpoint(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Checkpoint: get session timeline
async fn get_session_timeline(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Checkpoint: update settings
async fn update_checkpoint_settings(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Checkpoint: track message
async fn track_checkpoint_message(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    if let Ok(mgr) = cs.get_or_create_manager(session_id, project_id, pp).await {
        let _ = mgr.track_message(message).await;
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

/// Checkpoint: check auto checkpoint
async fn check_auto_checkpoint(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Checkpoint: cleanup old checkpoints
async fn cleanup_old_checkpoints(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id.clone(), project_id.clone(), pp).await {
        Ok(mgr) => {
            match mgr.storage.cleanup_old_checkpoints(&project_id, &session_id, keep_count) {
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

/// Checkpoint: get settings
async fn get_checkpoint_settings(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    match cs.get_or_create_manager(session_id, project_id, pp).await {
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

/// Checkpoint: delete
async fn delete_checkpoint(
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

    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/tmp".to_string());
    let claude_dir = std::path::PathBuf::from(&home).join(".claude");
    let paths = CheckpointPaths::new(&claude_dir, &project_id, &session_id);

    let checkpoint_dir = paths.checkpoint_dir(&id);
    let refs_dir = paths.files_dir.join("refs").join(&id);
    let _ = std::fs::remove_dir_all(&checkpoint_dir);
    let _ = std::fs::remove_dir_all(&refs_dir);

    // Evict cached manager so it reloads from disk
    state.checkpoint_state.remove_manager(&session_id).await;

    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

/// Clear checkpoint manager for a session
async fn clear_checkpoint_manager(
    AxumState(state): AxumState<AppState>,
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let session_id = params.get("sessionId").cloned().unwrap_or_default();
    if !session_id.is_empty() {
        state.checkpoint_state.remove_manager(&session_id).await;
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

/// Track session messages
async fn track_session_messages(
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

    let cs = state.checkpoint_state.clone();
    let pp = std::path::PathBuf::from(&project_path);
    if let Ok(mgr) = cs.get_or_create_manager(session_id, project_id, pp).await {
        for line in messages.lines() {
            let _ = mgr.track_message(line.to_string()).await;
        }
    }
    axum::Json(serde_json::json!({
        "success": true, "data": null, "error": null
    }))
}

/// List directory contents — for web mode file browsing
async fn list_directory_contents(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let dir_path = params
        .get("directoryPath")
        .or(params.get("directory_path"))
        .cloned()
        .unwrap_or_default();

    // Enforce home-directory boundary before touching the filesystem.
    if let Err(e) = crate::path_guard::require_within_home(std::path::Path::new(&dir_path)) {
        return axum::Json(serde_json::json!({
            "success": false,
            "data": null,
            "error": format!("Access denied: {e}")
        }));
    }

    let result = tokio::task::spawn_blocking(move || {
        let mut entries = Vec::new();
        if let Ok(dir) = std::fs::read_dir(&dir_path) {
            for entry in dir.flatten().take(500) {
                let path = entry.path();
                let is_dir = path.is_dir();
                let name = entry.file_name().to_string_lossy().to_string();
                entries.push(serde_json::json!({
                    "name": name,
                    "path": path.to_string_lossy(),
                    "isDirectory": is_dir,
                    "isFile": !is_dir
                }));
            }
        }
        entries
    })
    .await
    .unwrap_or_default();

    axum::Json(serde_json::json!({
        "success": true,
        "data": result,
        "error": null
    }))
}

/// Search files — stub for web mode
async fn search_files_handler(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "success": true,
        "data": [],
        "error": null
    }))
}

/// Create the web server
pub async fn create_web_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let checkpoint_state = CheckpointState::new();
    let home_for_cp = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/tmp".to_string());
    let claude_dir = std::path::PathBuf::from(&home_for_cp).join(".claude");
    checkpoint_state.set_claude_dir(claude_dir).await;

    let state = AppState {
        active_sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        active_pids: Arc::new(Mutex::new(std::collections::HashMap::new())),
        session_config: Arc::new(Mutex::new(std::collections::HashMap::new())),
        checkpoint_state,
    };

    // CORS layer — restrict to localhost origins to prevent cross-origin attacks.
    // LAN devices should access via the host IP directly (same-origin), not via CORS.
    let localhost_origins = [
        "http://localhost".parse().unwrap(),
        "http://localhost:1420".parse().unwrap(),
        "http://localhost:5173".parse().unwrap(),
        "http://127.0.0.1".parse().unwrap(),
        "http://127.0.0.1:1420".parse().unwrap(),
        "http://127.0.0.1:5173".parse().unwrap(),
        "tauri://localhost".parse().unwrap(),
    ];
    let cors = CorsLayer::new()
        .allow_origin(localhost_origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION, ACCEPT]);

    // Create router with API endpoints
    let app = Router::new()
        // Health check
        .route(
            "/api/health",
            get(|| async {
                axum::Json(serde_json::json!({ "status": "ok", "uptime": "running" }))
            }),
        )
        // API routes (REST API equivalent of Tauri commands)
        .route("/api/projects", get(get_projects))
        .route("/api/projects/{project_id}/sessions", get(get_sessions))
        .route("/api/project-info", get(get_project_info))
        .route("/api/project/init", post(init_project))
        .route("/api/agents", get(get_agents).post(create_agent_post))
        .route(
            "/api/agents/{id}",
            get(get_agent_by_id)
                .put(update_agent)
                .delete(delete_agent_handler),
        )
        .route("/api/agents/{id}/export", get(export_agent))
        .route("/api/agents/import", post(import_agent_post))
        .route("/api/agents/import/file", post(import_agent_from_file_post))
        .route("/api/agents/github", get(fetch_github_agents))
        .route("/api/agents/github/content", get(fetch_github_agent_content))
        .route(
            "/api/agents/import/github",
            post(import_agent_from_github_post),
        )
        .route(
            "/api/agents/{agentId}/execute",
            post(execute_agent_handler),
        )
        .route("/api/agents/runs", get(list_agent_runs))
        .route("/api/agents/runs/{id}", get(get_agent_run))
        .route("/api/agents/runs/{id}/metrics", get(get_agent_run_metrics))
        .route(
            "/api/agents/sessions/{runId}/kill",
            post(kill_agent_session),
        )
        .route(
            "/api/agents/sessions/{runId}/status",
            get(get_agent_session_status),
        )
        .route(
            "/api/agents/sessions/cleanup",
            post(cleanup_finished_processes),
        )
        .route(
            "/api/agents/sessions/{runId}/output",
            get(get_agent_session_output),
        )
        .route(
            "/api/agents/sessions/{runId}/output/live",
            get(get_live_agent_session_output),
        )
        .route(
            "/api/agents/sessions/{runId}/output/stream",
            get(stream_agent_session_output),
        )
        .route(
            "/api/agents/sessions/{sessionId}/history",
            get(load_agent_session_history),
        )
        .route("/api/agents/live", get(get_live_agents))
        .route("/api/auth/status", get(get_auth_status))
        .route("/api/usage", get(get_usage))
        .route("/api/usage/range", get(get_usage_range))
        .route("/api/usage/sessions", get(get_usage_sessions))
        .route("/api/usage/details", get(get_usage_details))
        .route("/api/usage/window", get(get_usage_window))
        .route("/api/usage/cost", get(get_usage_cost))
        .route("/api/resources", get(get_resources))
        .route(
            "/api/integrations",
            get(get_integrations).post(save_integrations),
        )
        // Settings and configuration
        .route(
            "/api/settings/claude",
            get(get_claude_settings).post(save_claude_settings_post),
        )
        .route("/api/settings/claude/version", get(check_claude_version))
        .route(
            "/api/settings/claude/installations",
            get(list_claude_installations),
        )
        .route(
            "/api/settings/claude/binary-path",
            get(get_claude_binary_path_web).post(set_claude_binary_path),
        )
        .route(
            "/api/settings/system-prompt",
            get(get_system_prompt).post(save_system_prompt_post),
        )
        // CLAUDE.md management
        .route("/api/claude-md", get(find_claude_md_files))
        .route("/api/claude-md/read", get(read_claude_md_file))
        .route("/api/claude-md/save", post(save_claude_md_file_post))
        // Session management
        .route("/api/sessions/new", get(open_new_session))
        // Skills
        .route("/api/skills", get(get_skills_catalog_web))
        // Dynamic command discovery
        .route("/api/commands/builtin", get(get_builtin_commands))
        .route("/api/commands/agents", get(get_agents_list))
        .route("/api/commands/mcp", get(get_mcp_servers_list))
        // Slash commands
        .route(
            "/api/slash-commands",
            get(list_slash_commands).post(save_slash_command),
        )
        .route(
            "/api/slash-commands/{commandId}",
            get(get_slash_command).delete(delete_slash_command),
        )
        // Storage
        .route("/api/storage/tables", get(storage_list_tables))
        .route("/api/storage/tables/{tableName}", get(get_storage_table))
        .route(
            "/api/storage/tables/{tableName}/rows/{id}",
            put(storage_update_row).delete(storage_delete_row),
        )
        .route(
            "/api/storage/tables/{tableName}/rows",
            post(storage_insert_row),
        )
        .route("/api/storage/sql", post(storage_execute_sql))
        .route("/api/storage/reset", post(storage_reset_database))
        // MCP
        .route(
            "/api/mcp/servers",
            get(mcp_list).post(mcp_add_server),
        )
        .route(
            "/api/mcp/servers/{name}",
            get(mcp_get_server).delete(mcp_remove_server),
        )
        .route("/api/mcp/servers/json", post(mcp_add_json))
        .route(
            "/api/mcp/import/claude-desktop",
            post(mcp_import_claude_desktop),
        )
        .route("/api/mcp/serve", get(mcp_serve))
        .route(
            "/api/mcp/servers/{name}/test",
            get(mcp_test_connection),
        )
        .route("/api/mcp/reset-choices", post(mcp_reset_choices))
        .route("/api/mcp/status", get(mcp_get_status))
        .route(
            "/api/mcp/project-config",
            get(mcp_read_project_config).post(mcp_save_project_config),
        )
        // Session history
        .route(
            "/api/sessions/{session_id}/history/{project_id}",
            get(load_session_history),
        )
        .route("/api/sessions/running", get(list_running_claude_sessions))
        // Claude execution endpoints (read-only in web mode)
        .route("/api/sessions/execute", get(execute_claude_code))
        .route("/api/sessions/continue", get(continue_claude_code))
        .route("/api/sessions/resume", get(resume_claude_code))
        .route(
            "/api/sessions/{sessionId}/cancel",
            get(cancel_claude_execution),
        )
        .route(
            "/api/sessions/{sessionId}/output",
            get(get_claude_session_output),
        )
        // Home directory
        .route("/api/home-directory", get(get_home_directory))
        // File browsing
        .route("/api/files/list", get(list_directory_contents))
        .route("/api/files/search", get(search_files_handler))
        // Checkpoint management (wired to real CheckpointManager)
        .route("/api/checkpoints/clear", get(clear_checkpoint_manager))
        .route("/api/checkpoints/create", get(create_checkpoint_handler).post(create_checkpoint_handler))
        .route("/api/checkpoints", get(list_checkpoints_handler))
        .route("/api/checkpoints/restore", get(restore_checkpoint_handler).post(restore_checkpoint_handler))
        .route(
            "/api/checkpoints/{id}",
            get(get_checkpoint_handler).delete(delete_checkpoint),
        )
        .route("/api/checkpoints/{id}/diff", get(get_checkpoint_diff_handler))
        .route("/api/checkpoints/fork", get(fork_from_checkpoint).post(fork_from_checkpoint))
        .route("/api/checkpoints/timeline", get(get_session_timeline))
        .route(
            "/api/checkpoints/settings",
            get(get_checkpoint_settings).post(update_checkpoint_settings),
        )
        .route("/api/checkpoints/track-message", get(track_checkpoint_message).post(track_checkpoint_message))
        .route("/api/checkpoints/auto-check", get(check_auto_checkpoint))
        .route("/api/checkpoints/cleanup", get(cleanup_old_checkpoints).post(cleanup_old_checkpoints))
        .route("/api/checkpoints/track-sessions", get(track_session_messages).post(track_session_messages))
        // Proxy settings
        .route(
            "/api/settings/proxy",
            get(get_proxy_settings).post(save_proxy_settings),
        )
        // Hooks configuration
        .route(
            "/api/hooks/config",
            get(get_hooks_config).post(update_hooks_config),
        )
        .route("/api/hooks/validate", post(validate_hook_command))
        // Catch-all for unmapped commands (prevents HTML fallback errors)
        .route("/api/noop/{command}", get(noop_ok))
        // WebSocket endpoint for real-time Claude execution
        .route("/ws/claude", get(claude_websocket))
        // Serve embedded frontend assets with SPA fallback
        .fallback(serve_frontend)
        .layer(cors)
        .with_state(state);

    // Bind to localhost only by default to prevent unauthenticated LAN access.
    // To expose on the network, use a reverse proxy with authentication.
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    println!("🌐 Web server running on http://127.0.0.1:{}", port);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Start web server mode (alternative to Tauri GUI)
pub async fn start_web_mode(port: Option<u16>) -> Result<(), Box<dyn std::error::Error>> {
    let port = port.unwrap_or(8080);

    println!("🚀 Starting RuneCode in web server mode...");
    create_web_server(port).await
}
