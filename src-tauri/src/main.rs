// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checkpoint;
mod claude_binary;
mod commands;
mod process;
mod terminal_server;

use checkpoint::state::CheckpointState;
use commands::agents::{
    cleanup_finished_processes, create_agent, delete_agent, execute_agent, export_agent,
    export_agent_to_file, fetch_github_agent_content, fetch_github_agents, get_agent,
    get_agent_run, get_agent_run_with_real_time_metrics, get_claude_binary_path,
    get_live_session_output, get_session_output, get_session_status, import_agent,
    import_agent_from_file, import_agent_from_github, init_database, kill_agent_session,
    list_agent_runs, list_agent_runs_with_metrics, list_agents, list_claude_installations,
    list_running_sessions, load_agent_session_history, set_claude_binary_path,
    stream_session_output, update_agent, AgentDb,
};
use commands::claude::{
    cancel_claude_execution, check_auto_checkpoint, check_claude_version, cleanup_old_checkpoints,
    clear_checkpoint_manager, continue_claude_code, create_checkpoint, create_project,
    execute_claude_code, find_claude_md_files, fork_from_checkpoint, get_checkpoint_diff,
    get_checkpoint_settings, get_checkpoint_state_stats, get_claude_session_output,
    get_claude_settings, get_home_directory, get_hooks_config, get_project_sessions,
    get_recently_modified_files, get_session_timeline, get_system_prompt, list_checkpoints,
    list_directory_contents, list_projects, list_running_claude_sessions, load_session_history,
    open_new_session, read_claude_md_file, restore_checkpoint, resume_claude_code,
    save_claude_md_file, save_claude_settings, save_system_prompt, search_files,
    track_checkpoint_message, track_session_messages, update_checkpoint_settings,
    check_node_installed, install_claude_code, install_node, update_hooks_config,
    validate_hook_command, ClaudeProcessState,
};
use commands::mcp::{
    mcp_add, mcp_add_from_claude_desktop, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list,
    mcp_read_project_config, mcp_remove, mcp_reset_project_choices, mcp_save_project_config,
    mcp_serve, mcp_test_connection,
};

use commands::helicone::post_to_helicone;
use commands::project_info::{get_project_info, initialize_project};
use commands::proxy::{apply_proxy_settings, get_proxy_settings, save_proxy_settings};
use commands::resources::get_system_resources;
use commands::skills::get_skills_catalog;
use commands::storage::{
    storage_delete_row, storage_execute_sql, storage_insert_row, storage_list_tables,
    storage_read_table, storage_reset_database, storage_update_row,
};
use commands::ruflo::{
    check_ruflo_installed, install_ruflo, activate_ruflo_mcp, deactivate_ruflo_mcp,
    create_ruflo_slash_command, create_ddd_optimization_command, init_ruflo_project,
    get_ruflo_project_status, get_ruflo_swarm_status, uninstall_ruflo,
    get_ruflo_memory_stats, sync_ruflo_memory_local, consolidate_ruflo_memory,
    set_ruflo_memory_backend,
};
use commands::usage::{
    get_session_stats, get_usage_by_date_range, get_usage_details, get_usage_stats,
    load_usage_ledgers, persist_usage_ledger,
};
use process::ProcessRegistryState;
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Embedded terminal server port — stored in app state so the frontend can
// retrieve it via the `get_terminal_port` IPC command.
// ---------------------------------------------------------------------------

/// Holds the port the embedded terminal WebSocket server is listening on.
/// A value of 0 means the server failed to start.
pub struct TerminalServerPort(pub u16);

/// Return the port the embedded terminal WebSocket server is listening on.
/// The frontend uses this to construct `ws://127.0.0.1:<port>/ws/terminal`.
#[tauri::command]
fn get_terminal_port(state: tauri::State<TerminalServerPort>) -> u16 {
    state.0
}

/// Returns OS platform and feature availability flags used by the frontend
/// to conditionally show/hide options that don't apply on every platform.
#[tauri::command]
fn get_system_info() -> serde_json::Value {
    let platform = if cfg!(target_os = "windows") { "windows" }
                   else if cfg!(target_os = "macos") { "macos" }
                   else { "linux" };

    // tmux is not available on Windows (no native package; WSL is a separate env).
    // On Unix, do a cheap PATH lookup — no child process needed.
    let tmux_available = if cfg!(target_os = "windows") {
        false
    } else {
        which::which("tmux").is_ok()
    };

    serde_json::json!({
        "platform": platform,
        "tmux_available": tmux_available,
    })
}

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

