/**
 * Identity bounded context — UserProfileAggregate.
 *
 * Owns the canonical user identity within the system.
 * Raises domain events for all state transitions.
 */

import type { DomainEvent } from '../shared/event-bus';
import { Result, Ok, Err } from '../shared/result';
import { UserId, Email, DisplayName } from './types';
import {
  IDENTITY_EVENT_TYPES,
  UserProfileCreatedEvent,
  UserProfileUpdatedEvent,
  UserProfileDeletedEvent,
} from './events';

// ─── Snapshot type ────────────────────────────────────────────────────────────

export interface UserProfileSnapshot {
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly deleted: boolean;
}

// ─── Aggregate ────────────────────────────────────────────────────────────────

export class UserProfileAggregate {
  private readonly _userId: UserId;
  private _email: Email;
  private _displayName: DisplayName;
  private _deleted = false;
  private readonly _events: DomainEvent[] = [];

  private constructor(userId: UserId, email: Email, displayName: DisplayName) {
    this._userId = userId;
    this._email = email;
    this._displayName = displayName;
  }

  // ─── Factory ────────────────────────────────────────────────────────────────

  static create(opts: {
    email: Email;
    displayName: DisplayName;
    userId?: UserId;
  }): Result<UserProfileAggregate> {
    const userId = opts.userId ?? UserId.generate();
    const aggregate = new UserProfileAggregate(userId, opts.email, opts.displayName);

    const event: UserProfileCreatedEvent = {
      type: IDENTITY_EVENT_TYPES.PROFILE_CREATED,
      occurredAt: Date.now(),
      aggregateId: userId.value,
      payload: {
        userId: userId.value,
        email: opts.email.value,
        displayName: opts.displayName.value,
      },
    };
    aggregate._events.push(event);

    return Ok(aggregate);
  }

  // ─── Getters ─────────────────────────────────────────────────────────────────

  get userId(): UserId {
    return this._userId;
  }

  get email(): Email {
    return this._email;
  }

  get displayName(): DisplayName {
    return this._displayName;
  }

  get isDeleted(): boolean {
    return this._deleted;
  }

  // ─── Commands ─────────────────────────────────────────────────────────────────

  update(patch: { email?: Email; displayName?: DisplayName }): Result<void> {
    if (this._deleted) return Err('Cannot update a deleted profile');
    if (!patch.email && !patch.displayName)
      return Err('At least one field must be provided to update');

    if (patch.email) this._email = patch.email;
    if (patch.displayName) this._displayName = patch.displayName;

    const event: UserProfileUpdatedEvent = {
      type: IDENTITY_EVENT_TYPES.PROFILE_UPDATED,
      occurredAt: Date.now(),
      aggregateId: this._userId.value,
      payload: {
        userId: this._userId.value,
        ...(patch.email ? { email: patch.email.value } : {}),
        ...(patch.displayName ? { displayName: patch.displayName.value } : {}),
      },
    };
    this._events.push(event);

    return Ok(undefined);
  }

  markDeleted(): void {
    this._deleted = true;

    const event: UserProfileDeletedEvent = {
      type: IDENTITY_EVENT_TYPES.PROFILE_DELETED,
      occurredAt: Date.now(),
      aggregateId: this._userId.value,
      payload: { userId: this._userId.value },
    };
    this._events.push(event);
  }

  // ─── Event draining ───────────────────────────────────────────────────────────

  pullEvents(): DomainEvent[] {
    return this._events.splice(0);
  }

  // ─── Snapshot ─────────────────────────────────────────────────────────────────

  toSnapshot(): UserProfileSnapshot {
    return {
      userId: this._userId.value,
      email: this._email.value,
      displayName: this._displayName.value,
      deleted: this._deleted,
    };
  }
}
