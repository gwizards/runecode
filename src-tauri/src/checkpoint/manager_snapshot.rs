use anyhow::Result;
use log;
use std::fs;

use super::{storage, FileSnapshot, FileState, FileTracker};

/// Build file snapshots for all currently tracked + modified files.
pub(super) async fn create_file_snapshots(
    project_path: &std::path::Path,
    file_tracker: &tokio::sync::RwLock<FileTracker>,
    checkpoint_id: &str,
) -> Result<Vec<FileSnapshot>> {
    let tracker = file_tracker.read().await;
    let mut snapshots = Vec::new();

    for (rel_path, state) in &tracker.tracked_files {
        if !state.is_modified {
            continue;
        }

        let full_path = project_path.join(rel_path);

        let (content, exists, permissions, size, current_hash) = if full_path.exists() {
            let content = match fs::read_to_string(&full_path) {
                Ok(c) => c,
                Err(e) => {
                    log::warn!(
                        "Skipping unreadable file {} during snapshot: {}",
                        full_path.display(),
                        e
                    );
                    continue;
                }
            };
            let current_hash = storage::CheckpointStorage::calculate_file_hash(&content);
            let metadata = fs::metadata(&full_path)?;
            let permissions = {
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    Some(metadata.permissions().mode())
                }
                #[cfg(not(unix))]
                {
                    None
                }
            };
            (content, true, permissions, metadata.len(), current_hash)
        } else {
            (String::new(), false, None, 0, String::new())
        };

        snapshots.push(FileSnapshot {
            checkpoint_id: checkpoint_id.to_string(),
            file_path: rel_path.clone(),
            content,
            hash: current_hash,
            is_deleted: !exists,
            permissions,
            size,
        });
    }

    Ok(snapshots)
}

/// Restore a single file from its snapshot, with path-traversal protection.
pub(super) async fn restore_file_snapshot(
    project_path: &std::path::Path,
    snapshot: &FileSnapshot,
) -> Result<()> {
    use anyhow::Context;

    let full_path = project_path.join(&snapshot.file_path);

    let canonical_project = project_path
        .canonicalize()
        .context("Failed to canonicalize project path")?;

    let check_path = if full_path.exists() {
        full_path
            .canonicalize()
            .context("Failed to canonicalize file path")?
    } else if let Some(parent) = full_path.parent() {
        if parent.exists() {
            let canon_parent = parent
                .canonicalize()
                .context("Failed to canonicalize parent path")?;
            canon_parent.join(full_path.file_name().unwrap_or_default())
        } else {
            anyhow::bail!(
                "Cannot restore file outside project: {}",
                snapshot.file_path.display()
            );
        }
    } else {
        anyhow::bail!(
            "Cannot restore file outside project: {}",
            snapshot.file_path.display()
        );
    };

    if !check_path.starts_with(&canonical_project) {
        anyhow::bail!(
            "Path traversal detected — refusing to restore file outside project: {}",
            snapshot.file_path.display()
        );
    }

    if snapshot.is_deleted {
        if full_path.exists() {
            fs::remove_file(&full_path).context("Failed to delete file")?;
        }
    } else {
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).context("Failed to create parent directories")?;
        }
        fs::write(&full_path, &snapshot.content).context("Failed to write file")?;

        #[cfg(unix)]
        if let Some(mode) = snapshot.permissions {
            use std::os::unix::fs::PermissionsExt;
            let permissions = std::fs::Permissions::from_mode(mode);
            fs::set_permissions(&full_path, permissions)
                .context("Failed to set file permissions")?;
        }
    }

    Ok(())
}

/// Mark all tracked files as no longer modified.
pub(super) async fn reset_modified_flags(
    file_tracker: &tokio::sync::RwLock<FileTracker>,
) {
    let mut tracker = file_tracker.write().await;
    for (_, state) in tracker.tracked_files.iter_mut() {
        state.is_modified = false;
    }
}

/// Rebuild file tracker state from a set of restored snapshots.
pub(super) async fn rebuild_tracker_from_snapshots(
    file_tracker: &tokio::sync::RwLock<FileTracker>,
    snapshots: &[FileSnapshot],
) {
    use chrono::Utc;
    let mut tracker = file_tracker.write().await;
    tracker.tracked_files.clear();
    for snapshot in snapshots {
        if !snapshot.is_deleted {
            tracker.tracked_files.insert(
                snapshot.file_path.clone(),
                FileState {
                    last_hash: snapshot.hash.clone(),
                    is_modified: false,
                    last_modified: Utc::now(),
                    exists: true,
                },
            );
        }
    }
}
