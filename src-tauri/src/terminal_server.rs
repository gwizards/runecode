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
///   - `flags` contains `--shell` → spawn the native login shell
///   - Otherwise (including empty) → spawn `claude <flags>` so it launches by default
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
    // Reap the child to prevent zombie processes on Unix.
    let _ = child.wait();
    sender_task.abort();
}

// ---------------------------------------------------------------------------
// Command resolution
// ---------------------------------------------------------------------------

/// Decide which program to run inside the PTY.
///
/// - `--shell` present → native interactive shell
/// - Empty OR any other flags → `claude <flags>` (empty = `claude` with no extra args)
fn resolve_command(flags: &[String]) -> (String, Vec<String>) {
    let is_shell_mode = flags.iter().any(|f| f == "--shell");

    if is_shell_mode {
        let shell = detect_shell();
        // On macOS, launch as a LOGIN shell so that /etc/zprofile is sourced.
        // path_helper then adds /opt/homebrew/bin, and ~/.zprofile adds NVM/volta.
        // Without --login, Finder-launched apps only get /usr/bin:/bin:/usr/sbin:/sbin.
        #[cfg(target_os = "macos")]
        return (shell, vec!["--login".to_string()]);
        #[cfg(not(target_os = "macos"))]
        return (shell, vec![]);
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

    // PowerShell 7+ (pwsh.exe) — check common install locations without
    // mutating the global process PATH (which would be a data race).
    let pwsh7_locations = [
        r"C:\Program Files\PowerShell\7\pwsh.exe",
        r"C:\Program Files\PowerShell\7-preview\pwsh.exe",
    ];
    for p in &pwsh7_locations {
        if std::path::Path::new(p).exists() {
            return p.to_string();
        }
    }

    // Windows PowerShell 5.1 — present on all Windows 10/11 installs.
    let ps_path = format!(r"{}\System32\WindowsPowerShell\v1.0\powershell.exe", system_root);
    if std::path::Path::new(&ps_path).exists() {
        return ps_path;
    }

    // Final fallback: cmd.exe
    format!(r"{}\System32\cmd.exe", system_root)
}

#[cfg(not(target_os = "windows"))]
fn detect_shell_unix() -> String {
    // 1. $SHELL env var — set by launchd/PAM in interactive sessions.
    if let Ok(shell) = std::env::var("SHELL") {
        if !shell.is_empty() && std::path::Path::new(&shell).exists() {
            return shell;
        }
    }

    // 2. On macOS, /bin/zsh is the default since Catalina (10.15).
    #[cfg(target_os = "macos")]
    if std::path::Path::new("/bin/zsh").exists() {
        return "/bin/zsh".to_string();
    }

    // 3. /etc/passwd lookup — works when launched from a .desktop file (Linux)
    //    or Finder/Spotlight (macOS) where $SHELL may be unset by the display manager.
    {
        let uid = unsafe { libc::getuid() };
        if let Ok(contents) = std::fs::read_to_string("/etc/passwd") {
            for line in contents.lines() {
                let fields: Vec<&str> = line.splitn(7, ':').collect();
                if fields.len() == 7 {
                    if let Ok(entry_uid) = fields[2].parse::<u32>() {
                        if entry_uid == uid {
                            let shell = fields[6].trim();
                            if !shell.is_empty() && std::path::Path::new(shell).exists() {
                                return shell.to_string();
                            }
                        }
                    }
                }
            }
        }
    }

    // 4. Common absolute paths (don't need PATH resolution).
    for candidate in &["/usr/bin/zsh", "/bin/zsh", "/usr/bin/bash", "/bin/bash", "/bin/sh"] {
        if std::path::Path::new(candidate).exists() {
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

/// Build an augmented PATH for the PTY child process.
///
/// GUI apps on macOS (launched from Finder/Dock) and Windows (launched via
/// Explorer) inherit a minimal PATH that does not include package manager
/// bins such as Homebrew, nvm, volta, fnm, or scoop.  We inject the most
/// common locations so the shell and Claude can find node, npm, and other
/// tools immediately — without mutating the global process environment.
fn build_pty_path() -> String {
    let base = std::env::var("PATH").unwrap_or_default();
    let sep = if cfg!(windows) { ";" } else { ":" };
    let mut extras: Vec<String> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        // Homebrew (Apple Silicon first, then Intel)
        extras.push("/opt/homebrew/bin".into());
        extras.push("/opt/homebrew/sbin".into());
        extras.push("/usr/local/bin".into());
        extras.push("/usr/local/sbin".into());
        if let Ok(home) = std::env::var("HOME") {
            // Active nvm version (env var set by nvm's shell init)
            if let Ok(nvm_bin) = std::env::var("NVM_BIN") {
                extras.push(nvm_bin);
            } else {
                // Scan nvm versions: pick the newest installed node
                let nvm_versions = std::path::PathBuf::from(&home).join(".nvm/versions/node");
                if let Ok(mut entries) = std::fs::read_dir(&nvm_versions) {
                    let mut versions: Vec<_> = entries.flatten()
                        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                        .collect();
                    // Sort descending by name (v22 > v20 > v18 …)
                    versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                    if let Some(latest) = versions.first() {
                        extras.push(latest.path().join("bin").to_string_lossy().into_owned());
                    }
                }
            }
            extras.push(format!("{}/.volta/bin", home));
            extras.push(format!("{}/.local/bin", home));
            extras.push(format!("{}/.cargo/bin", home));
            extras.push(format!("{}/.yarn/bin", home));
        }
    }

    #[cfg(target_os = "linux")]
    {
        extras.push("/usr/local/bin".into());
        if let Ok(home) = std::env::var("HOME") {
            if let Ok(nvm_bin) = std::env::var("NVM_BIN") {
                extras.push(nvm_bin);
            } else {
                let nvm_versions = std::path::PathBuf::from(&home).join(".nvm/versions/node");
                if let Ok(entries) = std::fs::read_dir(&nvm_versions) {
                    let mut versions: Vec<_> = entries.flatten()
                        .filter(|e| e.file_type().map(|t| t.is_dir()).unwrap_or(false))
                        .collect();
                    versions.sort_by(|a, b| b.file_name().cmp(&a.file_name()));
                    if let Some(latest) = versions.first() {
                        extras.push(latest.path().join("bin").to_string_lossy().into_owned());
                    }
                }
            }
            extras.push(format!("{}/.volta/bin", home));
            extras.push(format!("{}/.local/bin", home));
            extras.push(format!("{}/.cargo/bin", home));
            extras.push(format!("{}/.yarn/bin", home));
            // fnm: default alias bin
            if let Ok(fnm_dir) = std::env::var("FNM_DIR") {
                extras.push(format!("{}/aliases/default/bin", fnm_dir));
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());
        let appdata = std::env::var("APPDATA").unwrap_or_default();
        let user_profile = std::env::var("USERPROFILE").unwrap_or_default();
        extras.push(format!(r"{}\System32", system_root));
        extras.push(format!(r"{}\System32\WindowsPowerShell\v1.0", system_root));
        extras.push(r"C:\Program Files\PowerShell\7".into());
        extras.push(format!(r"{}\npm", appdata));
        extras.push(format!(r"{}\.local\bin", user_profile));
        extras.push(format!(r"{}\scoop\shims", user_profile));
        extras.push(format!(r"{}\.volta\bin", user_profile));
    }

    // Only prepend extras that actually exist on disk; skip phantom paths.
    let valid: Vec<String> = extras.into_iter()
        .filter(|p| std::path::Path::new(p).exists())
        .collect();

    if valid.is_empty() {
        base
    } else {
        format!("{}{}{}", valid.join(sep), sep, base)
    }
}
