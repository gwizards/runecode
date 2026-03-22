use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuFloProjectStatus {
    pub initialized: bool,
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}

impl RuFloProjectStatus {
    pub fn total(&self) -> usize {
        self.pending + self.completed + self.blocked
    }

    pub fn completion_rate(&self) -> f32 {
        let total = self.total();
        if total == 0 {
            return 0.0;
        }
        self.completed as f32 / total as f32
    }

    pub fn has_blocked_tasks(&self) -> bool {
        self.blocked > 0
    }
}
