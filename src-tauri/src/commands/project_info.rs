use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInfo {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub tech_stack: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repo_url: Option<String>,
    pub env_files: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git_branch: Option<String>,
    pub dirty_file_count: usize,
}

/// Collect project information by scanning a project directory.
/// This is used by both the web server endpoint and the Tauri IPC command.
pub fn collect_project_info(project_path: &str) -> ProjectInfo {
    let path = Path::new(project_path);

    // Default name from directory
    let mut name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    let mut description: Option<String> = None;
    let mut tech_stack: Vec<String> = Vec::new();
    let mut repo_url: Option<String> = None;
    let mut env_files: Vec<String> = Vec::new();

    // --- Scan package.json ---
    let package_json_path = path.join("package.json");
    if package_json_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&package_json_path) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(n) = pkg.get("name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                }
                if let Some(d) = pkg.get("description").and_then(|v| v.as_str()) {
                    if !d.is_empty() {
                        description = Some(d.to_string());
                    }
                }

                // Detect tech stack from dependencies
                let mut all_deps: Vec<String> = Vec::new();
                for key in &["dependencies", "devDependencies"] {
                    if let Some(deps) = pkg.get(*key).and_then(|v| v.as_object()) {
                        all_deps.extend(deps.keys().cloned());
                    }
                }

                // Framework / library detection
                let detections: &[(&[&str], &str)] = &[
                    (&["next"], "Next.js"),
                    (&["nuxt"], "Nuxt"),
                    (&["react", "react-dom"], "React"),
                    (&["vue"], "Vue"),
                    (&["svelte"], "Svelte"),
                    (&["@angular/core"], "Angular"),
                    (&["express"], "Express"),
                    (&["fastify"], "Fastify"),
                    (&["typescript"], "TypeScript"),
                    (&["tailwindcss"], "Tailwind CSS"),
                    (&["vite"], "Vite"),
                    (&["webpack"], "Webpack"),
                    (&["electron"], "Electron"),
                    (&["@tauri-apps/api", "tauri"], "Tauri"),
                    (&["prisma", "@prisma/client"], "Prisma"),
                    (&["drizzle-orm"], "Drizzle"),
                    (&["jest"], "Jest"),
                    (&["vitest"], "Vitest"),
                    (&["bun-types"], "Bun"),
                ];

                for (packages, label) in detections {
                    if packages.iter().any(|p| all_deps.contains(&p.to_string())) {
                        if !tech_stack.contains(&label.to_string()) {
                            tech_stack.push(label.to_string());
                        }
                    }
                }

                // If none of the frameworks matched but package.json exists, it's at least Node/JS
                if tech_stack.is_empty() {
                    tech_stack.push("Node.js".to_string());
                }
            }
        }
    }

    // --- Scan Cargo.toml ---
    let cargo_toml_path = path.join("Cargo.toml");
    if cargo_toml_path.exists() {
        if !tech_stack.contains(&"Rust".to_string()) {
            tech_stack.push("Rust".to_string());
        }

        if let Ok(content) = std::fs::read_to_string(&cargo_toml_path) {
            // Simple TOML parsing for name/description without adding toml crate dependency
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("name")
                    && name
                        == path
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("unknown")
                {
                    if let Some(val) = extract_toml_string_value(trimmed) {
                        name = val;
                    }
                }
                if trimmed.starts_with("description") && description.is_none() {
                    if let Some(val) = extract_toml_string_value(trimmed) {
                        description = Some(val);
                    }
                }
            }
        }
    }

    // --- Scan pyproject.toml / requirements.txt ---
    if path.join("pyproject.toml").exists() || path.join("requirements.txt").exists() {
        if !tech_stack.contains(&"Python".to_string()) {
            tech_stack.push("Python".to_string());
        }
    }

    // --- Scan go.mod ---
    if path.join("go.mod").exists() {
        if !tech_stack.contains(&"Go".to_string()) {
            tech_stack.push("Go".to_string());
        }
    }

    // --- Extract git remote URL from .git/config ---
    let git_config_path = path.join(".git/config");
    if git_config_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&git_config_path) {
            let mut in_remote_origin = false;
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed == "[remote \"origin\"]" {
                    in_remote_origin = true;
                    continue;
                }
                if trimmed.starts_with('[') {
                    in_remote_origin = false;
                    continue;
                }
                if in_remote_origin && trimmed.starts_with("url") {
                    if let Some(url) = trimmed.split('=').nth(1) {
                        let url = url.trim().to_string();
                        // Convert SSH URLs to HTTPS for display
                        let display_url = if url.starts_with("git@") {
                            url.replace("git@", "https://")
                                .replace(":", "/")
                                .trim_end_matches(".git")
                                .replace("https:///", "https://")
                                .to_string()
                        } else {
                            url.trim_end_matches(".git").to_string()
                        };
                        repo_url = Some(display_url);
                    }
                }
            }
        }
    }

    // --- Check for env files ---
    let env_candidates = [
        ".env",
        ".env.local",
        ".env.development",
        ".env.production",
        ".env.test",
    ];
    for env_file in &env_candidates {
        if path.join(env_file).exists() {
            env_files.push(env_file.to_string());
        }
    }

    // --- Git branch and dirty file count ---
    let git_branch = std::process::Command::new("git")
        .args(["-C", project_path, "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            } else {
                None
            }
        });

    let dirty_file_count = std::process::Command::new("git")
        .args(["-C", project_path, "status", "--porcelain"])
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                String::from_utf8(output.stdout)
                    .ok()
                    .map(|s| s.lines().filter(|line| !line.trim().is_empty()).count())
            } else {
                None
            }
        })
        .unwrap_or(0);

    // --- Check for .runecode/project.json overrides ---
    let override_path = path.join(".runecode/project.json");
    if override_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&override_path) {
            if let Ok(overrides) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(n) = overrides.get("name").and_then(|v| v.as_str()) {
                    name = n.to_string();
                }
                if let Some(d) = overrides.get("description").and_then(|v| v.as_str()) {
                    description = Some(d.to_string());
                }
                if let Some(stack) = overrides.get("techStack").and_then(|v| v.as_array()) {
                    let overridden: Vec<String> = stack
                        .iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect();
                    if !overridden.is_empty() {
                        tech_stack = overridden;
                    }
                }
                if let Some(url) = overrides.get("repoUrl").and_then(|v| v.as_str()) {
                    repo_url = Some(url.to_string());
                }
            }
        }
    }

    ProjectInfo {
        name,
        description,
        tech_stack,
        repo_url,
        env_files,
        git_branch,
        dirty_file_count,
    }
}

/// Tauri IPC command to get project info
#[tauri::command]
pub async fn get_project_info(path: String) -> Result<ProjectInfo, String> {
    Ok(collect_project_info(&path))
}

/// Initialize a new project by creating .runecode/project.json
#[tauri::command]
pub fn initialize_project(project_path: String, project_name: String) -> Result<(), String> {
    let runecode_dir = format!("{}/.runecode", project_path);
    std::fs::create_dir_all(&runecode_dir)
        .map_err(|e| format!("Failed to create .runecode directory: {}", e))?;

    let config = serde_json::json!({
        "name": project_name,
        "description": "",
        "techStack": [],
        "repoUrl": "",
        "entryPoints": [],
        "notes": ""
    });

    let config_path = format!("{}/project.json", runecode_dir);
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    std::fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write project.json: {}", e))?;

    Ok(())
}

/// Extract a string value from a simple TOML key = "value" line
fn extract_toml_string_value(line: &str) -> Option<String> {
    let after_eq = line.split('=').nth(1)?.trim();
    if after_eq.starts_with('"') && after_eq.ends_with('"') && after_eq.len() >= 2 {
        Some(after_eq[1..after_eq.len() - 1].to_string())
    } else {
        None
    }
}
