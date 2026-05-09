// DDD value objects for the RuFlo swarm context.
// NOTE(v0.7-roadmap): SwarmId and ProjectPath will be used by typed IPC commands when orchestration moves to Rust.
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Newtype for swarm identifiers — prevents mixing with other string IDs
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub struct SwarmId(String);

#[allow(dead_code)]
impl SwarmId {
    pub fn new(id: impl Into<String>) -> Self {
        Self(id.into())
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SwarmId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

/// Validated project path — must exist and be within home dir
// NOTE(v0.7-roadmap): used by path-safe IPC commands once typed project-path parameters land
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProjectPath(PathBuf);

#[allow(dead_code)]
impl ProjectPath {
    /// Validate and create a ProjectPath. Returns Err if path doesn't exist
    /// or is outside the user's home directory.
    pub fn try_new(path: impl AsRef<Path>) -> Result<Self, String> {
        let path = path.as_ref();
        let canonical = std::fs::canonicalize(path)
            .map_err(|e| format!("Cannot resolve path '{}': {e}", path.display()))?;
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        if !canonical.starts_with(&home) {
            return Err(format!(
                "Project path must be within home directory (got '{}')",
                canonical.display()
            ));
        }
        Ok(Self(canonical))
    }

    pub fn as_path(&self) -> &Path {
        &self.0
    }

    pub fn to_string_lossy(&self) -> String {
        self.0.to_string_lossy().into_owned()
    }
}

impl std::fmt::Display for ProjectPath {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0.display())
    }
}
