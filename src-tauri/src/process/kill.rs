/// Process kill logic for the ProcessRegistry.
///
/// Split from `registry.rs` to stay within the 500-line file budget.

use log::{error, info, warn};

use super::registry::ProcessRegistry;

impl ProcessRegistry {
    /// Kill a running process with proper cleanup
    pub async fn kill_process(&self, run_id: i64) -> Result<bool, String> {
        // First check if the process exists and get its PID
        let (pid, child_arc) = {
            let processes = self.processes.lock().map_err(|e| e.to_string())?;
            if let Some(handle) = processes.get(&run_id) {
                (handle.info.pid, handle.child.clone())
            } else {
                warn!("Process {} not found in registry", run_id);
                return Ok(false); // Process not found
            }
        };

        info!(
            "Attempting graceful shutdown of process {} (PID: {})",
            run_id, pid
        );

        // Send kill signal to the process
        let kill_sent = {
            let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
            if let Some(child) = child_guard.as_mut() {
                match child.start_kill() {
                    Ok(_) => {
                        info!("Successfully sent kill signal to process {}", run_id);
                        true
                    }
                    Err(e) => {
                        error!("Failed to send kill signal to process {}: {}", run_id, e);
                        // Don't return error here, try fallback method
                        false
                    }
                }
            } else {
                warn!(
                    "No child handle available for process {} (PID: {}), attempting system kill",
                    run_id, pid
                );
                false // Process handle not available, try fallback
            }
        };

        // If direct kill didn't work, try system command as fallback
        if !kill_sent {
            info!(
                "Attempting fallback kill for process {} (PID: {})",
                run_id, pid
            );
            match self.kill_process_by_pid(run_id, pid).await {
                Ok(true) => return Ok(true),
                Ok(false) => warn!(
                    "Fallback kill also failed for process {} (PID: {})",
                    run_id, pid
                ),
                Err(e) => error!("Error during fallback kill: {}", e),
            }
            // Continue with the rest of the cleanup even if fallback failed
        }

        // Wait for the process to exit (with timeout)
        let wait_result = tokio::time::timeout(tokio::time::Duration::from_secs(5), async {
            loop {
                // Check if process has exited
                let status = {
                    let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
                    if let Some(child) = child_guard.as_mut() {
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                info!("Process {} exited with status: {:?}", run_id, status);
                                *child_guard = None; // Clear the child handle
                                Some(Ok::<(), String>(()))
                            }
                            Ok(None) => {
                                // Still running
                                None
                            }
                            Err(e) => {
                                error!("Error checking process status: {}", e);
                                Some(Err(e.to_string()))
                            }
                        }
                    } else {
                        // Process already gone
                        Some(Ok(()))
                    }
                };

                match status {
                    Some(result) => return result,
                    None => {
                        // Still running, wait a bit
                        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                    }
                }
            }
        })
        .await;

        match wait_result {
            Ok(Ok(_)) => {
                info!("Process {} exited gracefully", run_id);
            }
            Ok(Err(e)) => {
                error!("Error waiting for process {}: {}", run_id, e);
            }
            Err(_) => {
                warn!("Process {} didn't exit within 5 seconds after kill", run_id);
                // Force clear the handle
                if let Ok(mut child_guard) = child_arc.lock() {
                    *child_guard = None;
                }
                // One more attempt with system kill
                let _ = self.kill_process_by_pid(run_id, pid).await;
            }
        }

        // Remove from registry after killing
        self.unregister_process(run_id)?;

        Ok(true)
    }

    /// Kill a process by PID using system commands (fallback method)
    pub async fn kill_process_by_pid(&self, run_id: i64, pid: u32) -> Result<bool, String> {
        info!("Attempting to kill process {} by PID {}", run_id, pid);

        let kill_result = if cfg!(target_os = "windows") {
            std::process::Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .output()
        } else {
            // First try SIGTERM
            let term_result = std::process::Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .output();

            match &term_result {
                Ok(output) if output.status.success() => {
                    info!("Sent SIGTERM to PID {}", pid);
                    // Give it 2 seconds to exit gracefully.
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                    // Check if still running
                    let check_result = std::process::Command::new("kill")
                        .args(["-0", &pid.to_string()])
                        .output();

                    if let Ok(output) = check_result {
                        if output.status.success() {
                            // Still running, send SIGKILL
                            warn!(
                                "Process {} still running after SIGTERM, sending SIGKILL",
                                pid
                            );
                            std::process::Command::new("kill")
                                .args(["-KILL", &pid.to_string()])
                                .output()
                        } else {
                            term_result
                        }
                    } else {
                        term_result
                    }
                }
                _ => {
                    // SIGTERM failed, try SIGKILL directly
                    warn!("SIGTERM failed for PID {}, trying SIGKILL", pid);
                    std::process::Command::new("kill")
                        .args(["-KILL", &pid.to_string()])
                        .output()
                }
            }
        };

        match kill_result {
            Ok(output) => {
                if output.status.success() {
                    info!("Successfully killed process with PID {}", pid);
                    // Remove from registry
                    self.unregister_process(run_id)?;
                    Ok(true)
                } else {
                    let error_msg = String::from_utf8_lossy(&output.stderr);
                    warn!("Failed to kill PID {}: {}", pid, error_msg);
                    Ok(false)
                }
            }
            Err(e) => {
                error!("Failed to execute kill command for PID {}: {}", pid, e);
                Err(format!("Failed to execute kill command: {}", e))
            }
        }
    }
}
