/**
 * Shared domain types extracted from api.ts.
 * All client modules import from here to avoid duplication.
 */

/** Process type for tracking in ProcessRegistry */
export type ProcessType =
  | { AgentRun: { agent_id: number; agent_name: string } }
  | { ClaudeSession: { session_id: string } };

/** Information about a running process */
export interface ProcessInfo {
  run_id: number;
  process_type: ProcessType;
  pid: number;
  started_at: string;
  project_path: string;
  task: string;
  model: string;
}

/**
 * Represents a project in the ~/.claude/projects directory
 */
export interface Project {
  /** The project ID (derived from the directory name) */
  id: string;
  /** The original project path (decoded from the directory name) */
  path: string;
  /** List of session IDs (JSONL file names without extension) */
  sessions: string[];
  /** Unix timestamp when the project directory was created */
  created_at: number;
  /** Unix timestamp of the most recent session (if any) */
  most_recent_session?: number;
}

/**
 * Represents a session with its metadata
 */
export interface Session {
  /** The session ID (UUID) */
  id: string;
  /** The project ID this session belongs to */
  project_id: string;
  /** The project path */
  project_path: string;
  /** Optional todo data associated with this session */
  todo_data?: any;
  /** Unix timestamp when the session file was created */
  created_at: number;
  /** First user message content (if available) */
  first_message?: string;
  /** Timestamp of the first user message (if available) */
  message_timestamp?: string;
}

/**
 * Represents the settings from ~/.claude/settings.json
 */
export interface ClaudeSettings {
  [key: string]: any;
}

/**
 * Represents the Claude Code version status
 */
export interface ClaudeVersionStatus {
  /** Whether Claude Code is installed and working */
  is_installed: boolean;
  /** The version string if available */
  version?: string;
  /** The full output from the command */
  output: string;
}

/**
 * Represents a CLAUDE.md file found in the project
 */
export interface ClaudeMdFile {
  /** Relative path from the project root */
  relative_path: string;
  /** Absolute path to the file */
  absolute_path: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modified: number;
}

/**
 * Represents a file or directory entry
 */
export interface FileEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size: number;
  extension?: string;
}

/**
 * Represents a Claude installation found on the system
 */
export interface ClaudeInstallation {
  /** Full path to the Claude binary */
  path: string;
  /** Version string if available */
  version?: string;
  /** Source of discovery (e.g., "nvm", "system", "homebrew", "which") */
  source: string;
  /** Type of installation */
  installation_type: "System" | "Custom";
}

// Agent API types — aligned with Claude Code native .md agent format
export interface Agent {
  /** Slug used as filename: ~/.claude/agents/{name}.md */
  name: string;
  /** Human-readable description (from YAML frontmatter) */
  description?: string;
  /** Model override (e.g. "sonnet", "opus") */
  model?: string;
  /** Allowed tools list (from YAML frontmatter) */
  tools?: string[];
  /** Disallowed tools list (from YAML frontmatter) */
  disallowedTools?: string[];
  /** Skills list (from YAML frontmatter) */
  skills?: string[];
  /** Max turns limit (from YAML frontmatter) */
  maxTurns?: number;
  /** Permission mode override (from YAML frontmatter) */
  permissionMode?: string;
  /** Isolation mode — "worktree" for git worktree isolation */
  isolation?: string;
  /** Whether to run in background by default */
  background?: boolean;
  /** System prompt (markdown body after frontmatter) */
  system_prompt: string;
  /** Scope: "user" (~/.claude/agents/) or "project" (.claude/agents/) */
  scope?: 'user' | 'project';
  /** Full file path on disk */
  file_path?: string;
  /** Source: "sdk" if discovered by SDK, "file" if read from disk */
  source?: 'sdk' | 'file';
}

/** Legacy export format for GitHub agent browser compatibility */
export interface AgentExport {
  version: number;
  exported_at: string;
  agent: {
    name: string;
    system_prompt: string;
    description?: string;
    model: string;
  };
}

export interface GitHubAgentFile {
  name: string;
  path: string;
  download_url: string;
  size: number;
  sha: string;
}

