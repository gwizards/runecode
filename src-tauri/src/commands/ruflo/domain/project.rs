use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuFloProjectStatus {
    pub initialized: bool,
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}
