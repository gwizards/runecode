use anyhow::{Context, Result};
use log::{error, info};
use std::collections::HashMap;
use tauri::AppHandle;

use super::types::{AddServerResult, MCPServer, ServerStatus};

fn create_command_with_env(program: &str) -> std::process::Command {
    crate::claude_binary::create_command_with_env(program)
}

fn find_claude_binary(app_handle: &AppHandle) -> Result<String> {
    crate::claude_binary::find_claude_binary(app_handle).map_err(|e| anyhow::anyhow!(e))
}

/// Executes a claude mcp command.
/// When `wsl_distro` is Some, routes through `wsl -d <distro> -- claude mcp ...`
/// instead of invoking the native claude binary.
pub(super) async fn execute_claude_mcp_command(
    app_handle: &AppHandle,
    args: Vec<&str>,
    wsl_distro: Option<&str>,
) -> Result<String> {
    info!("Executing claude mcp command with args: {:?}", args);

    let args_owned: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    // On Windows with WSL mode, route through wsl instead of the native binary.
    #[cfg(target_os = "windows")]
    if let Some(distro) = wsl_distro {
        let distro_owned = distro.to_string();
        let output = tokio::time::timeout(
            std::time::Duration::from_secs(30),
            tokio::task::spawn_blocking(move || {
                let mut cmd = create_command_with_env("wsl");
                cmd.arg("-d").arg(&distro_owned).arg("-e").arg("claude").arg("mcp");
                for arg in &args_owned {
                    cmd.arg(arg);
                }
                cmd.output()
            }),
        )
        .await
        .map_err(|_| anyhow::anyhow!("WSL mcp command timed out after 30s"))?
        .map_err(|e| anyhow::anyhow!("spawn_blocking failed: {}", e))?
        .context("Failed to execute WSL claude command")?;

        if output.status.success() {
            return Ok(String::from_utf8_lossy(&output.stdout).to_string());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            return Err(anyhow::anyhow!("WSL MCP command failed: {}", stderr));
        }
    }

    // Suppress unused-variable warning on non-Windows where the cfg block is compiled out
    let _ = wsl_distro;

    let claude_path = find_claude_binary(app_handle)?;

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::task::spawn_blocking(move || {
            let mut cmd = create_command_with_env(&claude_path);
            cmd.arg("mcp");
            for arg in &args_owned {
                cmd.arg(arg);
            }
            cmd.output()
        }),
    )
    .await
    .map_err(|_| anyhow::anyhow!("mcp command timed out after 30s"))?
    .map_err(|e| anyhow::anyhow!("spawn_blocking failed: {}", e))?
    .context("Failed to execute claude command")?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(anyhow::anyhow!("Command failed: {}", stderr))
    }
}

