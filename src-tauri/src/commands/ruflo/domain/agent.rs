// RuFlo domain types — DDD value objects for the swarm orchestration context.
// Items marked dead_code are part of the bounded-context model; not all variants are
// referenced in active IPC handlers yet.  NOTE(v0.7-roadmap): wire remaining variants to IPC.
use serde::{Deserialize, Serialize};

use super::capabilities::AgentCapability;

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
    #[serde(default)]
    pub capabilities: Vec<AgentCapability>,
}

// NOTE(v0.7-roadmap): has_capability used by task routing; expose when capability-based dispatch lands
#[allow(dead_code)]
impl RuFloAgent {
    pub fn has_capability(&self, cap: &AgentCapability) -> bool {
        self.capabilities.contains(cap)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_status_is_active() {
        assert!(AgentStatus::Running.is_active());
        assert!(AgentStatus::Waiting.is_active());
        assert!(AgentStatus::Active.is_active());
        assert!(AgentStatus::Busy.is_active());
        assert!(AgentStatus::Initializing.is_active());
        assert!(!AgentStatus::Idle.is_active());
        assert!(!AgentStatus::Stopped.is_active());
        assert!(!AgentStatus::Unknown.is_active());
    }

    #[test]
    fn test_agent_status_display() {
        assert_eq!(AgentStatus::Running.to_string(), "running");
        assert_eq!(AgentStatus::Unknown.to_string(), "unknown");
    }

    #[test]
    fn test_agent_status_serde_roundtrip() {
        let json = serde_json::to_string(&AgentStatus::Running).expect("serialize AgentStatus");
        assert_eq!(json, "\"running\"");
        let back: AgentStatus = serde_json::from_str(&json).expect("deserialize AgentStatus");
        assert_eq!(back, AgentStatus::Running);
    }

    #[test]
    fn test_agent_status_unknown_fallback() {
        let back: AgentStatus = serde_json::from_str("\"some-unknown-status\"").expect("deserialize unknown status");
        assert_eq!(back, AgentStatus::Unknown);
    }

    #[test]
    fn test_agent_has_capability() {
        let agent = RuFloAgent {
            id: "a1".into(),
            name: "coder".into(),
            agent_type: AgentType::Coder,
            status: AgentStatus::Running,
            capabilities: vec![AgentCapability::CodeGeneration],
        };
        assert!(agent.has_capability(&AgentCapability::CodeGeneration));
        assert!(!agent.has_capability(&AgentCapability::Testing));
    }
}
