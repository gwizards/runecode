use axum::extract::ws::{Message, WebSocket};
use axum::extract::Query;
use axum::http::Method;
use axum::{
    extract::{Path, State as AxumState, WebSocketUpgrade},
    response::{IntoResponse, Json, Response},
    routing::{delete, get, post},
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
use tower_http::cors::{Any, CorsLayer};
use which;

#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;

use crate::commands;

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
}

#[derive(Debug, Deserialize)]
pub struct ClaudeExecutionRequest {
    pub project_path: String,
    pub prompt: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub command_type: String, // "execute", "continue", or "resume"
}

#[derive(Deserialize)]
pub struct QueryParams {
    #[serde(default)]
    pub project_path: Option<String>,
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
    let output = std::process::Command::new("claude")
        .args(["auth", "status"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            match serde_json::from_str::<serde_json::Value>(&stdout) {
                Ok(json) => axum::Json(ApiResponse::success(json)).into_response(),
                Err(_) => axum::Json(ApiResponse::success(serde_json::json!({
                    "loggedIn": false,
                    "subscriptionType": "unknown"
                })))
                .into_response(),
            }
        }
        Err(_) => axum::Json(ApiResponse::success(serde_json::json!({
            "loggedIn": false,
            "subscriptionType": "unknown"
        })))
        .into_response(),
    }
}

