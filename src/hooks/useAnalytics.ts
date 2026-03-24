/**
 * Analytics hooks for tracking user behaviour and app performance.
 *
 * The bulk of the event-method definitions are in
 * `analytics/analyticsHelpers.ts`; this file exposes the React hooks that
 * wrap them.
 */

import { useCallback, useEffect, useRef } from 'react';
import { analytics, ANALYTICS_EVENTS } from '@/infrastructure/analytics';
import type { EventName } from '@/infrastructure/analytics';
import { createTrackEventMethods } from './analytics/analyticsHelpers';

// Screen name mapping for tab types
const TAB_SCREEN_NAMES: Record<string, string> = {
  'chat': 'chat_session',
  'agent': 'agent_view',
  'projects': 'projects_list',
  'usage': 'usage_dashboard',
  'mcp': 'mcp_manager',
  'settings': 'settings',
  'claude-md': 'markdown_editor',
  'claude-file': 'file_editor',
  'agent-execution': 'agent_execution',
  'create-agent': 'create_agent',
  'import-agent': 'import_agent',
};

interface UseAnalyticsReturn {
  track: (eventName: EventName | string, properties?: Record<string, unknown>) => void;
  trackEvent: ReturnType<typeof useTrackEvent>;
  isEnabled: boolean;
  hasConsented: boolean;
}

export function useAnalytics(): UseAnalyticsReturn {
  const isEnabled = analytics.isEnabled();
  const hasConsented = analytics.hasConsented();

  const track = useCallback((eventName: EventName | string, properties?: Record<string, unknown>) => {
    analytics.track(eventName, properties);
  }, []);

  const trackEvent = useTrackEvent();

  return { track, trackEvent, isEnabled, hasConsented };
}

/**
 * Returns a stable object whose methods each fire one analytics event.
 * The methods are defined in `analyticsHelpers.ts` to keep this hook small.
 */
export function useTrackEvent() {
  return createTrackEventMethods();
}

export function usePageView(pageName: string, properties?: Record<string, unknown>) {
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!hasTracked.current && analytics.isEnabled()) {
      analytics.track('$pageview', { page_name: pageName, ...properties });
      hasTracked.current = true;
    }
  }, [pageName, properties]);
}

