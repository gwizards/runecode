use serde::Serialize;

use crate::claude_binary::silent_command;

#[derive(Serialize, Clone)]
pub struct DockerContainer {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub cpu: f32,
    #[serde(rename = "memMb")]
    pub mem_mb: f32,
}

#[derive(Serialize)]
pub struct DockerStats {
    pub available: bool,
    pub running: u32,
    pub total: u32,
    #[serde(rename = "totalCpu")]
    pub total_cpu: f32,
    #[serde(rename = "totalMemMb")]
    pub total_mem_mb: f32,
    pub containers: Vec<DockerContainer>,
}

/// Get Docker container stats. If wsl_distro is set, queries Docker inside WSL.
#[tauri::command]
pub async fn get_docker_stats(wsl_distro: Option<String>) -> Result<DockerStats, String> {
    tokio::task::spawn_blocking(move || {
        let empty = DockerStats {
            available: false,
            running: 0,
            total: 0,
            total_cpu: 0.0,
            total_mem_mb: 0.0,
            containers: vec![],
        };

        // Build command: either native `docker` or `wsl -d <distro> -- docker`
        let output = if let Some(ref distro) = wsl_distro {
            #[cfg(target_os = "windows")]
            {
                silent_command("wsl")
                    .args([
                        "-d",
                        distro,
                        "-e",
                        "docker",
                        "ps",
                        "-a",
                        "--format",
                        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}",
                    ])
                    .output()
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = distro;
                silent_command("docker")
                    .args([
                        "ps",
                        "-a",
                        "--format",
                        "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}",
                    ])
                    .output()
            }
        } else {
            silent_command("docker")
                .args([
                    "ps",
                    "-a",
                    "--format",
                    "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}",
                ])
                .output()
        };

        let output = match output {
            Ok(o) if o.status.success() => o,
            _ => return Ok(empty),
        };

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut containers = Vec::new();

        for line in stdout.lines() {
            let parts: Vec<&str> = line.split('\t').collect();
            if parts.len() >= 4 {
                containers.push(DockerContainer {
                    id: parts[0].to_string(),
                    name: parts[1].to_string(),
                    image: parts[2].to_string(),
                    status: parts[3].to_string(),
                    cpu: 0.0,
                    mem_mb: 0.0,
                });
            }
        }

        let running = containers
            .iter()
            .filter(|c| c.status.starts_with("Up"))
            .count() as u32;
        let total = containers.len() as u32;

        Ok(DockerStats {
            available: true,
            running,
            total,
            total_cpu: 0.0,
            total_mem_mb: 0.0,
            containers,
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// List running processes. If wsl_distro is set, queries processes inside WSL.
#[tauri::command]
pub async fn get_running_processes(
    wsl_distro: Option<String>,
) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let output = if let Some(ref distro) = wsl_distro {
            #[cfg(target_os = "windows")]
            {
                silent_command("wsl")
                    .args(["-d", distro, "-e", "ps", "aux", "--sort=-%cpu"])
                    .output()
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = distro;
                silent_command("ps")
                    .args(["aux", "--sort=-%cpu"])
                    .output()
            }
        } else {
            #[cfg(target_os = "windows")]
            {
                silent_command("tasklist")
                    .arg("/fo")
                    .arg("csv")
                    .output()
            }
            #[cfg(not(target_os = "windows"))]
            {
                silent_command("ps")
                    .args(["aux", "--sort=-%cpu"])
                    .output()
            }
        };

        match output {
            Ok(o) if o.status.success() => {
                let stdout = String::from_utf8_lossy(&o.stdout);
                let lines: Vec<&str> = stdout.lines().take(21).collect();
                let header = lines.first().copied().unwrap_or("");
                let mut processes = Vec::new();

                // Parse ps aux output into structured ProcessInfo objects
                for line in lines.iter().skip(1) {
                    let fields: Vec<&str> = line.splitn(11, char::is_whitespace).collect();
                    if fields.len() >= 11 {
                        let cpu: f64 = fields[2].parse().unwrap_or(0.0);
                        let mem: f64 = fields[3].parse().unwrap_or(0.0);
                        let rss: f64 = fields[5].parse().unwrap_or(0.0);
                        let command = fields[10].to_string();
                        processes.push(serde_json::json!({
                            "pid": fields[1].parse::<u32>().unwrap_or(0),
                            "cpu": cpu,
                            "mem": mem,
                            "rss": (rss / 1024.0),
                            "command": command,
                            "cwd": "",
                            "project": ""
                        }));
                    }
                }

                Ok(serde_json::json!({
                    "processes": processes,
                    "count": processes.len(),
                    "header": header
                }))
            }
            _ => Ok(serde_json::json!({ "processes": [], "count": 0 })),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}
