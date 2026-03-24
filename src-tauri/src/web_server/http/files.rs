/// File-browsing and CLAUDE.md route handlers.

use axum::extract::Query;
use axum::response::{IntoResponse, Json};

use crate::web_server::ApiResponse;

pub async fn get_home_directory() -> impl IntoResponse {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_else(|_| "/".to_string());
    axum::Json(serde_json::json!({
        "success": true,
        "data": home,
        "error": null
    }))
}

pub async fn find_claude_md_files(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let project_path = params
        .get("projectPath")
        .or(params.get("project_path"))
        .cloned()
        .unwrap_or_default();

    let result = tokio::task::spawn_blocking(move || {
        let mut files = Vec::new();
        let home = std::env::var("HOME").unwrap_or_default();

        // Project CLAUDE.md — canonicalize and restrict to HOME
        let project_claude = format!("{}/CLAUDE.md", project_path);
        let project_path_obj = std::path::Path::new(&project_claude);
        if project_path_obj.exists() {
            if let Ok(canonical) = std::fs::canonicalize(project_path_obj) {
                let canonical_str = canonical.to_string_lossy();
                if !home.is_empty() && canonical_str.starts_with(&home) {
                    if let Ok(content) = std::fs::read_to_string(&canonical) {
                        files.push(serde_json::json!({
                            "path": canonical.to_string_lossy(),
                            "content": content,
                            "scope": "project"
                        }));
                    }
                }
            }
        }

        let user_claude = format!("{}/.claude/CLAUDE.md", home);
        if std::path::Path::new(&user_claude).exists() {
            if let Ok(content) = std::fs::read_to_string(&user_claude) {
                files.push(serde_json::json!({
                    "path": user_claude,
                    "content": content,
                    "scope": "user"
                }));
            }
        }

        files
    })
    .await
    .unwrap_or_default();

    axum::Json(serde_json::json!({
        "success": true,
        "data": result,
        "error": null
    }))
}

/// Read a CLAUDE.md file (restricted to CLAUDE.md / AGENTS.md / GEMINI.md files only).
pub async fn read_claude_md_file(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> Json<ApiResponse<String>> {
    let file_path = params
        .get("filePath")
        .or(params.get("file_path"))
        .cloned()
        .unwrap_or_default();

    let path = std::path::Path::new(&file_path);
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

    if !file_name.eq_ignore_ascii_case("CLAUDE.md")
        && !file_name.eq_ignore_ascii_case("AGENTS.md")
        && !file_name.eq_ignore_ascii_case("GEMINI.md")
    {
        return Json(ApiResponse::error(
            "Only CLAUDE.md, AGENTS.md, and GEMINI.md files can be read through this endpoint"
                .to_string(),
        ));
    }

    let result = tokio::task::spawn_blocking(move || {
        let canonical =
            crate::path_guard::require_within_home(std::path::Path::new(&file_path))
                .map_err(|e| {
                    format!(
                        "File path must be within the user's home directory: {}",
                        e
                    )
                })?;
        std::fs::read_to_string(&canonical)
            .map_err(|e| format!("Failed to read file: {}", e))
    })
    .await;

    match result {
        Ok(Ok(content)) => Json(ApiResponse::success(content)),
        Ok(Err(e)) => Json(ApiResponse::error(e)),
        Err(_) => Json(ApiResponse::error("I/O task was cancelled".to_string())),
    }
}

pub async fn save_claude_md_file_post(
    axum::Json(_body): axum::Json<serde_json::Value>,
) -> Json<ApiResponse<String>> {
    Json(ApiResponse::error(
        "Saving CLAUDE.md files is not yet available in web mode".to_string(),
    ))
}

pub async fn list_directory_contents(
    Query(params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    let dir_path = params
        .get("directoryPath")
        .or(params.get("directory_path"))
        .cloned()
        .unwrap_or_default();

    if let Err(e) =
        crate::path_guard::require_within_home(std::path::Path::new(&dir_path))
    {
        return axum::Json(serde_json::json!({
            "success": false,
            "data": null,
            "error": format!("Access denied: {e}")
        }));
    }

    let result = tokio::task::spawn_blocking(move || {
        let mut entries = Vec::new();
        if let Ok(dir) = std::fs::read_dir(&dir_path) {
            for entry in dir.flatten().take(500) {
                let path = entry.path();
                let is_dir = path.is_dir();
                let name = entry.file_name().to_string_lossy().to_string();
                entries.push(serde_json::json!({
                    "name": name,
                    "path": path.to_string_lossy(),
                    "isDirectory": is_dir,
                    "isFile": !is_dir
                }));
            }
        }
        entries
    })
    .await
    .unwrap_or_default();

    axum::Json(serde_json::json!({
        "success": true,
        "data": result,
        "error": null
    }))
}

pub async fn search_files_handler(
    Query(_params): Query<std::collections::HashMap<String, String>>,
) -> impl IntoResponse {
    axum::Json(serde_json::json!({
        "success": true,
        "data": [],
        "error": null
    }))
}
