use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub mcp_active: bool,
    pub slash_command_exists: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuFloProjectStatus {
    pub initialized: bool,
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloAgent {
    pub id: String,
    pub name: String,
    pub agent_type: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,
}

#[tauri::command]
pub fn check_ruflo_installed() -> RuFloStatus {
    // Single npx call: --no-install means "don't download if not cached"
    // Use create_command_with_env to inherit PATH/NVM
    let output = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "--version"])
        .output()
        .ok();

    let installed = output.as_ref().map(|o| o.status.success()).unwrap_or(false);

    let version = if installed {
        output
            .as_ref()
            .and_then(|o| {
                // Strip UTF-8 BOM if present, then trim
                String::from_utf8_lossy(&o.stdout)
                    .trim_start_matches('\u{FEFF}')
                    .trim()
                    .to_string()
                    .into()
            })
            .filter(|s: &String| !s.is_empty())
    } else {
        None
    };

    // Check if MCP is active — use create_command_with_env for PATH/NVM
    let mcp_active = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "list"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| {
            // Check for "claude-flow" as a standalone server name (not just substring)
            s.lines().any(|line| {
                let trimmed = line.trim();
                trimmed == "claude-flow" || trimmed.starts_with("claude-flow ") || trimmed.starts_with("claude-flow\t")
            })
        })
        .unwrap_or(false);

    let slash_command_exists = dirs::home_dir()
        .map(|h| h.join(".claude").join("commands").join("setup-ruflo.md").exists())
        .unwrap_or(false);

    RuFloStatus { installed, version, mcp_active, slash_command_exists }
}

#[tauri::command]
pub async fn install_ruflo(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Emitter;
    use std::io::BufRead;

    // Use npm directly — create_command_with_env inherits PATH which resolves npm on all platforms
    let mut child = crate::claude_binary::create_command_with_env("npm")
        .args(["install", "-g", "@claude-flow/cli@latest"])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start npm: {e}"))?;

    // Drain stderr in a separate thread to prevent deadlock
    let stderr_handle = if let Some(stderr) = child.stderr.take() {
        let app_clone = app.clone();
        Some(std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            let mut lines_vec = Vec::new();
            for line in reader.lines().flatten() {
                let _ = app_clone.emit("ruflo-install-progress", format!("[err] {}", &line));
                lines_vec.push(line);
            }
            lines_vec
        }))
    } else {
        None
    };

    // Stream stdout progress
    if let Some(stdout) = child.stdout.take() {
        let reader = std::io::BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let _ = app.emit("ruflo-install-progress", &line);
        }
    }

    let status = child.wait().map_err(|e| format!("npm wait failed: {e}"))?;

    // Collect stderr output for error messages
    let stderr_output = stderr_handle
        .and_then(|h| h.join().ok())
        .unwrap_or_default()
        .join("\n");

    if status.success() {
        Ok("RuFlo installed successfully".to_string())
    } else if !stderr_output.is_empty() {
        Err(format!("npm install failed: {}", stderr_output))
    } else {
        Err("npm install failed — check terminal output".to_string())
    }
}

#[tauri::command]
pub async fn activate_ruflo_mcp() -> Result<String, String> {
    let output = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "add", "claude-flow", "--", "npx", "-y", "@claude-flow/cli@latest"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp add: {e}"))?;

    if output.status.success() {
        Ok("MCP server activated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP activation failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn deactivate_ruflo_mcp() -> Result<String, String> {
    let output = crate::claude_binary::create_command_with_env("claude")
        .args(["mcp", "remove", "claude-flow"])
        .output()
        .map_err(|e| format!("Failed to run claude mcp remove: {e}"))?;

    if output.status.success() {
        Ok("MCP server deactivated".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("MCP deactivation failed: {stderr}"))
    }
}

#[tauri::command]
pub fn create_ruflo_slash_command() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    let commands_dir = home.join(".claude").join("commands");
    std::fs::create_dir_all(&commands_dir)
        .map_err(|e| format!("Failed to create commands dir: {e}"))?;

    let content = r#"---
name: setup-ruflo
description: Generates the autonomous project manager rules in claude.md using Ruflo MCP
---
Update the 'claude.md' file in the root of this project. This file is your permanent operating manual. You are the Autonomous Project Manager. Write a comprehensive, strictly formatted Markdown document detailing your operating procedures using the Ruflo MCP. Include the following core directives:

1. INTAKE & TASK CREATION: If I request a feature, bug fix, or update directly in the chat, DO NOT write the code yourself. Instead, instantly act as a Systems Architect: write a highly detailed specification for the request, format it as a Markdown file, and save it to the 'tasks/pending/' directory. If the request is large, break it down into multiple smaller, sequential .md files.
2. EXECUTION TRIGGER: Always check the 'tasks/pending/' directory for new Markdown files when you start a session or when told to 'execute'.
3. SWARM INITIALIZATION: When a pending task is found, use your Ruflo MCP tools to initialize a 'hierarchical' swarm.
4. DELEGATION: Spawn specialized agents (e.g., 'coder', 'tester', 'reviewer') and delegate the work. You are the manager; you must never write the application code yourself. Rely entirely on the Ruflo swarm.
5. QUALITY GATES: The 'tester' agent must verify that all tests pass. The 'reviewer' agent must sign off on the code quality.
6. ERROR HANDLING: If the swarm fails to complete the task after multiple attempts, or tests continuously fail, move the task file to 'tasks/blocked/' and document the exact error in 'logs/swarm_log.txt'. Do not loop infinitely.
7. SUCCESS PROTOCOL: If the task is successful, commit all changes to Git with a descriptive, conventional commit message.
8. CLEANUP: Move the successfully finished task file from 'tasks/pending/' to 'tasks/completed/'.
9. REPORTING: Append a brief, timestamped summary of the completed (or blocked) work to 'logs/swarm_log.txt'.

Format this document beautifully with clear headings, bullet points, and bold text for emphasis so you can read it easily on startup.
"#;

    let path = commands_dir.join("setup-ruflo.md");
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write setup-ruflo.md: {e}"))?;

    Ok(format!("Created {}", path.display()))
}

#[tauri::command]
pub fn get_ruflo_project_status(path: String) -> RuFloProjectStatus {
    let raw_path = std::path::Path::new(&path);
    let base = match std::fs::canonicalize(raw_path) {
        Ok(p) => p,
        Err(_) => return RuFloProjectStatus::default(),
    };
    // Verify within home directory
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return RuFloProjectStatus::default(),
    };
    if !base.starts_with(&home) {
        log::warn!("get_ruflo_project_status: path {} is outside home dir", base.display());
        return RuFloProjectStatus::default();
    }
    let tasks_dir = base.join("tasks");

    let initialized = tasks_dir.join("pending").exists()
        && tasks_dir.join("completed").exists()
        && tasks_dir.join("blocked").exists();

    let count_md = |subdir: &str| -> usize {
        std::fs::read_dir(tasks_dir.join(subdir))
            .map(|entries| {
                entries
                    .flatten()
                    .filter(|e| {
                        e.path().extension().and_then(|x| x.to_str()) == Some("md")
                    })
                    .count()
            })
            .unwrap_or(0)
    };

    RuFloProjectStatus {
        initialized,
        pending: count_md("pending"),
        completed: count_md("completed"),
        blocked: count_md("blocked"),
    }
}

