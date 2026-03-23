/// Embedded terminal WebSocket server for Tauri desktop mode.
///
/// In the Tauri desktop app, `window.location` resolves to `tauri://localhost/`
/// which has no port — so the frontend cannot construct a valid `ws://` URL.
/// This module starts a minimal axum server bound to `127.0.0.1:0` (OS-assigned
/// ephemeral port) that serves only the `/ws/terminal` WebSocket route.
/// The bound port is stored in Tauri app state and returned to the frontend
/// via the `get_terminal_port` IPC command.

use axum::{
    extract::{Query, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::Response,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::net::SocketAddr;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::process::Command;

/// Start the embedded terminal WebSocket server on an OS-assigned ephemeral port.
///
/// Binds to `127.0.0.1:0`, spawns the server as a background task, and returns
/// the actual port immediately.  Returns `Err` if binding fails.
pub async fn start_terminal_server() -> Result<u16, String> {
    let addr = SocketAddr::from(([127, 0, 0, 1], 0));
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| format!("terminal_server: failed to bind: {e}"))?;

    let port = listener
        .local_addr()
        .map_err(|e| format!("terminal_server: local_addr failed: {e}"))?
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
        .unwrap_or_else(|| home_dir());

    let cols: u16 = params
        .get("cols")
        .and_then(|s| s.parse().ok())
        .unwrap_or(80);
    let rows: u16 = params
        .get("rows")
        .and_then(|s| s.parse().ok())
        .unwrap_or(24);

    let shell = detect_shell();

    // Spawn the shell process with piped stdio so we can bridge it to the WS.
    //
    // PowerShell (pwsh / powershell) with piped stdin enters "non-interactive file"
    // mode: it reads commands from stdin, and if no data arrives it may exit almost
    // immediately.  -NoExit keeps it alive in the read loop; -NoLogo suppresses the
    // copyright banner duplication.
    //
    // cmd.exe without /k runs a single command then exits; /k keeps it alive.
    let shell_lower = shell.to_lowercase();
    let extra_args: &[&str] = if shell_lower.contains("pwsh") || shell_lower.contains("powershell") {
        &["-NoExit", "-NoLogo"]
    } else if cfg!(windows) && shell_lower.ends_with("cmd.exe") {
        // /k keeps cmd.exe alive in its REPL after startup.
        // Scoped to Windows + exact suffix so Unix shells whose path happens
        // to contain "cmd" are not affected.
        &["/k"]
    } else {
        &[]
    };

    let mut child = match Command::new(&shell)
        .args(extra_args)
        .current_dir(&project_path)
        .env("TERM", "xterm-256color")
        .env("COLUMNS", cols.to_string())
        .env("LINES", rows.to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            let (mut tx, _) = socket.split();
            let _ = tx
                .send(Message::Text(
                    format!("\r\n\x1b[31mFailed to start shell '{}': {}\x1b[0m\r\n", shell, e).into(),
                ))
                .await;
            return;
        }
    };

    let mut child_stdin = child.stdin.take().expect("stdin is piped");
    let mut child_stdout = child.stdout.take().expect("stdout is piped");
    let mut child_stderr = child.stderr.take().expect("stderr is piped");

    let (mut ws_tx, mut ws_rx) = socket.split();

    // Channel from reader tasks → WebSocket sender task.
    let (out_tx, mut out_rx) = tokio::sync::mpsc::channel::<Vec<u8>>(128);
    let out_tx_err = out_tx.clone();

    // Task: forward shell stdout → WS
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match child_stdout.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if out_tx.send(buf[..n].to_vec()).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Task: forward shell stderr → WS
    tokio::spawn(async move {
        let mut buf = [0u8; 4096];
        loop {
            match child_stderr.read(&mut buf).await {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if out_tx_err.send(buf[..n].to_vec()).await.is_err() {
                        break;
                    }
                }
            }
        }
    });

    // Task: forward output channel → WS sender
    let sender_task = tokio::spawn(async move {
        while let Some(data) = out_rx.recv().await {
            if ws_tx.send(Message::Binary(data.into())).await.is_err() {
                break;
            }
        }
        // Close gracefully
        let _ = ws_tx.send(Message::Close(None)).await;
    });

    // Main loop: forward WS messages → shell stdin (or handle control messages)
    loop {
        match ws_rx.next().await {
            Some(Ok(Message::Binary(data))) => {
                if child_stdin.write_all(&data).await.is_err() {
                    break;
                }
            }
            Some(Ok(Message::Text(text))) => {
                // Check for resize control message: {"type":"resize","cols":N,"rows":N}
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                    if json.get("type").and_then(|t| t.as_str()) == Some("resize") {
                        // No PTY — we can only update the env vars; best effort.
                        let new_cols = json
                            .get("cols")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(cols as u64);
                        let new_rows = json
                            .get("rows")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(rows as u64);
                        // Signal via SIGWINCH is not available without a PTY;
                        // just log and continue.
                        eprintln!(
                            "[terminal_server] resize: {}x{} (no PTY — ignored)",
                            new_cols, new_rows
                        );
                        continue;
                    }
                }
                // Plain text input — write as bytes
                if child_stdin.write_all(text.as_bytes()).await.is_err() {
                    break;
                }
            }
            Some(Ok(Message::Close(_))) | None => break,
            Some(Ok(_)) => {} // ping/pong — handled by axum automatically
            Some(Err(_)) => break,
        }
    }

    // Clean up: kill the shell and abort the sender task.
    let _ = child.kill().await;
    sender_task.abort();
}

