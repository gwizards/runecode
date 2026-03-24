/// Recursively collect all file paths relative to `base` from `dir`,
/// skipping hidden directories (e.g. `.git`).
pub(super) fn collect_files(
    dir: &std::path::Path,
    base: &std::path::Path,
    files: &mut Vec<std::path::PathBuf>,
) -> Result<(), std::io::Error> {
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            // Skip hidden directories like .git
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with('.') {
                    continue;
                }
            }
            collect_files(&path, base, files)?;
        } else if path.is_file() {
            // Compute relative path from project root
            if let Ok(rel) = path.strip_prefix(base) {
                files.push(rel.to_path_buf());
            }
        }
    }
    Ok(())
}

/// Recursively remove empty directories under `dir`, stopping at `base`.
/// Returns `true` if the directory itself was removed (i.e. was empty).
pub(super) fn remove_empty_dirs(
    dir: &std::path::Path,
    base: &std::path::Path,
) -> Result<bool, std::io::Error> {
    if dir == base {
        return Ok(false); // Don't remove the base directory
    }

    let mut is_empty = true;
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            if !remove_empty_dirs(&path, base)? {
                is_empty = false;
            }
        } else {
            is_empty = false;
        }
    }

    if is_empty {
        std::fs::remove_dir(dir)?;
        Ok(true)
    } else {
        Ok(false)
    }
}