/** @deprecated Legacy type — agent runs are now WebSocket sessions */
export interface AgentRun {
  id?: number;
  agent_id: number;
  agent_name: string;
  task: string;
  model: string;
  project_path: string;
  session_id: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

/** @deprecated Legacy type — agent run metrics are now streamed via WebSocket */
export interface AgentRunMetrics {
  duration_ms?: number;
  total_tokens?: number;
  cost_usd?: number;
  message_count?: number;
}

/** @deprecated Legacy type — agent runs are now WebSocket sessions */
export interface AgentRunWithMetrics extends AgentRun {
  metrics?: AgentRunMetrics;
  output?: string;
}

// Usage Dashboard types
export interface UsageEntry {
  project: string;
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost: number;
}

export interface ModelUsage {
  model: string;
  total_cost: number;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  session_count: number;
}

export interface DailyUsage {
  date: string;
  total_cost: number;
  total_tokens: number;
  models_used: string[];
}

export interface ProjectUsage {
  project_path: string;
  project_name: string;
  total_cost: number;
  total_tokens: number;
  session_count: number;
  last_used: string;
}

export interface UsageStats {
  total_cost: number;
  total_tokens: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  total_sessions: number;
  by_model: ModelUsage[];
  by_date: DailyUsage[];
  by_project: ProjectUsage[];
}

/**
 * Represents a checkpoint in the session timeline
 */
export interface Checkpoint {
  id: string;
  sessionId: string;
  projectId: string;
  messageIndex: number;
  timestamp: string;
  description?: string;
  parentCheckpointId?: string;
  metadata: CheckpointMetadata;
}

/**
 * Metadata associated with a checkpoint
 */
export interface CheckpointMetadata {
  totalTokens: number;
  modelUsed: string;
  userPrompt: string;
  fileChanges: number;
  snapshotSize: number;
}

/**
 * Represents a file snapshot at a checkpoint
 */
export interface FileSnapshot {
  checkpointId: string;
  filePath: string;
  content: string;
  hash: string;
  isDeleted: boolean;
  permissions?: number;
  size: number;
}

/**
 * Represents a node in the timeline tree
 */
export interface TimelineNode {
  checkpoint: Checkpoint;
  children: TimelineNode[];
  fileSnapshotIds: string[];
}

/**
 * The complete timeline for a session
 */
export interface SessionTimeline {
  sessionId: string;
  rootNode?: TimelineNode;
  currentCheckpointId?: string;
  autoCheckpointEnabled: boolean;
  checkpointStrategy: CheckpointStrategy;
  totalCheckpoints: number;
}

/**
 * Strategy for automatic checkpoint creation
 */
export type CheckpointStrategy = 'manual' | 'per_prompt' | 'per_tool_use' | 'smart';

/**
 * Result of a checkpoint operation
 */
export interface CheckpointResult {
  checkpoint: Checkpoint;
  filesProcessed: number;
  warnings: string[];
}

/**
 * Diff between two checkpoints
 */
export interface CheckpointDiff {
  fromCheckpointId: string;
  toCheckpointId: string;
  modifiedFiles: FileDiff[];
  addedFiles: string[];
  deletedFiles: string[];
  tokenDelta: number;
}

/**
 * Diff for a single file
 */
export interface FileDiff {
  path: string;
  additions: number;
  deletions: number;
  diffContent?: string;
}

/**
 * Represents an MCP server configuration
 */
export interface MCPServer {
  /** Server name/identifier */
  name: string;
  /** Transport type: "stdio" or "sse" */
  transport: string;
  /** Command to execute (for stdio) */
  command?: string;
  /** Command arguments (for stdio) */
  args: string[];
  /** Environment variables */
  env: Record<string, string>;
  /** URL endpoint (for SSE) */
  url?: string;
  /** Configuration scope: "local", "project", or "user" */
  scope: string;
  /** Whether the server is currently active */
  is_active: boolean;
  /** Server status */
  status: ServerStatus;
}

/**
 * Server status information
 */
export interface ServerStatus {
  /** Whether the server is running */
  running: boolean;
  /** Last error message if any */
  error?: string;
  /** Last checked timestamp */
  last_checked?: number;
}

/**
 * MCP configuration for project scope (.mcp.json)
 */
export interface MCPProjectConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Individual server configuration in .mcp.json
 */
export interface MCPServerConfig {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * Represents a custom slash command
 */
export interface SlashCommand {
  /** Unique identifier for the command */
  id: string;
  /** Command name (without prefix) */
  name: string;
  /** Full command with prefix (e.g., "/project:optimize") */
  full_command: string;
  /** Command scope: "project" or "user" */
  scope: string;
  /** Optional namespace (e.g., "frontend" in "/project:frontend:component") */
  namespace?: string;
  /** Path to the markdown file */
  file_path: string;
  /** Command content (markdown body) */
  content: string;
  /** Optional description from frontmatter */
  description?: string;
  /** Allowed tools from frontmatter */
  allowed_tools: string[];
  /** Whether the command has bash commands (!) */
  has_bash_commands: boolean;
  /** Whether the command has file references (@) */
  has_file_references: boolean;
  /** Whether the command uses $ARGUMENTS placeholder */
  accepts_arguments: boolean;
}

/**
 * Result of adding a server
 */
export interface AddServerResult {
  success: boolean;
  message: string;
  server_name?: string;
}

/**
 * Import result for multiple servers
 */
export interface ImportResult {
  imported_count: number;
  failed_count: number;
  servers: ImportServerResult[];
}

/**
 * Result for individual server import
 */
export interface ImportServerResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface RuFloStatus {
  installed: boolean;
  version: string | null;
  mcp_active: boolean;
  slash_command_exists: boolean;
  is_supported?: boolean;
}

export interface RuFloProjectStatus {
  initialized: boolean;
  pending: number;
  completed: number;
  blocked: number;
}

export interface RuFloAgent {
  id: string;
  name: string;
  agent_type: string;
  status: string;
  capabilities?: string[];
}

export interface RuFloSwarmStatus {
  swarm_active: boolean;
  agents: RuFloAgent[];
  memory_entries: number;
}
