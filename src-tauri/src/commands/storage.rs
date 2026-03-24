use super::agents::AgentDb;
use anyhow::Result;
use rusqlite::{params, types::ValueRef, Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value as JsonValue};
use std::collections::{HashMap, HashSet};
use tauri::{AppHandle, Manager, State};

// Re-export all items from the query submodule so that
// `use commands::storage::*` continues to work.
pub use super::storage_query::*;

/// Represents metadata about a database table
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
    pub columns: Vec<ColumnInfo>,
}

/// Represents metadata about a table column
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ColumnInfo {
    pub cid: i32,
    pub name: String,
    pub type_name: String,
    pub notnull: bool,
    pub dflt_value: Option<String>,
    pub pk: bool,
}

/// Represents a page of table data
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TableData {
    pub table_name: String,
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Map<String, JsonValue>>,
    pub total_rows: i64,
    pub page: i64,
    pub page_size: i64,
    pub total_pages: i64,
}

/// SQL query result
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<JsonValue>>,
    pub rows_affected: Option<i64>,
    pub last_insert_rowid: Option<i64>,
}

/// List all tables in the database
#[tauri::command]
pub async fn storage_list_tables(db: State<'_, AgentDb>) -> Result<Vec<TableInfo>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Query for all tables
    let mut stmt = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
        .map_err(|e| e.to_string())?;

    let table_names: Vec<String> = stmt
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    drop(stmt);

    let mut tables = Vec::new();

    for table_name in table_names {
        // Get row count
        let row_count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {}", quote_identifier(&table_name)),
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        // Get column information
        let mut pragma_stmt = conn
            .prepare(&format!("PRAGMA table_info({})", quote_identifier(&table_name)))
            .map_err(|e| e.to_string())?;

        let columns: Vec<ColumnInfo> = pragma_stmt
            .query_map([], |row| {
                Ok(ColumnInfo {
                    cid: row.get(0)?,
                    name: row.get(1)?,
                    type_name: row.get(2)?,
                    notnull: row.get::<_, i32>(3)? != 0,
                    dflt_value: row.get(4)?,
                    pk: row.get::<_, i32>(5)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<SqliteResult<Vec<_>>>()
            .map_err(|e| e.to_string())?;

        tables.push(TableInfo {
            name: table_name,
            row_count,
            columns,
        });
    }

    Ok(tables)
}

/// Read table data with pagination
#[tauri::command]
#[allow(non_snake_case)]
pub async fn storage_read_table(
    db: State<'_, AgentDb>,
    tableName: String,
    page: i64,
    pageSize: i64,
    searchQuery: Option<String>,
) -> Result<TableData, String> {
    // Validate pagination parameters before acquiring the DB lock.
    if pageSize == 0 || pageSize > 1000 {
        return Err("pageSize must be between 1 and 1000".to_string());
    }
    if page == 0 {
        return Err("page must be >= 1".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Validate table name to prevent SQL injection
    if !is_valid_table_name(&conn, &tableName)? {
        return Err("Invalid table name".to_string());
    }

    // Get column information
    let mut pragma_stmt = conn
        .prepare(&format!("PRAGMA table_info({})", quote_identifier(&tableName)))
        .map_err(|e| e.to_string())?;

    let columns: Vec<ColumnInfo> = pragma_stmt
        .query_map([], |row| {
            Ok(ColumnInfo {
                cid: row.get(0)?,
                name: row.get(1)?,
                type_name: row.get(2)?,
                notnull: row.get::<_, i32>(3)? != 0,
                dflt_value: row.get(4)?,
                pk: row.get::<_, i32>(5)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    drop(pragma_stmt);

    let quoted_table = quote_identifier(&tableName);

    // Build query with optional search using parameterized queries
    let search_columns: Vec<String> = columns
        .iter()
        .filter(|col| col.type_name.contains("TEXT") || col.type_name.contains("VARCHAR"))
        .map(|col| quote_identifier(&col.name))
        .collect();

    let has_search = searchQuery.is_some() && !search_columns.is_empty();
    // Escape LIKE wildcard characters to prevent unintended matches
    let search_pattern = searchQuery.as_ref().map(|s| {
        let escaped = s
            .replace('\\', "\\\\")
            .replace('%', "\\%")
            .replace('_', "\\_");
        format!("%{}%", escaped)
    });

    let (query, count_query) = if has_search {
        // Use parameterized LIKE with one param per column
        let search_conditions: Vec<String> = search_columns
            .iter()
            .enumerate()
            .map(|(i, col)| format!("{} LIKE ?{} ESCAPE '\\'", col, i + 1))
            .collect();
        let where_clause = search_conditions.join(" OR ");
        let param_offset = search_columns.len();
        (
            format!(
                "SELECT * FROM {} WHERE {} LIMIT ?{} OFFSET ?{}",
                quoted_table, where_clause, param_offset + 1, param_offset + 2
            ),
            format!(
                "SELECT COUNT(*) FROM {} WHERE {}",
                quoted_table, where_clause
            ),
        )
    } else {
        (
            format!("SELECT * FROM {} LIMIT ?1 OFFSET ?2", quoted_table),
            format!("SELECT COUNT(*) FROM {}", quoted_table),
        )
    };

    // Get total row count
    let total_rows: i64 = if has_search {
        let mut count_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
        for _ in &search_columns {
            count_params.push(Box::new(search_pattern.clone().unwrap_or_default()));
        }
        let mut count_stmt = conn.prepare(&count_query).map_err(|e| e.to_string())?;
        count_stmt
            .query_row(
                rusqlite::params_from_iter(count_params.iter().map(|p| p.as_ref())),
                |row| row.get(0),
            )
            .unwrap_or(0)
    } else {
        conn.query_row(&count_query, [], |row| row.get(0))
            .unwrap_or(0)
    };

    // Calculate pagination
    let offset = (page - 1) * pageSize;
    let total_pages = (total_rows + pageSize - 1) / pageSize;

    // Query data with parameterized search
    let mut data_stmt = conn.prepare(&query).map_err(|e| e.to_string())?;

    let mut data_params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    if has_search {
        for _ in &search_columns {
            data_params.push(Box::new(search_pattern.clone().unwrap_or_default()));
        }
    }
    data_params.push(Box::new(pageSize));
    data_params.push(Box::new(offset));

    let rows: Vec<Map<String, JsonValue>> = data_stmt
        .query_map(
            rusqlite::params_from_iter(data_params.iter().map(|p| p.as_ref())),
            |row| {
            let mut row_map = Map::new();

            for (idx, col) in columns.iter().enumerate() {
                let value = match row.get_ref(idx)? {
                    ValueRef::Null => JsonValue::Null,
                    ValueRef::Integer(i) => JsonValue::Number(serde_json::Number::from(i)),
                    ValueRef::Real(f) => {
                        if let Some(n) = serde_json::Number::from_f64(f) {
                            JsonValue::Number(n)
                        } else {
                            JsonValue::String(f.to_string())
                        }
                    }
                    ValueRef::Text(s) => JsonValue::String(String::from_utf8_lossy(s).to_string()),
                    ValueRef::Blob(b) => JsonValue::String(base64::Engine::encode(
                        &base64::engine::general_purpose::STANDARD,
                        b,
                    )),
                };
                row_map.insert(col.name.clone(), value);
            }

            Ok(row_map)
        })
        .map_err(|e| e.to_string())?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| e.to_string())?;

    Ok(TableData {
        table_name: tableName,
        columns,
        rows,
        total_rows,
        page,
        page_size: pageSize,
        total_pages,
    })
}

/// Update a row in a table
#[tauri::command]
#[allow(non_snake_case)]
pub async fn storage_update_row(
    db: State<'_, AgentDb>,
    tableName: String,
    primaryKeyValues: HashMap<String, JsonValue>,
    updates: HashMap<String, JsonValue>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Validate table name
    if !is_valid_table_name(&conn, &tableName)? {
        return Err("Invalid table name".to_string());
    }

    // Validate column names to prevent SQL injection
    let valid_columns = get_valid_columns(&conn, &tableName)?;
    validate_column_names(&valid_columns, updates.keys())?;
    validate_column_names(&valid_columns, primaryKeyValues.keys())?;

    // Collect key-value pairs into Vecs to guarantee consistent ordering
    let update_pairs: Vec<(&String, &JsonValue)> = updates.iter().collect();
    let pk_pairs: Vec<(&String, &JsonValue)> = primaryKeyValues.iter().collect();

    // Build UPDATE query with quoted identifiers
    let set_clauses: Vec<String> = update_pairs
        .iter()
        .enumerate()
        .map(|(idx, (key, _))| format!("{} = ?{}", quote_identifier(key), idx + 1))
        .collect();

    let where_clauses: Vec<String> = pk_pairs
        .iter()
        .enumerate()
        .map(|(idx, (key, _))| format!("{} = ?{}", quote_identifier(key), idx + update_pairs.len() + 1))
        .collect();

    let query = format!(
        "UPDATE {} SET {} WHERE {}",
        quote_identifier(&tableName),
        set_clauses.join(", "),
        where_clauses.join(" AND ")
    );

    // Prepare parameters in the same order as the clauses
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    for (_, value) in &update_pairs {
        params.push(json_to_sql_value(value)?);
    }

    for (_, value) in &pk_pairs {
        params.push(json_to_sql_value(value)?);
    }

    // Execute update
    conn.execute(
        &query,
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
    )
    .map_err(|e| format!("Failed to update row: {}", e))?;

    Ok(())
}

/// Delete a row from a table
#[tauri::command]
#[allow(non_snake_case)]
pub async fn storage_delete_row(
    db: State<'_, AgentDb>,
    tableName: String,
    primaryKeyValues: HashMap<String, JsonValue>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Validate table name
    if !is_valid_table_name(&conn, &tableName)? {
        return Err("Invalid table name".to_string());
    }

    // Validate column names to prevent SQL injection
    let valid_columns = get_valid_columns(&conn, &tableName)?;
    validate_column_names(&valid_columns, primaryKeyValues.keys())?;

    // Build DELETE query with quoted identifiers
    let where_clauses: Vec<String> = primaryKeyValues
        .keys()
        .enumerate()
        .map(|(idx, key)| format!("{} = ?{}", quote_identifier(key), idx + 1))
        .collect();

    let query = format!(
        "DELETE FROM {} WHERE {}",
        quote_identifier(&tableName),
        where_clauses.join(" AND ")
    );

    // Prepare parameters
    let params: Vec<Box<dyn rusqlite::ToSql>> = primaryKeyValues
        .values()
        .map(json_to_sql_value)
        .collect::<Result<Vec<_>, _>>()?;

    // Execute delete
    conn.execute(
        &query,
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
    )
    .map_err(|e| format!("Failed to delete row: {}", e))?;

    Ok(())
}

/// Insert a new row into a table
#[tauri::command]
#[allow(non_snake_case)]
pub async fn storage_insert_row(
    db: State<'_, AgentDb>,
    tableName: String,
    values: HashMap<String, JsonValue>,
) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    // Validate table name
    if !is_valid_table_name(&conn, &tableName)? {
        return Err("Invalid table name".to_string());
    }

    // Validate column names to prevent SQL injection
    let valid_columns = get_valid_columns(&conn, &tableName)?;
    validate_column_names(&valid_columns, values.keys())?;

    // Build INSERT query with quoted identifiers
    let columns: Vec<&String> = values.keys().collect();
    let placeholders: Vec<String> = (1..=columns.len()).map(|i| format!("?{}", i)).collect();

    let query = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        quote_identifier(&tableName),
        columns
            .iter()
            .map(|c| quote_identifier(c))
            .collect::<Vec<_>>()
            .join(", "),
        placeholders.join(", ")
    );

    // Prepare parameters
    let params: Vec<Box<dyn rusqlite::ToSql>> = values
        .values()
        .map(json_to_sql_value)
        .collect::<Result<Vec<_>, _>>()?;

    // Execute insert
    conn.execute(
        &query,
        rusqlite::params_from_iter(params.iter().map(|p| p.as_ref())),
    )
    .map_err(|e| format!("Failed to insert row: {}", e))?;

    Ok(conn.last_insert_rowid())
}

// ---------------------------------------------------------------------------
// Shared helpers (used by storage_query.rs too)
// ---------------------------------------------------------------------------

/// Helper function to validate table name exists
pub fn is_valid_table_name(conn: &Connection, table_name: &str) -> Result<bool, String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
            params![table_name],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count > 0)
}

/// Quote a SQL identifier with double quotes to prevent injection
pub fn quote_identifier(name: &str) -> String {
    format!("\"{}\"", name.replace('"', "\"\""))
}
