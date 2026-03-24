use anyhow::Result;
use chrono::{DateTime, TimeZone, Utc};
use log;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;

use super::{
    storage::{self, CheckpointStorage},
    Checkpoint, CheckpointMetadata, CheckpointPaths, CheckpointResult, CheckpointStrategy,
    FileTracker, SessionTimeline,
};
use super::manager_helpers::{collect_files, remove_empty_dirs};
use super::manager_metadata::{extract_checkpoint_metadata, should_trigger};
use super::manager_snapshot::{
    create_file_snapshots, rebuild_tracker_from_snapshots, reset_modified_flags,
    restore_file_snapshot,
};

/// Manages checkpoint operations for a session
pub struct CheckpointManager {
    project_id: String,
    session_id: String,
    project_path: PathBuf,
    file_tracker: Arc<RwLock<FileTracker>>,
    pub storage: Arc<CheckpointStorage>,
    timeline: Arc<RwLock<SessionTimeline>>,
    current_messages: Arc<RwLock<Vec<String>>>, // JSONL messages
}

impl CheckpointManager {
    /// Create a new checkpoint manager
    pub async fn new(
        project_id: String,
        session_id: String,
        project_path: PathBuf,
        claude_dir: PathBuf,
    ) -> Result<Self> {
        let storage = Arc::new(CheckpointStorage::new(claude_dir.clone()));
        storage.init_storage(&project_id, &session_id)?;

        let paths = CheckpointPaths::new(&claude_dir, &project_id, &session_id);
        let timeline = if paths.timeline_file.exists() {
            storage.load_timeline(&paths.timeline_file)?
        } else {
            SessionTimeline::new(session_id.clone())
        };

        Ok(Self {
            project_id,
            session_id,
            project_path,
            file_tracker: Arc::new(RwLock::new(FileTracker {
                tracked_files: HashMap::new(),
            })),
            storage,
            timeline: Arc::new(RwLock::new(timeline)),
            current_messages: Arc::new(RwLock::new(Vec::new())),
        })
    }

