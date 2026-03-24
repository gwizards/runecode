use std::fs;
use std::path::PathBuf;

use tauri::Manager;

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

/// Exposes the per-session startup secret to the frontend.
#[tauri::command]
pub async fn get_startup_token(app: tauri::AppHandle) -> Result<String, String> {
    let state = app.state::<super::StartupSecret>();
    Ok(state.0.clone())
}
