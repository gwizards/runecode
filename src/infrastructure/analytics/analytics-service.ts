/**
 * Analytics infrastructure service.
 *
 * Moved from src/lib/analytics/index.ts.
 * Depends on posthog-adapter for SDK calls and ConsentManager for consent state.
 * No domain logic — business rules live in src/domain/analytics/.
 */

import { ConsentManager } from '../../lib/analytics/consent';
import { sanitizers } from '../../lib/analytics/events';
import type { AnalyticsConfig, AnalyticsEvent, EventName, AnalyticsSettings } from '../../lib/analytics/types';
import {
  initPosthog,
  trackEvent as posthogTrack,
  identifyUser as posthogIdentify,
  resetUser as posthogReset,
  setEnabled as posthogSetEnabled,
} from './posthog-adapter';

// Re-export domain vocabulary so callers can import from one place.
export { ANALYTICS_EVENTS, eventBuilders, sanitizers } from '../../lib/analytics/events';
export { ConsentManager } from '../../lib/analytics/consent';

class AnalyticsService {
  private static instance: AnalyticsService;
  private initialized = false;
  private consentManager: ConsentManager;
  private config: AnalyticsConfig;
  private eventQueue: AnalyticsEvent[] = [];
  private flushInterval: ReturnType<typeof setInterval> | null = null;
  private currentScreen: string = 'app_start';

  private constructor() {
    this.consentManager = ConsentManager.getInstance();
    this.config = {
      apiKey: 'phc_6seRe1SJkFckJU2qQWeeIy62kaSoaUbCsdVCm1TQZg8',
      apiHost: 'https://us.i.posthog.com',
      persistence: 'localStorage',
      autocapture: false,
      disable_session_recording: true,
      opt_out_capturing_by_default: false,
    };
  }

