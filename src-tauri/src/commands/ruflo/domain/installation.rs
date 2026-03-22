use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub mcp_active: bool,
    pub slash_command_exists: bool,
}