/// Usage endpoint - returns real usage stats from ~/.claude JSONL files
async fn get_usage(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let days = params
        .get("days")
        .and_then(|d| d.parse::<u32>().ok());
    match commands::usage::get_usage_stats(days) {
        Ok(stats) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Err(e) => Json(ApiResponse::error(e)),
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
    match commands::usage::get_usage_by_date_range(start, end) {
        Ok(stats) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Err(e) => Json(ApiResponse::error(e)),
    }
}

/// Usage sessions - returns real session-level stats
async fn get_usage_sessions(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let since = params.get("since").cloned();
    let until = params.get("until").cloned();
    let order = params.get("order").cloned();
    match commands::usage::get_session_stats(since, until, order) {
        Ok(sessions) => Json(ApiResponse::success(
            serde_json::to_value(sessions).unwrap_or_default(),
        )),
        Err(e) => Json(ApiResponse::error(e)),
    }
}

/// Usage details - returns real per-entry usage data
async fn get_usage_details(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let project_path = params.get("project_path").cloned();
    let date = params.get("date").cloned();
    match commands::usage::get_usage_details(project_path, date) {
        Ok(details) => Json(ApiResponse::success(
            serde_json::to_value(details).unwrap_or_default(),
        )),
        Err(e) => Json(ApiResponse::error(e)),
    }
}

/// Get 5-hour rolling usage window for Max/Pro plan users
async fn get_usage_window() -> impl IntoResponse {
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
    // Output tokens count at full rate (1x)
    // Input tokens count at ~0.2x of output rate
    // Cache creation tokens count at ~0.25x of output rate
    // Cache read tokens are essentially free (0x)
    let effective_tokens = (total_input as f64 * 0.2) + (total_output as f64) + (total_cache_creation as f64 * 0.25);
    let estimated_limit: f64 = 5_000_000.0;
    let usage_percent = (effective_tokens / estimated_limit * 100.0).min(100.0);

    axum::Json(serde_json::json!({
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
    }))
}

/// Get usage cost info by running `claude -p "/cost" --output-format json`
async fn get_usage_cost() -> impl IntoResponse {
    let claude_bin = find_claude_binary_web().unwrap_or_else(|_| "claude".to_string());

    let output = std::process::Command::new(&claude_bin)
        .args(["-p", "/cost", "--output-format", "json"])
        .output();

    match output {
        Ok(out) => {
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
        Err(_) => axum::Json(serde_json::json!({
            "total_cost_usd": 0,
            "result": "Claude binary not available"
        }))
        .into_response(),
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
    let resources = crate::commands::resources::get_system_resources();
    axum::Json(resources)
}

/// Get integrations configuration
async fn get_integrations() -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_default();
    let config_path = format!("{}/.runecode/integrations.json", home);

    match std::fs::read_to_string(&config_path) {
        Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(config) => axum::Json(config).into_response(),
            Err(_) => axum::Json(serde_json::json!({})).into_response(),
        },
        Err(_) => axum::Json(serde_json::json!({})).into_response(),
    }
}

/// Save integrations configuration
async fn save_integrations(axum::Json(config): axum::Json<serde_json::Value>) -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_default();
    let dir_path = format!("{}/.runecode", home);
    let config_path = format!("{}/integrations.json", dir_path);

    let _ = std::fs::create_dir_all(&dir_path);
    match serde_json::to_string_pretty(&config) {
        Ok(content) => match std::fs::write(&config_path, content) {
            Ok(_) => axum::http::StatusCode::OK.into_response(),
            Err(e) => {
                (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e.to_string()).into_response()
            }
        },
        Err(e) => (axum::http::StatusCode::BAD_REQUEST, e.to_string()).into_response(),
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
        .unwrap_or_default();
    let name = body
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("New Project");

    match crate::commands::project_info::initialize_project(path.to_string(), name.to_string()) {
        Ok(_) => axum::http::StatusCode::OK.into_response(),
        Err(e) => (axum::http::StatusCode::INTERNAL_SERVER_ERROR, e).into_response(),
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

    let info = crate::commands::project_info::collect_project_info(&project_path);
    axum::Json(info).into_response()
}

/// Get skills catalog
async fn get_skills_catalog_web() -> impl IntoResponse {
    let catalog = crate::commands::skills::get_skills_catalog();
    axum::Json(catalog)
}

/// Discover built-in commands from the Claude binary
async fn get_builtin_commands() -> impl IntoResponse {
    let output = std::process::Command::new("claude")
        .args(["--help"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let commands = parse_claude_help_output(&stdout);
            axum::Json(ApiResponse::success(commands))
        }
        Err(_) => {
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
    let output = std::process::Command::new("claude")
        .arg("agents")
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let agents = parse_agents_output(&stdout);
            axum::Json(ApiResponse::success(agents))
        }
        Err(_) => axum::Json(ApiResponse::success(serde_json::json!([]))),
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
    let output = std::process::Command::new("claude")
        .args(["mcp", "list"])
        .output();

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let servers = parse_mcp_list_output(&stdout);
            axum::Json(ApiResponse::success(servers))
        }
        Err(_) => axum::Json(ApiResponse::success(serde_json::json!([]))),
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
) -> Json<ApiResponse<Vec<serde_json::Value>>> {
    match commands::claude::load_session_history(session_id, project_id).await {
        Ok(history) => Json(ApiResponse::success(history)),
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
async fn cancel_claude_execution(Path(sessionId): Path<String>) -> Json<ApiResponse<()>> {
    // In web mode, we don't have a way to cancel the subprocess cleanly
    // The WebSocket closing should handle cleanup
    println!("[TRACE] Cancel request for session: {}", sessionId);
    Json(ApiResponse::success(()))
}

/// Get Claude session output
async fn get_claude_session_output(Path(sessionId): Path<String>) -> Json<ApiResponse<String>> {
    // In web mode, output is streamed via WebSocket, not stored
    println!("[TRACE] Output request for session: {}", sessionId);
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
    let session_id = uuid::Uuid::new_v4().to_string();

    println!(
        "[TRACE] WebSocket handler started - session_id: {}",
        session_id
    );

    // Channel for sending output to WebSocket
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(100);

    // Store session in state
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.insert(session_id.clone(), tx);
        println!(
            "[TRACE] Session stored in state - active sessions count: {}",
            sessions.len()
        );
    }

    // Task to forward channel messages to WebSocket
    let session_id_for_forward = session_id.clone();
    let forward_task = tokio::spawn(async move {
        println!(
            "[TRACE] Forward task started for session {}",
            session_id_for_forward
        );
        while let Some(message) = rx.recv().await {
            println!("[TRACE] Forwarding message to WebSocket: {}", message);
            if sender.send(Message::Text(message.into())).await.is_err() {
                println!("[TRACE] Failed to send message to WebSocket - connection closed");
                break;
            }
        }
        println!(
            "[TRACE] Forward task ended for session {}",
            session_id_for_forward
        );
    });

    // Handle incoming messages from WebSocket
    println!("[TRACE] Starting to listen for WebSocket messages");
    while let Some(msg) = receiver.next().await {
        println!("[TRACE] Received WebSocket message: {:?}", msg);
        if let Ok(msg) = msg {
            if let Message::Text(text) = msg {
                println!(
                    "[TRACE] WebSocket text message received - length: {} chars",
                    text.len()
                );
                println!("[TRACE] WebSocket message content: {}", text);
                match serde_json::from_str::<ClaudeExecutionRequest>(&text) {
                    Ok(request) => {
                        println!("[TRACE] Successfully parsed request: {:?}", request);
                        println!("[TRACE] Command type: {}", request.command_type);
                        println!("[TRACE] Project path: {}", request.project_path);
                        println!("[TRACE] Prompt length: {} chars", request.prompt.len());

                        // Execute Claude command based on request type
                        let session_id_clone = session_id.clone();
                        let state_clone = state.clone();

                        println!(
                            "[TRACE] Spawning task to execute command: {}",
                            request.command_type
                        );
                        tokio::spawn(async move {
                            println!("[TRACE] Task started for command execution");
                            let result = match request.command_type.as_str() {
                                "execute" => {
                                    println!("[TRACE] Calling execute_claude_command");
                                    execute_claude_command(
                                        request.project_path,
                                        request.prompt,
                                        request.model.unwrap_or_default(),
                                        session_id_clone.clone(),
                                        state_clone.clone(),
                                    )
                                    .await
                                }
                                "continue" => {
                                    println!("[TRACE] Calling continue_claude_command");
                                    continue_claude_command(
                                        request.project_path,
                                        request.prompt,
                                        request.model.unwrap_or_default(),
                                        session_id_clone.clone(),
                                        state_clone.clone(),
                                    )
                                    .await
                                }
                                "resume" => {
                                    println!("[TRACE] Calling resume_claude_command");
                                    resume_claude_command(
                                        request.project_path,
                                        request.session_id.unwrap_or_default(),
                                        request.prompt,
                                        request.model.unwrap_or_default(),
                                        session_id_clone.clone(),
                                        state_clone.clone(),
                                    )
                                    .await
                                }
                                _ => {
                                    println!(
                                        "[TRACE] Unknown command type: {}",
                                        request.command_type
                                    );
                                    Err("Unknown command type".to_string())
                                }
                            };

                            println!(
                                "[TRACE] Command execution finished with result: {:?}",
                                result
                            );

                            // Send completion message
                            if let Some(sender) = state_clone
                                .active_sessions
                                .lock()
                                .await
                                .get(&session_id_clone)
                            {
                                let completion_msg = match result {
                                    Ok(_) => json!({
                                        "type": "completion",
                                        "status": "success"
                                    }),
                                    Err(e) => json!({
                                        "type": "completion",
                                        "status": "error",
                                        "error": e
                                    }),
                                };
                                println!("[TRACE] Sending completion message: {}", completion_msg);
                                let _ = sender.send(completion_msg.to_string()).await;
                            } else {
                                println!("[TRACE] Session not found in active sessions when sending completion");
                            }
                        });
                    }
                    Err(e) => {
                        println!("[TRACE] Failed to parse WebSocket request: {}", e);
                        println!("[TRACE] Raw message that failed to parse: {}", text);

                        // Send error back to client
                        let error_msg = json!({
                            "type": "error",
                            "message": format!("Failed to parse request: {}", e)
                        });
                        if let Some(sender_tx) = state.active_sessions.lock().await.get(&session_id)
                        {
                            let _ = sender_tx.send(error_msg.to_string()).await;
                        }
                    }
                }
            } else if let Message::Close(_) = msg {
                println!("[TRACE] WebSocket close message received");
                break;
            } else {
                println!("[TRACE] Non-text WebSocket message received: {:?}", msg);
            }
        } else {
            println!("[TRACE] Error receiving WebSocket message");
        }
    }

    println!("[TRACE] WebSocket message loop ended");

    // Clean up session
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.remove(&session_id);
        println!(
            "[TRACE] Session {} removed from state - remaining sessions: {}",
            session_id,
            sessions.len()
        );
    }

    forward_task.abort();
    println!("[TRACE] WebSocket handler ended for session {}", session_id);
}

// Claude command execution functions for WebSocket streaming
async fn execute_claude_command(
    project_path: String,
    prompt: String,
    model: String,
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
        "--dangerously-skip-permissions".to_string(),
    ]);
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
        "--dangerously-skip-permissions",
    ]);
    cmd.args(&args);
    cmd.current_dir(&project_path);
    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    // Spawn and stream output
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude: {}", e))?;
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
        "--dangerously-skip-permissions",
    ]);
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
    if !exit_status.success() {
        return Err(format!(
            "Claude execution failed with exit code: {:?}",
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

/// No-op handler returning empty array — for list commands not available in web mode
async fn noop_empty_array() -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "success": true,
        "data": [],
        "error": null
    }))
}

