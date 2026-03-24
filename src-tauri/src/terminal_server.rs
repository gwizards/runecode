/// Embedded terminal WebSocket server -- PTY-backed, cross-platform.
///
/// Uses `portable-pty` (ConPTY on Windows, openpty on Unix) so the spawned
/// shell or Claude process gets a real pseudo-terminal.  This means:
///   * Characters are echoed back to the client automatically
///   * Readline / line-editing (arrows, backspace, history) work correctly
///   * Colours, prompts, and interactive programs (vim, htop, claude) render properly
///   * Ctrl-C / Ctrl-D are forwarded as the expected control characters
///
/// ## Flags
/// The `flags` query parameter controls which program is launched:
///   - `flags` contains `--shell` -> spawn the native login shell
///   - Otherwise (including empty) -> spawn `claude <flags>` so it launches by default
///
/// ## URL
/// `ws://127.0.0.1:<port>/ws/terminal?token=<secret>&projectPath=...&cols=...&rows=...&flags=...`
/// The port is obtained via the `get_terminal_port` Tauri IPC command.
/// The `token` must match the per-process startup secret from `get_startup_token`.

use axum::{
    extract::{Query, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::TcpListener;

use crate::terminal_pty::{build_pty_path, home_dir, resolve_command};

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

/// Shared state for the terminal WebSocket server.
#[derive(Clone)]
struct TerminalServerState {
    /// Per-process startup secret used to authenticate incoming WS connections.
    startup_secret: Arc<String>,
}

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/// Start the embedded terminal WebSocket server on an OS-assigned ephemeral port.
///
/// `startup_secret` is the same token exposed to the frontend via `get_startup_token`.
/// Every WS upgrade request must supply it as `?token=<secret>`.
pub async fn start_terminal_server(startup_secret: String) -> Result<u16, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("terminal_server: failed to bind: {e}"))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("terminal_server: local_addr: {e}"))?
        .port();

    let state = TerminalServerState {
        startup_secret: Arc::new(startup_secret),
    };

    let app = Router::new()
        .route("/ws/terminal", get(terminal_ws_upgrade))
        .with_state(state);

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[terminal_server] serve error: {e}");
        }
    });

    Ok(port)
}

// ---------------------------------------------------------------------------
// WebSocket upgrade handler
// ---------------------------------------------------------------------------

async fn terminal_ws_upgrade(
    State(state): State<TerminalServerState>,
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    // 1a. Startup token validation -- reject unauthenticated connections.
    let provided_token = params.get("token").map(|s| s.as_str()).unwrap_or("");
    if provided_token != state.startup_secret.as_str() {
        return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
    }

    // 1b. Path guard -- resolve and verify project_path is within the user's home dir.
    let raw_path = params.get("projectPath").cloned().unwrap_or_else(home_dir);
    let canonical = match std::fs::canonicalize(&raw_path) {
        Ok(p) => p,
        Err(_) => {
            // Path does not exist yet (new project); fall back to home dir.
            let home = home_dir();
            PathBuf::from(&home)
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(&home))
        }
    };
    let home = home_dir();
    let home_path = PathBuf::from(&home)
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from(&home));
    if !canonical.starts_with(&home_path) {
        return (StatusCode::FORBIDDEN, "Path outside home directory").into_response();
    }

    // Replace the raw projectPath in params with the validated canonical form.
    let mut validated_params = params;
    validated_params.insert(
        "projectPath".to_string(),
        canonical.to_string_lossy().into_owned(),
    );

    ws.on_upgrade(move |socket| handle_terminal_ws(socket, validated_params))
}

// ---------------------------------------------------------------------------
// Per-connection handler
// ---------------------------------------------------------------------------

