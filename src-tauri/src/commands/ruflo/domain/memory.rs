// RuFlo memory domain types — used as JSON response bodies for memory IPC commands.
// NOTE(v0.7-roadmap): MemoryStats and MemorySyncResult fully wired when AgentDB bridge moves to Rust.
use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryBackend {
    Agentdb,
    Hnsw,
    Hybrid,
    #[serde(other)]
    Unknown,
}

impl Default for MemoryBackend {
    fn default() -> Self {
        Self::Agentdb
    }
}

impl std::fmt::Display for MemoryBackend {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Agentdb => write!(f, "agentdb"),
            Self::Hnsw => write!(f, "hnsw"),
            Self::Hybrid => write!(f, "hybrid"),
            Self::Unknown => write!(f, "unknown"),
        }
    }
}

// NOTE(v0.7-roadmap): returned by get_ruflo_memory_stats once stats endpoint reads live AgentDB data
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub total_entries: usize,
    #[serde(default)]
    pub backend: MemoryBackend,
    pub size_bytes: Option<u64>,
    pub namespaces: Vec<String>,
}

// NOTE(v0.7-roadmap): returned by sync_ruflo_memory_local once local sync writes to disk
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySyncResult {
    pub exported_entries: usize,
    pub output_path: String,
    pub success: bool,
}
