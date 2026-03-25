//! Node.js and Claude Code installation commands.
//!
//! Extracted from `hooks.rs` to keep each module under 500 lines.

use std::process::Stdio;

use tauri::{AppHandle, Emitter};

/// Checks if Node.js is installed and returns version info.
/// On Windows, Tauri launches without the shell PATH (NVM/fnm paths are
/// shell-profile-only), so we try well-known install locations as fallback.
///
/// When `wsl_distro` is provided on Windows, the check runs inside the
/// specified WSL distribution instead of scanning native Windows paths.
#[tauri::command]
pub fn check_node_installed(wsl_distro: Option<String>) -> serde_json::Value {
    // WSL path: check node inside the WSL distribution
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            if let Ok(output) = crate::claude_binary::silent_command("wsl")
                .args(["-d", distro, "-e", "/bin/bash", "-lc", "node --version"])
                .output()
            {
                if output.status.success() {
                    let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    let major: u32 = version_str
                        .trim_start_matches('v')
                        .split('.')
                        .next()
                        .and_then(|s| s.parse().ok())
                        .unwrap_or(0);
                    return serde_json::json!({
                        "installed": true,
                        "version": version_str,
                        "major": major,
                        "meets_minimum": major >= 18
                    });
                }
            }
            return serde_json::json!({
                "installed": false,
                "version": null,
                "major": 0,
                "meets_minimum": false
            });
        }
    }
    let _ = &wsl_distro; // suppress unused warning on non-Windows

    let candidates: Vec<std::path::PathBuf> = {
        #[cfg(target_os = "windows")]
        {
            let mut v = Vec::new();

            // Use `where node` to resolve node from PATH on Windows (equivalent
            // of `which` on Unix). This finds node even when launched from a GUI
            // app that inherits a limited PATH.
            if let Ok(output) = crate::claude_binary::silent_command("where")
                .arg("node")
                .output()
            {
                if output.status.success() {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    for line in stdout.lines() {
                        let trimmed = line.trim();
                        if !trimmed.is_empty() {
                            v.push(std::path::PathBuf::from(trimmed));
                        }
                    }
                }
            }

            // Fall back to well-known install locations
            v.push(std::path::PathBuf::from("node.exe"));
            if let Some(home) = dirs::home_dir() {
                v.push(home.join("AppData\\Roaming\\nvm\\current\\node.exe"));
                v.push(home.join("AppData\\Local\\fnm_multishells\\node.exe"));
                v.push(home.join(".volta\\bin\\node.exe"));
                v.push(std::path::PathBuf::from(
                    "C:\\Program Files\\nodejs\\node.exe",
                ));
                v.push(std::path::PathBuf::from(
                    "C:\\Program Files (x86)\\nodejs\\node.exe",
                ));
            }
            v
        }
        #[cfg(not(target_os = "windows"))]
        {
            let mut v = vec![std::path::PathBuf::from("node")];
            if let Some(home) = dirs::home_dir() {
                if let Ok(versions) = std::fs::read_dir(home.join(".nvm/versions/node")) {
                    let mut ver_dirs: Vec<_> = versions
                        .flatten()
                        .filter(|e| e.path().is_dir())
                        .collect();
                    ver_dirs.sort_by_key(|e| e.file_name());
                    if let Some(latest) = ver_dirs.last() {
                        v.push(latest.path().join("bin/node"));
                    }
                }
                v.push(home.join(".volta/bin/node"));
                v.push(home.join(".fnm/node-versions/current/installation/bin/node"));
            }
            v.push(std::path::PathBuf::from("/usr/local/bin/node"));
            v.push(std::path::PathBuf::from("/usr/bin/node"));
            v
        }
    };

    for candidate in &candidates {
        if let Ok(output) = crate::claude_binary::silent_command(
            candidate.to_str().unwrap_or("node"),
        )
        .arg("--version")
        .output()
        {
            if output.status.success() {
                let version_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                let major: u32 = version_str
                    .trim_start_matches('v')
                    .split('.')
                    .next()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0);
                return serde_json::json!({
                    "installed": true,
                    "version": version_str,
                    "major": major,
                    "meets_minimum": major >= 18
                });
            }
        }
    }

    serde_json::json!({
        "installed": false,
        "version": null,
        "major": 0,
        "meets_minimum": false
    })
}

