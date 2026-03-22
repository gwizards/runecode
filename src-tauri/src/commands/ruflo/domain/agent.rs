use serde::{Deserialize, Serialize};

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentType {
    Coder,
    Reviewer,
    Tester,
    Planner,
    Researcher,
    Analyst,
    #[serde(rename = "security-architect")]
    SecurityArchitect,
    #[serde(rename = "performance-engineer")]
    PerformanceEngineer,
    #[serde(rename = "memory-specialist")]
    MemorySpecialist,
    #[serde(other)]
    Custom,
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Coder => "coder",
            Self::Reviewer => "reviewer",
            Self::Tester => "tester",
            Self::Planner => "planner",
            Self::Researcher => "researcher",
            Self::Analyst => "analyst",
            Self::SecurityArchitect => "security-architect",
            Self::PerformanceEngineer => "performance-engineer",
            Self::MemorySpecialist => "memory-specialist",
            Self::Custom => "custom",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AgentStatus {
    Running,
    Waiting,
    Active,
    Busy,
    Initializing,
    Idle,
    Stopped,
    #[serde(other)]
    Unknown,
}

impl AgentStatus {
    pub fn is_active(&self) -> bool {
        matches!(
            self,
            Self::Running | Self::Waiting | Self::Active | Self::Busy | Self::Initializing
        )
    }
}

impl std::fmt::Display for AgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::Active => "active",
            Self::Busy => "busy",
            Self::Initializing => "initializing",
            Self::Idle => "idle",
            Self::Stopped => "stopped",
            Self::Unknown => "unknown",
        };
        write!(f, "{}", s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloAgent {
    pub id: String,
    pub name: String,
    pub agent_type: AgentType,
    pub status: AgentStatus,
}
