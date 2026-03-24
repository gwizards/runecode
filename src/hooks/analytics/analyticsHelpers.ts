/**
 * Analytics event-tracking methods extracted from useAnalytics.
 * Each method builds an event and dispatches it via the analytics singleton.
 *
 * This module is consumed by `useTrackEvent()` in useAnalytics.ts.
 */

import { analytics, ANALYTICS_EVENTS, eventBuilders } from '@/infrastructure/analytics';

/**
 * Build the full track-event object used by useTrackEvent().
 * Kept as a plain function (not a hook) so it can be called from the
 * memoised hook without introducing extra closures.
 */
export function createTrackEventMethods() {
  return {
    // Session events
    sessionCreated: (model: string, source?: string) => {
      const event = eventBuilders.session({ model, source });
      analytics.track(event.event, event.properties);
    },
    sessionCompleted: () => { analytics.track(ANALYTICS_EVENTS.SESSION_COMPLETED); },
    sessionResumed: (checkpointId: string) => {
      const event = eventBuilders.session({ resumed: true, checkpoint_id: checkpointId });
      analytics.track(ANALYTICS_EVENTS.SESSION_RESUMED, event.properties);
    },

    // Feature usage
    featureUsed: (feature: string, subfeature?: string, metadata?: Record<string, unknown>) => {
      const event = eventBuilders.feature(feature, subfeature, metadata);
      analytics.track(event.event, event.properties);
    },

    // Model selection
    modelSelected: (newModel: string, previousModel?: string, source?: string) => {
      const event = eventBuilders.model(newModel, previousModel, source);
      analytics.track(event.event, event.properties);
    },

    // Tab events
    tabCreated: (tabType: string) => { analytics.track(ANALYTICS_EVENTS.TAB_CREATED, { tab_type: tabType }); },
    tabClosed: (tabType: string) => { analytics.track(ANALYTICS_EVENTS.TAB_CLOSED, { tab_type: tabType }); },

    // File operations
    fileOpened: (fileType: string) => { analytics.track(ANALYTICS_EVENTS.FILE_OPENED, { file_type: fileType }); },
    fileEdited: (fileType: string) => { analytics.track(ANALYTICS_EVENTS.FILE_EDITED, { file_type: fileType }); },
    fileSaved: (fileType: string) => { analytics.track(ANALYTICS_EVENTS.FILE_SAVED, { file_type: fileType }); },

    // Agent execution
    agentExecuted: (agentType: string, success: boolean, agentName?: string, durationMs?: number) => {
      const event = eventBuilders.agent(agentType, success, agentName, durationMs);
      analytics.track(event.event, event.properties);
    },

    // MCP events
    mcpServerConnected: (serverName: string, success: boolean, serverType?: string) => {
      const event = eventBuilders.mcp(serverName, success, serverType);
      analytics.track(event.event, event.properties);
    },
    mcpServerDisconnected: (serverName: string) => {
      analytics.track(ANALYTICS_EVENTS.MCP_SERVER_DISCONNECTED, { server_name: serverName });
    },

    // Slash commands
    slashCommandUsed: (command: string, success: boolean) => {
      const event = eventBuilders.slashCommand(command, success);
      analytics.track(event.event, event.properties);
    },

    // Settings
    settingsChanged: (setting: string, value: unknown) => {
      analytics.track(ANALYTICS_EVENTS.SETTINGS_CHANGED, { setting, value });
    },

    // Errors
    errorOccurred: (errorType: string, errorCode?: string, context?: string) => {
      const event = eventBuilders.error(errorType, errorCode, context);
      analytics.track(event.event, event.properties);
    },

    // Performance
    performanceMetrics: (metrics: Record<string, number>) => {
      const event = eventBuilders.performance(metrics);
      analytics.track(event.event, event.properties);
    },

    // Claude Code Session events
    promptSubmitted: (props: Parameters<typeof eventBuilders.promptSubmitted>[0]) => {
      const event = eventBuilders.promptSubmitted(props);
      analytics.track(event.event, event.properties);
    },
    sessionStopped: (props: Parameters<typeof eventBuilders.sessionStopped>[0]) => {
      const event = eventBuilders.sessionStopped(props);
      analytics.track(event.event, event.properties);
    },
    enhancedSessionStopped: (props: Parameters<typeof eventBuilders.enhancedSessionStopped>[0]) => {
      const event = eventBuilders.enhancedSessionStopped(props);
      analytics.track(event.event, event.properties);
    },
    checkpointCreated: (props: Parameters<typeof eventBuilders.checkpointCreated>[0]) => {
      const event = eventBuilders.checkpointCreated(props);
      analytics.track(event.event, event.properties);
    },
    checkpointRestored: (props: Parameters<typeof eventBuilders.checkpointRestored>[0]) => {
      const event = eventBuilders.checkpointRestored(props);
      analytics.track(event.event, event.properties);
    },
    toolExecuted: (props: Parameters<typeof eventBuilders.toolExecuted>[0]) => {
      const event = eventBuilders.toolExecuted(props);
      analytics.track(event.event, event.properties);
    },

    // Enhanced Agent events
    agentStarted: (props: Parameters<typeof eventBuilders.agentStarted>[0]) => {
      const event = eventBuilders.agentStarted(props);
      analytics.track(event.event, event.properties);
    },
    agentProgress: (props: Parameters<typeof eventBuilders.agentProgress>[0]) => {
      const event = eventBuilders.agentProgress(props);
      analytics.track(event.event, event.properties);
    },
    agentError: (props: Parameters<typeof eventBuilders.agentError>[0]) => {
      const event = eventBuilders.agentError(props);
      analytics.track(event.event, event.properties);
    },

    // MCP events (enhanced)
    mcpServerAdded: (props: Parameters<typeof eventBuilders.mcpServerAdded>[0]) => {
      const event = eventBuilders.mcpServerAdded(props);
      analytics.track(event.event, event.properties);
    },
    mcpServerRemoved: (props: Parameters<typeof eventBuilders.mcpServerRemoved>[0]) => {
      const event = eventBuilders.mcpServerRemoved(props);
      analytics.track(event.event, event.properties);
    },
    mcpToolInvoked: (props: Parameters<typeof eventBuilders.mcpToolInvoked>[0]) => {
      const event = eventBuilders.mcpToolInvoked(props);
      analytics.track(event.event, event.properties);
    },
    mcpConnectionError: (props: Parameters<typeof eventBuilders.mcpConnectionError>[0]) => {
      const event = eventBuilders.mcpConnectionError(props);
      analytics.track(event.event, event.properties);
    },

    // Slash Command events (enhanced)
    slashCommandSelected: (props: Parameters<typeof eventBuilders.slashCommandSelected>[0]) => {
      const event = eventBuilders.slashCommandSelected(props);
      analytics.track(event.event, event.properties);
    },
    slashCommandExecuted: (props: Parameters<typeof eventBuilders.slashCommandExecuted>[0]) => {
      const event = eventBuilders.slashCommandExecuted(props);
      analytics.track(event.event, event.properties);
    },
    slashCommandCreated: (props: Parameters<typeof eventBuilders.slashCommandCreated>[0]) => {
      const event = eventBuilders.slashCommandCreated(props);
      analytics.track(event.event, event.properties);
    },

    // Error and Performance events
    apiError: (props: Parameters<typeof eventBuilders.apiError>[0]) => {
      const event = eventBuilders.apiError(props);
      analytics.track(event.event, event.properties);
    },
    uiError: (props: Parameters<typeof eventBuilders.uiError>[0]) => {
      const event = eventBuilders.uiError(props);
      analytics.track(event.event, event.properties);
    },
    performanceBottleneck: (props: Parameters<typeof eventBuilders.performanceBottleneck>[0]) => {
      const event = eventBuilders.performanceBottleneck(props);
      analytics.track(event.event, event.properties);
    },
    memoryWarning: (props: Parameters<typeof eventBuilders.memoryWarning>[0]) => {
      const event = eventBuilders.memoryWarning(props);
      analytics.track(event.event, event.properties);
    },

    // User journey events
    journeyMilestone: (props: Parameters<typeof eventBuilders.journeyMilestone>[0]) => {
      const event = eventBuilders.journeyMilestone(props);
      analytics.track(event.event, event.properties);
    },

    // Enhanced tracking methods
    enhancedPromptSubmitted: (props: Parameters<typeof eventBuilders.enhancedPromptSubmitted>[0]) => {
      const event = eventBuilders.enhancedPromptSubmitted(props);
      analytics.track(event.event, event.properties);
    },
    enhancedToolExecuted: (props: Parameters<typeof eventBuilders.enhancedToolExecuted>[0]) => {
      const event = eventBuilders.enhancedToolExecuted(props);
      analytics.track(event.event, event.properties);
    },
    enhancedError: (props: Parameters<typeof eventBuilders.enhancedError>[0]) => {
      const event = eventBuilders.enhancedError(props);
      analytics.track(event.event, event.properties);
    },

    // Session engagement
    sessionEngagement: (props: Parameters<typeof eventBuilders.sessionEngagement>[0]) => {
      const event = eventBuilders.sessionEngagement(props);
      analytics.track(event.event, event.properties);
    },

    // Feature discovery and adoption
    featureDiscovered: (props: Parameters<typeof eventBuilders.featureDiscovered>[0]) => {
      const event = eventBuilders.featureDiscovered(props);
      analytics.track(event.event, event.properties);
    },
    featureAdopted: (props: Parameters<typeof eventBuilders.featureAdopted>[0]) => {
      const event = eventBuilders.featureAdopted(props);
      analytics.track(event.event, event.properties);
    },
    featureCombination: (props: Parameters<typeof eventBuilders.featureCombination>[0]) => {
      const event = eventBuilders.featureCombination(props);
      analytics.track(event.event, event.properties);
    },

    // Quality metrics
    outputRegenerated: (props: Parameters<typeof eventBuilders.outputRegenerated>[0]) => {
      const event = eventBuilders.outputRegenerated(props);
      analytics.track(event.event, event.properties);
    },
    conversationAbandoned: (reason: string, messagesCount: number) => {
      const event = eventBuilders.conversationAbandoned(reason, messagesCount);
      analytics.track(event.event, event.properties);
    },
    suggestionAccepted: (props: Parameters<typeof eventBuilders.suggestionAccepted>[0]) => {
      const event = eventBuilders.suggestionAccepted(props);
      analytics.track(event.event, event.properties);
    },
    suggestionRejected: (props: Parameters<typeof eventBuilders.suggestionRejected>[0]) => {
      const event = eventBuilders.suggestionRejected(props);
      analytics.track(event.event, event.properties);
    },

    // AI interactions
    aiInteraction: (props: Parameters<typeof eventBuilders.aiInteraction>[0]) => {
      const event = eventBuilders.aiInteraction(props);
      analytics.track(event.event, event.properties);
    },
    promptPattern: (props: Parameters<typeof eventBuilders.promptPattern>[0]) => {
      const event = eventBuilders.promptPattern(props);
      analytics.track(event.event, event.properties);
    },

    // Workflow tracking
    workflowStarted: (props: Parameters<typeof eventBuilders.workflowStarted>[0]) => {
      const event = eventBuilders.workflowStarted(props);
      analytics.track(event.event, event.properties);
    },
    workflowCompleted: (props: Parameters<typeof eventBuilders.workflowCompleted>[0]) => {
      const event = eventBuilders.workflowCompleted(props);
      analytics.track(event.event, event.properties);
    },
    workflowAbandoned: (props: Parameters<typeof eventBuilders.workflowAbandoned>[0]) => {
      const event = eventBuilders.workflowAbandoned(props);
      analytics.track(event.event, event.properties);
    },

    // Network performance
    networkPerformance: (props: Parameters<typeof eventBuilders.networkPerformance>[0]) => {
      const event = eventBuilders.networkPerformance(props);
      analytics.track(event.event, event.properties);
    },
    networkFailure: (props: Parameters<typeof eventBuilders.networkFailure>[0]) => {
      const event = eventBuilders.networkFailure(props);
      analytics.track(event.event, event.properties);
    },

    // Resource usage
    resourceUsageHigh: (props: Parameters<typeof eventBuilders.resourceUsageHigh>[0]) => {
      const event = eventBuilders.resourceUsageHigh(props);
      analytics.track(event.event, event.properties);
    },
    resourceUsageSampled: (props: Parameters<typeof eventBuilders.resourceUsageSampled>[0]) => {
      const event = eventBuilders.resourceUsageSampled(props);
      analytics.track(event.event, event.properties);
    },
  };
}