/// Installs Node.js in a platform-aware manner.
///
/// When `wsl_distro` is provided on Windows, Node is installed inside the WSL
/// distribution via nvm rather than opening the browser download page.
#[tauri::command]
pub async fn install_node(app: AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    log::info!("Installing Node.js");

    // Suppress unused-variable warning on non-Windows targets where the
    // cfg(target_os = "windows") block is compiled out entirely.
    #[cfg(not(target_os = "windows"))]
    let _ = &wsl_distro;

    #[cfg(target_os = "windows")]
    {
        // WSL path: install nvm + Node 22 inside the distro
        if let Some(ref distro) = wsl_distro {
            if !distro.is_empty() {
                let nvm_install_script = r#"curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22"#;
                let mut child = tokio::process::Command::new("wsl")
                    .args(["-d", distro, "-e", "/bin/bash", "-lc", nvm_install_script])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to start WSL install: {}", e))?;

                let mut output_lines = Vec::new();

                if let Some(stdout) = child.stdout.take() {
                    let reader = tokio::io::BufReader::new(stdout);
                    let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
                    while let Ok(Some(line)) = lines.next_line().await {
                        let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                        output_lines.push(line);
                    }
                }

                if let Some(stderr) = child.stderr.take() {
                    let reader = tokio::io::BufReader::new(stderr);
                    let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
                    while let Ok(Some(line)) = lines.next_line().await {
                        let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                        output_lines.push(line);
                    }
                }

                let status = child
                    .wait()
                    .await
                    .map_err(|e| format!("Failed to wait for WSL install: {}", e))?;

                return if status.success() {
                    Ok(output_lines.join("\n"))
                } else {
                    Err(format!(
                        "Node.js installation in WSL failed with exit code: {:?}",
                        status.code()
                    ))
                };
            }
        }
        let _ = &wsl_distro; // suppress unused warning

        open::that("https://nodejs.org/en/download/")
            .map_err(|e| format!("Failed to open browser: {}", e))?;
        Ok("Opened Node.js download page in browser. Please install Node.js and restart RuneCode.".to_string())
    }

    #[cfg(target_os = "macos")]
    {
        let mut child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(r#"curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash && export NVM_DIR="$HOME/.nvm" && [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm install 22"#)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start install: {}", e))?;

        let mut output_lines = Vec::new();

        if let Some(stdout) = child.stdout.take() {
            let reader = tokio::io::BufReader::new(stdout);
            let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                output_lines.push(line);
            }
        }

        if let Some(stderr) = child.stderr.take() {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                output_lines.push(line);
            }
        }

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for install: {}", e))?;

        if status.success() {
            Ok(output_lines.join("\n"))
        } else {
            Err(format!(
                "Node.js installation failed with exit code: {:?}",
                status.code()
            ))
        }
    }

    #[cfg(target_os = "linux")]
    {
        let mut child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg("curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs")
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start install: {}", e))?;

        let mut output_lines = Vec::new();

        if let Some(stdout) = child.stdout.take() {
            let reader = tokio::io::BufReader::new(stdout);
            let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                output_lines.push(line);
            }
        }

        if let Some(stderr) = child.stderr.take() {
            let reader = tokio::io::BufReader::new(stderr);
            let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                output_lines.push(line);
            }
        }

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for install: {}", e))?;

        if status.success() {
            Ok(output_lines.join("\n"))
        } else {
            Err(format!(
                "Node.js installation failed with exit code: {:?}",
                status.code()
            ))
        }
    }
}

/// Installs Claude Code globally via npm.
///
/// When `wsl_distro` is provided on Windows, the install runs inside the
/// specified WSL distribution (`wsl -d <distro> -- npm install -g ...`).
#[tauri::command]
pub async fn install_claude_code(app: AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    log::info!("Installing Claude Code via npm");

    // WSL path: run npm inside the distro
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        if !distro.is_empty() {
            let mut child = tokio::process::Command::new("wsl")
                .args(["-d", distro, "-e", "/bin/bash", "-lc", "npm install -g @anthropic-ai/claude-code"])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to start WSL npm install: {}", e))?;

            let mut output_lines = Vec::new();

            async fn drain_stream<R: tokio::io::AsyncRead + Unpin>(
                stream: R,
                app: &AppHandle,
                out: &mut Vec<String>,
            ) {
                let mut lines =
                    tokio::io::AsyncBufReadExt::lines(tokio::io::BufReader::new(stream));
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = app.emit("install-progress", serde_json::json!({"line": line}));
                    out.push(line);
                }
            }

            if let Some(stdout) = child.stdout.take() {
                drain_stream(stdout, &app, &mut output_lines).await;
            }
            if let Some(stderr) = child.stderr.take() {
                drain_stream(stderr, &app, &mut output_lines).await;
            }

            let status = child
                .wait()
                .await
                .map_err(|e| format!("Failed to wait for WSL npm install: {}", e))?;

            return if status.success() {
                Ok(output_lines.join("\n"))
            } else {
                Err(format!(
                    "Claude Code installation in WSL failed with exit code: {:?}",
                    status.code()
                ))
            };
        }
    }
    let _ = &wsl_distro; // suppress unused warning on non-Windows

    let npm_bin = if cfg!(target_os = "windows") {
        "npm.cmd"
    } else {
        "npm"
    };

    let mut cmd = tokio::process::Command::new(npm_bin);
    cmd.args(["install", "-g", "@anthropic-ai/claude-code"])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        #[allow(unused_imports)]
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start npm install: {}", e))?;

    let mut output_lines = Vec::new();

    async fn drain_stream<R: tokio::io::AsyncRead + Unpin>(
        stream: R,
        app: &AppHandle,
        out: &mut Vec<String>,
    ) {
        let mut lines =
            tokio::io::AsyncBufReadExt::lines(tokio::io::BufReader::new(stream));
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit("install-progress", serde_json::json!({"line": line}));
            out.push(line);
        }
    }

    if let Some(stdout) = child.stdout.take() {
        drain_stream(stdout, &app, &mut output_lines).await;
    }
    if let Some(stderr) = child.stderr.take() {
        drain_stream(stderr, &app, &mut output_lines).await;
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for npm install: {}", e))?;

    if status.success() {
        Ok(output_lines.join("\n"))
    } else {
        Err(format!(
            "Claude Code installation failed with exit code: {:?}",
            status.code()
        ))
    }
}
