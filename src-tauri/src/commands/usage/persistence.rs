use rusqlite::params;
use tauri::State;

use super::super::agents::AgentDb;

// ─── Persistence: usage_ledgers table ─────────────────────────────────────────

/// Run during app init (called from `agents::init_database`) to ensure the
/// usage_ledgers table exists.  Safe to call on an already-migrated database.
pub fn migrate_usage_ledgers_table(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS usage_ledgers (
            id                   TEXT PRIMARY KEY,
            project_id           TEXT NOT NULL,
            session_id           TEXT,
            records_json         TEXT NOT NULL,
            total_cost_micro_usd INTEGER NOT NULL DEFAULT 0,
            created_at           INTEGER NOT NULL,
            updated_at           INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_usage_ledgers_project
            ON usage_ledgers(project_id);
        CREATE INDEX IF NOT EXISTS idx_usage_ledgers_session
            ON usage_ledgers(session_id);",
    )
}

/// Upsert a serialised UsageLedger aggregate snapshot into SQLite.
///
/// The TypeScript layer calls this after every `save()` on the in-memory
/// repository, making it a write-through cache.  Cost is stored as integer
/// micro-dollars so no float precision is lost during persistence.
#[tauri::command]
pub async fn persist_usage_ledger(
    db: State<'_, AgentDb>,
    id: String,
    project_id: String,
    session_id: Option<String>,
    records_json: String,
    total_cost_micro_usd: i64,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let now = i64::try_from(
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis(),
    )
    .unwrap_or(i64::MAX);

    conn.execute(
        "INSERT INTO usage_ledgers
             (id, project_id, session_id, records_json, total_cost_micro_usd, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
             project_id           = excluded.project_id,
             session_id           = excluded.session_id,
             records_json         = excluded.records_json,
             total_cost_micro_usd = excluded.total_cost_micro_usd,
             updated_at           = excluded.updated_at",
        params![id, project_id, session_id, records_json, total_cost_micro_usd, now],
    )
    .map_err(|e| format!("persist_usage_ledger failed: {}", e))?;

    Ok(())
}

/// Load all persisted UsageLedger snapshots for rehydration on app start.
///
/// Returns each row as a `serde_json::Value` so the TypeScript layer can
/// deserialise each `records_json` payload and rehydrate the in-memory
/// repository without requiring a separate Rust struct per row.
#[tauri::command]
pub async fn load_usage_ledgers(
    db: State<'_, AgentDb>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, project_id, session_id, records_json, total_cost_micro_usd,
                    created_at, updated_at
             FROM usage_ledgers
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let project_id: String = row.get(1)?;
            let session_id: Option<String> = row.get(2)?;
            let records_json: String = row.get(3)?;
            let total_cost_micro_usd: i64 = row.get(4)?;
            let created_at: i64 = row.get(5)?;
            let updated_at: i64 = row.get(6)?;
            Ok((
                id,
                project_id,
                session_id,
                records_json,
                total_cost_micro_usd,
                created_at,
                updated_at,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .map(
            |(
                id,
                project_id,
                session_id,
                records_json,
                total_cost_micro_usd,
                created_at,
                updated_at,
            )| {
                serde_json::json!({
                    "id": id,
                    "projectId": project_id,
                    "sessionId": session_id,
                    "recordsJson": records_json,
                    "totalCostMicroUsd": total_cost_micro_usd,
                    "createdAt": created_at,
                    "updatedAt": updated_at,
                })
            },
        )
        .collect();

    Ok(rows)
}
