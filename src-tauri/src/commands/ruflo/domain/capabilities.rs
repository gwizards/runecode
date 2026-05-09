use serde::{Deserialize, Serialize};

/// Capabilities that an agent can possess — used to match tasks to agents.
// NOTE(v0.7-roadmap): AgentCapability fully consumed by capability-based task routing when that feature lands
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AgentCapability {
    CodeGeneration,
    CodeReview,
    Testing,
    SecurityAudit,
    PerformanceAnalysis,
    MemoryOptimization,
    Documentation,
    Planning,
    Research,
    #[serde(other)]
    Unknown,
}

impl std::fmt::Display for AgentCapability {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::CodeGeneration => "code-generation",
            Self::CodeReview => "code-review",
            Self::Testing => "testing",
            Self::SecurityAudit => "security-audit",
            Self::PerformanceAnalysis => "performance-analysis",
            Self::MemoryOptimization => "memory-optimization",
            Self::Documentation => "documentation",
            Self::Planning => "planning",
            Self::Research => "research",
            Self::Unknown => "unknown",
        };
        write!(f, "{s}")
    }
}

/// Swarm topology value object — how agents connect to each other.
// NOTE(v0.7-roadmap): is_fault_tolerant + recommended_max_agents used by swarm-init handler once typed
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SwarmTopology {
    Hierarchical,
    Mesh,
    Star,
    Ring,
    Hybrid,
    #[serde(other)]
    Unknown,
}

// NOTE(v0.7-roadmap): expose via swarm-topology IPC query when orchestrator reads typed config
#[allow(dead_code)]
impl SwarmTopology {
    /// Returns true if this topology supports fault-tolerant communication.
    pub fn is_fault_tolerant(&self) -> bool {
        matches!(self, Self::Mesh | Self::Hierarchical | Self::Hybrid)
    }

    /// Returns the recommended max agents for this topology.
    pub fn recommended_max_agents(&self) -> usize {
        match self {
            Self::Hierarchical => 15,
            Self::Mesh => 8,
            Self::Star => 20,
            Self::Ring => 10,
            Self::Hybrid => 15,
            Self::Unknown => 5,
        }
    }
}

impl std::fmt::Display for SwarmTopology {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Hierarchical => "hierarchical",
            Self::Mesh => "mesh",
            Self::Star => "star",
            Self::Ring => "ring",
            Self::Hybrid => "hybrid",
            Self::Unknown => "unknown",
        };
        write!(f, "{s}")
    }
}

/// Task priority value object — validated 0–10 range.
// NOTE(v0.7-roadmap): TaskPriority used by task_create IPC once typed priority validation lands
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct TaskPriority(u8);

// NOTE(v0.7-roadmap): LOW/NORMAL/HIGH/CRITICAL constants used by task scheduler
#[allow(dead_code)]
impl TaskPriority {
    pub const LOW: Self = Self(2);
    pub const NORMAL: Self = Self(5);
    pub const HIGH: Self = Self(8);
    pub const CRITICAL: Self = Self(10);

    /// Create a TaskPriority, clamping to 0–10.
    pub fn new(value: u8) -> Self {
        Self(value.min(10))
    }

    pub fn value(&self) -> u8 {
        self.0
    }

    pub fn is_urgent(&self) -> bool {
        self.0 >= 8
    }

    pub fn label(&self) -> &'static str {
        match self.0 {
            0..=3 => "low",
            4..=6 => "normal",
            7..=9 => "high",
            _ => "critical",
        }
    }
}

impl std::fmt::Display for TaskPriority {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.label(), self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_capability_display() {
        assert_eq!(AgentCapability::CodeGeneration.to_string(), "code-generation");
        assert_eq!(AgentCapability::SecurityAudit.to_string(), "security-audit");
    }

    #[test]
    fn test_agent_capability_serde() {
        let json = serde_json::to_string(&AgentCapability::Testing).expect("serialize AgentCapability");
        assert_eq!(json, "\"testing\"");
        let back: AgentCapability = serde_json::from_str(&json).expect("deserialize AgentCapability");
        assert_eq!(back, AgentCapability::Testing);
    }

    #[test]
    fn test_agent_capability_unknown_fallback() {
        let back: AgentCapability = serde_json::from_str("\"not-a-real-capability\"").expect("deserialize unknown capability");
        assert_eq!(back, AgentCapability::Unknown);
    }

    #[test]
    fn test_swarm_topology_fault_tolerance() {
        assert!(SwarmTopology::Mesh.is_fault_tolerant());
        assert!(SwarmTopology::Hierarchical.is_fault_tolerant());
        assert!(!SwarmTopology::Star.is_fault_tolerant());
        assert!(!SwarmTopology::Ring.is_fault_tolerant());
    }

    #[test]
    fn test_swarm_topology_max_agents() {
        assert_eq!(SwarmTopology::Hierarchical.recommended_max_agents(), 15);
        assert_eq!(SwarmTopology::Mesh.recommended_max_agents(), 8);
        assert_eq!(SwarmTopology::Star.recommended_max_agents(), 20);
    }

    #[test]
    fn test_swarm_topology_serde() {
        let json = serde_json::to_string(&SwarmTopology::Hierarchical).expect("serialize SwarmTopology");
        assert_eq!(json, "\"hierarchical\"");
    }

    #[test]
    fn test_task_priority_clamping() {
        assert_eq!(TaskPriority::new(255).value(), 10);
        assert_eq!(TaskPriority::new(0).value(), 0);
        assert_eq!(TaskPriority::new(7).value(), 7);
    }

    #[test]
    fn test_task_priority_is_urgent() {
        assert!(TaskPriority::CRITICAL.is_urgent());
        assert!(TaskPriority::HIGH.is_urgent());
        assert!(!TaskPriority::NORMAL.is_urgent());
        assert!(!TaskPriority::LOW.is_urgent());
    }

    #[test]
    fn test_task_priority_label() {
        assert_eq!(TaskPriority::LOW.label(), "low");
        assert_eq!(TaskPriority::NORMAL.label(), "normal");
        assert_eq!(TaskPriority::HIGH.label(), "high");
        assert_eq!(TaskPriority::CRITICAL.label(), "critical");
    }

    #[test]
    fn test_task_priority_ord() {
        assert!(TaskPriority::CRITICAL > TaskPriority::HIGH);
        assert!(TaskPriority::HIGH > TaskPriority::NORMAL);
        assert!(TaskPriority::NORMAL > TaskPriority::LOW);
    }

    #[test]
    fn test_task_priority_constants() {
        assert_eq!(TaskPriority::LOW.value(), 2);
        assert_eq!(TaskPriority::NORMAL.value(), 5);
        assert_eq!(TaskPriority::HIGH.value(), 8);
        assert_eq!(TaskPriority::CRITICAL.value(), 10);
    }
}
