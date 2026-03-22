use serde::{Deserialize, Serialize};
use super::agent::RuFloAgent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,
}

impl RuFloSwarmStatus {
    pub fn active_agent_count(&self) -> usize {
        self.agents.iter().filter(|a| a.status.is_active()).count()
    }

    pub fn agent_by_id(&self, id: &str) -> Option<&super::agent::RuFloAgent> {
        self.agents.iter().find(|a| a.id == id)
    }

    pub fn is_healthy(&self) -> bool {
        self.swarm_active && self.active_agent_count() > 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::agent::{AgentStatus, AgentType};

    fn make_agent(id: &str, status: AgentStatus) -> RuFloAgent {
        RuFloAgent { id: id.to_string(), name: id.to_string(), agent_type: AgentType::Coder, status, capabilities: vec![] }
    }

    #[test]
    fn test_active_agent_count() {
        let swarm = RuFloSwarmStatus {
            swarm_active: true,
            agents: vec![
                make_agent("a1", AgentStatus::Running),
                make_agent("a2", AgentStatus::Idle),
                make_agent("a3", AgentStatus::Busy),
            ],
            memory_entries: 0,
        };
        assert_eq!(swarm.active_agent_count(), 2);
    }

    #[test]
    fn test_is_healthy() {
        let healthy = RuFloSwarmStatus {
            swarm_active: true,
            agents: vec![make_agent("a1", AgentStatus::Running)],
            memory_entries: 0,
        };
        assert!(healthy.is_healthy());

        let idle = RuFloSwarmStatus {
            swarm_active: true,
            agents: vec![make_agent("a1", AgentStatus::Idle)],
            memory_entries: 0,
        };
        assert!(!idle.is_healthy());
    }

    #[test]
    fn test_agent_by_id() {
        let swarm = RuFloSwarmStatus {
            swarm_active: true,
            agents: vec![make_agent("agent-1", AgentStatus::Running)],
            memory_entries: 0,
        };
        assert!(swarm.agent_by_id("agent-1").is_some());
        assert!(swarm.agent_by_id("nope").is_none());
    }
}
