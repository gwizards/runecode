use anyhow::Result;
use rusqlite::params;
use tauri::State;

use super::{Agent, AgentDb, AgentRun, AgentRunWithMetrics};

// ─────────────────────────────────────────────────────────────────────────────
// Read JSONL helper (used by both db and sessions submodules)
// ─────────────────────────────────────────────────────────────────────────────

/// Read JSONL content from a session file
pub async fn read_session_jsonl(session_id: &str, project_path: &str) -> Result<String, String> {
    // Validate session_id to prevent filename injection
    if !session_id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
        || session_id.len() > 128
    {
        return Err(format!("Invalid session_id: {}", session_id));
    }

    let claude_dir = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude")
        .join("projects");

    // Encode project path to match Claude Code's directory naming
    let encoded_project = project_path.replace('/', "-");
    let project_dir = claude_dir.join(&encoded_project);
    let session_file = project_dir.join(format!("{}.jsonl", session_id));

    if !session_file.exists() {
        return Err(format!(
            "Session file not found: {}",
            session_file.display()
        ));
    }

    match tokio::fs::read_to_string(&session_file).await {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read session file: {}", e)),
    }
}

/// Get agent run with real-time metrics
pub async fn get_agent_run_with_metrics(run: AgentRun) -> AgentRunWithMetrics {
    use super::AgentRunMetrics;

    match read_session_jsonl(&run.session_id, &run.project_path).await {
        Ok(jsonl_content) => {
            let metrics = AgentRunMetrics::from_jsonl(&jsonl_content);
            AgentRunWithMetrics {
                run,
                metrics: Some(metrics),
                output: Some(jsonl_content),
            }
        }
        Err(e) => {
            log::warn!("Failed to read JSONL for session {}: {}", run.session_id, e);
            AgentRunWithMetrics {
                run,
                metrics: None,
                output: None,
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Row mapper helpers
// ─────────────────────────────────────────────────────────────────────────────

fn map_agent_row(row: &rusqlite::Row) -> rusqlite::Result<Agent> {
    Ok(Agent {
        id: Some(row.get(0)?),
        name: row.get(1)?,
        icon: row.get(2)?,
        system_prompt: row.get(3)?,
        default_task: row.get(4)?,
        model: row
            .get::<_, String>(5)
            .unwrap_or_else(|_| "sonnet".to_string()),
        enable_file_read: row.get::<_, bool>(6).unwrap_or(true),
        enable_file_write: row.get::<_, bool>(7).unwrap_or(true),
        enable_network: row.get::<_, bool>(8).unwrap_or(false),
        hooks: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn map_run_row(row: &rusqlite::Row) -> rusqlite::Result<AgentRun> {
    Ok(AgentRun {
        id: Some(row.get(0)?),
        agent_id: row.get(1)?,
        agent_name: row.get(2)?,
        agent_icon: row.get(3)?,
        task: row.get(4)?,
        model: row.get(5)?,
        project_path: row.get(6)?,
        session_id: row.get(7)?,
        status: row
            .get::<_, String>(8)
            .unwrap_or_else(|_| "pending".to_string()),
        pid: row
            .get::<_, Option<i64>>(9)
            .ok()
            .flatten()
            .map(|p| {
                if p >= 0 && p <= u32::MAX as i64 {
                    p as u32
                } else {
                    0
                }
            }),
        process_started_at: row.get(10)?,
        created_at: row.get(11)?,
        completed_at: row.get(12)?,
    })
}

const AGENT_SELECT: &str =
    "SELECT id, name, icon, system_prompt, default_task, model, \
     enable_file_read, enable_file_write, enable_network, hooks, created_at, updated_at \
     FROM agents";

const RUN_SELECT: &str =
    "SELECT id, agent_id, agent_name, agent_icon, task, model, project_path, \
     session_id, status, pid, process_started_at, created_at, completed_at \
     FROM agent_runs";

// ─────────────────────────────────────────────────────────────────────────────
// Tauri commands — agents CRUD
// ─────────────────────────────────────────────────────────────────────────────

/// List all agents
#[tauri::command]
pub async fn list_agents(db: State<'_, AgentDb>) -> Result<Vec<Agent>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(&format!("{} ORDER BY created_at DESC", AGENT_SELECT))
        .map_err(|e| e.to_string())?;

    let agents = stmt
        .query_map([], map_agent_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(agents)
}

/// Create a new agent
#[tauri::command]
pub async fn create_agent(
    db: State<'_, AgentDb>,
    name: String,
    icon: String,
    system_prompt: String,
    default_task: Option<String>,
    model: Option<String>,
    enable_file_read: Option<bool>,
    enable_file_write: Option<bool>,
    enable_network: Option<bool>,
    hooks: Option<String>,
) -> Result<Agent, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let model = model.unwrap_or_else(|| "sonnet".to_string());
    let enable_file_read = enable_file_read.unwrap_or(true);
    let enable_file_write = enable_file_write.unwrap_or(true);
    let enable_network = enable_network.unwrap_or(false);

    conn.execute(
        "INSERT INTO agents (name, icon, system_prompt, default_task, model, \
         enable_file_read, enable_file_write, enable_network, hooks) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            name,
            icon,
            system_prompt,
            default_task,
            model,
            enable_file_read,
            enable_file_write,
            enable_network,
            hooks
        ],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    let agent = conn
        .query_row(
            &format!("{} WHERE id = ?1", AGENT_SELECT),
            params![id],
            map_agent_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(agent)
}

/// Update an existing agent
#[tauri::command]
pub async fn update_agent(
    db: State<'_, AgentDb>,
    id: i64,
    name: String,
    icon: String,
    system_prompt: String,
    default_task: Option<String>,
    model: Option<String>,
    enable_file_read: Option<bool>,
    enable_file_write: Option<bool>,
    enable_network: Option<bool>,
    hooks: Option<String>,
) -> Result<Agent, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let model = model.unwrap_or_else(|| "sonnet".to_string());

    let mut query =
        "UPDATE agents SET name = ?1, icon = ?2, system_prompt = ?3, \
         default_task = ?4, model = ?5, hooks = ?6"
            .to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![
        Box::new(name),
        Box::new(icon),
        Box::new(system_prompt),
        Box::new(default_task),
        Box::new(model),
        Box::new(hooks),
    ];
    let mut param_count = 6;

    if let Some(efr) = enable_file_read {
        param_count += 1;
        query.push_str(&format!(", enable_file_read = ?{}", param_count));
        params_vec.push(Box::new(efr));
    }
    if let Some(efw) = enable_file_write {
        param_count += 1;
        query.push_str(&format!(", enable_file_write = ?{}", param_count));
        params_vec.push(Box::new(efw));
    }
    if let Some(en) = enable_network {
        param_count += 1;
        query.push_str(&format!(", enable_network = ?{}", param_count));
        params_vec.push(Box::new(en));
    }

    param_count += 1;
    query.push_str(&format!(" WHERE id = ?{}", param_count));
    params_vec.push(Box::new(id));

    conn.execute(
        &query,
        rusqlite::params_from_iter(params_vec.iter().map(|p| p.as_ref())),
    )
    .map_err(|e| e.to_string())?;

    let agent = conn
        .query_row(
            &format!("{} WHERE id = ?1", AGENT_SELECT),
            params![id],
            map_agent_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(agent)
}

/// Delete an agent
#[tauri::command]
pub async fn delete_agent(db: State<'_, AgentDb>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM agents WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Get a single agent by ID
#[tauri::command]
pub async fn get_agent(db: State<'_, AgentDb>, id: i64) -> Result<Agent, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let agent = conn
        .query_row(
            &format!("{} WHERE id = ?1", AGENT_SELECT),
            params![id],
            map_agent_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(agent)
}

/// List agent runs (optionally filtered by agent_id)
#[tauri::command]
pub async fn list_agent_runs(
    db: State<'_, AgentDb>,
    agent_id: Option<i64>,
) -> Result<Vec<AgentRun>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let query_all = format!("{} ORDER BY created_at DESC", RUN_SELECT);
    let query_filtered = format!(
        "{} WHERE agent_id = ?1 ORDER BY created_at DESC",
        RUN_SELECT
    );

    let mut stmt = if agent_id.is_some() {
        conn.prepare(&query_filtered)
    } else {
        conn.prepare(&query_all)
    }
    .map_err(|e| e.to_string())?;

    let runs = if let Some(aid) = agent_id {
        stmt.query_map(params![aid], map_run_row)
    } else {
        stmt.query_map(params![], map_run_row)
    }
    .map_err(|e| e.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|e| e.to_string())?;

    Ok(runs)
}

/// Get a single agent run by ID
#[tauri::command]
pub async fn get_agent_run(db: State<'_, AgentDb>, id: i64) -> Result<AgentRun, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let run = conn
        .query_row(
            &format!("{} WHERE id = ?1", RUN_SELECT),
            params![id],
            map_run_row,
        )
        .map_err(|e| e.to_string())?;

    Ok(run)
}

/// Get agent run with real-time metrics from JSONL
#[tauri::command]
pub async fn get_agent_run_with_real_time_metrics(
    db: State<'_, AgentDb>,
    id: i64,
) -> Result<AgentRunWithMetrics, String> {
    let run = get_agent_run(db, id).await?;
    Ok(get_agent_run_with_metrics(run).await)
}

/// List agent runs with real-time metrics from JSONL
#[tauri::command]
pub async fn list_agent_runs_with_metrics(
    db: State<'_, AgentDb>,
    agent_id: Option<i64>,
) -> Result<Vec<AgentRunWithMetrics>, String> {
    let runs = list_agent_runs(db, agent_id).await?;
    let mut runs_with_metrics = Vec::new();

    for run in runs {
        let run_with_metrics = get_agent_run_with_metrics(run).await;
        runs_with_metrics.push(run_with_metrics);
    }

    Ok(runs_with_metrics)
}
