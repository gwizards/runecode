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
    // Canonicalize home so both paths have the same form on all platforms.
    // On Windows, canonicalize() adds \\?\ prefix; raw home_dir() does not.
    let home = home.canonicalize().unwrap_or(home);
    if !canonical.starts_with(&home) {
        bail!(
            "access denied: path is outside home directory: {}",
            canonical.display()
        );
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_require_within_home_valid_path() {
        let home = dirs::home_dir().unwrap();
        let test_path = home.join(".claude");
        // Only test if the path exists
        if test_path.exists() {
            let result = require_within_home(&test_path);
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_require_within_home_rejects_outside() {
        let result = require_within_home(&PathBuf::from("/tmp/evil"));
        // On most systems /tmp is not under $HOME
        if !dirs::home_dir()
            .map(|h| PathBuf::from("/tmp").starts_with(h))
            .unwrap_or(false)
        {
            assert!(result.is_err());
        }
    }

    #[test]
    fn test_require_within_home_rejects_traversal() {
        let home = dirs::home_dir().unwrap();
        let traversal = home.join("..").join("..").join("etc").join("passwd");
        let result = require_within_home(&traversal);
        assert!(result.is_err());
    }

    #[test]
    fn test_require_within_home_nonexistent() {
        let result = require_within_home(&PathBuf::from("/nonexistent/path/xyz"));
        assert!(result.is_err());
    }
}
