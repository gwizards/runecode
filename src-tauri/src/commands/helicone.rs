use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct HeliconeEvent {
    pub api_key: String,
    pub model: String,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub session_id: String,
}

#[derive(Serialize)]
struct HeliconePayload {
    model: String,
    usage: HeliconeUsage,
    session_id: String,
}

#[derive(Serialize)]
struct HeliconeUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    total_tokens: u64,
}

#[tauri::command]
pub async fn post_to_helicone(event: HeliconeEvent) -> Result<(), String> {
    let api_key = event.api_key;
    let payload = HeliconePayload {
        model: event.model,
        usage: HeliconeUsage {
            prompt_tokens: event.input_tokens,
            completion_tokens: event.output_tokens,
            total_tokens: event.input_tokens + event.output_tokens,
        },
        session_id: event.session_id,
    };

    // Fire and forget — spawn a task so we don't block the caller
    tokio::spawn(async move {
        let client = reqwest::Client::new();
        let _ = client
            .post("https://api.helicone.ai/v1/log")
            .header("Authorization", format!("Bearer {}", api_key))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await;
    });

    Ok(())
}