export function useAppLifecycle() {
  useEffect(() => {
    analytics.track(ANALYTICS_EVENTS.APP_STARTED);
    const handleUnload = () => { analytics.track(ANALYTICS_EVENTS.APP_CLOSED); analytics.shutdown(); };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, []);
}

export function useComponentMetrics(componentName: string) {
  const mountTime = useRef(Date.now());
  const renderCount = useRef(0);

  useEffect(() => { renderCount.current += 1; });

  useEffect(() => {
    return () => {
      const lifetime = Date.now() - mountTime.current;
      analytics.track('component_metrics', {
        component: componentName,
        lifetime_ms: lifetime,
        render_count: renderCount.current,
      });
    };
  }, [componentName]);
}

export function useInteractionTracking(interactionType: string) {
  return useCallback((details?: Record<string, unknown>) => {
    analytics.track('user_interaction', { interaction_type: interactionType, ...details });
  }, [interactionType]);
}

export function useScreenTracking(tabType?: string, tabId?: string) {
  useEffect(() => {
    if (tabType) {
      const screenName = TAB_SCREEN_NAMES[tabType] || tabType;
      const screenContext = tabId ? `${screenName}/${tabId.substring(0, 8)}` : screenName;
      analytics.setScreen(screenContext);
    }
  }, [tabType, tabId]);
}

export { TAB_SCREEN_NAMES };

export function useFeatureExperiment(featureName: string, variant: string) {
  useEffect(() => {
    analytics.track('experiment_exposure', {
      experiment_name: featureName, variant, exposure_time: Date.now(),
    });
  }, [featureName, variant]);

  const trackConversion = useCallback((conversionType: string) => {
    analytics.track('experiment_conversion', {
      experiment_name: featureName, variant, conversion_type: conversionType,
    });
  }, [featureName, variant]);

  return { trackConversion };
}

export function usePathTracking(pathname: string) {
  const previousPath = useRef<string>('');
  useEffect(() => {
    if (previousPath.current && previousPath.current !== pathname) {
      analytics.track('path_transition', {
        from: previousPath.current, to: pathname, transition_type: 'navigation',
      });
    }
    previousPath.current = pathname;
  }, [pathname]);
}

export function useFeatureAdoptionTracking(featureName: string) {
  const startTime = useRef<number>(Date.now());
  const usageCount = useRef<number>(0);
  const trackEvent = useTrackEvent();

  const trackUsage = useCallback(() => {
    usageCount.current += 1;
    if (usageCount.current === 1) {
      trackEvent.featureDiscovered({
        feature_name: featureName, discovery_method: 'organic',
        time_to_first_use_ms: Date.now() - startTime.current, initial_success: true,
      });
    }
    if (usageCount.current === 5) {
      const daysSinceFirst = (Date.now() - startTime.current) / (1000 * 60 * 60 * 24);
      trackEvent.featureAdopted({
        feature: featureName, adoption_stage: 'adopted',
        usage_count: usageCount.current, days_since_first_use: daysSinceFirst,
        usage_trend: 'increasing',
      });
    }
  }, [featureName, trackEvent]);

  return { trackUsage, usageCount: usageCount.current };
}

export function useWorkflowTracking(workflowType: string) {
  const startTime = useRef<number | null>(null);
  const stepsCompleted = useRef<number>(0);
  const toolsUsed = useRef<Set<string>>(new Set());
  const interruptions = useRef<number>(0);
  const trackEvent = useTrackEvent();

  const startWorkflow = useCallback((totalSteps: number) => {
    startTime.current = Date.now();
    stepsCompleted.current = 0; toolsUsed.current.clear(); interruptions.current = 0;
    trackEvent.workflowStarted({
      workflow_type: workflowType, steps_completed: 0, total_steps: totalSteps,
      duration_ms: 0, interruptions: 0, completion_rate: 0, tools_used: [],
    });
  }, [workflowType, trackEvent]);

  const trackStep = useCallback((toolName?: string) => {
    stepsCompleted.current += 1;
    if (toolName) toolsUsed.current.add(toolName);
  }, []);

  const trackInterruption = useCallback(() => { interruptions.current += 1; }, []);

  const completeWorkflow = useCallback((totalSteps: number, success = true) => {
    if (!startTime.current) return;
    const duration = Date.now() - startTime.current;
    const completionRate = stepsCompleted.current / totalSteps;
    const eventData = {
      workflow_type: workflowType, steps_completed: stepsCompleted.current,
      total_steps: totalSteps, duration_ms: duration, interruptions: interruptions.current,
      completion_rate: completionRate, tools_used: Array.from(toolsUsed.current),
    };
    if (success) trackEvent.workflowCompleted(eventData);
    else trackEvent.workflowAbandoned(eventData);
    startTime.current = null;
  }, [workflowType, trackEvent]);

  return { startWorkflow, trackStep, trackInterruption, completeWorkflow };
}

export function useAIInteractionTracking(model: string) {
  const interactionStart = useRef<number | null>(null);
  const contextSwitches = useRef<number>(0);
  const clarificationRequests = useRef<number>(0);
  const trackEvent = useTrackEvent();

  const startInteraction = useCallback(() => {
    interactionStart.current = Date.now();
    contextSwitches.current = 0; clarificationRequests.current = 0;
  }, []);

  const trackContextSwitch = useCallback(() => { contextSwitches.current += 1; }, []);
  const trackClarificationRequest = useCallback(() => { clarificationRequests.current += 1; }, []);

  const completeInteraction = useCallback((
    requestTokens: number, responseTokens: number, qualityScore?: number
  ) => {
    if (!interactionStart.current) return;
    trackEvent.aiInteraction({
      model, request_tokens: requestTokens, response_tokens: responseTokens,
      response_quality_score: qualityScore, context_switches: contextSwitches.current,
      clarification_requests: clarificationRequests.current,
    });
    interactionStart.current = null;
  }, [model, trackEvent]);

  return { startInteraction, trackContextSwitch, trackClarificationRequest, completeInteraction };
}

export function useNetworkPerformanceTracking() {
  const trackEvent = useTrackEvent();

  const trackRequest = useCallback((
    _endpoint: string, endpointType: 'mcp' | 'api' | 'webhook',
    latency: number, payloadSize: number, success: boolean, retryCount = 0
  ) => {
    const connectionQuality: 'excellent' | 'good' | 'poor' =
      latency < 100 ? 'excellent' : latency < 500 ? 'good' : 'poor';
    const eventData = {
      endpoint_type: endpointType, latency_ms: latency,
      payload_size_bytes: payloadSize, connection_quality: connectionQuality,
      retry_count: retryCount, circuit_breaker_triggered: false,
    };
    if (success) trackEvent.networkPerformance(eventData);
    else trackEvent.networkFailure(eventData);
  }, [trackEvent]);

  return { trackRequest };
}