  static getInstance(): AnalyticsService {
    if (!AnalyticsService.instance) {
      AnalyticsService.instance = new AnalyticsService();
    }
    return AnalyticsService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      const settings = await this.consentManager.initialize();
      if (settings.hasConsented && settings.enabled) {
        this.initializePostHog(settings);
      }
      this.startFlushInterval();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize analytics:', error);
    }
  }

  private initializePostHog(settings: AnalyticsSettings): void {
    try {
      const token = this.config.apiKey;
      if (!token || token === '' || token === 'undefined') {
        console.log('[Analytics] Skipping PostHog init: no valid API key');
        return;
      }

      const tauriInternals = window.__TAURI_INTERNALS__;
      const isWebMode =
        typeof window !== 'undefined' &&
        (!tauriInternals || tauriInternals.__WEB_MODE_MOCK__);
      if (isWebMode) {
        console.log('[Analytics] Skipping PostHog init: running in web mode');
        return;
      }

      initPosthog(this.config.apiKey, {
        apiHost: this.config.apiHost,
        persistence: this.config.persistence,
        autocapture: this.config.autocapture,
        disable_session_recording: this.config.disable_session_recording,
        opt_out_capturing_by_default: this.config.opt_out_capturing_by_default,
        bootstrapDistinctId: settings.userId,
        onLoaded: (ph) => {
          ph.identify(settings.userId!, {
            anonymous: true,
            consent_date: settings.consentDate,
            app_type: 'desktop',
            app_name: 'runecode',
          });
          ph.capture('$screen', { $screen_name: 'app_start' });
          ph.opt_in_capturing();
          if (this.config.loaded) {
            this.config.loaded(ph);
          }
        },
      });
    } catch (error) {
      console.error('Failed to initialize PostHog:', error);
    }
  }

  async enable(): Promise<void> {
    await this.consentManager.grantConsent();
    const settings = this.consentManager.getSettings();
    if (settings) {
      this.initializePostHog(settings);
    }
  }

  async disable(): Promise<void> {
    await this.consentManager.revokeConsent();
    posthogSetEnabled(false);
  }

  async deleteAllData(): Promise<void> {
    await this.consentManager.deleteAllData();
    posthogReset();
  }

  setScreen(screenName: string): void {
    this.currentScreen = screenName;
    posthogTrack('$screen', { $screen_name: screenName });
  }

  track(eventName: EventName | string, properties?: Record<string, any>): void {
    if (!this.consentManager.isEnabled()) return;

    const sanitizedProperties = this.sanitizeProperties(properties ?? {});
    const enhancedProperties = {
      ...sanitizedProperties,
      screen_name: this.currentScreen,
      app_context: 'runecode_desktop',
    };

    const event: AnalyticsEvent = {
      event: eventName,
      properties: enhancedProperties,
      timestamp: Date.now(),
      sessionId: this.consentManager.getSessionId(),
      userId: this.consentManager.getUserId(),
    };

    this.eventQueue.push(event);
    this.flushEvents();
  }

  identify(traits?: Record<string, any>): void {
    if (!this.consentManager.isEnabled()) return;
    const userId = this.consentManager.getUserId();
    const sanitizedTraits = this.sanitizeProperties(traits ?? {});
    posthogIdentify(userId, { ...sanitizedTraits, anonymous: true });
  }

  private sanitizeProperties(properties: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (value == null) continue;
      if (key.includes('path') || key.includes('file')) {
        sanitized[key] = typeof value === 'string' ? sanitizers.sanitizeFilePath(value) : value;
      } else if (key.includes('project')) {
        sanitized[key] = typeof value === 'string' ? sanitizers.sanitizeProjectPath(value) : value;
      } else if (key.includes('error') || key.includes('message')) {
        sanitized[key] = typeof value === 'string' ? sanitizers.sanitizeErrorMessage(value) : value;
      } else if (key.includes('agent_name')) {
        sanitized[key] = typeof value === 'string' ? sanitizers.sanitizeAgentName(value) : value;
      } else {
        if (typeof value === 'string') {
          let clean = value.replace(/\/[\w\-\/\.]+/g, '/***');
          clean = clean.replace(/[a-zA-Z0-9]{32,}/g, '***');
          clean = clean.replace(/[\w\.-]+@[\w\.-]+\.\w+/g, '***@***.***');
          sanitized[key] = clean;
        } else {
          sanitized[key] = value;
        }
      }
    }
    return sanitized;
  }

  private flushEvents(): void {
    if (this.eventQueue.length === 0) return;
    const events = [...this.eventQueue];
    this.eventQueue = [];
    events.forEach((event) => {
      posthogTrack(event.event, {
        ...event.properties,
        $session_id: event.sessionId,
        timestamp: event.timestamp,
        $current_url: `runecode://${event.properties?.screen_name ?? 'unknown'}`,
      });
    });
  }

  private startFlushInterval(): void {
    this.flushInterval = setInterval(() => {
      if (this.consentManager.isEnabled()) {
        this.flushEvents();
      }
    }, 5000);
  }

  shutdown(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flushEvents();
  }

  isEnabled(): boolean {
    return this.consentManager.isEnabled();
  }

  hasConsented(): boolean {
    return this.consentManager.hasConsented();
  }

  getSettings(): AnalyticsSettings | null {
    return this.consentManager.getSettings();
  }
}

export const analytics = AnalyticsService.getInstance();
export default analytics;

/**
 * Performance tracking utility — records percentiles and emits analytics events.
 */
export class PerformanceTracker {
  private static performanceData: Map<string, number[]> = new Map();

  static recordMetric(operation: string, duration: number): void {
    if (!this.performanceData.has(operation)) {
      this.performanceData.set(operation, []);
    }
    const data = this.performanceData.get(operation)!;
    data.push(duration);
    if (data.length > 100) data.shift();

    if (data.length >= 10 && data.length % 10 === 0) {
      const sorted = [...data].sort((a, b) => a - b);
      analytics.track('performance_percentiles', {
        operation,
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p95: sorted[Math.floor(sorted.length * 0.95)],
        p99: sorted[Math.floor(sorted.length * 0.99)],
        sample_size: data.length,
        min: sorted[0],
        max: sorted[sorted.length - 1],
        avg: data.reduce((a, b) => a + b, 0) / data.length,
      });
    }
  }

  static getStats(
    operation: string,
  ): { p50: number; p95: number; p99: number; count: number } | null {
    const data = this.performanceData.get(operation);
    if (!data || data.length === 0) return null;
    const sorted = [...data].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      count: data.length,
    };
  }

  static clear(operation?: string): void {
    if (operation) {
      this.performanceData.delete(operation);
    } else {
      this.performanceData.clear();
    }
  }
}
