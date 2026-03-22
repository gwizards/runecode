use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MemoryBackend {
    Agentdb,
    Hnsw,
    Hybrid,
    #[serde(other)]
    Unknown,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemoryStats {
    pub total_entries: usize,
    pub backend: MemoryBackend,
    pub size_bytes: Option<u64>,
    pub namespaces: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MemorySyncResult {
    pub exported_entries: usize,
    pub output_path: String,
    pub success: bool,
}
