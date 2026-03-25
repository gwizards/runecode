//! WSL-specific project and session functions.
//!
//! Extracted from `project.rs` to keep each module under 500 lines.
//! These functions are only compiled on Windows (`#[cfg(target_os = "windows")]`).

use super::{decode_project_path, Project, Session};

/// Lists projects by reading ~/.claude/projects inside a WSL distribution.
///
/// Shells out to `wsl -d <distro>` to enumerate project directories and their
/// session files, then builds `Project` values matching the native format.
#[cfg(target_os = "windows")]
pub(super) async fn list_projects_wsl(distro: &str) -> Result<Vec<Project>, String> {
    let d = distro.to_string();
    tokio::task::spawn_blocking(move || {
        // Single shell invocation that outputs one line per project dir:
        //   <dir_name>|<mtime_epoch>|<session_count>|<newest_session_mtime>|<cwd_from_jsonl>
        let script = r#"
for dir in ~/.claude/projects/*/; do
  [ -d "$dir" ] || continue
  dname=$(basename "$dir")
  mtime=$(stat -c %Y "$dir" 2>/dev/null || date -r "$dir" +%s 2>/dev/null || echo 0)
  count=0; newest=0; cwd=""
  for f in "$dir"*.jsonl; do
    [ -f "$f" ] || continue
    count=$((count + 1))
    fmtime=$(stat -c %Y "$f" 2>/dev/null || date -r "$f" +%s 2>/dev/null || echo 0)
    [ "$fmtime" -gt "$newest" ] 2>/dev/null && newest=$fmtime
    if [ -z "$cwd" ]; then
      cwd=$(head -20 "$f" | grep -o '"cwd":"[^"]*"' | head -1 | sed 's/"cwd":"//;s/"$//')
    fi
  done
  echo "${dname}|${mtime}|${count}|${newest}|${cwd}"
done
"#;
        let output = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "--", "bash", "-lc", script])
            .output()
            .map_err(|e| format!("WSL list projects: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("WSL list_projects script exited with {}: {}", output.status, stderr);
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        // WSL on Windows may produce \r\n line endings; bash login shell may
        // print startup messages (nvm, conda, etc.) before our script output.
        // Strip \r and only process lines containing '|' (our delimiter).
        let stdout = raw_stdout.replace('\r', "");
        log::info!("WSL list_projects raw output ({} bytes, {} lines)",
            stdout.len(),
            stdout.lines().count());
        if stdout.len() < 500 {
            log::info!("WSL list_projects output: {:?}", &stdout);
        } else {
            log::info!("WSL list_projects first 500 chars: {:?}", &stdout[..500]);
        }
        let mut projects = Vec::new();

        for line in stdout.lines() {
            // Skip shell startup noise — our lines always contain '|'
            if !line.contains('|') {
                continue;
            }
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 4 {
                continue;
            }
            let dir_name = parts[0].trim();
            let created_at: u64 = parts[1].parse().unwrap_or(0);
            let _session_count: usize = parts[2].parse().unwrap_or(0);
            let newest_session: u64 = parts[3].parse().unwrap_or(0);
            let cwd = if parts.len() >= 5 && !parts[4].is_empty() {
                parts[4].to_string()
            } else {
                decode_project_path(dir_name)
            };

            // Build a list of session IDs (we only have the count; use empty vec)
            // The UI typically calls get_project_sessions separately for details.
            let sessions = Vec::new();

            projects.push(Project {
                id: dir_name.to_string(),
                path: cwd,
                sessions,
                created_at,
                most_recent_session: if newest_session > 0 {
                    Some(newest_session)
                } else {
                    None
                },
            });
        }

        projects.sort_by(|a, b| match (a.most_recent_session, b.most_recent_session) {
            (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
            (Some(_), None) => std::cmp::Ordering::Less,
            (None, Some(_)) => std::cmp::Ordering::Greater,
            (None, None) => b.created_at.cmp(&a.created_at),
        });

        // Fallback: if wsl.exe script returned nothing, try reading via
        // the \\wsl$\<distro>\ UNC path which Windows mounts automatically.
        if projects.is_empty() {
            log::info!("WSL script returned 0 projects, trying UNC path fallback");
            // Get the WSL home directory via wsl.exe
            let home_output = crate::claude_binary::silent_command("wsl")
                .args(["-d", &d, "--", "bash", "-lc", "echo $HOME"])
                .output()
                .ok();
            let wsl_home = home_output
                .as_ref()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().replace('\r', "").to_string())
                .unwrap_or_else(|| "/home".to_string());

            // Convert to UNC path: /home/user → \\wsl$\Ubuntu\home\user
            let unc_projects = format!(
                "\\\\wsl$\\{}{}/.claude/projects",
                d,
                wsl_home.replace('/', "\\")
            );
            log::info!("Trying UNC path: {}", unc_projects);
            let unc_path = std::path::PathBuf::from(&unc_projects);
            if unc_path.exists() {
                if let Ok(entries) = std::fs::read_dir(&unc_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_dir() {
                            if let Some(dir_name) = path.file_name().and_then(|n| n.to_str()) {
                                let decoded = decode_project_path(dir_name);
                                let created_at = path.metadata()
                                    .and_then(|m| m.modified().or(m.created()))
                                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                                    .duration_since(std::time::SystemTime::UNIX_EPOCH)
                                    .unwrap_or_default()
                                    .as_secs();
                                projects.push(Project {
                                    id: dir_name.to_string(),
                                    path: decoded,
                                    sessions: Vec::new(),
                                    created_at,
                                    most_recent_session: None,
                                });
                            }
                        }
                    }
                    projects.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                    log::info!("UNC fallback found {} projects", projects.len());
                }
            } else {
                log::warn!("UNC path does not exist: {}", unc_projects);
            }
        }

        log::info!("Found {} WSL projects in distro {}", projects.len(), d);
        Ok(projects)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Gets sessions for a project by reading JSONL files inside a WSL distribution.
#[cfg(target_os = "windows")]
pub(super) async fn get_project_sessions_wsl(
    project_id: &str,
    distro: &str,
) -> Result<Vec<Session>, String> {
    let pid = project_id.to_string();
    let d = distro.to_string();
    tokio::task::spawn_blocking(move || {
        // Output one line per .jsonl file:
        //   <session_id>|<mtime_epoch>|<first_user_message>|<message_timestamp>|<cwd>
        let script = format!(
            r#"
projdir="$HOME/.claude/projects/{pid}"
[ -d "$projdir" ] || {{ echo ""; exit 0; }}
for f in "$projdir"/*.jsonl; do
  [ -f "$f" ] || continue
  sid=$(basename "$f" .jsonl)
  mtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
  # Extract cwd and first user message from the JSONL (first 20 lines)
  cwd=$(head -20 "$f" | grep -o '"cwd":"[^"]*"' | head -1 | sed 's/"cwd":"//;s/"$//')
  msg=$(head -100 "$f" \
    | grep -v 'Caveat: The messages below' \
    | grep -v '<command-name>' \
    | grep -v '<local-command-stdout>' \
    | grep '"role"' | grep '"user"' \
    | grep -o '"content":"[^"]*"' | head -1 | sed 's/"content":"//;s/"$//')
  ts=$(head -100 "$f" \
    | grep '"role"' | grep '"user"' \
    | grep -o '"timestamp":"[^"]*"' | head -1 | sed 's/"timestamp":"//;s/"$//')
  echo "${{sid}}|${{mtime}}|${{msg}}|${{ts}}|${{cwd}}"
done
"#,
            pid = pid
        );
        let output = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "--", "bash", "-lc", &script])
            .output()
            .map_err(|e| format!("WSL get_project_sessions: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("WSL get_project_sessions script exited with {}: {}", output.status, stderr);
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let stdout = raw_stdout.replace('\r', "");
        let mut sessions = Vec::new();
        let project_path = decode_project_path(&pid);

        for line in stdout.lines() {
            // Skip empty lines and shell startup noise
            if line.is_empty() || !line.contains('|') {
                continue;
            }
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.is_empty() {
                continue;
            }
            let session_id = parts[0].trim();
            let created_at: u64 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
            let first_message = parts
                .get(2)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let message_timestamp = parts
                .get(3)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let cwd = parts
                .get(4)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .unwrap_or_else(|| project_path.clone());

            sessions.push(Session {
                id: session_id.to_string(),
                project_id: pid.clone(),
                project_path: cwd,
                todo_data: None,
                created_at,
                first_message,
                message_timestamp,
            });
        }

        // UNC fallback: if wsl.exe returned no sessions, read via \\wsl$\
        if sessions.is_empty() {
            log::info!("WSL sessions script returned 0, trying UNC fallback for {}", pid);
            let home_output = crate::claude_binary::silent_command("wsl")
                .args(["-d", &d, "--", "bash", "-lc", "echo $HOME"])
                .output()
                .ok();
            let wsl_home = home_output
                .as_ref()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().replace('\r', "").to_string())
                .unwrap_or_else(|| "/home".to_string());
            let unc_dir = format!(
                "\\\\wsl$\\{}{}/.claude/projects/{}",
                d,
                wsl_home.replace('/', "\\"),
                pid
            );
            let unc_path = std::path::PathBuf::from(&unc_dir);
            if unc_path.exists() {
                if let Ok(entries) = std::fs::read_dir(&unc_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.extension().and_then(|e| e.to_str()) == Some("jsonl") {
                            let session_id = path.file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or("unknown")
                                .to_string();
                            let created_at = path.metadata()
                                .and_then(|m| m.modified())
                                .unwrap_or(std::time::SystemTime::UNIX_EPOCH)
                                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs();
                            // Try to read first user message from the JSONL
                            let first_message = std::fs::read_to_string(&path)
                                .ok()
                                .and_then(|content| {
                                    content.lines().take(100).find_map(|line| {
                                        if line.contains("\"role\"") && line.contains("\"user\"") {
                                            // Extract content field
                                            let start = line.find("\"content\":\"")?;
                                            let after = &line[start + 11..];
                                            let end = after.find('"')?;
                                            Some(after[..end].to_string())
                                        } else {
                                            None
                                        }
                                    })
                                });
                            sessions.push(Session {
                                id: session_id,
                                project_id: pid.clone(),
                                project_path: project_path.clone(),
                                todo_data: None,
                                created_at,
                                first_message,
                                message_timestamp: None,
                            });
                        }
                    }
                    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                    log::info!("UNC fallback found {} sessions", sessions.len());
                }
            }
        }

        sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        log::info!(
            "Found {} WSL sessions for project {} in distro {}",
            sessions.len(),
            pid,
            d
        );
        Ok(sessions)
    })
    .await
    .map_err(|e| e.to_string())?
}
