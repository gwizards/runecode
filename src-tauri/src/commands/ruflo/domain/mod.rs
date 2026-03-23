pub mod agent;
pub mod capabilities;
pub mod events;
pub mod installation;
pub mod memory;
pub mod project;
pub mod swarm;
pub mod value_objects;

// Re-export only what command handlers actually consume.
// Domain types used exclusively within their own modules are accessed via
// their full path (e.g. domain::agent::AgentType) to avoid dead-import warnings.
pub use agent::{AgentStatus, RuFloAgent};
pub use installation::RuFloStatus;
pub use project::RuFloProjectStatus;
pub use swarm::RuFloSwarmStatus;