async fn handle_terminal_ws(socket: WebSocket, params: HashMap<String, String>) {
    // projectPath has already been validated and canonicalized by terminal_ws_upgrade.
    let project_path = params
        .get("projectPath")
        .cloned()
        .unwrap_or_else(home_dir);

    let cols: u16 = params.get("cols").and_then(|s| s.parse().ok()).unwrap_or(80);
    let rows: u16 = params.get("rows").and_then(|s| s.parse().ok()).unwrap_or(24);

    // Decode flags: comma-separated list forwarded from EmbeddedTerminal.
    // "--shell" (or no flags) -> plain shell; otherwise -> claude <flags>
    let flags_str = params.get("flags").cloned().unwrap_or_default();
    let raw_flags: Vec<String> = if flags_str.is_empty() {
        vec![]
    } else {
        flags_str.split(',').map(String::from).collect()
    };

    // 1c. Flags whitelist -- only permit known safe Claude CLI flags to prevent
    //     argument injection attacks.
    const ALLOWED_FLAGS: &[&str] = &[
        "--shell",
        "--resume",
        "--continue",
        "--model",
        "--permission-mode",
        "--output-format",
    ];
    let flags: Vec<String> = raw_flags
        .into_iter()
        .filter(|f| ALLOWED_FLAGS.iter().any(|allowed| f.starts_with(allowed)))
        .collect();

    let (program, program_args) = resolve_command(&flags);

    // --- Open PTY -----------------------------------------------------------
    let pty_system = native_pty_system();
    let pty_pair = match pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }) {
        Ok(p) => p,
        Err(e) => {
            let (mut tx, _) = socket.split();
            let _ = tx
                .send(Message::Text(
                    format!("\r\n\x1b[31mFailed to open PTY: {e}\x1b[0m\r\n").into(),
                ))
                .await;
            return;
        }
    };

    // --- Build command ------------------------------------------------------
    let mut cmd = CommandBuilder::new(&program);
    for arg in &program_args {
        cmd.arg(arg);
    }
    cmd.cwd(&project_path);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    // Propagate essential env vars so claude/shells find their config.
    for key in &["HOME", "USERPROFILE", "USER", "USERNAME", "APPDATA",
                 "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL",
                 "NVM_DIR", "NVM_BIN", "VOLTA_HOME", "VOLTA_BINDIR", "FNM_DIR",
                 "FNM_MULTISHELL_PATH"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    // Linux: propagate D-Bus / display env vars so interactive tools work correctly.
    #[cfg(target_os = "linux")]
    for key in &["XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
                 "XDG_DATA_DIRS", "XDG_CONFIG_DIRS",
                 "WAYLAND_DISPLAY", "DISPLAY"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    // Build an augmented PATH that includes package manager bins commonly
    // absent from GUI app environments (Homebrew, nvm, volta, fnm, scoop).
    cmd.env("PATH", build_pty_path());

    // --- Spawn child in the slave PTY side ----------------------------------
    let mut child = match pty_pair.slave.spawn_command(cmd) {
        Ok(c) => c,
        Err(e) => {
            let (mut tx, _) = socket.split();
            let _ = tx
                .send(Message::Text(
                    format!("\r\n\x1b[31mFailed to start '{}': {e}\x1b[0m\r\n", program).into(),
                ))
                .await;
            drop(pty_pair.slave);
            return;
        }
    };
    // Drop slave -- we only need the master side from here on.
    drop(pty_pair.slave);

    let master = pty_pair.master;

    // Obtain reader / writer from the master.
    let mut pty_reader = match master.try_clone_reader() {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[terminal_server] try_clone_reader: {e}");
            let _ = child.kill();
            return;
        }
    };
    let mut pty_writer = match master.take_writer() {
        Ok(w) => w,
        Err(e) => {
            eprintln!("[terminal_server] take_writer: {e}");
            let _ = child.kill();
            return;
        }
    };

    let (mut ws_tx, mut ws_rx) = socket.split();

    // Channel: PTY reader -> async WS sender
    let (out_tx, mut out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);

    // Channel: async WS receiver -> PTY writer thread
    // std::sync::mpsc is used here because the writer runs in a blocking context.
    let (in_tx, in_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(128);

    // --- Blocking reader task ------------------------------------------------
    tokio::task::spawn_blocking(move || {
        let mut buf = [0u8; 4096];
        loop {
            match pty_reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if out_tx.blocking_send(buf[..n].to_vec()).is_err() {
                        break;
                    }
                }
            }
        }
    });

    // --- Blocking writer task ------------------------------------------------
    tokio::task::spawn_blocking(move || {
        while let Ok(data) = in_rx.recv() {
            if pty_writer.write_all(&data).is_err() {
                break;
            }
            let _ = pty_writer.flush();
        }
    });

    // --- Async sender task ---------------------------------------------------
    let sender_task = tokio::spawn(async move {
        while let Some(data) = out_rx.recv().await {
            if ws_tx.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
        let _ = ws_tx.send(Message::Close(None)).await;
    });

    // --- Main loop: WS -> PTY ------------------------------------------------
    loop {
        match ws_rx.next().await {
            Some(Ok(Message::Binary(data))) => {
                let _ = in_tx.try_send(data.to_vec());
            }
            Some(Ok(Message::Text(text))) => {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if json.get("type").and_then(|t| t.as_str()) == Some("resize") {
                        let new_cols = json
                            .get("cols")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(cols as u64) as u16;
                        let new_rows = json
                            .get("rows")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(rows as u64) as u16;
                        let _ = master.resize(PtySize {
                            rows: new_rows,
                            cols: new_cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                        continue;
                    }
                }
                let _ = in_tx.try_send(text.as_bytes().to_vec());
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(_)) => {}
            Some(Err(_)) => break,
        }
    }

    // --- Cleanup -------------------------------------------------------------
    drop(in_tx);
    let _ = child.kill();
    let _ = child.wait();
    sender_task.abort();
}
