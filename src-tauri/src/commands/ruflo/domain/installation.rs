use serde::{Deserialize, Serialize};
use std::fmt;

/// Semantic version value object for the RuFlo CLI.
/// Parsed from strings like "3.5.42" or "v3.5.42".
#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
pub struct RuFloVersion {
    pub major: u32,
    pub minor: u32,
    pub patch: u32,
}

impl RuFloVersion {
    pub fn parse(s: &str) -> Option<Self> {
        let s = s.trim().trim_start_matches('v');
        let mut parts = s.split('.');
        let major = parts.next()?.parse().ok()?;
        let minor = parts.next()?.parse().ok()?;
        let patch = parts.next()?.parse().ok()?;
        Some(Self { major, minor, patch })
    }

    pub fn is_at_least(&self, major: u32, minor: u32, patch: u32) -> bool {
        *self >= Self { major, minor, patch }
    }

    /// Minimum supported version for full feature compatibility
    pub fn minimum_supported() -> Self {
        Self { major: 3, minor: 0, patch: 0 }
    }

    pub fn is_supported(&self) -> bool {
        self.is_at_least(
            Self::minimum_supported().major,
            Self::minimum_supported().minor,
            Self::minimum_supported().patch,
        )
    }
}

impl fmt::Display for RuFloVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

// Manual Serialize/Deserialize to/from string so JSON representation is "3.5.42"
impl Serialize for RuFloVersion {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for RuFloVersion {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = String::deserialize(d)?;
        Self::parse(&raw).ok_or_else(|| {
            serde::de::Error::custom(format!("invalid version string: {raw}"))
        })
    }
}

/// The RuFlo installation aggregate.
/// Represents the installed state of the claude-flow CLI.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuFloStatus {
    pub installed: bool,
    pub version: Option<String>,
    pub mcp_active: bool,
    pub slash_command_exists: bool,
    /// True if version >= 3.0.0 (minimum supported), false if unknown or too old
    #[serde(default)]
    pub is_supported: bool,
}

impl RuFloStatus {
    /// Build a fully-populated status, computing derived fields.
    pub fn build(
        installed: bool,
        version: Option<String>,
        mcp_active: bool,
        slash_command_exists: bool,
    ) -> Self {
        let is_supported = version
            .as_deref()
            .and_then(RuFloVersion::parse)
            .map(|v| v.is_supported())
            .unwrap_or(false);
        Self { installed, version, mcp_active, slash_command_exists, is_supported }
    }

    /// Parse the version string into a typed value object, if present.
    #[allow(dead_code)]
    pub fn parsed_version(&self) -> Option<RuFloVersion> {
        self.version.as_deref().and_then(RuFloVersion::parse)
    }

    /// True if installed with a supported version (>= 3.0.0)
    #[allow(dead_code)]
    pub fn is_fully_operational(&self) -> bool {
        if !self.installed {
            return false;
        }
        match self.parsed_version() {
            Some(v) => v.is_supported(),
            None => false, // installed but version unknown — treat as unsupported
        }
    }

    /// True if MCP is ready (installed + mcp active)
    #[allow(dead_code)]
    pub fn is_mcp_ready(&self) -> bool {
        self.installed && self.mcp_active
    }

    /// True if fully set up (installed + mcp + slash command)
    #[allow(dead_code)]
    pub fn is_fully_configured(&self) -> bool {
        self.installed && self.mcp_active && self.slash_command_exists
    }
}
