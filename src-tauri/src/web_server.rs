// Submodules
pub mod http;
pub mod middleware;
pub mod ws;

use log::info;
use axum::http::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE};
use axum::http::Method;
use axum::routing::{get, post, put};
use axum::Router;
use rust_embed::Embed;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;

#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;

use crate::checkpoint::state::CheckpointState;

// ---------------------------------------------------------------------------
// Shared state and types
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    /// Track active WebSocket sessions for Claude execution.
    pub active_sessions:
        Arc<Mutex<std::collections::HashMap<String, tokio::sync::mpsc::Sender<String>>>>,
    /// Track child process PIDs so we can interrupt them.
    /// Key: WS session_id  Value: OS PID of the running Claude child process.
    pub active_pids: Arc<Mutex<std::collections::HashMap<String, u32>>>,
    /// Per-session runtime config (model, permission_mode).
    pub session_config: Arc<Mutex<std::collections::HashMap<String, SessionConfig>>>,
    /// Checkpoint state for managing checkpoint managers per session.
    pub checkpoint_state: CheckpointState,
    /// Startup secret used to authenticate requests from the frontend.
    pub startup_secret: String,
}

/// Runtime-mutable configuration for a single WS session.
#[derive(Clone, Debug, Default)]
pub struct SessionConfig {
    pub model: Option<String>,
    pub permission_mode: Option<String>,
    pub project_path: String,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ClaudeExecutionRequest {
    pub project_path: String,
    pub prompt: String,
    pub model: Option<String>,
    pub session_id: Option<String>,
    pub command_type: String,
    pub permission_mode: Option<String>,
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

// ---------------------------------------------------------------------------
// Binary discovery
// ---------------------------------------------------------------------------

/// Find Claude binary for web mode — use bundled binary first, then system paths.
pub fn find_claude_binary_web() -> Result<String, String> {
    let bundled_binary = "src-tauri/binaries/claude-code-x86_64-unknown-linux-gnu";
    if std::path::Path::new(bundled_binary).exists() {
        return Ok(bundled_binary.to_string());
    }

    for name in &["claude", "claude-code"] {
        if let Ok(path) = which::which(name) {
            return Ok(path.to_string_lossy().to_string());
        }
    }

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
            return Ok(candidate.clone());
        }
    }

    let installations = crate::claude_binary::discover_claude_installations();
    if let Some(best) = installations.into_iter().next() {
        return Ok(best.path);
    }

    Err("Claude binary not found in bundled location or system paths".to_string())
}

// ---------------------------------------------------------------------------
// Frontend asset serving
// ---------------------------------------------------------------------------

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
        None => match FrontendAssets::get("index.html") {
            Some(content) => (
                [(axum::http::header::CONTENT_TYPE, "text/html")],
                content.data.into_owned(),
            )
                .into_response(),
            None => axum::http::StatusCode::NOT_FOUND.into_response(),
        },
    }
}

// ---------------------------------------------------------------------------
// create_web_server and start_web_mode
// ---------------------------------------------------------------------------

