/**
 * Identity bounded context — Domain Events.
 *
 * All event type strings follow the `identity/noun.verb` convention.
 */

import type { DomainEvent } from '../shared/event-bus';

// ─── Event type constants ──────────────────────────────────────────────────────

export const IDENTITY_EVENT_TYPES = {
  PROFILE_CREATED: 'identity/profile.created',
  PROFILE_UPDATED: 'identity/profile.updated',
  PROFILE_DELETED: 'identity/profile.deleted',
} as const;

/** Alias kept for cross-context consistency with other bounded contexts. */
export const DOMAIN_EVENT_TYPES = IDENTITY_EVENT_TYPES;

export type IdentityEventType =
  (typeof IDENTITY_EVENT_TYPES)[keyof typeof IDENTITY_EVENT_TYPES];

// ─── Event interfaces ──────────────────────────────────────────────────────────

export interface UserProfileCreatedEvent extends DomainEvent {
  readonly type: typeof IDENTITY_EVENT_TYPES.PROFILE_CREATED;
  readonly payload: {
    readonly userId: string;
    readonly email: string;
    readonly displayName: string;
  };
}

export interface UserProfileUpdatedEvent extends DomainEvent {
  readonly type: typeof IDENTITY_EVENT_TYPES.PROFILE_UPDATED;
  readonly payload: {
    readonly userId: string;
    readonly email?: string;
    readonly displayName?: string;
  };
}

export interface UserProfileDeletedEvent extends DomainEvent {
  readonly type: typeof IDENTITY_EVENT_TYPES.PROFILE_DELETED;
  readonly payload: {
    readonly userId: string;
  };
}
