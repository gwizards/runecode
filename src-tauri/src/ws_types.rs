use serde::{Deserialize, Serialize};

// Fields are deserialized from the WebSocket client but may not all be read
// by every handler. Allow dead_code to suppress warnings for future-proofed fields.
#[allow(dead_code)]

/// All message types the TypeScript client can send over the WebSocket.
///
/// The `type` field is used as a serde tag (snake_case). Field names mirror
/// what `apiAdapter.ts` serialises so no renaming is needed on either side.
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum WsClientMessage {
    /// Start a new Claude session. Equivalent to `execute` / `resume` in the old
    /// `ClaudeExecutionRequest`. When `resume_at` / `session_id` are present the
    /// handler resumes an existing Claude conversation.
    Init {
        project_path: String,
        /// The first prompt text.
        text: String,
        model: Option<String>,
        session_id: Option<String>,
        thinking_mode: Option<String>,
        permission_mode: Option<String>,
        effort: Option<String>,
        resume_at: Option<String>,
        teams_enabled: Option<bool>,
        // environment block intentionally left as opaque JSON for forward-compat
        environment: Option<serde_json::Value>,
    },
    /// Start a Claude session that runs as a named agent.
    InitAgent {
        agent_name: String,
        project_path: String,
        text: String,
        model: Option<String>,
        thinking_mode: Option<String>,
        permission_mode: Option<String>,
        effort: Option<String>,
        teams_enabled: Option<bool>,
        environment: Option<serde_json::Value>,
    },
    /// Send a follow-up prompt to the running Claude process.
    Prompt {
        text: String,
        thinking_mode: Option<String>,
    },
    /// Interrupt the current Claude turn without closing the session.
    Interrupt {},
    /// Rewind file state to a prior checkpoint.
    RewindFiles {
        user_message_id: Option<String>,
        dry_run: Option<bool>,
    },
    /// Change the model for subsequent turns.
    SetModel {
        model: String,
    },
    /// Change the permission mode for subsequent turns.
    SetPermissionMode {
        mode: String,
    },
    /// Stop a background task inside the session without closing the connection.
    StopTask {
        task_id: Option<String>,
    },
    /// Client is closing the session — clean up and close the WS connection.
    Close {},
}

/// Messages the server sends back to the client.
#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
pub enum WsServerMessage {
    /// Streaming output line from Claude stdout.
    Output {
        session_id: String,
        content: String,
    },
    /// Non-fatal error scoped to this session.
    Error {
        session_id: String,
        error: String,
    },
    /// The current turn is complete.
    Done {
        session_id: String,
    },
    /// Claude turn was interrupted successfully.
    Interrupted {
        session_id: String,
    },
    /// Model was updated.
    ModelChanged {
        session_id: String,
        model: String,
    },
    /// Permission mode was updated.
    PermissionModeChanged {
        session_id: String,
        mode: String,
    },
    /// Rewind was requested (stub — full implementation is follow-up work).
    RewindAck {
        session_id: String,
        user_message_id: Option<String>,
        dry_run: bool,
    },
}
