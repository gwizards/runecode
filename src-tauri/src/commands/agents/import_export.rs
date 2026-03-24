use anyhow::Result;
use log::info;
use rusqlite::params;
use tauri::State;

use super::{Agent, AgentDb, AgentExport, GitHubAgentFile};
// ─────────────────────────────────────────────────────────────────────────────
// GitHub API types (private to this module)
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
struct GitHubApiResponse {
    name: String,
    path: String,
    sha: String,
    size: i64,
    download_url: Option<String>,
    #[serde(rename = "type")]
    file_type: String,
}

// ─────────────────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────────────────

/// Export a single agent to JSON format
#[tauri::command]
pub async fn export_agent(db: State<'_, AgentDb>, id: i64) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let agent = conn
        .query_row(
            "SELECT name, icon, system_prompt, default_task, model, hooks \
             FROM agents WHERE id = ?1",
            params![id],
            |row| {
                Ok(serde_json::json!({
                    "name": row.get::<_, String>(0)?,
                    "icon": row.get::<_, String>(1)?,
                    "system_prompt": row.get::<_, String>(2)?,
                    "default_task": row.get::<_, Option<String>>(3)?,
                    "model": row.get::<_, String>(4)?,
                    "hooks": row.get::<_, Option<String>>(5)?
                }))
            },
        )
        .map_err(|e| format!("Failed to fetch agent: {}", e))?;

    let export_data = serde_json::json!({
        "version": 1,
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "agent": agent
    });

    serde_json::to_string_pretty(&export_data)
        .map_err(|e| format!("Failed to serialize agent: {}", e))
}