/// Create the web server
pub async fn create_web_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let state = AppState {
        active_sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
    };

    // CORS layer to allow requests from phone browsers
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    // Create router with API endpoints
    let app = Router::new()
        // API routes (REST API equivalent of Tauri commands)
        .route("/api/projects", get(get_projects))
        .route("/api/projects/{project_id}/sessions", get(get_sessions))
        .route("/api/project-info", get(get_project_info))
        .route("/api/project/init", post(init_project))
        .route("/api/agents", get(get_agents))
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
        .route("/api/settings/claude", get(get_claude_settings))
        .route("/api/settings/claude/version", get(check_claude_version))
        .route(
            "/api/settings/claude/installations",
            get(list_claude_installations),
        )
        .route(
            "/api/settings/claude/binary-path",
            get(get_claude_binary_path_web),
        )
        .route("/api/settings/system-prompt", get(get_system_prompt))
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
        .route("/api/storage/tables/{tableName}", get(get_storage_table))
        // MCP
        .route("/api/mcp/servers", get(mcp_list))
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
        // Checkpoint management (stubs for web mode)
        .route("/api/checkpoints/clear", get(noop_ok))
        .route("/api/checkpoints/create", post(noop_ok))
        .route("/api/checkpoints", get(noop_empty_array))
        .route("/api/checkpoints/{id}/diff", get(noop_ok))
        // Catch-all for unmapped commands (prevents HTML fallback errors)
        .route("/api/noop/{command}", get(noop_ok))
        // WebSocket endpoint for real-time Claude execution
        .route("/ws/claude", get(claude_websocket))
        // Serve embedded frontend assets with SPA fallback
        .fallback(serve_frontend)
        .layer(cors)
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("🌐 Web server running on http://0.0.0.0:{}", port);
    println!("📱 Access from phone: http://YOUR_PC_IP:{}", port);

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
