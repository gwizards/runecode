/// `/api/usage/*` route handlers — read real usage stats from ~/.claude JSONL files.

use axum::extract::Query;
use axum::response::{IntoResponse, Json};
use std::time::Duration;

use crate::commands;
use crate::web_server::{find_claude_binary_web, ApiResponse};

pub async fn get_usage(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let days = params.get("days").and_then(|d| d.parse::<u32>().ok());
    match tokio::task::spawn_blocking(move || commands::usage::get_usage_stats(days)).await {
        Ok(Ok(stats)) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

pub async fn get_usage_range(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let start = params
        .get("start")
        .cloned()
        .unwrap_or_else(|| {
            (chrono::Local::now() - chrono::Duration::days(30))
                .format("%Y-%m-%d")
                .to_string()
        });
    let end = params
        .get("end")
        .cloned()
        .unwrap_or_else(|| chrono::Local::now().format("%Y-%m-%d").to_string());
    match tokio::task::spawn_blocking(move || {
        commands::usage::get_usage_by_date_range(start, end)
    })
    .await
    {
        Ok(Ok(stats)) => Json(ApiResponse::success(
            serde_json::to_value(stats).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

pub async fn get_usage_sessions(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let since = params.get("since").cloned();
    let until = params.get("until").cloned();
    let order = params.get("order").cloned();
    match tokio::task::spawn_blocking(move || {
        commands::usage::get_session_stats(since, until, order)
    })
    .await
    {
        Ok(Ok(sessions)) => Json(ApiResponse::success(
            serde_json::to_value(sessions).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

pub async fn get_usage_details(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<serde_json::Value>> {
    let project_path = params.get("project_path").cloned();
    let date = params.get("date").cloned();
    match tokio::task::spawn_blocking(move || {
        commands::usage::get_usage_details(project_path, date)
    })
    .await
    {
        Ok(Ok(details)) => Json(ApiResponse::success(
            serde_json::to_value(details).unwrap_or_default(),
        )),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("Task failed".to_string())),
    }
}

/// Get 5-hour rolling usage window for Max/Pro plan users.
pub async fn get_usage_window() -> impl IntoResponse {
    let result = tokio::task::spawn_blocking(|| {
        let home = std::env::var("HOME").unwrap_or_default();
        let claude_dir = format!("{}/.claude/projects", home);

        let five_hours_ago = chrono::Utc::now() - chrono::Duration::hours(5);
        let five_hours_ago_ms = five_hours_ago.timestamp_millis();

        let mut total_input = 0u64;
        let mut total_output = 0u64;
        let mut total_cache_creation = 0u64;
        let mut total_cache_read = 0u64;
        let mut message_count = 0u64;

        if let Ok(projects) = std::fs::read_dir(&claude_dir) {
            for project in projects.flatten() {
                if project.file_type().map_or(false, |t| t.is_dir()) {
                    for entry in walkdir::WalkDir::new(project.path())
                        .into_iter()
                        .filter_map(Result::ok)
                        .filter(|e| {
                            e.path().extension().map_or(false, |ext| ext == "jsonl")
                        })
                    {
                        let path = entry.path();
                        if let Ok(metadata) = path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                let mod_time_u128 = modified
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_millis();
                                let mod_time =
                                    i64::try_from(mod_time_u128).unwrap_or(i64::MAX);
                                if mod_time < five_hours_ago_ms {
                                    continue;
                                }
                            }
                        }

                        if let Ok(content) = std::fs::read_to_string(path) {
                            for line in content.lines() {
                                if let Ok(json) =
                                    serde_json::from_str::<serde_json::Value>(line)
                                {
                                    let timestamp = json
                                        .get("timestamp")
                                        .and_then(|t| t.as_str())
                                        .and_then(|t| {
                                            chrono::DateTime::parse_from_rfc3339(t).ok()
                                        })
                                        .map(|t| t.timestamp_millis())
                                        .unwrap_or(0);

                                    if timestamp < five_hours_ago_ms {
                                        continue;
                                    }

                                    let usage = json
                                        .get("message")
                                        .and_then(|m| m.get("usage"))
                                        .or_else(|| {
                                            json.get("data")
                                                .and_then(|d| d.get("message"))
                                                .and_then(|m| m.get("message"))
                                                .and_then(|m| m.get("usage"))
                                        });

                                    if let Some(usage) = usage {
                                        total_input += usage
                                            .get("input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_output += usage
                                            .get("output_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_cache_creation += usage
                                            .get("cache_creation_input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        total_cache_read += usage
                                            .get("cache_read_input_tokens")
                                            .and_then(|v| v.as_u64())
                                            .unwrap_or(0);
                                        message_count += 1;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        let effective_tokens = (total_input as f64 * 0.2)
            + (total_output as f64)
            + (total_cache_creation as f64 * 0.25);
        let estimated_limit: f64 = 5_000_000.0;
        let usage_percent = (effective_tokens / estimated_limit * 100.0).min(100.0);

        serde_json::json!({
            "windowHours": 5,
            "inputTokens": total_input,
            "outputTokens": total_output,
            "cacheCreationTokens": total_cache_creation,
            "cacheReadTokens": total_cache_read,
            "totalTokens": total_input + total_output + total_cache_creation + total_cache_read,
            "effectiveTokens": effective_tokens as u64,
            "estimatedLimitTokens": estimated_limit as u64,
            "usagePercent": usage_percent,
            "rateRelevantTokens": total_input + total_output + total_cache_creation,
            "messageCount": message_count,
            "windowStart": five_hours_ago.to_rfc3339(),
            "windowEnd": chrono::Utc::now().to_rfc3339()
        })
    })
    .await
    .unwrap_or_else(|_| serde_json::json!({}));

    axum::Json(result)
}

/// Get usage cost info by running `claude -p "/cost" --output-format json`.
pub async fn get_usage_cost() -> impl IntoResponse {
    let claude_bin = find_claude_binary_web().unwrap_or_else(|_| "claude".to_string());

    let default_response = serde_json::json!({
        "total_cost_usd": 0,
        "result": "Claude binary not available or timed out"
    });

    let result = tokio::time::timeout(
        Duration::from_secs(10),
        tokio::task::spawn_blocking(move || {
            std::process::Command::new(&claude_bin)
                .args(["-p", "/cost", "--output-format", "json"])
                .output()
        }),
    )
    .await;

    match result {
        Ok(Ok(Ok(out))) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            match serde_json::from_str::<serde_json::Value>(&stdout) {
                Ok(json) => axum::Json(json).into_response(),
                Err(_) => axum::Json(serde_json::json!({
                    "total_cost_usd": 0,
                    "result": "Unable to parse cost info"
                }))
                .into_response(),
            }
        }
        _ => axum::Json(default_response).into_response(),
    }
}
