// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checkpoint;
mod claude_binary;
mod claude_binary_env;
mod commands;
mod process;
mod setup;
mod terminal_pty;
mod terminal_server;

use checkpoint::state::CheckpointState;
use commands::agents::{
    cleanup_finished_processes, create_agent, delete_agent, execute_agent, export_agent,
    export_agent_to_file, fetch_github_agent_content, fetch_github_agents, get_agent,
    get_agent_run, get_agent_run_with_real_time_metrics, get_claude_binary_path,
    get_live_session_output, get_session_output, get_session_status, import_agent,
    import_agent_from_file, import_agent_from_github, kill_agent_session,
    list_agent_runs, list_agent_runs_with_metrics, list_agents, list_claude_installations,
    list_running_sessions, load_agent_session_history, set_claude_binary_path,
    stream_session_output, update_agent,
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
    validate_hook_command,
};
use commands::mcp::{
    mcp_add, mcp_add_from_claude_desktop, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list,
    mcp_read_project_config, mcp_remove, mcp_reset_project_choices, mcp_save_project_config,
    mcp_serve, mcp_test_connection,
};

use commands::helicone::post_to_helicone;
use commands::project_info::{get_project_info, initialize_project};
use commands::proxy::{get_proxy_settings, save_proxy_settings};
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
use commands::docker::{get_docker_stats, get_running_processes};
use commands::wsl::{detect_wsl, install_claude_in_wsl, wsl_execute};
use tauri::Manager;

// ---------------------------------------------------------------------------
// Embedded terminal server port
// ---------------------------------------------------------------------------

/// Holds the port the embedded terminal WebSocket server is listening on.
/// A value of 0 means the server failed to start.
pub struct TerminalServerPort(pub u16);

/// Return the port the embedded terminal WebSocket server is listening on.
#[tauri::command]
fn get_terminal_port(state: tauri::State<TerminalServerPort>) -> u16 {
    state.0
}

/// Returns OS platform and feature availability flags.
#[tauri::command]
fn get_system_info() -> serde_json::Value {
    let platform = if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "macos"
    } else {
        "linux"
    };

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
// Global startup log
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
    eprintln!("{}", timestamped.trim_end());
}

#[macro_export]
macro_rules! startup_log {
    ($($arg:tt)*) => { crate::startup_log_write(&format!($($arg)*)) }
}

fn main() {
    // Open startup log file
    if let Some(f) = setup::init_startup_log() {
        *STARTUP_LOG.lock().unwrap_or_else(|e| e.into_inner()) = Some(f);
    }

    startup_log!("RuneCode {} starting", env!("CARGO_PKG_VERSION"));
    startup_log!("OS: {} {}", std::env::consts::OS, std::env::consts::ARCH);

    // Panic hook
    setup::install_panic_hook();
    startup_log!("Panic hook installed");

    // WebView2 pre-flight check
    startup_log!("Checking WebView2 runtime...");
    match setup::check_webview2() {
        Ok(()) => startup_log!("WebView2 runtime OK"),
        Err(e) => startup_log!("WARNING: {}", e),
    }

    // Initialize env_logger
    env_logger::init();
    startup_log!("env_logger initialized");

    // Tauri builder
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
        .setup(|app| setup::run_setup(app))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
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
            // Docker & Process Monitoring
            get_docker_stats,
            get_running_processes,
            // WSL Detection & Management
            detect_wsl,
            wsl_execute,
            install_claude_in_wsl,
            // Terminal server
            get_terminal_port,
            get_system_info,
            // Startup token
            crate::commands::claude::get_startup_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    startup_log!("tauri run() returned -- exiting normally");
}