/// Create and run the web server on `port`.
pub async fn create_web_server(port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let checkpoint_state = CheckpointState::new();
    let home_for_cp = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| std::env::temp_dir().to_string_lossy().into_owned());
    let claude_dir = std::path::PathBuf::from(&home_for_cp).join(".claude");
    checkpoint_state.set_claude_dir(claude_dir).await;

    let startup_secret = uuid::Uuid::new_v4().to_string();
    info!(
        "Web server startup secret generated (first 8 chars: {}...)",
        &startup_secret[..8]
    );

    let state = AppState {
        active_sessions: Arc::new(Mutex::new(std::collections::HashMap::new())),
        active_pids: Arc::new(Mutex::new(std::collections::HashMap::new())),
        session_config: Arc::new(Mutex::new(std::collections::HashMap::new())),
        checkpoint_state,
        startup_secret: startup_secret.clone(),
    };

    let localhost_origins = [
        "http://localhost".parse().expect("valid URL literal"),
        "http://localhost:1420".parse().expect("valid URL literal"),
        "http://localhost:5173".parse().expect("valid URL literal"),
        "http://127.0.0.1".parse().expect("valid URL literal"),
        "http://127.0.0.1:1420".parse().expect("valid URL literal"),
        "http://127.0.0.1:5173".parse().expect("valid URL literal"),
        "tauri://localhost".parse().expect("valid URL literal"),
    ];
    let cors = CorsLayer::new()
        .allow_origin(localhost_origins)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([CONTENT_TYPE, AUTHORIZATION, ACCEPT]);

    // Bring submodule handlers into scope for the router
    use http::agents::*;
    use http::checkpoints::*;
    use http::discovery::{
        get_agents_list, get_builtin_commands, get_mcp_servers_list, get_skills_catalog_web,
    };
    use http::docker::{get_docker_handler, get_processes_handler};
    use http::files::{
        find_claude_md_files, get_home_directory, list_directory_contents,
        read_claude_md_file, save_claude_md_file_post, search_files_handler,
    };
    use http::handlers::*;
    use http::hooks::*;
    use http::mcp::*;
    use http::sessions::*;
    use http::storage::*;
    use http::usage::*;
    use ws::claude_websocket;

    let app = Router::new()
        // Health check
        .route(
            "/api/health",
            get(|| async {
                axum::Json(serde_json::json!({ "status": "ok", "uptime": "running" }))
            }),
        )
        // Projects / sessions
        .route("/api/projects", get(get_projects))
        .route("/api/projects/{project_id}/sessions", get(get_sessions))
        .route("/api/project-info", get(get_project_info))
        .route("/api/project/init", post(init_project))
        // Agents
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
        .route("/api/agents/import/github", post(import_agent_from_github_post))
        .route("/api/agents/{agentId}/execute", post(execute_agent_handler))
        .route("/api/agents/runs", get(list_agent_runs))
        .route("/api/agents/runs/{id}", get(get_agent_run))
        .route("/api/agents/runs/{id}/metrics", get(get_agent_run_metrics))
        .route("/api/agents/sessions/{runId}/kill", post(kill_agent_session))
        .route("/api/agents/sessions/{runId}/status", get(get_agent_session_status))
        .route("/api/agents/sessions/cleanup", post(cleanup_finished_processes))
        .route("/api/agents/sessions/{runId}/output", get(get_agent_session_output))
        .route("/api/agents/sessions/{runId}/output/live", get(get_live_agent_session_output))
        .route("/api/agents/sessions/{runId}/output/stream", get(stream_agent_session_output))
        .route("/api/agents/sessions/{sessionId}/history", get(load_agent_session_history))
        .route("/api/agents/live", get(get_live_agents))
        // Auth / usage
        .route("/api/auth/status", get(get_auth_status))
        .route("/api/usage", get(get_usage))
        .route("/api/usage/range", get(get_usage_range))
        .route("/api/usage/sessions", get(get_usage_sessions))
        .route("/api/usage/details", get(get_usage_details))
        .route("/api/usage/window", get(get_usage_window))
        .route("/api/usage/cost", get(get_usage_cost))
        .route("/api/resources", get(get_resources))
        .route("/api/resources/docker", get(get_docker_handler))
        .route("/api/resources/processes", get(get_processes_handler))
        .route("/api/integrations", get(get_integrations).post(save_integrations))
        // Settings
        .route("/api/settings/claude", get(get_claude_settings).post(save_claude_settings_post))
        .route("/api/settings/claude/version", get(check_claude_version))
        .route("/api/settings/claude/installations", get(list_claude_installations))
        .route("/api/settings/claude/binary-path", get(get_claude_binary_path_web).post(set_claude_binary_path))
        .route("/api/settings/system-prompt", get(get_system_prompt).post(save_system_prompt_post))
        // CLAUDE.md
        .route("/api/claude-md", get(find_claude_md_files))
        .route("/api/claude-md/read", get(read_claude_md_file))
        .route("/api/claude-md/save", post(save_claude_md_file_post))
        // Session management
        .route("/api/sessions/new", get(open_new_session))
        // Skills / commands discovery
        .route("/api/skills", get(get_skills_catalog_web))
        .route("/api/commands/builtin", get(get_builtin_commands))
        .route("/api/commands/agents", get(get_agents_list))
        .route("/api/commands/mcp", get(get_mcp_servers_list))
        // Slash commands
        .route("/api/slash-commands", get(list_slash_commands).post(save_slash_command))
        .route("/api/slash-commands/{commandId}", get(get_slash_command).delete(delete_slash_command))
        // Storage
        .route("/api/storage/tables", get(storage_list_tables))
        .route("/api/storage/tables/{tableName}", get(get_storage_table))
        .route("/api/storage/tables/{tableName}/rows/{id}", put(storage_update_row).delete(storage_delete_row))
        .route("/api/storage/tables/{tableName}/rows", post(storage_insert_row))
        .route("/api/storage/sql", post(storage_execute_sql))
        .route("/api/storage/reset", post(storage_reset_database))
        // MCP
        .route("/api/mcp/servers", get(mcp_list).post(mcp_add_server))
        .route("/api/mcp/servers/{name}", get(mcp_get_server).delete(mcp_remove_server))
        .route("/api/mcp/servers/json", post(mcp_add_json))
        .route("/api/mcp/import/claude-desktop", post(mcp_import_claude_desktop))
        .route("/api/mcp/serve", get(mcp_serve))
        .route("/api/mcp/servers/{name}/test", get(mcp_test_connection))
        .route("/api/mcp/reset-choices", post(mcp_reset_choices))
        .route("/api/mcp/status", get(mcp_get_status))
        .route("/api/mcp/project-config", get(mcp_read_project_config).post(mcp_save_project_config))
        // Session history
        .route("/api/sessions/{session_id}/history/{project_id}", get(load_session_history))
        .route("/api/sessions/running", get(list_running_claude_sessions))
        .route("/api/sessions/execute", get(execute_claude_code))
        .route("/api/sessions/continue", get(continue_claude_code))
        .route("/api/sessions/resume", get(resume_claude_code))
        .route("/api/sessions/{sessionId}/cancel", get(cancel_claude_execution))
        .route("/api/sessions/{sessionId}/output", get(get_claude_session_output))
        // Home directory / file browsing
        .route("/api/home-directory", get(get_home_directory))
        .route("/api/files/list", get(list_directory_contents))
        .route("/api/files/search", get(search_files_handler))
        // Checkpoints
        .route("/api/checkpoints/clear", get(clear_checkpoint_manager))
        .route("/api/checkpoints/create", get(create_checkpoint_handler).post(create_checkpoint_handler))
        .route("/api/checkpoints", get(list_checkpoints_handler))
        .route("/api/checkpoints/restore", get(restore_checkpoint_handler).post(restore_checkpoint_handler))
        .route("/api/checkpoints/{id}", get(get_checkpoint_handler).delete(delete_checkpoint))
        .route("/api/checkpoints/{id}/diff", get(get_checkpoint_diff_handler))
        .route("/api/checkpoints/fork", get(fork_from_checkpoint).post(fork_from_checkpoint))
        .route("/api/checkpoints/timeline", get(get_session_timeline))
        .route("/api/checkpoints/settings", get(get_checkpoint_settings).post(update_checkpoint_settings))
        .route("/api/checkpoints/track-message", get(track_checkpoint_message).post(track_checkpoint_message))
        .route("/api/checkpoints/auto-check", get(check_auto_checkpoint))
        .route("/api/checkpoints/cleanup", get(cleanup_old_checkpoints).post(cleanup_old_checkpoints))
        .route("/api/checkpoints/track-sessions", get(track_session_messages).post(track_session_messages))
        // Proxy / hooks
        .route("/api/settings/proxy", get(get_proxy_settings).post(save_proxy_settings))
        .route("/api/hooks/config", get(get_hooks_config).post(update_hooks_config))
        .route("/api/hooks/validate", post(validate_hook_command))
        // Catch-all
        .route("/api/noop/{command}", get(noop_ok))
        // WebSocket
        .route("/ws/claude", get(claude_websocket))
        // SPA fallback
        .fallback(serve_frontend)
        .layer(cors)
        .layer(axum::middleware::from_fn_with_state(
            state.clone(),
            middleware::require_startup_token,
        ))
        .with_state(state);

    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    info!("Web server running on http://127.0.0.1:{}", port);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// Start web server mode (alternative to Tauri GUI).
pub async fn start_web_mode(port: Option<u16>) -> Result<(), Box<dyn std::error::Error>> {
    let port = port.unwrap_or(8080);
    info!("Starting RuneCode in web server mode...");
    create_web_server(port).await
}
