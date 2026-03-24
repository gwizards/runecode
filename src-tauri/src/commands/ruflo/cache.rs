// ---------------------------------------------------------------------------
// File-based cache helpers — best-effort, silently skip on any error
// ---------------------------------------------------------------------------

pub(super) fn try_read_cache<T: for<'de> serde::Deserialize<'de>>(
    filename: &str,
    ttl_secs: u64,
) -> Option<T> {
    let cache_path = std::env::temp_dir().join(filename);
    let content = std::fs::read_to_string(&cache_path).ok()?;
    let cached: serde_json::Value = serde_json::from_str(&content).ok()?;
    let ts = cached["timestamp"].as_u64()?;
    let value: T = serde_json::from_value(cached["value"].clone()).ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let age = now.saturating_sub(ts);
    if age < ttl_secs {
        Some(value)
    } else {
        None
    }
}

pub(super) fn write_cache<T: serde::Serialize>(filename: &str, value: &T) {
    let cache_path = std::env::temp_dir().join(filename);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    if let Ok(json) = serde_json::to_string(&serde_json::json!({
        "timestamp": now,
        "value": value,
    })) {
        let _ = std::fs::write(cache_path, json);
    }
}

pub(super) fn bust_status_cache() {
    let _ = std::fs::remove_file(
        std::env::temp_dir().join("runecode_ruflo_cache.json"),
    );
}

pub(super) fn bust_all_caches() {
    bust_status_cache();
    let _ = std::fs::remove_file(
        std::env::temp_dir().join("runecode_swarm_cache.json"),
    );
}
