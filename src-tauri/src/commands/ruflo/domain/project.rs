use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RuFloProjectStatus {
    pub initialized: bool,
    pub pending: usize,
    pub completed: usize,
    pub blocked: usize,
}

#[allow(dead_code)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_total() {
        let p = RuFloProjectStatus { initialized: true, pending: 3, completed: 5, blocked: 1 };
        assert_eq!(p.total(), 9);
    }

    #[test]
    fn test_completion_rate() {
        let p = RuFloProjectStatus { initialized: true, pending: 0, completed: 4, blocked: 0 };
        assert!((p.completion_rate() - 1.0).abs() < 0.001);
    }

    #[test]
    fn test_completion_rate_empty() {
        let p = RuFloProjectStatus::default();
        assert_eq!(p.completion_rate(), 0.0);
    }

    #[test]
    fn test_has_blocked_tasks() {
        let mut p = RuFloProjectStatus::default();
        assert!(!p.has_blocked_tasks());
        p.blocked = 1;
        assert!(p.has_blocked_tasks());
    }
}
