//! Path traversal protection — ensures paths stay within the user's home directory.

use std::path::{Path, PathBuf};
use anyhow::{bail, Context, Result};

/// Resolves `path` to its canonical form and verifies it is within the user's
/// home directory. Returns the canonical path on success.
///
/// Rejects:
/// - Paths outside `$HOME`
/// - Symlinks that escape `$HOME` (canonicalize resolves them first)
/// - Non-existent paths (canonicalize fails)
pub fn require_within_home(path: &Path) -> Result<PathBuf> {
    let canonical = path
        .canonicalize()
        .with_context(|| format!("path does not exist or is not accessible: {}", path.display()))?;
    let home = dirs::home_dir().context("cannot determine home directory")?;
    if !canonical.starts_with(&home) {
        bail!(
            "access denied: path is outside home directory: {}",
            canonical.display()
        );
    }
    Ok(canonical)
}