// ---------------------------------------------------------------------------
// Round 4: Global startup log — accessible from main() and the setup closure.
// Uses once_cell so the file handle is initialized once and shared everywhere.
// On Windows release builds, windows_subsystem = "windows" suppresses stderr,
// so writing to a file is the only reliable way to capture startup diagnostics.
// ---------------------------------------------------------------------------
static STARTUP_LOG: once_cell::sync::Lazy<std::sync::Mutex<Option<std::fs::File>>> =
    once_cell::sync::Lazy::new(|| std::sync::Mutex::new(None));

fn startup_log_write(msg: &str) {
    let timestamped = format!(
        "[{}] {}\n",
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ"),
        msg
    );
    if let Ok(mut guard) = STARTUP_LOG.lock() {
        if let Some(ref mut f) = *guard {
            use std::io::Write;
            let _ = f.write_all(timestamped.as_bytes());
            let _ = f.flush();
        }
    }
    // Also emit to stderr — visible in debug builds and terminal launches.
    eprintln!("{}", timestamped.trim_end());
}

macro_rules! startup_log {
    ($($arg:tt)*) => { startup_log_write(&format!($($arg)*)) }
}

// ---------------------------------------------------------------------------
// Round 1: Open the startup log file before anything else.
// Path:
//   Windows : %APPDATA%\runecode\startup.log
//   macOS   : ~/Library/Application Support/runecode/startup.log
//   Linux   : ~/.local/share/runecode/startup.log
// dirs::data_dir() returns all three correctly.
// ---------------------------------------------------------------------------
fn init_startup_log() -> Option<std::fs::File> {
    let log_path = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .map(|d| d.join("runecode").join("startup.log"))?;

    if let Some(parent) = log_path.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }

    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .ok()
}

// ---------------------------------------------------------------------------
// Round 3: WebView2 detection on Windows.
// If WebView2 is absent, Tauri silently exits with no window and no error.
// This check writes a diagnostic entry to startup.log before Tauri init so
// the cause is captured even if Tauri never gets to run.
// ---------------------------------------------------------------------------
#[cfg(target_os = "windows")]
fn check_webview2() -> Result<(), String> {
    // System-wide WebView2 installation (machine-level).
    let machine_key = r"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let output = crate::claude_binary::silent_command("reg")
        .args(["query", machine_key, "/v", "pv"])
        .output();

    match output {
        Ok(o) if o.status.success() => return Ok(()),
        _ => {}
    }

    // Per-user WebView2 installation.
    let user_key = r"HKEY_CURRENT_USER\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let output2 = crate::claude_binary::silent_command("reg")
        .args(["query", user_key, "/v", "pv"])
        .output();

    match output2 {
        Ok(o) if o.status.success() => Ok(()),
        _ => Err("WebView2 runtime not detected".to_string()),
    }
}

#[cfg(not(target_os = "windows"))]
fn check_webview2() -> Result<(), String> {
    Ok(())
}

