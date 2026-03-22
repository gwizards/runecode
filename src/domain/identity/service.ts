/**
 * Identity bounded context — IdentityApplicationService.
 *
 * Orchestrates use-cases: validates raw inputs via VOs, delegates to the
 * repository port, and dispatches domain events through the event bus.
 *
 * All methods return async Promise<Result<T>> — no exceptions escape.
 */

import { Result, Ok, Err } from '../shared/result';
import type { DomainEventBus } from '../shared/event-bus';
import { UserId, Email, DisplayName } from './types';
import { UserProfileAggregate } from './aggregate';
import type { IIdentityRepository } from './ports/IIdentityRepository';

export class IdentityApplicationService {
  constructor(
    private readonly repo: IIdentityRepository,
    private readonly bus: DomainEventBus,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────────

  async createProfile(
    rawEmail: string,
    rawDisplayName: string,
    rawUserId?: string,
  ): Promise<Result<UserProfileAggregate>> {
    const emailResult = Email.create(rawEmail);
    if (!emailResult.ok) return Err(emailResult.error);

    const displayNameResult = DisplayName.create(rawDisplayName);
    if (!displayNameResult.ok) return Err(displayNameResult.error);

    let userId: UserId | undefined;
    if (rawUserId !== undefined) {
      const userIdResult = UserId.create(rawUserId);
      if (!userIdResult.ok) return Err(userIdResult.error);
      userId = userIdResult.value;
    }

    // Prevent duplicate email addresses
    const existing = await this.repo.findByEmail(emailResult.value);
    if (existing !== null) return Err(`Email already registered: '${emailResult.value.value}'`);

    const profileResult = UserProfileAggregate.create({
      email: emailResult.value,
      displayName: displayNameResult.value,
      userId,
    });
    if (!profileResult.ok) return Err(profileResult.error);

    const profile = profileResult.value;
    await this.repo.save(profile);
    this.bus.dispatch(profile.pullEvents());

    return Ok(profile);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

  async updateProfile(
    rawUserId: string,
    patch: { email?: string; displayName?: string },
  ): Promise<Result<UserProfileAggregate>> {
    const userIdResult = UserId.create(rawUserId);
    if (!userIdResult.ok) return Err(userIdResult.error);

    const profile = await this.repo.findById(userIdResult.value);
    if (profile === null) return Err(`Profile not found: '${rawUserId}'`);

    const resolvedPatch: { email?: Email; displayName?: DisplayName } = {};

    if (patch.email !== undefined) {
      const r = Email.create(patch.email);
      if (!r.ok) return Err(r.error);
      resolvedPatch.email = r.value;
    }

    if (patch.displayName !== undefined) {
      const r = DisplayName.create(patch.displayName);
      if (!r.ok) return Err(r.error);
      resolvedPatch.displayName = r.value;
    }

    const updateResult = profile.update(resolvedPatch);
    if (!updateResult.ok) return Err(updateResult.error);

    await this.repo.save(profile);
    this.bus.dispatch(profile.pullEvents());

    return Ok(profile);
  }

  // ─── Delete ───────────────────────────────────────────────────────────────────

  async deleteProfile(rawUserId: string): Promise<Result<void>> {
    const userIdResult = UserId.create(rawUserId);
    if (!userIdResult.ok) return Err(userIdResult.error);

    const profile = await this.repo.findById(userIdResult.value);
    if (profile === null) return Err(`Profile not found: '${rawUserId}'`);

    profile.markDeleted();
    await this.repo.delete(userIdResult.value);
    this.bus.dispatch(profile.pullEvents());

    return Ok(undefined);
  }

  // ─── Lookup ───────────────────────────────────────────────────────────────────

  async lookupByEmail(rawEmail: string): Promise<Result<UserProfileAggregate>> {
    const emailResult = Email.create(rawEmail);
    if (!emailResult.ok) return Err(emailResult.error);

    const profile = await this.repo.findByEmail(emailResult.value);
    if (profile === null) return Err(`No profile found for email: '${emailResult.value.value}'`);

    return Ok(profile);
  }
}
