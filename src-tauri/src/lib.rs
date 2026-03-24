// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

// Declare modules
pub mod checkpoint;
pub mod claude_binary;
pub mod claude_binary_env;
pub mod commands;
pub mod path_guard;
pub mod process;
pub mod terminal_pty;
pub mod terminal_server;
pub mod web_server;
pub mod ws_types;
// web_server submodules (http, middleware, ws) are declared inside web_server.rs


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running tauri application"); // safe: top-level entry point, process must abort on runtime failure
}