    /// Track a new message in the session
    pub async fn track_message(&self, jsonl_message: String) -> Result<()> {
        let mut messages = self.current_messages.write().await;
        messages.push(jsonl_message.clone());

        if let Ok(msg) = serde_json::from_str::<serde_json::Value>(&jsonl_message) {
            if let Some(content) = msg.get("message").and_then(|m| m.get("content")) {
                if let Some(content_array) = content.as_array() {
                    for item in content_array {
                        if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            if let Some(tool_name) =
                                item.get("name").and_then(|n| n.as_str())
                            {
                                if let Some(input) = item.get("input") {
                                    self.track_tool_operation(tool_name, input).await?;
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn track_tool_operation(
        &self,
        tool: &str,
        input: &serde_json::Value,
    ) -> Result<()> {
        match tool.to_lowercase().as_str() {
            "edit" | "write" | "multiedit" => {
                if let Some(file_path) = input.get("file_path").and_then(|p| p.as_str()) {
                    self.track_file_modification(file_path).await?;
                }
            }
            "bash" => {
                if let Some(command) = input.get("command").and_then(|c| c.as_str()) {
                    self.track_bash_side_effects(command).await?;
                }
            }
            _ => {}
        }
        Ok(())
    }

    /// Track a file modification (with path traversal protection)
    pub async fn track_file_modification(&self, file_path: &str) -> Result<()> {
        let mut tracker = self.file_tracker.write().await;
        let full_path = self.project_path.join(file_path);

        // Prevent path traversal
        if let Ok(canonical_project) = self.project_path.canonicalize() {
            let check_path = if full_path.exists() {
                full_path.canonicalize().ok()
            } else {
                full_path.parent().and_then(|p| p.canonicalize().ok()).map(|p| {
                    p.join(full_path.file_name().unwrap_or_default())
                })
            };
            match check_path {
                Some(resolved) if !resolved.starts_with(&canonical_project) => {
                    anyhow::bail!(
                        "Path traversal detected — refusing to track file outside project: {}",
                        file_path
                    );
                }
                None => {
                    anyhow::bail!(
                        "Cannot resolve path — refusing to track unresolvable file: {}",
                        file_path
                    );
                }
                _ => {}
            }
        }

        let (hash, exists, _size, modified) = if full_path.exists() {
            let content = match fs::read_to_string(&full_path) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!(
                        "Skipping unreadable file {} during tracking: {}",
                        full_path.display(),
                        e
                    );
                    return Ok(());
                }
            };
            let metadata = fs::metadata(&full_path)?;
            let modified = metadata
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| {
                    let secs = i64::try_from(d.as_secs())
                        .unwrap_or_else(|_| Utc::now().timestamp());
                    Utc.timestamp_opt(secs, d.subsec_nanos())
                        .single()
                        .unwrap_or_else(Utc::now)
                })
                .unwrap_or_else(Utc::now);
            (
                storage::CheckpointStorage::calculate_file_hash(&content),
                true,
                metadata.len(),
                modified,
            )
        } else {
            (String::new(), false, 0, Utc::now())
        };

        let is_modified = tracker
            .tracked_files
            .get(&PathBuf::from(file_path))
            .map(|s| s.last_hash != hash || s.exists != exists || s.is_modified)
            .unwrap_or(true);

        tracker.tracked_files.insert(
            PathBuf::from(file_path),
            super::FileState {
                last_hash: hash,
                is_modified,
                last_modified: modified,
                exists,
            },
        );

        Ok(())
    }

    async fn track_bash_side_effects(&self, command: &str) -> Result<()> {
        let file_commands = [
            "echo", "cat", "cp", "mv", "rm", "touch", "sed", "awk", "npm", "yarn",
            "pnpm", "bun", "cargo", "make", "gcc", "g++",
        ];
        if file_commands.iter().any(|c| command.contains(c)) {
            let mut tracker = self.file_tracker.write().await;
            for state in tracker.tracked_files.values_mut() {
                state.is_modified = true;
            }
        }
        Ok(())
    }

    /// Create a checkpoint
    pub async fn create_checkpoint(
        &self,
        description: Option<String>,
        parent_checkpoint_id: Option<String>,
    ) -> Result<CheckpointResult> {
        let messages = self.current_messages.read().await;
        let message_index = messages.len().saturating_sub(1);

        let (user_prompt, model_used, total_tokens) =
            extract_checkpoint_metadata(&messages).await?;

        // Walk the project and track every file
        let mut all_files = Vec::new();
        let _ = collect_files(
            self.project_path.as_path(),
            self.project_path.as_path(),
            &mut all_files,
        );
        for rel in all_files {
            if let Some(p) = rel.to_str() {
                self.track_file_modification(p).await?;
            }
        }

        let checkpoint_id = storage::CheckpointStorage::generate_checkpoint_id();
        let file_snapshots =
            create_file_snapshots(&self.project_path, &self.file_tracker, &checkpoint_id)
                .await?;

        let checkpoint = Checkpoint {
            id: checkpoint_id.clone(),
            session_id: self.session_id.clone(),
            project_id: self.project_id.clone(),
            message_index,
            timestamp: Utc::now(),
            description,
            parent_checkpoint_id: if let Some(parent_id) = parent_checkpoint_id {
                Some(parent_id)
            } else {
                self.timeline.read().await.current_checkpoint_id.clone()
            },
            metadata: CheckpointMetadata {
                total_tokens,
                model_used,
                user_prompt,
                file_changes: file_snapshots.len(),
                snapshot_size: storage::CheckpointStorage::estimate_checkpoint_size(
                    &messages.join("\n"),
                    &file_snapshots,
                ),
            },
        };

        let messages_content = messages.join("\n");
        let result = self.storage.save_checkpoint(
            &self.project_id,
            &self.session_id,
            &checkpoint,
            file_snapshots,
            &messages_content,
        )?;

        // Reload timeline from disk
        let claude_dir = self.storage.claude_dir.clone();
        let paths = CheckpointPaths::new(&claude_dir, &self.project_id, &self.session_id);
        let updated = self.storage.load_timeline(&paths.timeline_file)?;
        *self.timeline.write().await = updated;

        self.timeline.write().await.current_checkpoint_id = Some(checkpoint_id);

        reset_modified_flags(&self.file_tracker).await;

        Ok(result)
    }

    /// Restore a checkpoint
    pub async fn restore_checkpoint(&self, checkpoint_id: &str) -> Result<CheckpointResult> {
        let (checkpoint, file_snapshots, messages) = self.storage.load_checkpoint(
            &self.project_id,
            &self.session_id,
            checkpoint_id,
        )?;

        let mut current_files = Vec::new();
        let _ = collect_files(&self.project_path, &self.project_path, &mut current_files);

        let checkpoint_file_set: std::collections::HashSet<_> = file_snapshots
            .iter()
            .filter(|s| !s.is_deleted)
            .map(|s| s.file_path.clone())
            .collect();

        let mut warnings = Vec::new();
        let mut files_processed = 0;

        for current_file in current_files {
            if !checkpoint_file_set.contains(&current_file) {
                match fs::remove_file(self.project_path.join(&current_file)) {
                    Ok(_) => {
                        files_processed += 1;
                        log::info!("Deleted file not in checkpoint: {:?}", current_file);
                    }
                    Err(e) => {
                        warnings.push(format!(
                            "Failed to delete {}: {}",
                            current_file.display(),
                            e
                        ));
                    }
                }
            }
        }

        let _ = remove_empty_dirs(&self.project_path, &self.project_path);

        let mut fatal_count = 0usize;
        for snapshot in &file_snapshots {
            match restore_file_snapshot(&self.project_path, snapshot).await {
                Ok(_) => files_processed += 1,
                Err(e) => {
                    fatal_count += 1;
                    warnings.push(format!(
                        "Failed to restore {}: {}",
                        snapshot.file_path.display(),
                        e
                    ));
                }
            }
        }

        // Restore current messages
        let mut current_messages = self.current_messages.write().await;
        current_messages.clear();
        current_messages.extend(messages.lines().map(|l| l.to_string()));

        self.timeline.write().await.current_checkpoint_id =
            Some(checkpoint_id.to_string());

        rebuild_tracker_from_snapshots(&self.file_tracker, &file_snapshots).await;

        Ok(CheckpointResult {
            checkpoint: checkpoint.clone(),
            files_processed,
            warnings,
            fatal_count,
        })
    }

    /// Get the current timeline
    pub async fn get_timeline(&self) -> SessionTimeline {
        self.timeline.read().await.clone()
    }

    /// List all checkpoints
    pub async fn list_checkpoints(&self) -> Vec<Checkpoint> {
        let timeline = self.timeline.read().await;
        let mut checkpoints = Vec::new();
        if let Some(root) = &timeline.root_node {
            Self::collect_checkpoints_from_node(root, &mut checkpoints);
        }
        checkpoints
    }

    fn collect_checkpoints_from_node(
        node: &super::TimelineNode,
        checkpoints: &mut Vec<Checkpoint>,
    ) {
        checkpoints.push(node.checkpoint.clone());
        for child in &node.children {
            Self::collect_checkpoints_from_node(child, checkpoints);
        }
    }

    /// Fork from a checkpoint
    pub async fn fork_from_checkpoint(
        &self,
        checkpoint_id: &str,
        description: Option<String>,
    ) -> Result<CheckpointResult> {
        let _ = self.storage.load_checkpoint(
            &self.project_id,
            &self.session_id,
            checkpoint_id,
        )?;
        self.restore_checkpoint(checkpoint_id).await?;
        let fork_desc = description
            .unwrap_or_else(|| format!("Fork from checkpoint {}", &checkpoint_id[..8]));
        self.create_checkpoint(Some(fork_desc), Some(checkpoint_id.to_string()))
            .await
    }

    /// Check if auto-checkpoint should be triggered
    pub async fn should_auto_checkpoint(&self, message: &str) -> bool {
        let timeline = self.timeline.read().await;
        timeline.auto_checkpoint_enabled
            && should_trigger(&timeline.checkpoint_strategy, message)
    }

    /// Update checkpoint settings
    pub async fn update_settings(
        &self,
        auto_checkpoint_enabled: bool,
        checkpoint_strategy: CheckpointStrategy,
    ) -> Result<()> {
        let mut timeline = self.timeline.write().await;
        timeline.auto_checkpoint_enabled = auto_checkpoint_enabled;
        timeline.checkpoint_strategy = checkpoint_strategy;

        let claude_dir = self.storage.claude_dir.clone();
        let paths = CheckpointPaths::new(&claude_dir, &self.project_id, &self.session_id);
        self.storage.save_timeline(&paths.timeline_file, &timeline)
    }

    /// Get files modified since a given timestamp
    pub async fn get_files_modified_since(&self, since: DateTime<Utc>) -> Vec<PathBuf> {
        let tracker = self.file_tracker.read().await;
        tracker
            .tracked_files
            .iter()
            .filter(|(_, s)| s.last_modified > since && s.is_modified)
            .map(|(p, _)| p.clone())
            .collect()
    }

    /// Get the last modification time of any tracked file
    pub async fn get_last_modification_time(&self) -> Option<DateTime<Utc>> {
        let tracker = self.file_tracker.read().await;
        tracker.tracked_files.values().map(|s| s.last_modified).max()
    }
}
