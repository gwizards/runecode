use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// TTL-based cache for expensive CLI results stored in the app's SQLite database.
#[allow(dead_code)]
pub struct CliResultCache {
    conn: std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
}

impl CliResultCache {
    pub fn new(conn: std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>) -> Self {
        Self { conn }
    }

    pub fn ensure_table(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS cli_cache (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                expires_at INTEGER NOT NULL
            )",
        )
        .map_err(|e| e.to_string())
    }

    pub fn get(&self, key: &str) -> Option<String> {
        let conn = self.conn.lock().ok()?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        conn.query_row(
            "SELECT value FROM cli_cache WHERE key = ?1 AND expires_at > ?2",
            rusqlite::params![key, now],
            |row| row.get::<_, String>(0),
        )
        .ok()
    }

    pub fn set(&self, key: &str, value: &str, ttl: Duration) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let expires_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64
            + ttl.as_secs() as i64;
        conn.execute(
            "INSERT OR REPLACE INTO cli_cache (key, value, expires_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![key, value, expires_at],
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
    }
}
