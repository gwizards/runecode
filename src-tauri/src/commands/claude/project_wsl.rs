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
  mtime=$(stat -c %Y "$dir" 2>/dev/null || echo 0)
  count=0; newest=0; cwd=""
  for f in "$dir"*.jsonl; do
    [ -f "$f" ] || continue
    count=$((count + 1))
    fmtime=$(stat -c %Y "$f" 2>/dev/null || echo 0)
    [ "$fmtime" -gt "$newest" ] && newest=$fmtime
    if [ -z "$cwd" ]; then
      cwd=$(head -20 "$f" | grep -oP '"cwd"\s*:\s*"\K[^"]+' | head -1)
    fi
  done
  echo "${dname}|${mtime}|${count}|${newest}|${cwd}"
done
"#;
        let output = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "--", "bash", "-lc", script])
            .output()
            .map_err(|e| format!("WSL list projects: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut projects = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.len() < 4 {
                continue;
            }
            let dir_name = parts[0];
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
  cwd=$(head -20 "$f" | grep -oP '"cwd"\s*:\s*"\K[^"]+' | head -1)
  msg=$(head -100 "$f" \
    | grep -v 'Caveat: The messages below' \
    | grep -v '<command-name>' \
    | grep -v '<local-command-stdout>' \
    | grep '"role"' | grep '"user"' \
    | grep -oP '"content"\s*:\s*"\K[^"]+' \
    | head -1)
  ts=$(head -100 "$f" \
    | grep '"role"' | grep '"user"' \
    | grep -oP '"timestamp"\s*:\s*"\K[^"]+' \
    | head -1)
  echo "${{sid}}|${{mtime}}|${{msg}}|${{ts}}|${{cwd}}"
done
"#,
            pid = pid
        );
        let output = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "--", "bash", "-lc", &script])
            .output()
            .map_err(|e| format!("WSL get_project_sessions: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut sessions = Vec::new();
        let project_path = decode_project_path(&pid);

        for line in stdout.lines() {
            if line.is_empty() {
                continue;
            }
            let parts: Vec<&str> = line.splitn(5, '|').collect();
            if parts.is_empty() {
                continue;
            }
            let session_id = parts[0];
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
