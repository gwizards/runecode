/**
 * PostHog infrastructure adapter.
 *
 * Thin wrapper around the PostHog SDK — no business logic lives here.
 * All calls are delegated directly to the PostHog client.
 */

import posthog, { type PostHogConfig } from 'posthog-js';

export interface PosthogInitOptions {
  apiHost?: string;
  persistence?: 'localStorage' | 'memory';
  autocapture?: boolean;
  disable_session_recording?: boolean;
  opt_out_capturing_by_default?: boolean;
  bootstrapDistinctId?: string;
  onLoaded?: PostHogConfig['loaded'];
}

export function initPosthog(apiKey: string, options: PosthogInitOptions = {}): void {
  posthog.init(apiKey, {
    api_host: options.apiHost ?? 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
    bootstrap: options.bootstrapDistinctId
      ? { distinctID: options.bootstrapDistinctId }
      : undefined,
    persistence: options.persistence ?? 'localStorage',
    autocapture: options.autocapture ?? false,
    disable_session_recording: options.disable_session_recording ?? true,
    opt_out_capturing_by_default: options.opt_out_capturing_by_default ?? false,
    loaded: options.onLoaded,
  });
}

export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (typeof posthog !== 'undefined' && typeof posthog.capture === 'function') {
    posthog.capture(name, properties);
  }
}

export function identifyUser(id: string, traits?: Record<string, unknown>): void {
  if (typeof posthog !== 'undefined' && typeof posthog.identify === 'function') {
    posthog.identify(id, traits);
  }
}

export function resetUser(): void {
  if (typeof posthog !== 'undefined' && typeof posthog.reset === 'function') {
    posthog.reset();
  }
}

export function setEnabled(enabled: boolean): void {
  if (typeof posthog === 'undefined') return;
  if (enabled) {
    if (typeof posthog.opt_in_capturing === 'function') posthog.opt_in_capturing();
  } else {
    if (typeof posthog.opt_out_capturing === 'function') posthog.opt_out_capturing();
  }
}
