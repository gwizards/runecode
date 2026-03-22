use serde::{Deserialize, Serialize};
use super::agent::AgentStatus;

/// All domain events emitted by the RuFlo bounded context.
/// Used for event sourcing and cross-component communication.
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event_type", rename_all = "snake_case")]
pub enum RuFloEvent {
    /// RuFlo CLI was installed successfully
    Installed { version: String },
    /// RuFlo CLI was uninstalled
    Uninstalled,
    /// MCP server was activated
    McpActivated,
    /// MCP server was deactivated
    McpDeactivated,
    /// A swarm was initialized
    SwarmInitialized { swarm_id: String },
    /// An agent status changed
    AgentStatusChanged { agent_id: String, new_status: AgentStatus },
    /// Memory was synced to a local file
    MemorySynced { output_path: String, entries: usize },
    /// Memory was consolidated (compressed + cleaned)
    MemoryConsolidated,
    /// Memory backend was changed
    MemoryBackendChanged { backend: String },
    /// A project was initialized with RuFlo
    ProjectInitialized { project_path: String },
}

impl RuFloEvent {
    /// Human-readable event name for logging
    pub fn name(&self) -> &'static str {
        match self {
            Self::Installed { .. } => "ruflo.installed",
            Self::Uninstalled => "ruflo.uninstalled",
            Self::McpActivated => "ruflo.mcp_activated",
            Self::McpDeactivated => "ruflo.mcp_deactivated",
            Self::SwarmInitialized { .. } => "ruflo.swarm_initialized",
            Self::AgentStatusChanged { .. } => "ruflo.agent_status_changed",
            Self::MemorySynced { .. } => "ruflo.memory_synced",
            Self::MemoryConsolidated => "ruflo.memory_consolidated",
            Self::MemoryBackendChanged { .. } => "ruflo.memory_backend_changed",
            Self::ProjectInitialized { .. } => "ruflo.project_initialized",
        }
    }
}
