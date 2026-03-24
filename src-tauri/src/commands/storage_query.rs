/// SQL query execution, database reset, and shared helpers for the storage module.
///
/// Split from `storage.rs` to stay within the 500-line file budget.

use rusqlite::{types::ValueRef, Connection, Result as SqliteResult};
use serde_json::Value as JsonValue;
use std::collections::HashSet;
use tauri::{AppHandle, Manager, State};

use super::agents::AgentDb;
use super::storage::QueryResult;

/// Execute a read-only SQL query (SELECT only)
#[tauri::command]
pub async fn storage_execute_sql(
    db: State<'_, AgentDb>,
    query: String,
) -> Result<QueryResult, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Only allow SELECT and safe read-only PRAGMAs. Reject anything else.
    let trimmed = query.trim().to_uppercase();
    let allowed_pragma = trimmed.starts_with("PRAGMA TABLE_INFO")
        || trimmed.starts_with("PRAGMA INDEX_LIST");
    if !trimmed.starts_with("SELECT") && !allowed_pragma {
        return Err(
            "Only SELECT and read-only PRAGMA queries are allowed.".to_string(),
        );
    }

    // Reject patterns that enable data exfiltration or dangerous operations
    // even inside SELECT queries (UNION, subqueries on system tables, multi-stmt).
    let forbidden_patterns = [
        "ATTACH", "DETACH", "LOAD_EXTENSION",
        // Prevent UNION-based cross-table exfiltration
        "UNION",
        // Prevent access to the SQLite schema catalog
        "SQLITE_MASTER", "SQLITE_TEMP_MASTER", "SQLITE_SCHEMA",
        // Prevent comment-based bypass attempts
        "/*", "*/", "--",
    ];
    for pattern in &forbidden_patterns {
        if trimmed.contains(pattern) {
            return Err(format!("Query contains forbidden keyword: {}", pattern));
        }
    }
    // Reject multi-statement queries (semicolon not at end)
    let without_trailing = trimmed.trim_end_matches(';');
    if without_trailing.contains(';') {
        return Err("Multi-statement queries are not allowed.".to_string());
    }

    // Handle SELECT/PRAGMA queries
    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let column_count = stmt.column_count();

    // Get column names — use empty string as fallback (column index still valid)
    let columns: Vec<String> = (0..column_count)
        .map(|i| stmt.column_name(i).unwrap_or("").to_string())
        .collect();

    // Execute query and collect results
    let rows: Vec<Vec<JsonValue>> = stmt
        .query_map([], |row| {
            let mut row_values = Vec::new();
            for i in 0..column_count {
                let value = match row.get_ref(i)? {
                    ValueRef::Null => JsonValue::Null,
                    ValueRef::Integer(n) => JsonValue::Number(serde_json::Number::from(n)),
                    ValueRef::Real(f) => {
                        if let Some(n) = serde_json::Number::from_f64(f) {
                            JsonValue::Number(n)
                        } else {
                            JsonValue::String(f.to_string())
                        }
                    }
                    ValueRef::Text(s) => {
                        JsonValue::String(String::from_utf8_lossy(s).to_string())
                    }
                    ValueRef::Blob(b) => JsonValue::String(base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        b,
                    )),
                };
                row_values.push(value);
            }
            Ok(row_values)
        })
        .map_err(|e| e.to_string())?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(QueryResult {
        columns,
        rows,
        rows_affected: None,
        last_insert_rowid: None,
    })
}

/// Reset the entire database (with confirmation)
#[tauri::command]
pub async fn storage_reset_database(app: AppHandle) -> Result<(), String> {
    {
        // Drop all existing tables within a scoped block
        let db_state = app.state::<AgentDb>();
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;

        // Disable foreign key constraints temporarily to allow dropping tables
        conn.execute("PRAGMA foreign_keys = OFF", [])
            .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

        // Drop tables - order doesn't matter with foreign keys disabled
        conn.execute("DROP TABLE IF EXISTS agent_runs", [])
            .map_err(|e| format!("Failed to drop agent_runs table: {}", e))?;
        conn.execute("DROP TABLE IF EXISTS agents", [])
            .map_err(|e| format!("Failed to drop agents table: {}", e))?;
        conn.execute("DROP TABLE IF EXISTS app_settings", [])
            .map_err(|e| format!("Failed to drop app_settings table: {}", e))?;

        // Re-enable foreign key constraints
        conn.execute("PRAGMA foreign_keys = ON", [])
            .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

        // Connection is automatically dropped at end of scope
    }

    // Re-initialize the database which will recreate all tables empty
    let new_conn = init_database(&app).map_err(|e| format!("Failed to reset database: {}", e))?;

    // Update the managed state with the new connection
    {
        let db_state = app.state::<AgentDb>();
        let mut conn_guard = db_state.0.lock().map_err(|e| e.to_string())?;
        *conn_guard = new_conn;
    }

    // Run VACUUM to optimize the database
    {
        let db_state = app.state::<AgentDb>();
        let conn = db_state.0.lock().map_err(|e| e.to_string())?;
        conn.execute("VACUUM", []).map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/// Get the set of valid column names for a table (prevents SQL injection via column names)
pub fn get_valid_columns(conn: &Connection, table_name: &str) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare(&format!(
            "PRAGMA table_info(\"{}\")",
            table_name.replace('"', "\"\"")
        ))
        .map_err(|e| e.to_string())?;

    let columns: HashSet<String> = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<SqliteResult<HashSet<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(columns)
}

/// Validate that all provided column names exist in the table
pub fn validate_column_names(
    valid_columns: &HashSet<String>,
    provided_keys: impl Iterator<Item = impl AsRef<str>>,
) -> Result<(), String> {
    for key in provided_keys {
        let key_ref = key.as_ref();
        if !valid_columns.contains(key_ref) {
            return Err(format!("Invalid column name: {}", key_ref));
        }
    }
    Ok(())
}

/// Helper function to convert JSON value to SQL value
pub fn json_to_sql_value(value: &JsonValue) -> Result<Box<dyn rusqlite::ToSql>, String> {
    match value {
        JsonValue::Null => Ok(Box::new(rusqlite::types::Null)),
        JsonValue::Bool(b) => Ok(Box::new(*b)),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Box::new(i))
            } else if let Some(f) = n.as_f64() {
                Ok(Box::new(f))
            } else {
                Err("Invalid number value".to_string())
            }
        }
        JsonValue::String(s) => Ok(Box::new(s.clone())),
        _ => Err("Unsupported value type".to_string()),
    }
}

/// Initialize the agents database (re-exported from agents module)
use super::agents::init_database;