// ---------------------------------------------------------------------------
// Shell detection
// ---------------------------------------------------------------------------

/// Detect the best available interactive shell for the current platform.
///
/// Windows priority: pwsh.exe → powershell.exe → cmd.exe
/// Unix priority:    $SHELL env var → bash → sh
fn detect_shell() -> String {
    #[cfg(target_os = "windows")]
    {
        return detect_shell_windows();
    }

    #[cfg(not(target_os = "windows"))]
    {
        detect_shell_unix()
    }
}

#[cfg(target_os = "windows")]
fn detect_shell_windows() -> String {
    // Build a PATH that includes the directories Windows shells live in.
    // This is important when the Tauri app is launched without a full shell
    // environment (e.g. double-clicked from Explorer).
    let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
    let appdata = std::env::var("APPDATA").unwrap_or_default();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let extra_paths = [
        format!(r"{}\System32", system_root),
        format!(r"{}\System32\WindowsPowerShell\v1.0", system_root),
        format!(r"{}\npm", appdata),
        format!(r"{}\.local\bin", user_profile),
    ];

    // Prepend our required dirs to any existing PATH.
    let existing_path = std::env::var("PATH").unwrap_or_default();
    let new_path = format!("{};{}", extra_paths.join(";"), existing_path);

    // Persist for child processes — tokio::process::Command inherits env.
    // SAFETY: single-threaded at this point; documented requirement for set_var.
    unsafe { std::env::set_var("PATH", &new_path) };

    // PowerShell Core (pwsh.exe) — preferred, supports modern scripts.
    for candidate in &["pwsh.exe", "powershell.exe"] {
        if which::which(candidate).is_ok() {
            return candidate.to_string();
        }
        // Also check absolute paths in case PATH is not yet updated.
        let abs = format!(r"{}\System32\WindowsPowerShell\v1.0\{}", system_root, candidate);
        if std::path::Path::new(&abs).exists() {
            return abs;
        }
    }

    // Last resort: cmd.exe
    format!(r"{}\System32\cmd.exe", system_root)
}

#[cfg(not(target_os = "windows"))]
fn detect_shell_unix() -> String {
    // Respect the user's configured shell if available.
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

/// Return the user's home directory as a fallback working directory.
fn home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| {
            #[cfg(target_os = "windows")]
            return std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOMEDRIVE").and_then(|d| std::env::var("HOMEPATH").map(|p| format!("{}{}", d, p))))
                .unwrap_or_else(|_| r"C:\Users\Public".to_string());

            #[cfg(not(target_os = "windows"))]
            return std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        })
}
