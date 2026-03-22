/**
 * Identity bounded context — Repository Port.
 *
 * Defines the persistence contract for UserProfileAggregate.
 * Implementations live in the infrastructure layer.
 */

import type { UserId, Email } from '../types';
import type { UserProfileAggregate } from '../aggregate';

export interface IIdentityRepository {
  findById(userId: UserId): Promise<UserProfileAggregate | null>;
  findByEmail(email: Email): Promise<UserProfileAggregate | null>;
  save(profile: UserProfileAggregate): Promise<void>;
  delete(userId: UserId): Promise<void>;
  findAll(): Promise<UserProfileAggregate[]>;
}
