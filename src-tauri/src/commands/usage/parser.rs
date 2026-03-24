use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use super::types::{
    JsonlEntry, MessageData, UsageData, UsageEntry,
    OPUS_4_CACHE_READ_PRICE, OPUS_4_CACHE_WRITE_PRICE, OPUS_4_INPUT_PRICE, OPUS_4_OUTPUT_PRICE,
    SONNET_4_CACHE_READ_PRICE, SONNET_4_CACHE_WRITE_PRICE, SONNET_4_INPUT_PRICE,
    SONNET_4_OUTPUT_PRICE,
};

/// Calculate cost in integer micro-dollars (1_000_000 = $1.00) from token
/// counts and model-based pricing.  Using integer arithmetic here prevents
/// IEEE-754 accumulation drift when summing many entries.
pub(super) fn calculate_cost_micro_usd(model: &str, usage: &UsageData) -> i64 {
    let input_tokens = usage.input_tokens.unwrap_or(0) as f64;
    let output_tokens = usage.output_tokens.unwrap_or(0) as f64;
    let cache_creation_tokens = usage.cache_creation_input_tokens.unwrap_or(0) as f64;
    let cache_read_tokens = usage.cache_read_input_tokens.unwrap_or(0) as f64;

    // Select per-million-token prices based on model.
    let (input_price, output_price, cache_write_price, cache_read_price) =
        if model.contains("opus-4") || model.contains("claude-opus-4") {
            (
                OPUS_4_INPUT_PRICE,
                OPUS_4_OUTPUT_PRICE,
                OPUS_4_CACHE_WRITE_PRICE,
                OPUS_4_CACHE_READ_PRICE,
            )
        } else if model.contains("sonnet-4") || model.contains("claude-sonnet-4") {
            (
                SONNET_4_INPUT_PRICE,
                SONNET_4_OUTPUT_PRICE,
                SONNET_4_CACHE_WRITE_PRICE,
                SONNET_4_CACHE_READ_PRICE,
            )
        } else {
            // Return 0 for unknown models to avoid incorrect cost estimations.
            (0.0, 0.0, 0.0, 0.0)
        };

    // Compute cost in USD as f64 (single multiply-accumulate, then round once).
    let cost_usd = (input_tokens * input_price / 1_000_000.0)
        + (output_tokens * output_price / 1_000_000.0)
        + (cache_creation_tokens * cache_write_price / 1_000_000.0)
        + (cache_read_tokens * cache_read_price / 1_000_000.0);

    // Round to nearest micro-dollar; integer storage prevents drift on summation.
    (cost_usd * 1_000_000.0).round() as i64
}

