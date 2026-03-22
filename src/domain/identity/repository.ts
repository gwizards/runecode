/**
 * Identity bounded context — InMemoryIdentityRepository.
 *
 * Map-backed adapter for tests and local development.
 * Implements IIdentityRepository without any infrastructure dependencies.
 */

import type { IIdentityRepository } from './ports/IIdentityRepository';
import type { UserProfileAggregate } from './aggregate';
import type { UserId, Email } from './types';

export class InMemoryIdentityRepository implements IIdentityRepository {
  /** Primary index: userId → profile */
  private readonly byId = new Map<string, UserProfileAggregate>();

  async findById(userId: UserId): Promise<UserProfileAggregate | null> {
    return this.byId.get(userId.value) ?? null;
  }

  async findByEmail(email: Email): Promise<UserProfileAggregate | null> {
    for (const profile of this.byId.values()) {
      if (profile.email.equals(email)) return profile;
    }
    return null;
  }

  async save(profile: UserProfileAggregate): Promise<void> {
    this.byId.set(profile.userId.value, profile);
  }

  async delete(userId: UserId): Promise<void> {
    this.byId.delete(userId.value);
  }

  async findAll(): Promise<UserProfileAggregate[]> {
    return Array.from(this.byId.values());
  }
}