fn main() {
    // -----------------------------------------------------------------------
    // Round 1: Open startup log file — the very first thing, before anything
    // else.  This file survives the windows_subsystem = "windows" suppression
    // that silences stderr in Windows release builds.
    // -----------------------------------------------------------------------
    if let Some(f) = init_startup_log() {
        *STARTUP_LOG.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    }

    startup_log!(
        "RuneCode {} starting",
        env!("CARGO_PKG_VERSION")
    );
    startup_log!(
        "OS: {} {}",
        std::env::consts::OS,
        std::env::consts::ARCH
    );

    // -----------------------------------------------------------------------
    // Round 2: Panic hook — installed before env_logger::init() so that panics
    // during logger initialization are also captured.
    // Writes to panic.log (sibling of startup.log) and to stderr.
    // -----------------------------------------------------------------------
    let panic_log_path = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .map(|d| d.join("runecode").join("panic.log"));

    std::panic::set_hook(Box::new(move |info| {
        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown".to_string());

        let msg = format!(
            "[{}] PANIC: {}\n  Location: {}\n",
            chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ"),
            info,
            location
        );

        if let Some(ref path) = panic_log_path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
            {
                let _ = f.write_all(msg.as_bytes());
            }
        }

        // Also try stderr — visible in debug builds and terminal launches.
        eprintln!("{}", msg);
    }));

    startup_log!("Panic hook installed");

    // -----------------------------------------------------------------------
    // Round 3: WebView2 pre-flight check.
    // On Windows, a missing WebView2 runtime causes a silent exit with no
    // window and no error message.  Log the result here so the cause is
    // captured in startup.log before Tauri initializes.
    // -----------------------------------------------------------------------
    startup_log!("Checking WebView2 runtime...");
    match check_webview2() {
        Ok(()) => startup_log!("WebView2 runtime OK"),
        Err(e) => {
            // Do not abort — Tauri will surface its own error dialog on Windows 10.
            // Windows 11 ships WebView2 by default so this is mainly diagnostic.
            startup_log!("WARNING: {}", e);
        }
    }

    // -----------------------------------------------------------------------
    // Round 1 continued: Initialize env_logger.
    // On Windows release builds this writes to the (suppressed) stderr, so it
    // is only useful in debug builds or terminal launches.  The startup_log
    // file above is the reliable path for release diagnostics.
    // -----------------------------------------------------------------------
    env_logger::init();
    startup_log!("env_logger initialized");

    // -----------------------------------------------------------------------
    // Tauri builder — log each plugin registration milestone so we can
    // identify which plugin causes a crash if startup.log is truncated there.
    // -----------------------------------------------------------------------
    startup_log!("Registering Tauri plugins...");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Round 4: startup_log! works inside the closure because it uses
            // the global STARTUP_LOG rather than a captured mutable reference.
            startup_log!("setup() entered");

            // First pass: load proxy settings from DB (best-effort — degraded mode if DB fails)
            match init_database(&app.handle()) {
                Ok(conn) => {
                    let db = AgentDb(Mutex::new(conn));
                    let proxy_settings = match db.0.lock() {
                        Ok(conn) => {
                            let mut settings = commands::proxy::ProxySettings::default();
                            let keys = vec![
                                ("proxy_enabled", "enabled"),
                                ("proxy_http", "http_proxy"),
                                ("proxy_https", "https_proxy"),
                                ("proxy_no", "no_proxy"),
                                ("proxy_all", "all_proxy"),
                            ];
                            for (db_key, field) in keys {
                                if let Ok(value) = conn.query_row(
                                    "SELECT value FROM app_settings WHERE key = ?1",
                                    rusqlite::params![db_key],
                                    |row| row.get::<_, String>(0),
                                ) {
                                    match field {
                                        "enabled" => settings.enabled = value == "true",
                                        "http_proxy" => {
                                            settings.http_proxy = Some(value).filter(|s| !s.is_empty())
                                        }
                                        "https_proxy" => {
                                            settings.https_proxy = Some(value).filter(|s| !s.is_empty())
                                        }
                                        "no_proxy" => {
                                            settings.no_proxy = Some(value).filter(|s| !s.is_empty())
                                        }
                                        "all_proxy" => {
                                            settings.all_proxy = Some(value).filter(|s| !s.is_empty())
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            log::info!("Loaded proxy settings: enabled={}", settings.enabled);
                            startup_log!("DB init OK — proxy settings loaded (enabled={})", settings.enabled);
                            settings
                        }
                        Err(e) => {
                            let msg = format!("Failed to lock DB for proxy settings: {}", e);
                            log::warn!("{}", msg);
                            startup_log!("WARNING: {}", msg);
                            commands::proxy::ProxySettings::default()
                        }
                    };
                    apply_proxy_settings(&proxy_settings);
                }
                Err(e) => {
                    let msg = format!("DB init failed (degraded mode, no proxy/agent history): {}", e);
                    log::warn!("{}", msg);
                    startup_log!("WARNING: {}", msg);
                }
            }

            startup_log!("Proxy settings applied");

            // Second pass: open connection for app state (best-effort — degraded mode if DB fails)
            match init_database(&app.handle()) {
                Ok(conn) => {
                    app.manage(AgentDb(Mutex::new(conn)));
                    startup_log!("AgentDb state registered");
                }
                Err(e) => {
                    let msg = format!("DB re-open failed (degraded mode): {}", e);
                    log::warn!("{}", msg);
                    startup_log!("WARNING: {}", msg);
                }
            }

            // Initialize checkpoint state
            let checkpoint_state = CheckpointState::new();
            startup_log!("CheckpointState created");

            // Set the Claude directory path.
            // Round 5c: dirs::home_dir() + canonicalize() are synchronous filesystem
            // calls.  On Windows, canonicalize() can fail if ~/.claude does not exist;
            // that is handled gracefully — we just skip setting the claude dir.
            // No network I/O or heavy work occurs here.
            if let Ok(claude_dir) = dirs::home_dir()
                .ok_or_else(|| "Could not find home directory")
                .and_then(|home| {
                    let claude_path = home.join(".claude");
                    claude_path
                        .canonicalize()
                        .map_err(|_| "Could not find ~/.claude directory")
                })
            {
                startup_log!("~/.claude found — scheduling async dir set");
                let state_clone = checkpoint_state.clone();
                tauri::async_runtime::spawn(async move {
                    state_clone.set_claude_dir(claude_dir).await;
                });
            } else {
                startup_log!("~/.claude not found — checkpoint dir skipped");
            }

            app.manage(checkpoint_state);

            // Initialize process registry
            app.manage(ProcessRegistryState::default());

            // Initialize Claude process state
            app.manage(ClaudeProcessState::default());

            // Generate and manage the startup secret for frontend authentication.
            let startup_secret = uuid::Uuid::new_v4().to_string();
            startup_log!("Startup secret generated (first 8 chars: {}...)", &startup_secret[..8]);
            app.manage(commands::claude::StartupSecret(startup_secret.clone()));

            // Start the embedded terminal WebSocket server.
            // Binds to 127.0.0.1:0 (OS-assigned ephemeral port) so it never
            // conflicts with other services.  The frontend retrieves the port
            // via the `get_terminal_port` command and constructs the WS URL.
            // The startup_secret is passed so every WS upgrade is authenticated.
            startup_log!("Starting embedded terminal server...");
            let terminal_port = tauri::async_runtime::block_on(async {
                terminal_server::start_terminal_server(startup_secret).await.unwrap_or(0)
            });
            if terminal_port > 0 {
                startup_log!("Terminal server listening on 127.0.0.1:{}", terminal_port);
            } else {
                startup_log!("WARNING: Terminal server failed to start — terminal will be unavailable");
            }
            app.manage(TerminalServerPort(terminal_port));

            startup_log!("App state managed (checkpoint, process registry, claude process, terminal server)");

            // Apply window vibrancy with rounded corners on macOS
            #[cfg(target_os = "macos")]
            {
                startup_log!("Applying macOS window vibrancy...");
                if let Some(window) = app.get_webview_window("main") {
                    // Try different vibrancy materials that support rounded corners
                    let materials = [
                        NSVisualEffectMaterial::UnderWindowBackground,
                        NSVisualEffectMaterial::WindowBackground,
                        NSVisualEffectMaterial::Popover,
                        NSVisualEffectMaterial::Menu,
                        NSVisualEffectMaterial::Sidebar,
                    ];

                    let mut applied = false;
                    for material in materials.iter() {
                        if apply_vibrancy(&window, *material, None, Some(12.0)).is_ok() {
                            applied = true;
                            break;
                        }
                    }

                    if !applied {
                        // Fallback without rounded corners
                        if let Err(e) = apply_vibrancy(
                            &window,
                            NSVisualEffectMaterial::WindowBackground,
                            None,
                            None,
                        ) {
                            let msg = format!("Failed to apply window vibrancy: {}", e);
                            log::warn!("{}", msg);
                            startup_log!("WARNING: {}", msg);
                        } else {
                            startup_log!("Window vibrancy applied (fallback, no rounded corners)");
                        }
                    } else {
                        startup_log!("Window vibrancy applied with rounded corners");
                    }
                } else {
                    let msg = "Main window not found — skipping vibrancy setup";
                    log::warn!("{}", msg);
                    startup_log!("WARNING: {}", msg);
                }
            }

            startup_log!("setup() complete");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clean up all checkpoint managers on window close to prevent data accumulation.
                // This mirrors what clear_checkpoint_manager does per-session but for the full set.
                let app = window.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let state = app.state::<CheckpointState>();
                    let cleared = state.clear_all_and_count().await;
                    if cleared > 0 {
                        log::info!("Cleared {} checkpoint manager(s) on window close", cleared);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Claude & Project Management
            list_projects,
            create_project,
            get_project_sessions,
            get_home_directory,
            get_claude_settings,
            open_new_session,
            get_system_prompt,
            check_claude_version,
            check_node_installed,
            install_node,
            install_claude_code,
            save_system_prompt,
            save_claude_settings,
            find_claude_md_files,
            read_claude_md_file,
            save_claude_md_file,
            load_session_history,
            execute_claude_code,
            continue_claude_code,
            resume_claude_code,
            cancel_claude_execution,
            list_running_claude_sessions,
            get_claude_session_output,
            list_directory_contents,
            search_files,
            get_recently_modified_files,
            get_hooks_config,
            update_hooks_config,
            validate_hook_command,
            // Checkpoint Management
            create_checkpoint,
            restore_checkpoint,
            list_checkpoints,
            fork_from_checkpoint,
            get_session_timeline,
            update_checkpoint_settings,
            get_checkpoint_diff,
            track_checkpoint_message,
            track_session_messages,
            check_auto_checkpoint,
            cleanup_old_checkpoints,
            get_checkpoint_settings,
            clear_checkpoint_manager,
            get_checkpoint_state_stats,
            // Agent Management
            list_agents,
            create_agent,
            update_agent,
            delete_agent,
            get_agent,
            execute_agent,
            list_agent_runs,
            get_agent_run,
            list_agent_runs_with_metrics,
            get_agent_run_with_real_time_metrics,
            list_running_sessions,
            kill_agent_session,
            get_session_status,
            cleanup_finished_processes,
            get_session_output,
            get_live_session_output,
            stream_session_output,
            load_agent_session_history,
            get_claude_binary_path,
            set_claude_binary_path,
            list_claude_installations,
            export_agent,
            export_agent_to_file,
            import_agent,
            import_agent_from_file,
            fetch_github_agents,
            fetch_github_agent_content,
            import_agent_from_github,
            // Usage & Analytics
            get_usage_stats,
            get_usage_by_date_range,
            get_usage_details,
            get_session_stats,
            persist_usage_ledger,
            load_usage_ledgers,
            // MCP (Model Context Protocol)
            mcp_add,
            mcp_list,
            mcp_get,
            mcp_remove,
            mcp_add_json,
            mcp_add_from_claude_desktop,
            mcp_serve,
            mcp_test_connection,
            mcp_reset_project_choices,
            mcp_get_server_status,
            mcp_read_project_config,
            mcp_save_project_config,
            // Storage Management
            storage_list_tables,
            storage_read_table,
            storage_update_row,
            storage_delete_row,
            storage_insert_row,
            storage_execute_sql,
            storage_reset_database,
            // Slash Commands
            commands::slash_commands::slash_commands_list,
            commands::slash_commands::slash_command_get,
            commands::slash_commands::slash_command_save,
            commands::slash_commands::slash_command_delete,
            // Proxy Settings
            get_proxy_settings,
            save_proxy_settings,
            // System Resources & Skills
            get_system_resources,
            get_skills_catalog,
            // Project Info
            get_project_info,
            initialize_project,
            // Helicone
            post_to_helicone,
            // RuFlo
            check_ruflo_installed,
            install_ruflo,
            uninstall_ruflo,
            activate_ruflo_mcp,
            deactivate_ruflo_mcp,
            create_ruflo_slash_command,
            create_ddd_optimization_command,
            init_ruflo_project,
            get_ruflo_project_status,
            get_ruflo_swarm_status,
            get_ruflo_memory_stats,
            sync_ruflo_memory_local,
            consolidate_ruflo_memory,
            set_ruflo_memory_backend,
            // Terminal server
            get_terminal_port,
            get_system_info,
            // Startup token
            crate::commands::claude::get_startup_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application"); // safe: top-level entry point, process must abort on runtime failure

    startup_log!("tauri run() returned — exiting normally");
}
