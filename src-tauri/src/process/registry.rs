use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::process::Child;

/// Type of process being tracked
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ProcessType {
    AgentRun { agent_id: i64, agent_name: String },
    ClaudeSession { session_id: String },
}

/// Information about a running agent process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessInfo {
    pub run_id: i64,
    pub process_type: ProcessType,
    pub pid: u32,
    pub started_at: DateTime<Utc>,
    pub project_path: String,
    pub task: String,
    pub model: String,
}

/// Information about a running process with handle
pub struct ProcessHandle {
    pub info: ProcessInfo,
    pub child: Arc<Mutex<Option<Child>>>,
    pub live_output: Arc<Mutex<String>>,
}

/// Registry for tracking active agent processes
pub struct ProcessRegistry {
    pub(crate) processes: Arc<Mutex<HashMap<i64, ProcessHandle>>>, // run_id -> ProcessHandle
    next_id: Arc<Mutex<i64>>, // Auto-incrementing ID for non-agent processes
}

impl ProcessRegistry {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            next_id: Arc::new(Mutex::new(1000000)), // Start at high number to avoid conflicts
        }
    }

    /// Generate a unique ID for non-agent processes
    pub fn generate_id(&self) -> Result<i64, String> {
        let mut next_id = self.next_id.lock().map_err(|e| e.to_string())?;
        let id = *next_id;
        *next_id += 1;
        Ok(id)
    }

    /// Register a new running agent process
    pub fn register_process(
        &self,
        run_id: i64,
        agent_id: i64,
        agent_name: String,
        pid: u32,
        project_path: String,
        task: String,
        model: String,
        child: Child,
    ) -> Result<(), String> {
        let process_info = ProcessInfo {
            run_id,
            process_type: ProcessType::AgentRun {
                agent_id,
                agent_name,
            },
            pid,
            started_at: Utc::now(),
            project_path,
            task,
            model,
        };

        self.register_process_internal(run_id, process_info, child)
    }

    /// Register a new running agent process using sidecar (similar to register_process but for sidecar children)
    // NOTE(v0.7-roadmap): activate when sidecar launch mode is wired to IPC
    #[allow(dead_code)]
    pub fn register_sidecar_process(
        &self,
        run_id: i64,
        agent_id: i64,
        agent_name: String,
        pid: u32,
        project_path: String,
        task: String,
        model: String,
    ) -> Result<(), String> {
        let process_info = ProcessInfo {
            run_id,
            process_type: ProcessType::AgentRun {
                agent_id,
                agent_name,
            },
            pid,
            started_at: Utc::now(),
            project_path,
            task,
            model,
        };

        // For sidecar processes, we register without the child handle since it's managed differently
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        let process_handle = ProcessHandle {
            info: process_info,
            child: Arc::new(Mutex::new(None)), // No tokio::process::Child handle for sidecar
            live_output: Arc::new(Mutex::new(String::new())),
        };

        processes.insert(run_id, process_handle);
        Ok(())
    }

    /// Register a new Claude session (without child process - handled separately)
    pub fn register_claude_session(
        &self,
        session_id: String,
        pid: u32,
        project_path: String,
        task: String,
        model: String,
    ) -> Result<i64, String> {
        let run_id = self.generate_id()?;

        let process_info = ProcessInfo {
            run_id,
            process_type: ProcessType::ClaudeSession { session_id },
            pid,
            started_at: Utc::now(),
            project_path,
            task,
            model,
        };

        // Register without child - Claude sessions use ClaudeProcessState for process management
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        let process_handle = ProcessHandle {
            info: process_info,
            child: Arc::new(Mutex::new(None)), // No child handle for Claude sessions
            live_output: Arc::new(Mutex::new(String::new())),
        };

        processes.insert(run_id, process_handle);
        Ok(run_id)
    }

    /// Internal method to register any process
    fn register_process_internal(
        &self,
        run_id: i64,
        process_info: ProcessInfo,
        child: Child,
    ) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;

        let process_handle = ProcessHandle {
            info: process_info,
            child: Arc::new(Mutex::new(Some(child))),
            live_output: Arc::new(Mutex::new(String::new())),
        };

        processes.insert(run_id, process_handle);
        Ok(())
    }

    /// Get all running Claude sessions
    pub fn get_running_claude_sessions(&self) -> Result<Vec<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .filter_map(|handle| match &handle.info.process_type {
                ProcessType::ClaudeSession { .. } => Some(handle.info.clone()),
                _ => None,
            })
            .collect())
    }

    /// Get a specific Claude session by session ID
    pub fn get_claude_session_by_id(
        &self,
        session_id: &str,
    ) -> Result<Option<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .find(|handle| match &handle.info.process_type {
                ProcessType::ClaudeSession { session_id: sid } => sid == session_id,
                _ => false,
            })
            .map(|handle| handle.info.clone()))
    }

    /// Unregister a process (called when it completes)
    pub fn unregister_process(&self, run_id: i64) -> Result<(), String> {
        let mut processes = self.processes.lock().map_err(|e| e.to_string())?;
        processes.remove(&run_id);
        Ok(())
    }

    /// Get all running processes
    // NOTE(v0.7-roadmap): expose via IPC when generic process listing is needed
    #[allow(dead_code)]
    pub fn get_running_processes(&self) -> Result<Vec<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .map(|handle| handle.info.clone())
            .collect())
    }

    /// Get all running agent processes
    pub fn get_running_agent_processes(&self) -> Result<Vec<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes
            .values()
            .filter_map(|handle| match &handle.info.process_type {
                ProcessType::AgentRun { .. } => Some(handle.info.clone()),
                _ => None,
            })
            .collect())
    }

    /// Get a specific running process
    // NOTE(v0.7-roadmap): expose via get_agent_run_process IPC when single-process lookup is needed
    #[allow(dead_code)]
    pub fn get_process(&self, run_id: i64) -> Result<Option<ProcessInfo>, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        Ok(processes.get(&run_id).map(|handle| handle.info.clone()))
    }

    /// Check if a process is still running by trying to get its status
    // NOTE(v0.7-roadmap): used by cleanup_finished_processes; expose directly when status polling moves to Rust
    #[allow(dead_code)]
    pub async fn is_process_running(&self, run_id: i64) -> Result<bool, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;

        if let Some(handle) = processes.get(&run_id) {
            let child_arc = handle.child.clone();
            drop(processes); // Release the lock before async operation

            let mut child_guard = child_arc.lock().map_err(|e| e.to_string())?;
            if let Some(ref mut child) = child_guard.as_mut() {
                match child.try_wait() {
                    Ok(Some(_)) => {
                        // Process has exited
                        *child_guard = None;
                        Ok(false)
                    }
                    Ok(None) => {
                        // Process is still running
                        Ok(true)
                    }
                    Err(_) => {
                        // Error checking status, assume not running
                        *child_guard = None;
                        Ok(false)
                    }
                }
            } else {
                Ok(false) // No child handle
            }
        } else {
            Ok(false) // Process not found in registry
        }
    }

    /// Append to live output for a process
    pub fn append_live_output(&self, run_id: i64, output: &str) -> Result<(), String> {
        const MAX_LIVE_OUTPUT_BYTES: usize = 1024 * 1024; // 1 MB cap

        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let mut live_output = handle.live_output.lock().map_err(|e| e.to_string())?;
            live_output.push_str(output);
            live_output.push('\n');

            // Truncate from the front if the buffer exceeds the cap
            if live_output.len() > MAX_LIVE_OUTPUT_BYTES {
                let drain_to = live_output.len() - MAX_LIVE_OUTPUT_BYTES;
                // Find the next newline after the drain point to keep lines intact
                let cut = live_output[drain_to..]
                    .find('\n')
                    .map(|i| drain_to + i + 1)
                    .unwrap_or(drain_to);
                live_output.drain(..cut);
            }
        }
        Ok(())
    }

    /// Get live output for a process
    pub fn get_live_output(&self, run_id: i64) -> Result<String, String> {
        let processes = self.processes.lock().map_err(|e| e.to_string())?;
        if let Some(handle) = processes.get(&run_id) {
            let live_output = handle.live_output.lock().map_err(|e| e.to_string())?;
            Ok(live_output.clone())
        } else {
            Ok(String::new())
        }
    }

    /// Cleanup finished processes (available for periodic background cleanup tasks)
    // NOTE(v0.7-roadmap): wire to a background interval task in main.rs for automatic process reaping
    #[allow(dead_code)]
    pub async fn cleanup_finished_processes(&self) -> Result<Vec<i64>, String> {
        let mut finished_runs = Vec::new();
        let processes_lock = self.processes.clone();

        // First, identify finished processes
        {
            let processes = processes_lock.lock().map_err(|e| e.to_string())?;
            let run_ids: Vec<i64> = processes.keys().cloned().collect();
            drop(processes);

            for run_id in run_ids {
                if !self.is_process_running(run_id).await? {
                    finished_runs.push(run_id);
                }
            }
        }

        // Then remove them from the registry
        {
            let mut processes = processes_lock.lock().map_err(|e| e.to_string())?;
            for run_id in &finished_runs {
                processes.remove(run_id);
            }
        }

        Ok(finished_runs)
    }
}

impl Default for ProcessRegistry {
    fn default() -> Self {
        Self::new()
    }
}

/// Global process registry state
pub struct ProcessRegistryState(pub Arc<ProcessRegistry>);

impl Default for ProcessRegistryState {
    fn default() -> Self {
        Self(Arc::new(ProcessRegistry::new()))
    }
}