/// Export agent to file with native dialog
#[tauri::command]
pub async fn export_agent_to_file(
    db: State<'_, AgentDb>,
    id: i64,
    file_path: String,
) -> Result<(), String> {
    let canonical_file_path = crate::commands::claude::guard_path_within_home(
        &std::path::PathBuf::from(&file_path),
    )?;

    let json_data = export_agent(db, id).await?;

    std::fs::write(&canonical_file_path, json_data)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

// ─────────────────────────────────────────────────────────────────────────────
// Import
// ─────────────────────────────────────────────────────────────────────────────

/// Import an agent from JSON data
#[tauri::command]
pub async fn import_agent(db: State<'_, AgentDb>, json_data: String) -> Result<Agent, String> {
    let export_data: AgentExport =
        serde_json::from_str(&json_data).map_err(|e| format!("Invalid JSON format: {}", e))?;

    if export_data.version != 1 {
        return Err(format!(
            "Unsupported export version: {}. This version of the app only supports version 1.",
            export_data.version
        ));
    }

    let agent_data = export_data.agent;
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let existing_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM agents WHERE name = ?1",
            params![agent_data.name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let final_name = if existing_count > 0 {
        format!("{} (Imported)", agent_data.name)
    } else {
        agent_data.name
    };

    conn.execute(
        "INSERT INTO agents (name, icon, system_prompt, default_task, model, \
         enable_file_read, enable_file_write, enable_network, hooks) \
         VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, 0, ?6)",
        params![
            final_name,
            agent_data.icon,
            agent_data.system_prompt,
            agent_data.default_task,
            agent_data.model,
            agent_data.hooks
        ],
    )
    .map_err(|e| format!("Failed to create agent: {}", e))?;

    let id = conn.last_insert_rowid();

    let agent = conn
        .query_row(
            "SELECT id, name, icon, system_prompt, default_task, model, \
             enable_file_read, enable_file_write, enable_network, hooks, \
             created_at, updated_at FROM agents WHERE id = ?1",
            params![id],
            |row| {
                Ok(Agent {
                    id: Some(row.get(0)?),
                    name: row.get(1)?,
                    icon: row.get(2)?,
                    system_prompt: row.get(3)?,
                    default_task: row.get(4)?,
                    model: row.get(5)?,
                    enable_file_read: row.get(6)?,
                    enable_file_write: row.get(7)?,
                    enable_network: row.get(8)?,
                    hooks: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created agent: {}", e))?;

    Ok(agent)
}

/// Import agent from file
#[tauri::command]
pub async fn import_agent_from_file(
    db: State<'_, AgentDb>,
    file_path: String,
) -> Result<Agent, String> {
    let canonical_file_path = crate::commands::claude::guard_path_within_home(
        &std::path::PathBuf::from(&file_path),
    )?;

    let mut json_data = std::fs::read_to_string(&canonical_file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Normalize BOM and whitespace
    if json_data.starts_with('\u{feff}') {
        json_data = json_data.trim_start_matches('\u{feff}').to_string();
    }
    json_data = json_data.trim().to_string();

    import_agent(db, json_data).await
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub import
// ─────────────────────────────────────────────────────────────────────────────

/// Fetch list of agents from GitHub repository
#[tauri::command]
pub async fn fetch_github_agents() -> Result<Vec<GitHubAgentFile>, String> {
    info!("Fetching agents from GitHub repository...");

    let client = reqwest::Client::new();
    let url = "https://api.github.com/repos/getAsterisk/runecode/contents/cc_agents";

    let response = client
        .get(url)
        .header("Accept", "application/vnd.github+json")
        .header("User-Agent", "runecode-App")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch from GitHub: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("GitHub API error ({}): {}", status, error_text));
    }

    let api_files: Vec<GitHubApiResponse> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse GitHub response: {}", e))?;

    let agent_files: Vec<GitHubAgentFile> = api_files
        .into_iter()
        .filter(|f| {
            (f.name.ends_with(".runecode.json") || f.name.ends_with(".opcode.json"))
                && f.file_type == "file"
        })
        .filter_map(|f| {
            f.download_url.map(|download_url| GitHubAgentFile {
                name: f.name,
                path: f.path,
                download_url,
                size: f.size,
                sha: f.sha,
            })
        })
        .collect();

    info!("Found {} agents on GitHub", agent_files.len());
    Ok(agent_files)
}

/// Fetch and preview a specific agent from GitHub
#[tauri::command]
pub async fn fetch_github_agent_content(download_url: String) -> Result<AgentExport, String> {
    info!("Fetching agent content from: {}", download_url);

    // SSRF guard: restrict fetches to known-safe GitHub domains only.
    let allowed_domains = ["raw.githubusercontent.com", "api.github.com", "github.com"];
    let parsed =
        reqwest::Url::parse(&download_url).map_err(|e| format!("Invalid URL: {e}"))?;
    let host = parsed.host_str().unwrap_or("");
    if !allowed_domains
        .iter()
        .any(|d| host == *d || host.ends_with(&format!(".{d}")))
    {
        return Err(format!(
            "URL host '{}' is not in the allowed domains list",
            host
        ));
    }

    let client = reqwest::Client::new();
    let response = client
        .get(parsed)
        .header("Accept", "application/json")
        .header("User-Agent", "runecode-App")
        .send()
        .await
        .map_err(|e| format!("Failed to download agent: {}", e))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to download agent: HTTP {}",
            response.status()
        ));
    }

    let json_text = response
        .text()
        .await
        .map_err(|e| format!("Failed to read response: {}", e))?;

    let export_data: AgentExport = serde_json::from_str(&json_text)
        .map_err(|e| format!("Invalid agent JSON format: {}", e))?;

    if export_data.version != 1 {
        return Err(format!(
            "Unsupported agent version: {}",
            export_data.version
        ));
    }

    Ok(export_data)
}

/// Import an agent directly from GitHub
#[tauri::command]
pub async fn import_agent_from_github(
    db: State<'_, AgentDb>,
    download_url: String,
) -> Result<Agent, String> {
    info!("Importing agent from GitHub: {}", download_url);

    let export_data = fetch_github_agent_content(download_url).await?;

    let json_data = serde_json::to_string(&export_data)
        .map_err(|e| format!("Failed to serialize agent data: {}", e))?;

    import_agent(db, json_data).await
}
