use serde::Serialize;

#[derive(Serialize)]
pub struct SkillInfo {
    name: String,
    description: String,
}

#[derive(Serialize)]
pub struct PluginGroup {
    plugin: String,
    skills: Vec<SkillInfo>,
}

#[tauri::command]
pub fn get_skills_catalog() -> Vec<PluginGroup> {
    let home = std::env::var("HOME").unwrap_or_default();
    let plugins_file = format!("{}/.claude/plugins/installed_plugins.json", home);

    let mut catalog: Vec<PluginGroup> = Vec::new();

    let content = match std::fs::read_to_string(&plugins_file) {
        Ok(c) => c,
        Err(_) => return catalog,
    };

    let plugins: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return catalog,
    };

    if let Some(plugins_arr) = plugins.as_array() {
        for plugin in plugins_arr {
            let install_path = plugin
                .get("installPath")
                .and_then(|p| p.as_str())
                .unwrap_or_default();

            // Read plugin metadata
            let plugin_json_path = format!("{}/.claude-plugin/plugin.json", install_path);
            let plugin_meta = std::fs::read_to_string(&plugin_json_path)
                .ok()
                .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
                .unwrap_or_default();

            let plugin_name = plugin_meta
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("Unknown Plugin")
                .to_string();

            // Walk skills directories
            let skills_dir = format!("{}/skills", install_path);
            let mut skills = Vec::new();

            if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                for entry in entries.flatten() {
                    if entry.file_type().map_or(false, |t| t.is_dir()) {
                        if let Ok(skill_files) = std::fs::read_dir(entry.path()) {
                            for skill_file in skill_files.flatten() {
                                let path = skill_file.path();
                                if path.extension().map_or(false, |e| e == "md") {
                                    if let Ok(content) = std::fs::read_to_string(&path) {
                                        if let Some(info) = parse_skill_frontmatter(&content) {
                                            skills.push(info);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if !skills.is_empty() {
                catalog.push(PluginGroup {
                    plugin: plugin_name,
                    skills,
                });
            }
        }
    }

    catalog
}

fn parse_skill_frontmatter(content: &str) -> Option<SkillInfo> {
    let content = content.trim();
    if !content.starts_with("---") {
        return None;
    }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let yaml = &rest[..end];

    let parsed: serde_yaml::Value = serde_yaml::from_str(yaml).ok()?;
    let name = parsed.get("name")?.as_str()?.to_string();
    let description = parsed
        .get("description")
        .and_then(|d| d.as_str())
        .unwrap_or("")
        .to_string();

    Some(SkillInfo { name, description })
}
