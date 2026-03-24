use std::collections::HashMap;

use super::types::{DailyUsage, ModelUsage, ProjectUsage, UsageEntry, UsageStats};

/// Aggregate a slice of `UsageEntry` records into a `UsageStats` summary.
///
/// Costs are accumulated as integer micro-dollars (i64) to prevent IEEE-754
/// float drift; they are converted to f64 only at output time.
pub(super) fn aggregate_entries(entries: &[UsageEntry]) -> UsageStats {
    if entries.is_empty() {
        return UsageStats {
            total_cost: 0.0,
            total_tokens: 0,
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cache_creation_tokens: 0,
            total_cache_read_tokens: 0,
            total_sessions: 0,
            by_model: vec![],
            by_date: vec![],
            by_project: vec![],
        };
    }

    let mut total_cost_micro: i64 = 0;
    let mut total_input_tokens = 0u64;
    let mut total_output_tokens = 0u64;
    let mut total_cache_creation_tokens = 0u64;
    let mut total_cache_read_tokens = 0u64;

    // Integer micro-dollar accumulators per group.
    let mut model_cost_micro: HashMap<String, i64> = HashMap::new();
    let mut daily_cost_micro: HashMap<String, i64> = HashMap::new();
    let mut project_cost_micro: HashMap<String, i64> = HashMap::new();

    let mut model_stats: HashMap<String, ModelUsage> = HashMap::new();
    let mut daily_stats: HashMap<String, DailyUsage> = HashMap::new();
    let mut project_stats: HashMap<String, ProjectUsage> = HashMap::new();

    for entry in entries {
        // Update totals (integer accumulation for cost).
        total_cost_micro += entry.cost_micro_usd;
        total_input_tokens += entry.input_tokens;
        total_output_tokens += entry.output_tokens;
        total_cache_creation_tokens += entry.cache_creation_tokens;
        total_cache_read_tokens += entry.cache_read_tokens;

        // Update model stats.
        *model_cost_micro.entry(entry.model.clone()).or_insert(0) += entry.cost_micro_usd;
        let model_stat = model_stats.entry(entry.model.clone()).or_insert(ModelUsage {
            model: entry.model.clone(),
            total_cost: 0.0,
            total_tokens: 0,
            input_tokens: 0,
            output_tokens: 0,
            cache_creation_tokens: 0,
            cache_read_tokens: 0,
            session_count: 0,
        });
        model_stat.input_tokens += entry.input_tokens;
        model_stat.output_tokens += entry.output_tokens;
        model_stat.cache_creation_tokens += entry.cache_creation_tokens;
        model_stat.cache_read_tokens += entry.cache_read_tokens;
        model_stat.total_tokens = model_stat.input_tokens + model_stat.output_tokens;
        model_stat.session_count += 1;

        // Update daily stats.
        let date = entry
            .timestamp
            .split('T')
            .next()
            .unwrap_or(&entry.timestamp)
            .to_string();
        *daily_cost_micro.entry(date.clone()).or_insert(0) += entry.cost_micro_usd;
        let daily_stat = daily_stats.entry(date.clone()).or_insert(DailyUsage {
            date,
            total_cost: 0.0,
            total_tokens: 0,
            models_used: vec![],
        });
        daily_stat.total_tokens += entry.input_tokens
            + entry.output_tokens
            + entry.cache_creation_tokens
            + entry.cache_read_tokens;
        if !daily_stat.models_used.contains(&entry.model) {
            daily_stat.models_used.push(entry.model.clone());
        }

        // Update project stats.
        *project_cost_micro
            .entry(entry.project_path.clone())
            .or_insert(0) += entry.cost_micro_usd;
        let project_stat =
            project_stats
                .entry(entry.project_path.clone())
                .or_insert(ProjectUsage {
                    project_path: entry.project_path.clone(),
                    project_name: entry
                        .project_path
                        .split('/')
                        .last()
                        .unwrap_or(&entry.project_path)
                        .to_string(),
                    total_cost: 0.0,
                    total_tokens: 0,
                    session_count: 0,
                    last_used: entry.timestamp.clone(),
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

    // Assign display costs (convert integer micro-USD → f64 once per group).
    for (model, stat) in model_stats.iter_mut() {
        stat.total_cost =
            model_cost_micro.get(model).copied().unwrap_or(0) as f64 / 1_000_000.0;
    }
    for (date, stat) in daily_stats.iter_mut() {
        stat.total_cost =
            daily_cost_micro.get(date).copied().unwrap_or(0) as f64 / 1_000_000.0;
    }
    for (path, stat) in project_stats.iter_mut() {
        stat.total_cost =
            project_cost_micro.get(path).copied().unwrap_or(0) as f64 / 1_000_000.0;
    }

    let total_cost = total_cost_micro as f64 / 1_000_000.0;
    let total_tokens = total_input_tokens
        + total_output_tokens
        + total_cache_creation_tokens
        + total_cache_read_tokens;
    let total_sessions = entries.len() as u64;

    // Convert hashmaps to sorted vectors.
    let mut by_model: Vec<ModelUsage> = model_stats.into_values().collect();
    by_model.sort_by(|a, b| {
        b.total_cost
            .partial_cmp(&a.total_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let mut by_date: Vec<DailyUsage> = daily_stats.into_values().collect();
    by_date.sort_by(|a, b| b.date.cmp(&a.date));

    let mut by_project: Vec<ProjectUsage> = project_stats.into_values().collect();
    by_project.sort_by(|a, b| {
        b.total_cost
            .partial_cmp(&a.total_cost)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    UsageStats {
        total_cost,
        total_tokens,
        total_input_tokens,
        total_output_tokens,
        total_cache_creation_tokens,
        total_cache_read_tokens,
        total_sessions,
        by_model,
        by_date,
        by_project,
    }
}
