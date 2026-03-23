/// Embedded terminal WebSocket server — PTY-backed, cross-platform.
///
/// Uses `portable-pty` (ConPTY on Windows, openpty on Unix) so the spawned
/// shell or Claude process gets a real pseudo-terminal.  This means:
///   • Characters are echoed back to the client automatically
///   • Readline / line-editing (arrows, backspace, history) work correctly
///   • Colours, prompts, and interactive programs (vim, htop, claude) render properly
///   • Ctrl-C / Ctrl-D are forwarded as the expected control characters
///
/// ## Flags
/// The `flags` query parameter controls which program is launched:
///   - `flags` is absent OR contains `--shell` → spawn the native login shell
///   - Otherwise → spawn `claude <flags>` so teammate-mode / tmux / etc. work
///
/// ## URL
/// `ws://127.0.0.1:<port>/ws/terminal?projectPath=...&cols=...&rows=...&flags=...`
/// The port is obtained via the `get_terminal_port` Tauri IPC command.

use axum::{
    extract::{Query, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::Response,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::SocketAddr;
use tokio::net::TcpListener;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

/// Start the embedded terminal WebSocket server on an OS-assigned ephemeral port.
pub async fn start_terminal_server() -> Result<u16, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("terminal_server: failed to bind: {e}"))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("terminal_server: local_addr: {e}"))?
        .port();

    let app = Router::new().route("/ws/terminal", get(terminal_ws_upgrade));

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
    ws: WebSocketUpgrade,
    Query(params): Query<HashMap<String, String>>,
) -> Response {
    ws.on_upgrade(move |socket| handle_terminal_ws(socket, params))
}

// ---------------------------------------------------------------------------
// Per-connection handler
// ---------------------------------------------------------------------------

