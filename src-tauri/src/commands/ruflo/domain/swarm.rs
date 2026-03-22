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