/// Adds a new MCP server
#[tauri::command]
pub async fn mcp_add(
    app: AppHandle,
    name: String,
    transport: String,
    command: Option<String>,
    args: Vec<String>,
    env: HashMap<String, String>,
    url: Option<String>,
    scope: String,
    wsl_distro: Option<String>,
) -> Result<AddServerResult, String> {
    info!("Adding MCP server: {} with transport: {}", name, transport);

    let env_args: Vec<String> = env
        .iter()
        .map(|(key, value)| format!("{}={}", key, value))
        .collect();

    let mut cmd_args = vec!["add"];
    cmd_args.push("-s");
    cmd_args.push(&scope);

    if transport == "sse" {
        cmd_args.push("--transport");
        cmd_args.push("sse");
    }

    for (i, _) in env.iter().enumerate() {
        cmd_args.push("-e");
        cmd_args.push(&env_args[i]);
    }

    cmd_args.push(&name);

    if transport == "stdio" {
        if let Some(cmd) = &command {
            if !args.is_empty() || cmd.contains('-') {
                cmd_args.push("--");
            }
            cmd_args.push(cmd);
            for arg in &args {
                cmd_args.push(arg);
            }
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "Command is required for stdio transport".to_string(),
                server_name: None,
            });
        }
    } else if transport == "sse" {
        if let Some(url_str) = &url {
            cmd_args.push(url_str);
        } else {
            return Ok(AddServerResult {
                success: false,
                message: "URL is required for SSE transport".to_string(),
                server_name: None,
            });
        }
    }

    match execute_claude_mcp_command(&app, cmd_args, wsl_distro.as_deref()).await {
        Ok(output) => {
            info!("Successfully added MCP server: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Lists all configured MCP servers
#[tauri::command]
pub async fn mcp_list(app: AppHandle, wsl_distro: Option<String>) -> Result<Vec<MCPServer>, String> {
    info!("Listing MCP servers");

    match execute_claude_mcp_command(&app, vec!["list"], wsl_distro.as_deref()).await {
        Ok(output) => {
            let trimmed = output.trim();
            if trimmed.contains("No MCP servers configured") || trimmed.is_empty() {
                return Ok(vec![]);
            }

            let mut servers = Vec::new();
            let lines: Vec<&str> = trimmed.lines().collect();
            let mut i = 0;

            while i < lines.len() {
                let line = lines[i];
                if let Some(colon_pos) = line.find(':') {
                    let potential_name = line[..colon_pos].trim();
                    if !potential_name.contains('/') && !potential_name.contains('\\') {
                        let name = potential_name.to_string();
                        let mut command_parts =
                            vec![line[colon_pos + 1..].trim().to_string()];

                        i += 1;
                        while i < lines.len() {
                            let next_line = lines[i];
                            if next_line.contains(':') {
                                let potential_next_name =
                                    next_line.split(':').next().unwrap_or("").trim();
                                if !potential_next_name.is_empty()
                                    && !potential_next_name.contains('/')
                                    && !potential_next_name.contains('\\')
                                {
                                    break;
                                }
                            }
                            command_parts.push(next_line.trim().to_string());
                            i += 1;
                        }

                        let full_command = command_parts.join(" ");
                        servers.push(MCPServer {
                            name,
                            transport: "stdio".to_string(),
                            command: Some(full_command),
                            args: vec![],
                            env: HashMap::new(),
                            url: None,
                            scope: "local".to_string(),
                            is_active: false,
                            status: ServerStatus {
                                running: false,
                                error: None,
                                last_checked: None,
                            },
                        });
                        continue;
                    }
                }
                i += 1;
            }

            info!("Found {} MCP servers total", servers.len());
            Ok(servers)
        }
        Err(e) => {
            error!("Failed to list MCP servers: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets details for a specific MCP server
#[tauri::command]
pub async fn mcp_get(app: AppHandle, name: String, wsl_distro: Option<String>) -> Result<MCPServer, String> {
    info!("Getting MCP server details for: {}", name);

    match execute_claude_mcp_command(&app, vec!["get", &name], wsl_distro.as_deref()).await {
        Ok(output) => {
            let mut scope = "local".to_string();
            let mut transport = "stdio".to_string();
            let mut command = None;
            let mut args = vec![];
            let env = HashMap::new();
            let mut url = None;

            for line in output.lines() {
                let line = line.trim();
                if line.starts_with("Scope:") {
                    let scope_part = line.replace("Scope:", "").trim().to_string();
                    if scope_part.to_lowercase().contains("local") {
                        scope = "local".to_string();
                    } else if scope_part.to_lowercase().contains("project") {
                        scope = "project".to_string();
                    } else if scope_part.to_lowercase().contains("user")
                        || scope_part.to_lowercase().contains("global")
                    {
                        scope = "user".to_string();
                    }
                } else if line.starts_with("Type:") {
                    transport = line.replace("Type:", "").trim().to_string();
                } else if line.starts_with("Command:") {
                    command = Some(line.replace("Command:", "").trim().to_string());
                } else if line.starts_with("Args:") {
                    let args_str = line.replace("Args:", "").trim().to_string();
                    if !args_str.is_empty() {
                        args =
                            args_str.split_whitespace().map(|s| s.to_string()).collect();
                    }
                } else if line.starts_with("URL:") {
                    url = Some(line.replace("URL:", "").trim().to_string());
                }
            }

            Ok(MCPServer {
                name,
                transport,
                command,
                args,
                env,
                url,
                scope,
                is_active: false,
                status: ServerStatus {
                    running: false,
                    error: None,
                    last_checked: None,
                },
            })
        }
        Err(e) => {
            error!("Failed to get MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Removes an MCP server
#[tauri::command]
pub async fn mcp_remove(app: AppHandle, name: String, wsl_distro: Option<String>) -> Result<String, String> {
    info!("Removing MCP server: {}", name);

    match execute_claude_mcp_command(&app, vec!["remove", &name], wsl_distro.as_deref()).await {
        Ok(output) => {
            info!("Successfully removed MCP server: {}", name);
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to remove MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Adds an MCP server from JSON configuration
#[tauri::command]
pub async fn mcp_add_json(
    app: AppHandle,
    name: String,
    json_config: String,
    scope: String,
    wsl_distro: Option<String>,
) -> Result<AddServerResult, String> {
    info!("Adding MCP server from JSON: {} scope: {}", name, scope);

    let mut cmd_args = vec!["add-json", &name, &json_config];
    cmd_args.push("-s");
    cmd_args.push(&scope);

    match execute_claude_mcp_command(&app, cmd_args, wsl_distro.as_deref()).await {
        Ok(output) => {
            info!("Successfully added MCP server from JSON: {}", name);
            Ok(AddServerResult {
                success: true,
                message: output.trim().to_string(),
                server_name: Some(name),
            })
        }
        Err(e) => {
            error!("Failed to add MCP server from JSON: {}", e);
            Ok(AddServerResult {
                success: false,
                message: e.to_string(),
                server_name: None,
            })
        }
    }
}

/// Starts Claude Code as an MCP server
#[tauri::command]
pub async fn mcp_serve(app: AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    info!("Starting Claude Code as MCP server");

    // When WSL mode is active, route through wsl
    #[cfg(target_os = "windows")]
    if let Some(ref distro) = wsl_distro {
        let mut cmd = create_command_with_env("wsl");
        cmd.arg("-d").arg(distro).arg("-e").arg("claude").arg("mcp").arg("serve");
        match cmd.spawn() {
            Ok(_) => {
                info!("Successfully started Claude Code MCP server via WSL");
                return Ok("Claude Code MCP server started (WSL)".to_string());
            }
            Err(e) => {
                error!("Failed to start MCP server via WSL: {}", e);
                return Err(e.to_string());
            }
        }
    }

    let _ = wsl_distro; // suppress warning on non-Windows

    let claude_path = match crate::claude_binary::find_claude_binary(&app) {
        Ok(path) => path,
        Err(e) => {
            error!("Failed to find claude binary: {}", e);
            return Err(e.to_string());
        }
    };

    let mut cmd = create_command_with_env(&claude_path);
    cmd.arg("mcp").arg("serve");

    match cmd.spawn() {
        Ok(_) => {
            info!("Successfully started Claude Code MCP server");
            Ok("Claude Code MCP server started".to_string())
        }
        Err(e) => {
            error!("Failed to start MCP server: {}", e);
            Err(e.to_string())
        }
    }
}

/// Tests connection to an MCP server
#[tauri::command]
pub async fn mcp_test_connection(app: AppHandle, name: String, wsl_distro: Option<String>) -> Result<String, String> {
    info!("Testing connection to MCP server: {}", name);
    match execute_claude_mcp_command(&app, vec!["get", &name], wsl_distro.as_deref()).await {
        Ok(_) => Ok(format!("Connection to {} successful", name)),
        Err(e) => Err(e.to_string()),
    }
}

/// Resets project-scoped server approval choices
#[tauri::command]
pub async fn mcp_reset_project_choices(app: AppHandle, wsl_distro: Option<String>) -> Result<String, String> {
    info!("Resetting MCP project choices");

    match execute_claude_mcp_command(&app, vec!["reset-project-choices"], wsl_distro.as_deref()).await {
        Ok(output) => {
            info!("Successfully reset MCP project choices");
            Ok(output.trim().to_string())
        }
        Err(e) => {
            error!("Failed to reset project choices: {}", e);
            Err(e.to_string())
        }
    }
}

/// Gets the status of MCP servers
#[tauri::command]
pub async fn mcp_get_server_status() -> Result<HashMap<String, ServerStatus>, String> {
    info!("MCP server status check: returning empty map (per-server health probes not yet wired)");
    // NOTE: Per-server health probes are not yet implemented; returns an empty
    // map so callers degrade gracefully.
    Ok(HashMap::new())
}