#[tauri::command]
pub async fn get_ruflo_swarm_status() -> RuFloSwarmStatus {
    let agents_output = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "agent", "list", "--json"])
        .output()
        .ok();

    let (agents, parse_error) = match agents_output.as_ref() {
        Some(o) if o.status.success() => {
            let stdout = String::from_utf8_lossy(&o.stdout);
            match serde_json::from_str::<serde_json::Value>(stdout.trim()) {
                Ok(v) => {
                    let agents = v.as_array()
                        .cloned()
                        .unwrap_or_default()
                        .iter()
                        .map(|a| RuFloAgent {
                            id: a["id"].as_str().unwrap_or("").to_string(),
                            name: a["name"].as_str().unwrap_or("agent").to_string(),
                            agent_type: a["type"].as_str().unwrap_or("agent").to_string(),
                            status: a["status"].as_str().unwrap_or("idle").to_string(),
                        })
                        .collect::<Vec<_>>();
                    (agents, None)
                }
                Err(e) => {
                    log::warn!("Failed to parse agent list JSON: {}", e);
                    (vec![], Some(format!("parse error: {}", e)))
                }
            }
        }
        Some(o) => {
            let stderr = String::from_utf8_lossy(&o.stderr);
            log::warn!("agent list command failed: {}", stderr);
            (vec![], Some(stderr.to_string()))
        }
        None => (vec![], Some("command not found".to_string())),
    };

    let _ = parse_error; // logged above; callers see empty agents

    let swarm_active = !agents.is_empty()
        && agents.iter().any(|a| {
            matches!(a.status.as_str(), "running" | "waiting" | "active" | "busy" | "initializing")
        });

    let memory_entries = crate::claude_binary::create_command_with_env("npx")
        .args(["--no-install", "@claude-flow/cli", "memory", "list", "--json"])
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .and_then(|v| v.as_array().map(|a| a.len()))
        .unwrap_or(0);

    RuFloSwarmStatus { swarm_active, agents, memory_entries }
}

#[tauri::command]
pub async fn init_ruflo_project(path: String) -> Result<String, String> {
    let project_path = std::path::Path::new(&path);
    if !project_path.exists() {
        return Err(format!("Project path does not exist: {}", project_path.display()));
    }
    if !project_path.is_dir() {
        return Err(format!("Project path is not a directory: {}", project_path.display()));
    }

    let project_path = match std::fs::canonicalize(project_path) {
        Ok(p) => p,
        Err(e) => return Err(format!("Cannot resolve project path: {}", e)),
    };
    // Verify within home directory
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    if !project_path.starts_with(&home) {
        return Err("Project path must be within the home directory".to_string());
    }

    let output = crate::claude_binary::create_command_with_env("npx")
        .args(["@claude-flow/cli", "init"])
        .current_dir(&project_path)
        .output()
        .map_err(|e| format!("Failed to run ruflo init: {e}"))?;

    if output.status.success() {
        Ok("RuFlo initialized in project".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("ruflo init failed: {stderr}"))
    }
}

#[tauri::command]
pub async fn uninstall_ruflo() -> Result<String, String> {
    let output = crate::claude_binary::create_command_with_env("npm")
        .args(["uninstall", "-g", "@claude-flow/cli"])
        .output()
        .map_err(|e| format!("Failed to run npm uninstall: {e}"))?;

    if output.status.success() {
        Ok("RuFlo uninstalled successfully".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("npm uninstall failed: {stderr}"))
    }
}
