# Task 009 — Fix WebSocket Protocol Gap

**Priority:** Critical | **Sprint:** 1 | **Estimate:** 2-3 days

## Context

TypeScript sends 9 WS message types (`init`, `init_agent`, `prompt`, `interrupt`, `rewind_files`, `set_model`, `set_permission_mode`, `stop_task`, `close`) from `apiAdapter.ts:53`. The Rust handler at `web_server.rs:964` (`claude_websocket_handler`) only deserializes the old 3-field `ClaudeExecutionRequest` struct. All richer message types fall into the parse-error branch and are **silently discarded**. This means interrupt, mid-session model change, file rewind, and agent sessions are broken in web mode.

## Acceptance Criteria

- [ ] Replace `ClaudeExecutionRequest` with a `WsClientMessage` enum covering all 9 TS message types
- [ ] `interrupt` message terminates the running Claude subprocess cleanly (SIGTERM → SIGKILL after 3s)
- [ ] `init_agent` routes `--agent-name` flag to the Claude subprocess
- [ ] `rewind_files` delegates to the existing `checkpoint` module
- [ ] `set_model` and `set_permission_mode` update mid-session config
- [ ] `stop_task` and `close` perform cleanup and close the WS connection
- [ ] Unknown message types log a warning and are ignored (no panic)
- [ ] All existing tests pass; add integration tests for interrupt and rewind_files

## Technical Approach

```rust
// src-tauri/src/commands/ws_types.rs (new file)
#[derive(serde::Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsClientMessage {
    Init { session_id: String, project_path: String, model: Option<String> },
    InitAgent { session_id: String, agent_name: String, project_path: String },
    Prompt { session_id: String, content: String },
    Interrupt { session_id: String },
    RewindFiles { session_id: String, checkpoint_id: String },
    SetModel { session_id: String, model: String },
    SetPermissionMode { session_id: String, mode: String },
    StopTask { session_id: String },
    Close { session_id: String },
}
```

Replace the `serde_json::from_str::<ClaudeExecutionRequest>` call in `claude_websocket_handler` with `serde_json::from_str::<WsClientMessage>`, then `match` on each variant.

## Dependencies

- None (checkpoint module already exists)

## Out of Scope

- Splitting `web_server.rs` (tracked separately as file-split task)
