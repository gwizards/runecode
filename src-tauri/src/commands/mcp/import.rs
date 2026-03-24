use log::{error, info};
use tauri::AppHandle;

use super::servers::mcp_add_json;
use super::types::{ImportResult, ImportServerResult};

/// Imports MCP servers from Claude Desktop
#[tauri::command]
pub async fn mcp_add_from_claude_desktop(
    app: AppHandle,
    scope: String,
    wsl_distro: Option<String>,
) -> Result<ImportResult, String> {
    info!(
        "Importing MCP servers from Claude Desktop with scope: {}",
        scope
    );

    // Get Claude Desktop config path based on platform.
    // When WSL mode is active on Windows, read from the Linux config path
    // inside WSL (the Claude Desktop config is expected at the standard
    // Linux/XDG location within the WSL filesystem).
    let config_path = if cfg!(target_os = "windows") && wsl_distro.is_some() {
        // On Windows with WSL, read from ~/.config/Claude/claude_desktop_config.json
        // via the WSL filesystem mount (\\wsl$\<distro>\home\...).
        // Fall back to the standard Linux path resolution.
        dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join(".config")
            .join("Claude")
            .join("claude_desktop_config.json")
    } else if cfg!(target_os = "macos") {
        dirs::home_dir()
            .ok_or_else(|| "Could not find home directory".to_string())?
            .join("Library")
            .join("Application Support")
            .join("Claude")
            .join("claude_desktop_config.json")
    } else if cfg!(target_os = "linux") {
        dirs::config_dir()
            .ok_or_else(|| "Could not find config directory".to_string())?
            .join("Claude")
            .join("claude_desktop_config.json")
    } else {
        return Err(
            "Import from Claude Desktop is only supported on macOS and Linux/WSL".to_string(),
        );
    };

    if !config_path.exists() {
        return Err(
            "Claude Desktop configuration not found. Make sure Claude Desktop is installed."
                .to_string(),
        );
    }

    let config_content = std::fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read Claude Desktop config: {}", e))?;

    let config: serde_json::Value = serde_json::from_str(&config_content)
        .map_err(|e| format!("Failed to parse Claude Desktop config: {}", e))?;

    let mcp_servers = config
        .get("mcpServers")
        .and_then(|v| v.as_object())
        .ok_or_else(|| "No MCP servers found in Claude Desktop config".to_string())?;

    let mut imported_count = 0u32;
    let mut failed_count = 0u32;
    let mut server_results = Vec::new();

    for (name, server_config) in mcp_servers {
        info!("Importing server: {}", name);

        let mut json_config = serde_json::Map::new();
        json_config.insert(
            "type".to_string(),
            serde_json::Value::String("stdio".to_string()),
        );

        if let Some(command) = server_config.get("command").and_then(|v| v.as_str()) {
            json_config.insert(
                "command".to_string(),
                serde_json::Value::String(command.to_string()),
            );
        } else {
            failed_count += 1;
            server_results.push(ImportServerResult {
                name: name.clone(),
                success: false,
                error: Some("Missing command field".to_string()),
            });
            continue;
        }

        if let Some(args) = server_config.get("args").and_then(|v| v.as_array()) {
            json_config.insert("args".to_string(), args.clone().into());
        } else {
            json_config.insert("args".to_string(), serde_json::Value::Array(vec![]));
        }

        if let Some(env) = server_config.get("env").and_then(|v| v.as_object()) {
            json_config.insert("env".to_string(), env.clone().into());
        } else {
            json_config.insert(
                "env".to_string(),
                serde_json::Value::Object(serde_json::Map::new()),
            );
        }

        let json_str = serde_json::to_string(&json_config)
            .map_err(|e| format!("Failed to serialize config for {}: {}", name, e))?;

        match mcp_add_json(
            app.clone(),
            name.clone(),
            json_str,
            scope.clone(),
            wsl_distro.clone(),
        )
        .await
        {
            Ok(result) => {
                if result.success {
                    imported_count += 1;
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: true,
                        error: None,
                    });
                } else {
                    failed_count += 1;
                    let error_msg = result.message.clone();
                    server_results.push(ImportServerResult {
                        name: name.clone(),
                        success: false,
                        error: Some(result.message),
                    });
                    error!("Failed to import server {}: {}", name, error_msg);
                }
            }
            Err(e) => {
                failed_count += 1;
                let error_msg = e.clone();
                server_results.push(ImportServerResult {
                    name: name.clone(),
                    success: false,
                    error: Some(e),
                });
                error!("Error importing server {}: {}", name, error_msg);
            }
        }
    }

    info!(
        "Import complete: {} imported, {} failed",
        imported_count, failed_count
    );

    Ok(ImportResult {
        imported_count,
        failed_count,
        servers: server_results,
    })
}
