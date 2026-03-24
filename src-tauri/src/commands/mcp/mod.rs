mod config;
mod import;
mod servers;
mod types;

// Re-export all types and commands used by lib.rs / main.rs
#[allow(unused_imports)]
pub use types::{
    AddServerResult, ImportResult, ImportServerResult, MCPProjectConfig, MCPServer,
    MCPServerConfig, ServerStatus,
};
#[allow(unused_imports)]
pub use config::{mcp_read_project_config, mcp_save_project_config};
#[allow(unused_imports)]
pub use import::mcp_add_from_claude_desktop;
#[allow(unused_imports)]
pub use servers::{
    mcp_add, mcp_add_json, mcp_get, mcp_get_server_status, mcp_list, mcp_remove,
    mcp_reset_project_choices, mcp_serve, mcp_test_connection,
};