pub(super) fn parse_jsonl_file(
    path: &PathBuf,
    encoded_project_name: &str,
    processed_hashes: &mut HashSet<String>,
) -> Vec<UsageEntry> {
    let mut entries = Vec::new();
    let mut actual_project_path: Option<String> = None;

    if let Ok(content) = fs::read_to_string(path) {
        // Extract session ID from the file path
        let session_id = path
            .parent()
            .and_then(|p| p.file_name())
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        for line in content.lines() {
            if line.trim().is_empty() {
                continue;
            }

            if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(line) {
                // Extract the actual project path from cwd if we haven't already
                if actual_project_path.is_none() {
                    if let Some(cwd) = json_value.get("cwd").and_then(|v| v.as_str()) {
                        actual_project_path = Some(cwd.to_string());
                    }
                }

                // Try to parse as JsonlEntry for usage data
                if let Ok(entry) = serde_json::from_value::<JsonlEntry>(json_value) {
                    if let Some(message) = &entry.message {
                        // Deduplication based on message ID and request ID
                        if let (Some(msg_id), Some(req_id)) =
                            (&message.id, &entry.request_id)
                        {
                            let unique_hash = format!("{}:{}", msg_id, req_id);
                            if processed_hashes.contains(&unique_hash) {
                                continue; // Skip duplicate entry
                            }
                            processed_hashes.insert(unique_hash);
                        }

                        if let Some(usage) = &message.usage {
                            // Skip entries without meaningful token usage
                            if usage.input_tokens.unwrap_or(0) == 0
                                && usage.output_tokens.unwrap_or(0) == 0
                                && usage.cache_creation_input_tokens.unwrap_or(0) == 0
                                && usage.cache_read_input_tokens.unwrap_or(0) == 0
                            {
                                continue;
                            }

                            // Determine cost as integer micro-dollars.
                            // If the JSONL entry already carries a pre-computed
                            // costUSD float, convert it once via round(); otherwise
                            // derive from token counts using integer math.
                            let cost_micro_usd: i64 = if let Some(c) = entry.cost_usd {
                                (c * 1_000_000.0).round() as i64
                            } else if let Some(model_str) = &message.model {
                                calculate_cost_micro_usd(model_str, usage)
                            } else {
                                0
                            };

                            // Use actual project path if found, otherwise use encoded name
                            let project_path = actual_project_path
                                .clone()
                                .unwrap_or_else(|| encoded_project_name.to_string());

                            entries.push(UsageEntry {
                                timestamp: entry.timestamp,
                                model: message
                                    .model
                                    .clone()
                                    .unwrap_or_else(|| "unknown".to_string()),
                                input_tokens: usage.input_tokens.unwrap_or(0),
                                output_tokens: usage.output_tokens.unwrap_or(0),
                                cache_creation_tokens: usage
                                    .cache_creation_input_tokens
                                    .unwrap_or(0),
                                cache_read_tokens: usage
                                    .cache_read_input_tokens
                                    .unwrap_or(0),
                                cost_micro_usd,
                                cost: cost_micro_usd as f64 / 1_000_000.0,
                                session_id: entry
                                    .session_id
                                    .unwrap_or_else(|| session_id.clone()),
                                project_path,
                            });
                        }
                    }
                }
            }
        }
    }

    entries
}

pub(super) fn get_earliest_timestamp(path: &PathBuf) -> Option<String> {
    if let Ok(content) = fs::read_to_string(path) {
        let mut earliest_timestamp: Option<String> = None;
        for line in content.lines() {
            if let Ok(json_value) = serde_json::from_str::<serde_json::Value>(line) {
                if let Some(timestamp_str) =
                    json_value.get("timestamp").and_then(|v| v.as_str())
                {
                    if let Some(current_earliest) = &earliest_timestamp {
                        if timestamp_str < current_earliest.as_str() {
                            earliest_timestamp = Some(timestamp_str.to_string());
                        }
                    } else {
                        earliest_timestamp = Some(timestamp_str.to_string());
                    }
                }
            }
        }
        return earliest_timestamp;
    }
    None
}

pub(super) fn get_all_usage_entries(claude_path: &PathBuf) -> Vec<UsageEntry> {
    let mut all_entries = Vec::new();
    let mut processed_hashes = HashSet::new();
    let projects_dir = claude_path.join("projects");

    let mut files_to_process: Vec<(PathBuf, String)> = Vec::new();

    if let Ok(projects) = std::fs::read_dir(&projects_dir) {
        for project in projects.flatten() {
            if project.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                let project_name = project.file_name().to_string_lossy().to_string();
                let project_path = project.path();

                walkdir::WalkDir::new(&project_path)
                    .into_iter()
                    .filter_map(Result::ok)
                    .filter(|e| {
                        e.path().extension().and_then(|s| s.to_str()) == Some("jsonl")
                    })
                    .for_each(|entry| {
                        files_to_process
                            .push((entry.path().to_path_buf(), project_name.clone()));
                    });
            }
        }
    }

    // Sort files by their earliest timestamp to ensure chronological processing
    // and deterministic deduplication.
    files_to_process.sort_by_cached_key(|(path, _)| get_earliest_timestamp(path));

    for (path, project_name) in files_to_process {
        let entries = parse_jsonl_file(&path, &project_name, &mut processed_hashes);
        all_entries.extend(entries);
    }

    // Sort by timestamp
    all_entries.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

    all_entries
}
