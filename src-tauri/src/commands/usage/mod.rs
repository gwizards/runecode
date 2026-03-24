mod aggregator;
mod parser;
mod persistence;
mod types;

use chrono::{DateTime, NaiveDate};
use tauri::command;

use aggregator::aggregate_entries;
use parser::get_all_usage_entries;
use types::{ProjectUsage, UsageEntry, UsageStats};

// Re-export persistence commands and migration helper (called from agents module)
#[allow(unused_imports)]
pub use persistence::{load_usage_ledgers, migrate_usage_ledgers_table, persist_usage_ledger};

// Re-export public types used by the command registration in lib.rs / main.rs
#[allow(unused_imports)]
pub use types::{DailyUsage, ModelUsage};

#[command]
pub fn get_usage_stats(days: Option<u32>) -> Result<UsageStats, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let all_entries = get_all_usage_entries(&claude_path);

    // Filter by days if specified
    let filtered_entries = if let Some(days) = days {
        let cutoff = chrono::Local::now().naive_local().date()
            - chrono::Duration::days(days as i64);
        all_entries
            .into_iter()
            .filter(|e| {
                if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                    dt.naive_local().date() >= cutoff
                } else {
                    false
                }
            })
            .collect()
    } else {
        all_entries
    };

    Ok(aggregate_entries(&filtered_entries))
}

#[command]
pub fn get_usage_by_date_range(
    start_date: String,
    end_date: String,
) -> Result<UsageStats, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let all_entries = get_all_usage_entries(&claude_path);

    // Parse dates
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d").or_else(|_| {
        DateTime::parse_from_rfc3339(&start_date)
            .map(|dt| dt.naive_local().date())
            .map_err(|e| format!("Invalid start date: {}", e))
    })?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d").or_else(|_| {
        DateTime::parse_from_rfc3339(&end_date)
            .map(|dt| dt.naive_local().date())
            .map_err(|e| format!("Invalid end date: {}", e))
    })?;

    // Filter entries by date range
    let filtered_entries: Vec<_> = all_entries
        .into_iter()
        .filter(|e| {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                let date = dt.naive_local().date();
                date >= start && date <= end
            } else {
                false
            }
        })
        .collect();

    Ok(aggregate_entries(&filtered_entries))
}

#[command]
pub fn get_usage_details(
    project_path: Option<String>,
    date: Option<String>,
) -> Result<Vec<UsageEntry>, String> {
    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let mut all_entries = get_all_usage_entries(&claude_path);

    // Filter by project if specified
    if let Some(project) = project_path {
        all_entries.retain(|e| e.project_path == project);
    }

    // Filter by date if specified
    if let Some(date) = date {
        all_entries.retain(|e| e.timestamp.starts_with(&date));
    }

    Ok(all_entries)
}

#[command]
pub fn get_session_stats(
    since: Option<String>,
    until: Option<String>,
    order: Option<String>,
) -> Result<Vec<ProjectUsage>, String> {
    use std::collections::HashMap;

    let claude_path = dirs::home_dir()
        .ok_or("Failed to get home directory")?
        .join(".claude");

    let all_entries = get_all_usage_entries(&claude_path);

    let since_date = since.and_then(|s| NaiveDate::parse_from_str(&s, "%Y%m%d").ok());
    let until_date = until.and_then(|s| NaiveDate::parse_from_str(&s, "%Y%m%d").ok());

    let filtered_entries: Vec<_> = all_entries
        .into_iter()
        .filter(|e| {
            if let Ok(dt) = DateTime::parse_from_rfc3339(&e.timestamp) {
                let date = dt.date_naive();
                let is_after_since = since_date.map_or(true, |s| date >= s);
                let is_before_until = until_date.map_or(true, |u| date <= u);
                is_after_since && is_before_until
            } else {
                false
            }
        })
        .collect();

    // Accumulate cost as integer micro-dollars per session to avoid float drift.
    let mut session_cost_micro: HashMap<String, i64> = HashMap::new();
    let mut session_stats: HashMap<String, ProjectUsage> = HashMap::new();
    for entry in &filtered_entries {
        let session_key = format!("{}/{}", entry.project_path, entry.session_id);
        *session_cost_micro.entry(session_key.clone()).or_insert(0) +=
            entry.cost_micro_usd;
        let project_stat = session_stats
            .entry(session_key)
            .or_insert_with(|| ProjectUsage {
                project_path: entry.project_path.clone(),
                project_name: entry.session_id.clone(), // session_id as project_name for session view
                total_cost: 0.0,
                total_tokens: 0,
                session_count: 0, // counts entries per session in this context
                last_used: " ".to_string(),
            });

        project_stat.total_tokens += entry.input_tokens
            + entry.output_tokens
            + entry.cache_creation_tokens
            + entry.cache_read_tokens;
        project_stat.session_count += 1;
        if entry.timestamp > project_stat.last_used {
            project_stat.last_used = entry.timestamp.clone();
        }
    }

    // Assign display costs once, converting integer micro-USD → f64.
    for (key, stat) in session_stats.iter_mut() {
        stat.total_cost =
            session_cost_micro.get(key).copied().unwrap_or(0) as f64 / 1_000_000.0;
    }

    let mut by_session: Vec<ProjectUsage> = session_stats.into_values().collect();

    // Sort by last_used date
    if let Some(order_str) = order {
        if order_str == "asc" {
            by_session.sort_by(|a, b| a.last_used.cmp(&b.last_used));
        } else {
            by_session.sort_by(|a, b| b.last_used.cmp(&a.last_used));
        }
    } else {
        // Default to descending
        by_session.sort_by(|a, b| b.last_used.cmp(&a.last_used));
    }

    Ok(by_session)
}
