/// WebSocket upgrade handler and message-dispatch loop for Claude sessions.

use axum::extract::ws::{Message, WebSocket};
use axum::extract::{State as AxumState, WebSocketUpgrade};
use axum::response::IntoResponse;
use futures_util::{SinkExt, StreamExt};
use log::{debug, info, warn};

use crate::web_server::{AppState, SessionConfig};
use crate::ws_types::{WsClientMessage, WsServerMessage};

use super::executor::{
    execute_claude_agent_command, execute_claude_command, continue_claude_command,
    interrupt_session_process, resume_claude_command, ws_send_completion,
};

// ---------------------------------------------------------------------------
// Upgrade handler — validates Origin, then upgrades to WebSocket
// ---------------------------------------------------------------------------

pub async fn claude_websocket(
    ws: WebSocketUpgrade,
    headers: axum::http::HeaderMap,
    AxumState(state): AxumState<AppState>,
) -> impl IntoResponse {
    // Validate Origin header — reject cross-site WebSocket connections.
    // Tauri webviews send no Origin; browser connections must be localhost.
    let origin = headers
        .get(axum::http::header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if !origin.is_empty()
        && !origin.starts_with("http://localhost")
        && !origin.starts_with("http://127.0.0.1")
        && !origin.starts_with("tauri://")
    {
        return (axum::http::StatusCode::FORBIDDEN, "Origin not allowed").into_response();
    }
    ws.on_upgrade(move |socket| claude_websocket_handler(socket, state))
        .into_response()
}

// ---------------------------------------------------------------------------
// Main message loop
// ---------------------------------------------------------------------------

async fn claude_websocket_handler(socket: WebSocket, state: AppState) {
    let (mut sender, mut receiver) = socket.split();
    // ws_session_id identifies the *WebSocket connection*, not the Claude conversation.
    let ws_session_id = uuid::Uuid::new_v4().to_string();

    info!("[WS] Handler started -- ws_session_id: {}", ws_session_id);

    // Channel for forwarding output lines back to the WebSocket.
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(256);

    // Register the sender so execute functions can push output.
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.insert(ws_session_id.clone(), tx);
        debug!(
            "[WS] Session registered -- active sessions: {}",
            sessions.len()
        );
    }

    // Forward task: moves messages from the mpsc channel to the WebSocket sink.
    let ws_sid_fwd = ws_session_id.clone();
    let forward_task = tokio::spawn(async move {
        debug!("[WS] Forward task started for {}", ws_sid_fwd);
        while let Some(message) = rx.recv().await {
            if sender.send(Message::Text(message.into())).await.is_err() {
                warn!(
                    "[WS] Failed to forward -- connection closed for {}",
                    ws_sid_fwd
                );
                break;
            }
        }
        debug!("[WS] Forward task ended for {}", ws_sid_fwd);
    });

    // -- Main message loop -------------------------------------------------
    debug!("[WS] Listening for messages");
    let mut init_received = false;
    'outer: while let Some(msg) = receiver.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                warn!("[WS] Receive error: {}", e);
                break 'outer;
            }
        };

        match msg {
            Message::Text(text) => {
                debug!("[WS] Text message ({} chars): {}", text.len(), text);

                let client_msg = match serde_json::from_str::<WsClientMessage>(&text) {
                    Ok(m) => m,
                    Err(e) => {
                        warn!("[WS] Parse error: {} -- raw: {}", e, text);
                        let err_json = serde_json::to_string(&WsServerMessage::Error {
                            session_id: ws_session_id.clone(),
                            error: format!("Unrecognised message format: {}", e),
                        })
                        .unwrap_or_default();
                        let maybe_tx = {
                            let sessions = state.active_sessions.lock().await;
                            sessions.get(&ws_session_id).cloned()
                        };
                        if let Some(tx) = maybe_tx {
                            let _ = tx.send(err_json).await;
                        }
                        // Do not break -- connection stays open for subsequent messages.
                        continue 'outer;
                    }
                };

                match client_msg {
                    // -- Init -----------------------------------------------
                    WsClientMessage::Init {
                        project_path,
                        text: prompt,
                        model,
                        session_id: claude_session_id,
                        permission_mode,
                        ..
                    } => {
                        if init_received {
                            let err_json = serde_json::to_string(&WsServerMessage::Error {
                                session_id: ws_session_id.clone(),
                                error: "Session already initialized".to_string(),
                            })
                            .unwrap_or_default();
                            let maybe_tx = {
                                let sessions = state.active_sessions.lock().await;
                                sessions.get(&ws_session_id).cloned()
                            };
                            if let Some(tx) = maybe_tx {
                                let _ = tx.send(err_json).await;
                            }
                            continue 'outer;
                        }
                        init_received = true;
                        info!(
                            "[WS] Init -- project: {}  resume: {:?}",
                            project_path, claude_session_id
                        );
                        {
                            let mut cfg = state.session_config.lock().await;
                            cfg.insert(
                                ws_session_id.clone(),
                                SessionConfig {
                                    model: model.clone(),
                                    permission_mode: permission_mode.clone(),
                                    project_path: project_path.clone(),
                                },
                            );
                        }
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        let bypass = permission_mode.as_deref() == Some("bypassPermissions");
                        tokio::spawn(async move {
                            let result = if let Some(csid) = claude_session_id {
                                info!("[WS] Resuming claude session {}", csid);
                                resume_claude_command(
                                    project_path,
                                    csid,
                                    prompt,
                                    model.unwrap_or_default(),
                                    bypass,
                                    ws_sid.clone(),
                                    st.clone(),
                                )
                                .await
                            } else {
                                info!("[WS] Executing new session");
                                execute_claude_command(
                                    project_path,
                                    prompt,
                                    model.unwrap_or_default(),
                                    bypass,
                                    ws_sid.clone(),
                                    st.clone(),
                                )
                                .await
                            };
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- InitAgent ------------------------------------------
                    WsClientMessage::InitAgent {
                        agent_name,
                        project_path,
                        text: prompt,
                        model,
                        permission_mode,
                        ..
                    } => {
                        if init_received {
                            let err_json = serde_json::to_string(&WsServerMessage::Error {
                                session_id: ws_session_id.clone(),
                                error: "Session already initialized".to_string(),
                            })
                            .unwrap_or_default();
                            let maybe_tx = {
                                let sessions = state.active_sessions.lock().await;
                                sessions.get(&ws_session_id).cloned()
                            };
                            if let Some(tx) = maybe_tx {
                                let _ = tx.send(err_json).await;
                            }
                            continue 'outer;
                        }
                        init_received = true;
                        info!(
                            "[WS] InitAgent -- agent: {}  project: {}",
                            agent_name, project_path
                        );

                        // Validate model string: only allow alphanumeric, '-', '.', '_', '/'
                        if let Some(ref m) = model {
                            if !m.is_empty()
                                && !m.chars().all(|c| {
                                    c.is_ascii_alphanumeric()
                                        || matches!(c, '-' | '.' | '_' | '/')
                                })
                            {
                                let err = serde_json::to_string(&WsServerMessage::Error {
                                    session_id: ws_session_id.clone(),
                                    error: "Invalid model identifier".to_string(),
                                })
                                .unwrap_or_default();
                                let sessions = state.active_sessions.lock().await;
                                if let Some(tx) = sessions.get(&ws_session_id) {
                                    let _ = tx.send(err).await;
                                }
                                continue;
                            }
                        }

                        // Validate agent_name: only allow alphanumeric, '_', '-'; must not start with '-'
                        if !agent_name
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
                            || agent_name.starts_with('-')
                            || agent_name.is_empty()
                        {
                            let err = serde_json::to_string(&WsServerMessage::Error {
                                session_id: ws_session_id.clone(),
                                error: "Invalid agent name".to_string(),
                            })
                            .unwrap_or_default();
                            let sessions = state.active_sessions.lock().await;
                            if let Some(tx) = sessions.get(&ws_session_id) {
                                let _ = tx.send(err).await;
                            }
                            continue;
                        }

                        {
                            let mut cfg = state.session_config.lock().await;
                            cfg.insert(
                                ws_session_id.clone(),
                                SessionConfig {
                                    model: model.clone(),
                                    permission_mode: permission_mode.clone(),
                                    project_path: project_path.clone(),
                                },
                            );
                        }
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        let bypass = permission_mode.as_deref() == Some("bypassPermissions");
                        tokio::spawn(async move {
                            let result = execute_claude_agent_command(
                                project_path,
                                agent_name,
                                prompt,
                                model.unwrap_or_default(),
                                bypass,
                                ws_sid.clone(),
                                st.clone(),
                            )
                            .await;
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- Prompt (follow-up turn) -----------------------------
                    WsClientMessage::Prompt { text: prompt, .. } => {
                        debug!("[WS] Prompt ({} chars)", prompt.len());
                        let (model, bypass, project_path) = {
                            let cfg = state.session_config.lock().await;
                            let c = cfg.get(&ws_session_id).cloned().unwrap_or_default();
                            let bypass =
                                c.permission_mode.as_deref() == Some("bypassPermissions");
                            (c.model.unwrap_or_default(), bypass, c.project_path)
                        };
                        let ws_sid = ws_session_id.clone();
                        let st = state.clone();
                        tokio::spawn(async move {
                            let result = continue_claude_command(
                                project_path,
                                prompt,
                                model,
                                bypass,
                                ws_sid.clone(),
                                st.clone(),
                            )
                            .await;
                            ws_send_completion(&st, &ws_sid, result).await;
                        });
                    }

                    // -- Interrupt ------------------------------------------
                    WsClientMessage::Interrupt {} => {
                        info!(
                            "[WS] Interrupt requested for {}",
                            ws_session_id
                        );
                        interrupt_session_process(&state, &ws_session_id).await;
                        let interrupted =
                            serde_json::to_string(&WsServerMessage::Interrupted {
                                session_id: ws_session_id.clone(),
                            })
                            .unwrap_or_default();
                        let tx = {
                            let sessions = state.active_sessions.lock().await;
                            sessions.get(&ws_session_id).cloned()
                        };
                        if let Some(tx) = tx {
                            let _ = tx.send(interrupted).await;
                        }
                    }

                    // -- RewindFiles (stub — full impl is follow-up work) ---
                    WsClientMessage::RewindFiles {
                        user_message_id,
                        dry_run,
                    } => {
                        let dry = dry_run.unwrap_or(false);
                        debug!(
                            "[WS] RewindFiles -- user_message_id: {:?}  dry_run: {}",
                            user_message_id, dry
                        );
                        let ack = serde_json::to_string(&WsServerMessage::RewindAck {
                            session_id: ws_session_id.clone(),
                            user_message_id,
                            dry_run: dry,
                        })
                        .unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(ack).await;
                        }
                    }

                    // -- SetModel -------------------------------------------
                    WsClientMessage::SetModel { model } => {
                        debug!("[WS] SetModel -- model: {}", model);
                        {
                            let mut cfg = state.session_config.lock().await;
                            let entry = cfg.entry(ws_session_id.clone()).or_default();
                            entry.model = Some(model.clone());
                        }
                        let changed = serde_json::to_string(&WsServerMessage::ModelChanged {
                            session_id: ws_session_id.clone(),
                            model,
                        })
                        .unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(changed).await;
                        }
                    }

                    // -- SetPermissionMode ----------------------------------
                    WsClientMessage::SetPermissionMode { mode } => {
                        debug!("[WS] SetPermissionMode -- mode: {}", mode);
                        {
                            let mut cfg = state.session_config.lock().await;
                            let entry = cfg.entry(ws_session_id.clone()).or_default();
                            entry.permission_mode = Some(mode.clone());
                        }
                        let changed =
                            serde_json::to_string(&WsServerMessage::PermissionModeChanged {
                                session_id: ws_session_id.clone(),
                                mode,
                            })
                            .unwrap_or_default();
                        let sessions = state.active_sessions.lock().await;
                        if let Some(tx) = sessions.get(&ws_session_id) {
                            let _ = tx.send(changed).await;
                        }
                    }

                    // -- StopTask -------------------------------------------
                    WsClientMessage::StopTask { .. } => {
                        info!("[WS] StopTask -- interrupting running process");
                        interrupt_session_process(&state, &ws_session_id).await;
                        // Connection stays open for the next turn.
                    }

                    // -- Close ----------------------------------------------
                    WsClientMessage::Close {} => {
                        info!(
                            "[WS] Close received -- cleaning up {}",
                            ws_session_id
                        );
                        interrupt_session_process(&state, &ws_session_id).await;
                        break 'outer;
                    }
                }
            }

            Message::Close(_) => {
                debug!("[WS] Protocol close frame received");
                break 'outer;
            }

            _ => {
                // Ping/Pong/Binary -- ignore silently.
            }
        }
    }

    // -- Cleanup -----------------------------------------------------------
    debug!("[WS] Message loop ended for {}", ws_session_id);
    {
        let mut sessions = state.active_sessions.lock().await;
        sessions.remove(&ws_session_id);
        debug!(
            "[WS] Session {} removed -- remaining: {}",
            ws_session_id,
            sessions.len()
        );
    }
    state
        .active_pids
        .lock()
        .await
        .remove(&ws_session_id);
    state
        .session_config
        .lock()
        .await
        .remove(&ws_session_id);

    forward_task.abort();
    debug!("[WS] Handler ended for {}", ws_session_id);
}
