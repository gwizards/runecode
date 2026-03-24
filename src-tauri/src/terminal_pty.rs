/// Shell detection and PTY PATH-building helpers for the terminal server.
///
/// Split from `terminal_server.rs` to stay within the 500-line file budget.

// ---------------------------------------------------------------------------
// Command resolution
// ---------------------------------------------------------------------------

/// Decide which program to run inside the PTY.
///
/// - `--shell` present -> native interactive shell
/// - Empty OR any other flags -> `claude <flags>` (empty = `claude` with no extra args)
pub fn resolve_command(flags: &[String]) -> (String, Vec<String>) {
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
pub fn detect_shell() -> String {
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

    // PowerShell 7+ (pwsh.exe) -- check common install locations without
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

    // Windows PowerShell 5.1 -- present on all Windows 10/11 installs.
    let ps_path = format!(r"{}\System32\WindowsPowerShell\v1.0\powershell.exe", system_root);
    if std::path::Path::new(&ps_path).exists() {
        return ps_path;
    }

    // Final fallback: cmd.exe
    format!(r"{}\System32\cmd.exe", system_root)
}

#[cfg(not(target_os = "windows"))]
fn detect_shell_unix() -> String {
    // 1. $SHELL env var -- set by launchd/PAM in interactive sessions.
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

    // 3. /etc/passwd lookup -- works when launched from a .desktop file (Linux)
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

pub fn home_dir() -> String {
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
/// tools immediately -- without mutating the global process environment.
pub fn build_pty_path() -> String {
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
                    // Sort descending by name (v22 > v20 > v18 ...)
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