async fn handle_terminal_ws(socket: WebSocket, params: HashMap<String, String>) {
    let project_path = params
        .get("projectPath")
        .cloned()
        .unwrap_or_else(home_dir);

    let cols: u16 = params.get("cols").and_then(|s| s.parse().ok()).unwrap_or(80);
    let rows: u16 = params.get("rows").and_then(|s| s.parse().ok()).unwrap_or(24);

    // Decode flags: comma-separated list forwarded from EmbeddedTerminal.
    // "--shell" (or no flags) → plain shell; otherwise → claude <flags>
    let flags_str = params.get("flags").cloned().unwrap_or_default();
    let flags: Vec<String> = if flags_str.is_empty() {
        vec![]
    } else {
        flags_str.split(',').map(String::from).collect()
    };

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
    for key in &["HOME", "USERPROFILE", "USER", "USERNAME", "PATH", "APPDATA",
                 "LOCALAPPDATA", "HOMEDRIVE", "HOMEPATH", "LANG", "LC_ALL"] {
        if let Ok(val) = std::env::var(key) {
            cmd.env(key, val);
        }
    }
    // Ensure npm global bin is on PATH (Windows: %APPDATA%\npm)
    #[cfg(target_os = "windows")]
    if let Ok(appdata) = std::env::var("APPDATA") {
        let npm_path = format!(r"{}\npm", appdata);
        let current_path = std::env::var("PATH").unwrap_or_default();
        if !current_path.contains(&npm_path) {
            cmd.env("PATH", format!("{};{}", npm_path, current_path));
        }
    }

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
    // Drop slave — we only need the master side from here on.
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

    // Channel: PTY reader → async WS sender
    let (out_tx, mut out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(256);

    // Channel: async WS receiver → PTY writer thread
    // std::sync::mpsc is used here because the writer runs in a blocking context.
    let (in_tx, in_rx) = std::sync::mpsc::sync_channel::<Vec<u8>>(128);

    // --- Blocking reader task ------------------------------------------------
    // Reads PTY master output and pushes it into the async channel.
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
    // Receives bytes from the async layer and writes them to the PTY master.
    tokio::task::spawn_blocking(move || {
        while let Ok(data) = in_rx.recv() {
            if pty_writer.write_all(&data).is_err() {
                break;
            }
            let _ = pty_writer.flush();
        }
    });

    // --- Async sender task ---------------------------------------------------
    // Forwards PTY output to the WebSocket client.
    let sender_task = tokio::spawn(async move {
        while let Some(data) = out_rx.recv().await {
            if ws_tx.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
        let _ = ws_tx.send(Message::Close(None)).await;
    });

    // --- Main loop: WS → PTY ------------------------------------------------
    loop {
        match ws_rx.next().await {
            Some(Ok(Message::Binary(data))) => {
                // Raw keystrokes from xterm.js
                let _ = in_tx.try_send(data.to_vec());
            }
            Some(Ok(Message::Text(text))) => {
                // Resize control message: {"type":"resize","cols":N,"rows":N}
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
                // Plain text input (e.g. paste)
                let _ = in_tx.try_send(text.as_bytes().to_vec());
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(_)) => {} // ping/pong handled by axum
            Some(Err(_)) => break,
        }
    }

    // --- Cleanup -------------------------------------------------------------
    drop(in_tx); // signal writer thread to exit
    let _ = child.kill();
    sender_task.abort();
}

// ---------------------------------------------------------------------------
// Command resolution
// ---------------------------------------------------------------------------

/// Decide which program to run inside the PTY.
///
/// - No flags OR `--shell` present → native interactive shell
/// - Any other flags (e.g. `--teammate-mode`, `tmux`) → `claude <flags>`
fn resolve_command(flags: &[String]) -> (String, Vec<String>) {
    let is_shell_mode = flags.is_empty() || flags.iter().any(|f| f == "--shell");

    if is_shell_mode {
        (detect_shell(), vec![])
    } else {
        // Find the Claude CLI binary on this machine.
        let claude = find_claude_binary().unwrap_or_else(|| "claude".to_string());
        (claude, flags.to_vec())
    }
}

/// Locate the Claude CLI binary using the same logic as the rest of the app.
fn find_claude_binary() -> Option<String> {
    // 1. Use the app's own discovery (covers nvm, ~/.local/bin, etc.)
    let installations = crate::claude_binary::discover_claude_installations();
    if let Some(best) = installations.into_iter().next() {
        return Some(best.path);
    }
    // 2. Fall back to PATH lookup
    which::which("claude")
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// Shell detection
// ---------------------------------------------------------------------------

/// Detect the best available interactive shell for the current platform.
fn detect_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        detect_shell_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        detect_shell_unix()
    }
}

#[cfg(target_os = "windows")]
fn detect_shell_windows() -> String {
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let extra_paths = [
        format!(r"{}\System32", system_root),
        format!(r"{}\System32\WindowsPowerShell\v1.0", system_root),
        format!(r"{}\npm", appdata),
        format!(r"{}\.local\bin", user_profile),
    ];

    let existing_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", extra_paths.join(";"), existing_path);
    // SAFETY: called at connection time, single-threaded per-connection.
    unsafe { std::env::set_var("PATH", &new_path) };

    for candidate in &["pwsh.exe", "powershell.exe"] {
        if which::which(candidate).is_ok() {
            return candidate.to_string();
        }
        let abs = format!(r"{}\System32\WindowsPowerShell\v1.0\{}", system_root, candidate);
        if std::path::Path::new(&abs).exists() {
            return abs;
        }
    }

    format!(r"{}\System32\cmd.exe", system_root)
}

#[cfg(not(target_os = "windows"))]
fn detect_shell_unix() -> String {
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() && std::path::Path::new(&shell).exists() {
            return shell;
        }
    }
    for candidate in &["bash", "sh"] {
        if which::which(candidate).is_ok() {
            return candidate.to_string();
        }
    }
    "/bin/sh".to_string()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| {
            #[cfg(target_os = "windows")]
            return std::env::var("USERPROFILE")
                .or_else(|_| {
                    std::env::var("HOMEDRIVE")
                        .and_then(|d| std::env::var("HOMEPATH").map(|p| format!("{}{}", d, p)))
                })
                .unwrap_or_else(|_| r"C:\Users\Public".to_string());

            #[cfg(not(target_os = "windows"))]
            return std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        })
}
