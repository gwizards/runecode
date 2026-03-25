// @deprecated — use src/domain/analytics instead

import type { EventName } from './types';

export const ANALYTICS_EVENTS = {
  // Session events
  SESSION_CREATED: 'session_created' as EventName,
  SESSION_COMPLETED: 'session_completed' as EventName,
  SESSION_RESUMED: 'session_resumed' as EventName,
  PROMPT_SUBMITTED: 'prompt_submitted' as EventName,
  SESSION_STOPPED: 'session_stopped' as EventName,
  CHECKPOINT_CREATED: 'checkpoint_created' as EventName,
  CHECKPOINT_RESTORED: 'checkpoint_restored' as EventName,
  TOOL_EXECUTED: 'tool_executed' as EventName,
  // Feature usage events
  FEATURE_USED: 'feature_used' as EventName,
  MODEL_SELECTED: 'model_selected' as EventName,
  TAB_CREATED: 'tab_created' as EventName,
  TAB_CLOSED: 'tab_closed' as EventName,
  FILE_OPENED: 'file_opened' as EventName,
  FILE_EDITED: 'file_edited' as EventName,
  FILE_SAVED: 'file_saved' as EventName,
  // Agent events
  AGENT_EXECUTED: 'agent_executed' as EventName,
  AGENT_STARTED: 'agent_started' as EventName,
  AGENT_PROGRESS: 'agent_progress' as EventName,
  AGENT_ERROR: 'agent_error' as EventName,
  // MCP events
  MCP_SERVER_CONNECTED: 'mcp_server_connected' as EventName,
  MCP_SERVER_DISCONNECTED: 'mcp_server_disconnected' as EventName,
  MCP_SERVER_ADDED: 'mcp_server_added' as EventName,
  MCP_SERVER_REMOVED: 'mcp_server_removed' as EventName,
  MCP_TOOL_INVOKED: 'mcp_tool_invoked' as EventName,
  MCP_CONNECTION_ERROR: 'mcp_connection_error' as EventName,
  // Slash command events
  SLASH_COMMAND_USED: 'slash_command_used' as EventName,
  SLASH_COMMAND_SELECTED: 'slash_command_selected' as EventName,
  SLASH_COMMAND_EXECUTED: 'slash_command_executed' as EventName,
  SLASH_COMMAND_CREATED: 'slash_command_created' as EventName,
  // Settings and system events
  SETTINGS_CHANGED: 'settings_changed' as EventName,
  APP_STARTED: 'app_started' as EventName,
  APP_CLOSED: 'app_closed' as EventName,
  // Error and performance events
  ERROR_OCCURRED: 'error_occurred' as EventName,
  API_ERROR: 'api_error' as EventName,
  UI_ERROR: 'ui_error' as EventName,
  PERFORMANCE_BOTTLENECK: 'performance_bottleneck' as EventName,
  MEMORY_WARNING: 'memory_warning' as EventName,
  // User journey events
  JOURNEY_MILESTONE: 'journey_milestone' as EventName,
  USER_RETENTION: 'user_retention' as EventName,
  // AI interaction events
  AI_INTERACTION: 'ai_interaction' as EventName,
  PROMPT_PATTERN: 'prompt_pattern' as EventName,
  // Quality events
  OUTPUT_REGENERATED: 'output_regenerated' as EventName,
  CONVERSATION_ABANDONED: 'conversation_abandoned' as EventName,
  SUGGESTION_ACCEPTED: 'suggestion_accepted' as EventName,
  SUGGESTION_REJECTED: 'suggestion_rejected' as EventName,
  // Workflow events
  WORKFLOW_STARTED: 'workflow_started' as EventName,
  WORKFLOW_COMPLETED: 'workflow_completed' as EventName,
  WORKFLOW_ABANDONED: 'workflow_abandoned' as EventName,
  // Feature adoption events
  FEATURE_DISCOVERED: 'feature_discovered' as EventName,
  FEATURE_ADOPTED: 'feature_adopted' as EventName,
  FEATURE_COMBINATION: 'feature_combination' as EventName,
  // Resource usage events
  RESOURCE_USAGE_HIGH: 'resource_usage_high' as EventName,
  RESOURCE_USAGE_SAMPLED: 'resource_usage_sampled' as EventName,
  // Network performance events
  NETWORK_PERFORMANCE: 'network_performance' as EventName,
  NETWORK_FAILURE: 'network_failure' as EventName,
  // Engagement events
  SESSION_ENGAGEMENT: 'session_engagement' as EventName,
} as const;

// Sanitization helpers to remove PII
export const sanitizers = {
  sanitizeFilePath: (path: string): string => {
    const ext = path.split('.').pop();
    return ext ? `*.${ext}` : 'unknown';
  },
  sanitizeProjectPath: (_path: string): string => 'project',
  sanitizeErrorMessage: (message: string): string => {
    message = message.replace(/\/[\w\-\/\.]+/g, '/***');
    message = message.replace(/[a-zA-Z0-9]{20,}/g, '***');
    message = message.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '***@***.***');
    return message;
  },
  sanitizeAgentName: (name: string): string => name.split('-')[0] || 'custom',
  sanitizeToolName: (name: string): string => name.replace(/\/[\w\-\/\.]+/g, '').toLowerCase(),
  sanitizeServerName: (name: string): string => name.split(/[\-_]/)[0] || 'custom',
  sanitizeCommandName: (name: string): string => name.replace(/^custom-/, '').split('-')[0] || 'custom',
  sanitizeEndpoint: (endpoint: string): string =>
    endpoint.replace(/\/\d+/g, '/:id').replace(/\/[\w\-]{20,}/g, '/:id'),
};

// Re-export event builders from split module
export { eventBuilders } from './event-builders';
