use anyhow::Result;

use super::CheckpointStrategy;

/// Extract (user_prompt, model_used, total_tokens) from a slice of JSONL
/// message strings.  Iterates in reverse to find the last user message.
pub(super) async fn extract_checkpoint_metadata(
    messages: &[String],
) -> Result<(String, String, u64)> {
    let mut user_prompt = String::new();
    let mut model_used = String::from("unknown");
    let mut total_tokens = 0u64;

    for msg_str in messages.iter().rev() {
        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(msg_str) {
            if msg.get("type").and_then(|t| t.as_str()) == Some("user") {
                if let Some(content) = msg
                    .get("message")
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_array())
                {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                user_prompt = text.to_string();
                                break;
                            }
                        }
                    }
                }
            }

            if let Some(model) = msg.get("model").and_then(|m| m.as_str()) {
                model_used = model.to_string();
            }

            if let Some(message) = msg.get("message") {
                if let Some(model) = message.get("model").and_then(|m| m.as_str()) {
                    model_used = model.to_string();
                }
            }

            // Count tokens — check both nested (assistant) and top-level (result) usage
            for usage_val in [
                msg.get("message").and_then(|m| m.get("usage")),
                msg.get("usage"),
            ]
            .into_iter()
            .flatten()
            {
                if let Some(v) = usage_val.get("input_tokens").and_then(|t| t.as_u64()) {
                    total_tokens += v;
                }
                if let Some(v) = usage_val.get("output_tokens").and_then(|t| t.as_u64()) {
                    total_tokens += v;
                }
                if let Some(v) = usage_val
                    .get("cache_creation_input_tokens")
                    .and_then(|t| t.as_u64())
                {
                    total_tokens += v;
                }
                if let Some(v) = usage_val
                    .get("cache_read_input_tokens")
                    .and_then(|t| t.as_u64())
                {
                    total_tokens += v;
                }
            }
        }
    }

    Ok((user_prompt, model_used, total_tokens))
}

/// Returns true if the message should trigger an auto-checkpoint given the
/// current `strategy`.
pub(super) fn should_trigger(strategy: &CheckpointStrategy, message: &str) -> bool {
    match strategy {
        CheckpointStrategy::Manual => false,
        CheckpointStrategy::PerPrompt => {
            if let Ok(msg) = serde_json::from_str::<serde_json::Value>(message) {
                msg.get("type").and_then(|t| t.as_str()) == Some("user")
            } else {
                false
            }
        }
        CheckpointStrategy::PerToolUse => {
            has_tool_use(message, |_| true)
        }
        CheckpointStrategy::Smart => {
            has_tool_use(message, |tool_name| {
                matches!(
                    tool_name.to_lowercase().as_str(),
                    "write" | "edit" | "multiedit" | "bash" | "rm" | "delete"
                )
            })
        }
    }
}

/// Returns true if the JSONL message contains a `tool_use` content item whose
/// name satisfies `predicate`.
fn has_tool_use<F: Fn(&str) -> bool>(message: &str, predicate: F) -> bool {
    if let Ok(msg) = serde_json::from_str::<serde_json::Value>(message) {
        if let Some(content) = msg
            .get("message")
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_array())
        {
            return content.iter().any(|item| {
                if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    predicate(name)
                } else {
                    false
                }
            });
        }
    }
    false
}
