use serde::{Deserialize, Serialize};
use super::agent::RuFloAgent;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloSwarmStatus {
    pub swarm_active: bool,
    pub agents: Vec<RuFloAgent>,
    pub memory_entries: usize,
}
