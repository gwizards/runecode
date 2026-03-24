use serde::{Deserialize, Serialize};

/// Validates WSL distro name -- alphanumeric, hyphens, underscores, periods only.
pub fn validate_distro_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("Distro name cannot be empty".into());
    }
    if name.len() > 64 {
        return Err("Distro name too long".into());
    }
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err("Distro name contains invalid characters".into());
    }
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WslDistro {
    pub name: String,
    pub is_default: bool,
    pub version: u8,
    pub state: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WslStatus {
    pub available: bool,
    pub distros: Vec<WslDistro>,
    pub recommended_distro: Option<String>,
    pub claude_in_wsl: bool,
    pub node_in_wsl: bool,
}

/// Detect WSL availability and list installed distros.
/// On non-Windows platforms, returns `{ available: false, distros: [] }`.
#[tauri::command]
pub async fn detect_wsl() -> Result<WslStatus, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Ok(WslStatus {
            available: false,
            distros: vec![],
            recommended_distro: None,
            claude_in_wsl: false,
            node_in_wsl: false,
        });
    }

    #[cfg(target_os = "windows")]
    {
        let output = tokio::task::spawn_blocking(|| {
            silent_command("wsl")
                .args(["--list", "--verbose"])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| format!("WSL not available: {}", e))?;

        if !output.status.success() {
            return Ok(WslStatus {
                available: false,
                distros: vec![],
                recommended_distro: None,
                claude_in_wsl: false,
                node_in_wsl: false,
            });
        }

        // wsl --list --verbose outputs UTF-16 LE on Windows
        let stdout = String::from_utf16_lossy(
            &output
                .stdout
                .chunks(2)
                .map(|c| u16::from_le_bytes([c[0], *c.get(1).unwrap_or(&0)]))
                .collect::<Vec<_>>(),
        );

        // Parse lines — skip header row.
        // Format: "* Ubuntu    Running  2" or "  Debian    Stopped  1"
        let mut distros = Vec::new();
        for line in stdout.lines().skip(1) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let is_default = trimmed.starts_with('*');
            let clean = trimmed.trim_start_matches('*').trim();
            let parts: Vec<&str> = clean.split_whitespace().collect();
            if parts.len() >= 3 {
                distros.push(WslDistro {
                    name: parts[0].to_string(),
                    state: parts[1].to_string(),
                    is_default,
                    version: parts[2].parse().unwrap_or(2),
                });
            }
        }

        let recommended = distros
            .iter()
            .find(|d| d.version == 2 && d.is_default)
            .or_else(|| distros.iter().find(|d| d.version == 2))
            .map(|d| d.name.clone());

        // Check whether claude and node are available inside the recommended distro
        let (claude_found, node_found) = if let Some(ref distro) = recommended {
            let d_claude = distro.clone();
            let d_node = distro.clone();

            let claude = tokio::task::spawn_blocking(move || {
                silent_command("wsl")
                    .args(["-d", &d_claude, "--", "which", "claude"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            })
            .await
            .unwrap_or(false);

            let node = tokio::task::spawn_blocking(move || {
                silent_command("wsl")
                    .args(["-d", &d_node, "--", "which", "node"])
                    .output()
                    .map(|o| o.status.success())
                    .unwrap_or(false)
            })
            .await
            .unwrap_or(false);

            (claude, node)
        } else {
            (false, false)
        };

        Ok(WslStatus {
            available: !distros.is_empty(),
            distros,
            recommended_distro: recommended,
            claude_in_wsl: claude_found,
            node_in_wsl: node_found,
        })
    }
}

/// Execute a command inside a WSL distro.
///
/// Tries `bash -lc` first; if that fails, falls back to `sh -c`.
#[tauri::command]
pub async fn wsl_execute(distro: String, command: String) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        // Suppress unused-variable warnings on non-Windows builds.
        let _ = (&distro, &command);
        return Err("WSL is only available on Windows".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        validate_distro_name(&distro)?;

        let distro_clone = distro.clone();
        let command_clone = command.clone();

        // Try bash -lc first
        let output = tokio::task::spawn_blocking(move || {
            silent_command("wsl")
                .args(["-d", &distro_clone, "--", "bash", "-lc", &command_clone])
                .output()
        })
        .await
        .map_err(|e| e.to_string())?;

        match output {
            Ok(o) if o.status.success() => {
                return Ok(String::from_utf8_lossy(&o.stdout).to_string());
            }
            _ => {
                // Fallback to sh -c
                log::debug!("bash -lc failed in WSL, falling back to sh -c");
                let output = tokio::task::spawn_blocking(move || {
                    silent_command("wsl")
                        .args(["-d", &distro, "--", "sh", "-c", &command])
                        .output()
                })
                .await
                .map_err(|e| e.to_string())?
                .map_err(|e| format!("WSL execution failed: {}", e))?;

                let stdout = String::from_utf8_lossy(&output.stdout).to_string();
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();

                if output.status.success() {
                    Ok(stdout)
                } else {
                    Err(format!("{}\n{}", stdout, stderr))
                }
            }
        }
    }
}

/// Install Claude Code inside a WSL distro via npm.
#[tauri::command]
pub async fn install_claude_in_wsl(distro: String) -> Result<String, String> {
    validate_distro_name(&distro)?;
    wsl_execute(
        distro,
        "npm install -g @anthropic-ai/claude-code".to_string(),
    )
    .await
}
