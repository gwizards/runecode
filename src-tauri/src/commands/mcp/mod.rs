mod config;
mod import;
mod servers;
mod types;

// Re-export all types used by lib.rs / main.rs
pub use types::{
    AddServerResult, ImportResult, ImportServerResult, MCPProjectConfig, MCPServer,
    MCPServerConfig, ServerStatus,
};

// Re-export all commands
pub use config::{mcp_read_project_config, mcp_save_project_config};
pub use import::mcp_add_from_claude_desktop;
pub use servers::{
    mcp_add, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list, mcp_remove,
    mcp_reset_project_choices, mcp_serve, mcp_test_connection,
};
