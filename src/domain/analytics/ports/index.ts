/**
 * Analytics bounded context — Ports barrel.
 *
 * Import ports from here; never import from specific port files directly
 * in application code.
 */

export type { IConsentRepository } from './IConsentRepository';
export type { IAnalyticsTracker } from './IAnalyticsTracker';
