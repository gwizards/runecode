use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageEntry {
    pub timestamp: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    /// Integer micro-dollars (1_000_000 = $1.00).  Use for all arithmetic.
    pub cost_micro_usd: i64,
    /// Display-only field: cost_micro_usd / 1_000_000.  Never accumulate this.
    pub cost: f64,
    pub session_id: String,
    pub project_path: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsageStats {
    pub total_cost: f64,
    pub total_tokens: u64,
    pub total_input_tokens: u64,
    pub total_output_tokens: u64,
    pub total_cache_creation_tokens: u64,
    pub total_cache_read_tokens: u64,
    pub total_sessions: u64,
    pub by_model: Vec<ModelUsage>,
    pub by_date: Vec<DailyUsage>,
    pub by_project: Vec<ProjectUsage>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ModelUsage {
    pub model: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub cache_creation_tokens: u64,
    pub cache_read_tokens: u64,
    pub session_count: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DailyUsage {
    pub date: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub models_used: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProjectUsage {
    pub project_path: String,
    pub project_name: String,
    pub total_cost: f64,
    pub total_tokens: u64,
    pub session_count: u64,
    pub last_used: String,
}

// ─── Internal deserialization types ─────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub(super) struct JsonlEntry {
    pub timestamp: String,
    pub message: Option<MessageData>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    #[serde(rename = "requestId")]
    pub request_id: Option<String>,
    #[serde(rename = "costUSD")]
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Deserialize)]
pub(super) struct MessageData {
    pub id: Option<String>,
    pub model: Option<String>,
    pub usage: Option<UsageData>,
}

#[derive(Debug, Deserialize)]
pub(super) struct UsageData {
    pub input_tokens: Option<u64>,
    pub output_tokens: Option<u64>,
    pub cache_creation_input_tokens: Option<u64>,
    pub cache_read_input_tokens: Option<u64>,
}

// ─── Pricing constants (per million tokens) ──────────────────────────────────

pub(super) const OPUS_4_INPUT_PRICE: f64 = 15.0;
pub(super) const OPUS_4_OUTPUT_PRICE: f64 = 75.0;
pub(super) const OPUS_4_CACHE_WRITE_PRICE: f64 = 18.75;
pub(super) const OPUS_4_CACHE_READ_PRICE: f64 = 1.50;

pub(super) const SONNET_4_INPUT_PRICE: f64 = 3.0;
pub(super) const SONNET_4_OUTPUT_PRICE: f64 = 15.0;
pub(super) const SONNET_4_CACHE_WRITE_PRICE: f64 = 3.75;
pub(super) const SONNET_4_CACHE_READ_PRICE: f64 = 0.30;
