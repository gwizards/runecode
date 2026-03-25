//! WSL-specific project and session functions.
//!
//! Extracted from `project.rs` to keep each module under 500 lines.
//! These functions are only compiled on Windows (`#[cfg(target_os = "windows")]`).

use std::io::Write;
use std::process::Stdio;
use std::sync::Mutex;
use std::collections::HashMap;

use super::{decode_project_path, Project, Session};

// Cache resolved UNC paths per distro — avoids 2-3 wsl.exe calls per request
#[cfg(target_os = "windows")]
static UNC_CACHE: once_cell::sync::Lazy<Mutex<HashMap<String, Option<std::path::PathBuf>>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(HashMap::new()));

/// Lists projects by reading ~/.claude/projects inside a WSL distribution.
///
/// Shells out to `wsl -d <distro>` to enumerate project directories and their
/// session files, then builds `Project` values matching the native format.
#[cfg(target_os = "windows")]
pub(super) async fn list_projects_wsl(distro: &str) -> Result<Vec<Project>, String> {
    let d = distro.to_string();
    tokio::task::spawn_blocking(move || {
        let mut projects = Vec::new();

        // PRIMARY: try UNC path first (fast, no shell overhead)
        if let Some(unc_dir) = resolve_wsl_unc_projects_dir(&d) {
            read_projects_from_dir(&unc_dir, &mut projects);
            if !projects.is_empty() {
                projects.sort_by(|a, b| match (a.most_recent_session, b.most_recent_session) {
                    (Some(a_time), Some(b_time)) => b_time.cmp(&a_time),
                    (Some(_), None) => std::cmp::Ordering::Less,
                    (None, Some(_)) => std::cmp::Ordering::Greater,
                    (None, None) => b.created_at.cmp(&a.created_at),
                });
                log::info!("UNC primary found {} projects in distro {}", projects.len(), d);
                return Ok(projects);
            }
            log::info!("UNC primary returned 0 projects, falling back to wsl -e");
        }

        // FALLBACK: use `wsl -e /bin/bash -l` with stdin piping
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
        let child = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "-e", "/bin/bash", "-l"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let output = match child {
            Ok(mut child) => {
                if let Some(ref mut stdin) = child.stdin {
                    let _ = stdin.write_all(script.as_bytes());
                }
                // Drop stdin to signal EOF
                child.stdin.take();
                child.wait_with_output()
                    .map_err(|e| format!("WSL list projects wait: {}", e))?
            }
            Err(e) => return Err(format!("WSL list projects spawn: {}", e)),
        };

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
        let mut sessions = Vec::new();
        let project_path = decode_project_path(&pid);

        // PRIMARY: try UNC path first (fast, no shell overhead)
        if let Some(unc_dir) = resolve_wsl_unc_session_dir(&d, &pid) {
            if unc_dir.exists() {
                sessions = read_sessions_from_unc_dir(&unc_dir, &pid, &project_path);
                if !sessions.is_empty() {
                    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                    log::info!(
                        "UNC primary found {} sessions for project {} in distro {}",
                        sessions.len(), pid, d
                    );
                    return Ok(sessions);
                }
            }
            log::info!("UNC primary returned 0 sessions for {}, falling back to wsl -e", pid);
        }

        // FALLBACK: use `wsl -e /bin/bash -l` with stdin piping
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

        let child = crate::claude_binary::silent_command("wsl")
            .args(["-d", &d, "-e", "/bin/bash", "-l"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn();

        let output = match child {
            Ok(mut child) => {
                if let Some(ref mut stdin) = child.stdin {
                    let _ = stdin.write_all(script.as_bytes());
                }
                // Drop stdin to signal EOF
                child.stdin.take();
                child.wait_with_output()
                    .map_err(|e| format!("WSL get_project_sessions wait: {}", e))?
            }
            Err(e) => return Err(format!("WSL get_project_sessions spawn: {}", e)),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            log::warn!("WSL get_project_sessions script exited with {}: {}", output.status, stderr);
        }

        let raw_stdout = String::from_utf8_lossy(&output.stdout);
        let stdout = raw_stdout.replace('\r', "");

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

// ---------------------------------------------------------------------------
// UNC path helpers — resolve WSL filesystem paths from Windows
// ---------------------------------------------------------------------------

/// Resolves the UNC path to ~/.claude/projects inside a WSL distro.
/// Tries multiple approaches:
/// 1. `wsl -d <distro> -- bash -c "wslpath -w ..."` (most reliable)
/// 2. `\\wsl.localhost\<distro>\...\` (Windows 11+)
/// 3. `\\wsl$\<distro>\...\` (Windows 10)
#[cfg(target_os = "windows")]
fn resolve_wsl_unc_projects_dir(distro: &str) -> Option<std::path::PathBuf> {
    // Check cache first — avoids 2-3 wsl.exe spawns on each call
    if let Ok(cache) = UNC_CACHE.lock() {
        if let Some(cached) = cache.get(distro) {
            return cached.clone();
        }
    }

    let result = resolve_wsl_unc_projects_dir_uncached(distro);

    // Store in cache
    if let Ok(mut cache) = UNC_CACHE.lock() {
        cache.insert(distro.to_string(), result.clone());
    }
    result
}

#[cfg(target_os = "windows")]
fn resolve_wsl_unc_projects_dir_uncached(distro: &str) -> Option<std::path::PathBuf> {
    // Get WSL home dir
    let home_output = crate::claude_binary::silent_command("wsl")
        .args(["-d", distro, "-e", "/bin/bash", "-c", "echo $HOME"])
        .output()
        .ok();

    let wsl_home = home_output
        .as_ref()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().replace('\r', "").to_string())
        .unwrap_or_default();

    if wsl_home.is_empty() {
        log::warn!("Could not get WSL home for distro {}", distro);
        return None;
    }

    // Try wslpath first (converts Linux path to Windows UNC path)
    let projects_linux = format!("{}/.claude/projects", wsl_home);
    let wslpath_output = crate::claude_binary::silent_command("wsl")
        .args(["-d", distro, "-e", "wslpath", "-w", &projects_linux])
        .output()
        .ok();

    if let Some(ref out) = wslpath_output {
        if out.status.success() {
            let win_path = String::from_utf8_lossy(&out.stdout).trim().replace('\r', "").to_string();
            if !win_path.is_empty() {
                let p = std::path::PathBuf::from(&win_path);
                if p.exists() {
                    log::info!("WSL UNC via wslpath: {}", win_path);
                    return Some(p);
                }
            }
        }
    }

    // Fallback: try known UNC prefixes
    let home_win = wsl_home.trim_start_matches('/').replace('/', "\\");
    let candidates = [
        format!("\\\\wsl.localhost\\{}\\{}\\.claude\\projects", distro, home_win),
        format!("\\\\wsl$\\{}\\{}\\.claude\\projects", distro, home_win),
    ];

    for c in &candidates {
        let p = std::path::PathBuf::from(c);
        log::info!("Trying UNC: {}", c);
        if p.exists() {
            return Some(p);
        }
    }

    log::warn!("No UNC path found for distro {} (home={})", distro, wsl_home);
    None
}

/// Resolves UNC path for a specific project's session directory.
#[cfg(target_os = "windows")]
fn resolve_wsl_unc_session_dir(distro: &str, project_id: &str) -> Option<std::path::PathBuf> {
    resolve_wsl_unc_projects_dir(distro).map(|p| p.join(project_id))
}

/// Reads project directories from a filesystem path.
#[cfg(target_os = "windows")]
fn read_projects_from_dir(dir: &std::path::Path, projects: &mut Vec<Project>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
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

                    let mut newest = 0u64;
                    if let Ok(files) = std::fs::read_dir(&path) {
                        for file in files.flatten() {
                            if file.path().extension().and_then(|e| e.to_str()) == Some("jsonl") {
                                if let Ok(meta) = file.path().metadata() {
                                    if let Ok(mt) = meta.modified() {
                                        let ts = mt.duration_since(std::time::SystemTime::UNIX_EPOCH)
                                            .unwrap_or_default().as_secs();
                                        if ts > newest { newest = ts; }
                                    }
                                }
                            }
                        }
                    }

                    projects.push(Project {
                        id: dir_name.to_string(),
                        path: decoded,
                        sessions: Vec::new(),
                        created_at,
                        most_recent_session: if newest > 0 { Some(newest) } else { None },
                    });
                }
            }
        }
    }
}

/// Reads sessions from a project directory.
#[cfg(target_os = "windows")]
pub(super) fn read_sessions_from_unc_dir(dir: &std::path::Path, project_id: &str, project_path: &str) -> Vec<Session> {
    let mut sessions = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
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
                // Read only first 8KB — full JSONL files can be megabytes
                // and reading them over UNC is very slow
                let first_message = std::fs::File::open(&path).ok().and_then(|f| {
                    use std::io::{BufRead, BufReader};
                    let reader = BufReader::new(f);
                    reader.lines().take(50).find_map(|line| {
                        let line = line.ok()?;
                        if line.contains("\"role\"") && line.contains("\"user\"") {
                            let start = line.find("\"content\":\"")?;
                            let after = &line[start + 11..];
                            let end = after.find('"')?;
                            let msg = &after[..end];
                            if msg.is_empty() { None } else { Some(msg.to_string()) }
                        } else {
                            None
                        }
                    })
                });
                sessions.push(Session {
                    id: session_id,
                    project_id: project_id.to_string(),
                    project_path: project_path.to_string(),
                    todo_data: None,
                    created_at,
                    first_message,
                    message_timestamp: None,
                });
            }
        }
    }
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    sessions
}
