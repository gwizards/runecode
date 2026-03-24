/// Startup-token middleware — enforces `x-startup-token` on all HTTP routes
/// except the health-check path and WebSocket upgrade paths (those have their
/// own Origin validation).

use crate::web_server::AppState;

pub async fn require_startup_token(
    axum::extract::State(state): axum::extract::State<AppState>,
    headers: axum::http::HeaderMap,
    request: axum::extract::Request,
    next: axum::middleware::Next,
) -> axum::response::Response {
    use axum::response::IntoResponse;

    let path = request.uri().path().to_owned();
    // Health check and WS upgrade paths are exempt — WS has its own Origin check.
    if path == "/api/health" || path.starts_with("/ws/") {
        return next.run(request).await;
    }
    let token = headers
        .get("x-startup-token")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if token != state.startup_secret {
        return (
            axum::http::StatusCode::UNAUTHORIZED,
            axum::Json(serde_json::json!({"error": "Unauthorized"})),
        )
            .into_response();
    }
    next.run(request).await
}
