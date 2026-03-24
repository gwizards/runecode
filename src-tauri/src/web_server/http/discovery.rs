/// Dynamic command/agent/MCP discovery handlers — reads from the running `claude` binary.

use axum::response::IntoResponse;
use std::time::Duration;

use crate::web_server::ApiResponse;

pub async fn get_skills_catalog_web() -> impl IntoResponse {
    let result =
        tokio::task::spawn_blocking(|| crate::commands::skills::get_skills_catalog()).await;
    match result {
        Ok(catalog) => {
            axum::Json(serde_json::to_value(catalog).unwrap_or_default()).into_response()
        }
        Err(_) => axum::Json(serde_json::json!([])).into_response(),
    }
}

pub async fn get_builtin_commands() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
                .args(["--help"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let commands = parse_claude_help_output(&stdout);
            axum::Json(ApiResponse::success(commands))
        }
        _ => axum::Json(ApiResponse::success(serde_json::json!([]))),
    }
}

fn parse_claude_help_output(output: &str) -> serde_json::Value {
    let mut commands = Vec::new();
    let mut in_commands_section = false;

    for line in output.lines() {
        let trimmed = line.trim();

        if trimmed == "Commands:" {
            in_commands_section = true;
            continue;
        }

        if in_commands_section && trimmed.is_empty() {
            in_commands_section = false;
            continue;
        }

        if in_commands_section && !trimmed.is_empty() {
            let parts: Vec<&str> = trimmed.splitn(2, char::is_whitespace).collect();
            if let Some(name_part) = parts.first() {
                let name = name_part.split('|').next().unwrap_or(name_part).trim();
                if name.is_empty() {
                    continue;
                }
                let desc = parts.get(1).unwrap_or(&"").trim();
                let clean_desc = if desc.starts_with('[') {
                    desc.splitn(2, ']').last().unwrap_or("").trim()
                } else {
                    desc
                };
                commands.push(serde_json::json!({
                    "name": name,
                    "full_command": format!("claude {}", name),
                    "description": clean_desc,
                    "scope": "cli",
                    "type": "subcommand"
                }));
            }
        }

        if trimmed.starts_with("--") || trimmed.starts_with('-') {
            let parts: Vec<&str> = trimmed.splitn(2, "  ").collect();
            if parts.len() == 2 {
                let flag = parts[0]
                    .trim()
                    .split(',')
                    .last()
                    .unwrap_or("")
                    .trim()
                    .split(' ')
                    .next()
                    .unwrap_or("");
                let desc = parts[1].trim();
                if !flag.is_empty() && !desc.is_empty() {
                    commands.push(serde_json::json!({
                        "name": flag.trim_start_matches('-'),
                        "full_command": flag,
                        "description": desc,
                        "scope": "cli",
                        "type": "flag"
                    }));
                }
            }
        }
    }
    serde_json::json!(commands)
}

pub async fn get_agents_list() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude").arg("agents").output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let agents = parse_agents_output(&stdout);
            axum::Json(ApiResponse::success(agents))
        }
        _ => axum::Json(ApiResponse::success(serde_json::json!([]))),
    }
}

fn parse_agents_output(output: &str) -> serde_json::Value {
    let mut agents = Vec::new();
    let mut current_section = "";

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.ends_with("agents") || trimmed.ends_with(':') {
            current_section = if trimmed.contains("Plugin") {
                "plugin"
            } else if trimmed.contains("Built-in") {
                "builtin"
            } else {
                current_section
            };
            continue;
        }
        if trimmed.contains('\u{00b7}') {
            let parts: Vec<&str> = trimmed.splitn(2, '\u{00b7}').collect();
            let name = parts[0].trim();
            let model = parts.get(1).map(|m| m.trim()).unwrap_or("inherit");
            agents.push(serde_json::json!({
                "name": name,
                "model": model,
                "type": current_section
            }));
        }
    }
    serde_json::json!(agents)
}

pub async fn get_mcp_servers_list() -> impl IntoResponse {
    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(|| {
            std::process::Command::new("claude")
                .args(["mcp", "list"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let servers = parse_mcp_list_output(&stdout);
            axum::Json(ApiResponse::success(servers))
        }
        _ => axum::Json(ApiResponse::success(serde_json::json!([]))),
    }
}

fn parse_mcp_list_output(output: &str) -> serde_json::Value {
    let mut servers = Vec::new();

    for line in output.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("Checking") {
            continue;
        }

        if let Some(colon_pos) = trimmed.find(':') {
            let name = trimmed[..colon_pos].trim();
            let rest = trimmed[colon_pos + 1..].trim();

            let status = if rest.contains("Connected") {
                "connected"
            } else if rest.contains("Needs") {
                "needs_auth"
            } else if rest.contains('\u{2717}') {
                "error"
            } else {
                "unknown"
            };

            let command = rest.split(" - ").next().unwrap_or("").trim();

            servers.push(serde_json::json!({
                "name": name,
                "command": command,
                "status": status
            }));
        }
    }
    serde_json::json!(servers)
}
