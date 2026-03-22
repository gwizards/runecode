/**
 * Identity bounded context — barrel export.
 *
 * Other bounded contexts that need to reference the canonical UserId
 * should import from this module, not from internal files.
 */

// Value Objects
export { UserId, Email, DisplayName } from './types';

// Aggregate
export { UserProfileAggregate } from './aggregate';
export type { UserProfileSnapshot } from './aggregate';

// Events
export {
  IDENTITY_EVENT_TYPES,
  DOMAIN_EVENT_TYPES,
} from './events';
export type {
  IdentityEventType,
  UserProfileCreatedEvent,
  UserProfileUpdatedEvent,
  UserProfileDeletedEvent,
} from './events';

// Repository
export { InMemoryIdentityRepository } from './repository';

// Service
export { IdentityApplicationService } from './service';

// Port types
export type { IIdentityRepository } from './ports/IIdentityRepository';
