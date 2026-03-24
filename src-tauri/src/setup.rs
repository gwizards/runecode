//! Tauri application setup helpers.
//!
//! Extracted from `main.rs` to keep that file under 500 lines.
//! Contains the `setup()` closure body, panic hook, startup log init,
//! and WebView2 detection.

use crate::checkpoint::state::CheckpointState;
use crate::commands;
use crate::commands::agents::{init_database, AgentDb};
use crate::commands::claude::ClaudeProcessState;
use crate::process::ProcessRegistryState;
use crate::startup_log;
use crate::TerminalServerPort;
use std::sync::Mutex;
use tauri::Manager;

// ---------------------------------------------------------------------------
// Startup log file initialisation
// ---------------------------------------------------------------------------

/// Opens the startup log file.
///
/// Path:
///   Windows : %APPDATA%\runecode\startup.log
///   macOS   : ~/Library/Application Support/runecode/startup.log
///   Linux   : ~/.local/share/runecode/startup.log
pub fn init_startup_log() -> Option<std::fs::File> {
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
// Panic hook
// ---------------------------------------------------------------------------

/// Installs a panic hook that writes to `panic.log` beside `startup.log`.
pub fn install_panic_hook() {
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
        eprintln!("{}", msg);
    }));
}

// ---------------------------------------------------------------------------
// WebView2 detection on Windows
// ---------------------------------------------------------------------------

#[cfg(target_os = "windows")]
pub fn check_webview2() -> Result<(), String> {
    let machine_key = r"HKEY_LOCAL_MACHINE\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    let output = crate::claude_binary::silent_command("reg")
        .args(["query", machine_key, "/v", "pv"])
        .output();

    match output {
        Ok(o) if o.status.success() => return Ok(()),
        _ => {}
    }

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
pub fn check_webview2() -> Result<(), String> {
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri setup() body
// ---------------------------------------------------------------------------

/// Runs inside `tauri::Builder::setup()`.
///
/// Initialises the database, proxy settings, checkpoint state, process registry,
/// terminal server, and (on macOS) window vibrancy.
pub fn run_setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    startup_log!("setup() entered");

    // First pass: load proxy settings from DB (best-effort)
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
                    startup_log!(
                        "DB init OK -- proxy settings loaded (enabled={})",
                        settings.enabled
                    );
                    settings
                }
                Err(e) => {
                    let msg = format!("Failed to lock DB for proxy settings: {}", e);
                    log::warn!("{}", msg);
                    startup_log!("WARNING: {}", msg);
                    commands::proxy::ProxySettings::default()
                }
            };
            commands::proxy::apply_proxy_settings(&proxy_settings);
        }
        Err(e) => {
            let msg = format!(
                "DB init failed (degraded mode, no proxy/agent history): {}",
                e
            );
            log::warn!("{}", msg);
            startup_log!("WARNING: {}", msg);
        }
    }

    startup_log!("Proxy settings applied");

    // Second pass: open connection for app state
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

    if let Ok(claude_dir) = dirs::home_dir()
        .ok_or_else(|| "Could not find home directory")
        .and_then(|home| {
            let claude_path = home.join(".claude");
            claude_path
                .canonicalize()
                .map_err(|_| "Could not find ~/.claude directory")
        })
    {
        startup_log!("~/.claude found -- scheduling async dir set");
        let state_clone = checkpoint_state.clone();
        tauri::async_runtime::spawn(async move {
            state_clone.set_claude_dir(claude_dir).await;
        });
    } else {
        startup_log!("~/.claude not found -- checkpoint dir skipped");
    }

    app.manage(checkpoint_state);

    // Initialize process registry
    app.manage(ProcessRegistryState::default());

    // Initialize Claude process state
    app.manage(ClaudeProcessState::default());

    // Generate and manage the startup secret
    let startup_secret = uuid::Uuid::new_v4().to_string();
    startup_log!(
        "Startup secret generated (first 8 chars: {}...)",
        &startup_secret[..8]
    );
    app.manage(commands::claude::StartupSecret(startup_secret.clone()));

    // Start the embedded terminal WebSocket server
    startup_log!("Starting embedded terminal server...");
    let terminal_port = tauri::async_runtime::block_on(async {
        crate::terminal_server::start_terminal_server(startup_secret)
            .await
            .unwrap_or(0)
    });
    if terminal_port > 0 {
        startup_log!("Terminal server listening on 127.0.0.1:{}", terminal_port);
    } else {
        startup_log!("WARNING: Terminal server failed to start -- terminal will be unavailable");
    }
    app.manage(TerminalServerPort(terminal_port));

    startup_log!(
        "App state managed (checkpoint, process registry, claude process, terminal server)"
    );

    // Enable DevTools (Ctrl+Shift+I / F12) in all builds
    #[cfg(feature = "devtools")]
    if let Some(window) = app.get_webview_window("main") {
        // Open devtools automatically in debug builds only
        #[cfg(debug_assertions)]
        window.open_devtools();
        let _ = window; // suppress unused in release
    }

    // Apply window vibrancy with rounded corners on macOS
    #[cfg(target_os = "macos")]
    {
        apply_macos_vibrancy(app);
    }

    startup_log!("setup() complete");
    Ok(())
}

/// Applies macOS window vibrancy with rounded corners.
#[cfg(target_os = "macos")]
fn apply_macos_vibrancy(app: &mut tauri::App) {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};

    startup_log!("Applying macOS window vibrancy...");
    if let Some(window) = app.get_webview_window("main") {
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
        let msg = "Main window not found -- skipping vibrancy setup";
        log::warn!("{}", msg);
        startup_log!("WARNING: {}", msg);
    }
}
