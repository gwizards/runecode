use std::fs;
use std::path::PathBuf;
use std::process::Stdio;

use tauri::{AppHandle, Emitter, Manager};

use super::{get_claude_dir, guard_path_within_home};

/// Gets hooks configuration from settings at specified scope
#[tauri::command]
pub async fn get_hooks_config(
    scope: String,
    project_path: Option<String>,
) -> Result<serde_json::Value, String> {
    log::info!(
        "Getting hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let base = PathBuf::from(&path);
            guard_path_within_home(&base)
                .map_err(|e| format!("project_path rejected: {}", e))?;
            base.join(".claude").join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let base = PathBuf::from(&path);
            guard_path_within_home(&base)
                .map_err(|e| format!("project_path rejected: {}", e))?;
            base.join(".claude").join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    if !settings_path.exists() {
        log::info!(
            "Settings file does not exist at {:?}, returning empty hooks",
            settings_path
        );
        return Ok(serde_json::json!({}));
    }

    let content = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    let settings: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings
        .get("hooks")
        .cloned()
        .unwrap_or(serde_json::json!({})))
}

/// Updates hooks configuration in settings at specified scope
#[tauri::command]
pub async fn update_hooks_config(
    scope: String,
    hooks: serde_json::Value,
    project_path: Option<String>,
) -> Result<String, String> {
    log::info!(
        "Updating hooks config for scope: {}, project: {:?}",
        scope,
        project_path
    );

    let settings_path = match scope.as_str() {
        "user" => get_claude_dir()
            .map_err(|e| e.to_string())?
            .join("settings.json"),
        "project" => {
            let path = project_path.ok_or("Project path required for project scope")?;
            let base = PathBuf::from(&path);
            guard_path_within_home(&base)
                .map_err(|e| format!("project_path rejected: {}", e))?;
            let claude_dir = base.join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.json")
        }
        "local" => {
            let path = project_path.ok_or("Project path required for local scope")?;
            let base = PathBuf::from(&path);
            guard_path_within_home(&base)
                .map_err(|e| format!("project_path rejected: {}", e))?;
            let claude_dir = base.join(".claude");
            fs::create_dir_all(&claude_dir)
                .map_err(|e| format!("Failed to create .claude directory: {}", e))?;
            claude_dir.join("settings.local.json")
        }
        _ => return Err("Invalid scope".to_string()),
    };

    let mut settings = if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings: {}", e))?
    } else {
        serde_json::json!({})
    };

    settings["hooks"] = hooks;

    let json_string = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json_string)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok("Hooks configuration updated successfully".to_string())
}

/// Validates a hook command by dry-running it.
///
/// When `wsl_distro` is provided on Windows, the syntax check runs inside the
/// specified WSL distribution (`wsl -d <distro> -- bash -n -c <command>`).
#[tauri::command]
pub async fn validate_hook_command(
    command: String,
    wsl_distro: Option<String>,
) -> Result<serde_json::Value, String> {
    if command.len() > 4096 {
        return Err("Hook command too long (max 4096 chars)".to_string());
    }
    log::info!("Validating hook command syntax");

    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::task::spawn_blocking(move || {
            #[cfg(target_os = "windows")]
            if let Some(ref distro) = wsl_distro {
                if !distro.is_empty() {
                    let mut cmd = crate::claude_binary::silent_command("wsl");
                    cmd.args(["-d", distro, "--", "bash", "-n", "-c", &command]);
                    return cmd.output();
                }
            }
            let _ = &wsl_distro; // suppress unused warning on non-Windows
            let mut cmd = crate::claude_binary::silent_command("bash");
            cmd.arg("-n").arg("-c").arg(&command);
            cmd.output()
        }),
    )
    .await
    .map_err(|_| "validate_hook_command timed out".to_string())?
    .map_err(|e| format!("spawn_blocking failed: {}", e))?;

    match result {
        Ok(output) => {
            if output.status.success() {
                Ok(serde_json::json!({
                    "valid": true,
                    "message": "Command syntax is valid"
                }))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Ok(serde_json::json!({
                    "valid": false,
                    "message": format!("Syntax error: {}", stderr)
                }))
            }
        }
        Err(e) => Err(format!("Failed to validate command: {}", e)),
    }
}

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
                .args(["-d", distro, "--", "node", "--version"])
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
                    .args(["-d", distro, "--", "bash", "-lc", nvm_install_script])
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
                .args(["-d", distro, "--", "npm", "install", "-g", "@anthropic-ai/claude-code"])
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

/// Exposes the per-session startup secret to the frontend.
#[tauri::command]
pub async fn get_startup_token(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<super::StartupSecret>();
    Ok(state.0.clone())
}
