# Identity Domain — Value Objects & Bounded Context

**Version**: v0.5.9-target
**Status**: pending
**Priority**: critical

---

## Context

The current 9-domain DDD architecture has **identity concerns leaking** across multiple bounded contexts with no canonical owner. `userId` is a raw `string` in `analytics`, `usage`, and `session`. The shared kernel's `toProjectId()` throws instead of returning `Result<T>`. No `Identity` bounded context exists.

---

## Leaky Domain Audit

### Critical (domain boundary violations)

| File | Line | Violation |
|------|------|-----------|
| `src/domain/shared/project-id.ts` | 14–16 | `toProjectId()` throws — violates Result monad contract |
| `src/domain/analytics/service.ts` | ~61 | `grantConsent(userId: string)` — raw string, no `UserId` VO |
| `src/domain/analytics/types.ts` | 28, 37 | `ConsentId`, `AnalyticsSessionId` — branded types not class VOs |
| `src/domain/usage/service.ts` | multiple | `userId` as raw `string` in usage ledger methods |
| `src/domain/usage/repository.ts` | multiple | `userId` parameter typed as `string` |

### High (missing canonical home)

- `userId` referenced in 5+ domains with no single bounded context owning the concept
- No `Email` VO anywhere — user email would enter as raw string if feature existed
- `SessionId`, `ProjectId`, `ConsentId` are all branded string types — no class-based validation

---

## Acceptance Criteria

### 1. `src/domain/identity/` bounded context (new)

Must contain all 5 DDD building blocks:

**Value Objects** (class-based, `static create(): Result<T>`):
- `UserId` — non-empty UUID string; `create(raw)` returns `Result<UserId>`; `generate()` returns new UUID
- `Email` — validates format (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); `create(raw)` returns `Result<Email>`; `toString()` returns normalized lowercase
- `DisplayName` — 1–100 chars; `create(raw)` returns `Result<DisplayName>`; `toString()`

**Aggregate**:
- `UserProfileAggregate` — private constructor; `static create({ userId?, email, displayName })` returns `Result<UserProfileAggregate>`; raises `UserProfileCreatedEvent`; `update(patch)` method; `pullEvents()` drains event queue

**Domain Events** (`identity/noun.verb` convention):
- `IDENTITY_EVENT_TYPES` with `DOMAIN_EVENT_TYPES` alias
- `'identity/profile.created'`, `'identity/profile.updated'`, `'identity/profile.deleted'`

**Repository Port**:
- `src/domain/identity/ports/IIdentityRepository.ts` — `findById(userId)`, `save(profile)`, `delete(userId)`, `findByEmail(email)`
- `InMemoryIdentityRepository` adapter in `repository.ts`

**Application Service**:
- `IdentityApplicationService` — all methods `async Promise<Result<T>>`
- `createProfile(email, displayName)` → `Result<UserProfileAggregate>`
- `updateProfile(userId, patch)` → `Result<UserProfileAggregate>`
- `deleteProfile(userId)` → `Result<void>`
- `lookupByEmail(email)` → `Result<UserProfileAggregate>`

### 2. Shared kernel fixes

- `src/domain/shared/project-id.ts:14` — convert `toProjectId()` from throw to `Result<ProjectId>`
- Export `ProjectId.create` as a class method (optional: promote to class VO)

### 3. Analytics domain update

- `ConsentAggregate` — change `userId: string` field to `userId: UserId` imported from `@/domain/identity`
- `AnalyticsApplicationService.grantConsent(userId: UserId)` — accept typed VO, not raw string
- `ConsentId` — promote from branded type to class VO with `create()` returning `Result<ConsentId>`

### 4. Tests (TDD London School)

File: `src/domain/identity/identity.test.ts`

Must cover:
- `UserId.create()` — valid UUID, empty string → Err, whitespace → Err, `generate()` → unique
- `Email.create()` — valid email, missing @, double @, too long → Err, normalizes to lowercase
- `DisplayName.create()` — empty → Err, 100 chars → Ok, 101 chars → Err
- `UserProfileAggregate.create()` — success path, invalid email → propagates Err
- `UserProfileAggregate.update()` — emits `profile.updated` event
- `IdentityApplicationService` — all 4 methods: Ok path + Err (not found, duplicate email)
- `InMemoryIdentityRepository` — CRUD round-trips

---

## Technical Approach

### File structure

```
src/domain/identity/
├── types.ts                  # UserId, Email, DisplayName VOs
├── aggregate.ts              # UserProfileAggregate
├── events.ts                 # IDENTITY_EVENT_TYPES + event interfaces
├── repository.ts             # InMemoryIdentityRepository
├── service.ts                # IdentityApplicationService
├── index.ts                  # barrel
├── identity.test.ts          # tests
└── ports/
    ├── IIdentityRepository.ts
    └── index.ts
```

### Dependencies

- Import `Result`, `Ok`, `Err` from `../shared/result`
- Import `DomainEventBus` from `../shared/event-bus`
- Zero infrastructure imports (no Tauri, no localStorage, no fetch)

---

## Out of Scope

- Authentication / JWT / password hashing (infrastructure concern)
- OAuth / SSO (infrastructure concern)
- Persisting to actual DB (only InMemory adapter needed)
- Connecting to existing UI components

---

## Test Requirements

- All tests use real `InMemoryIdentityRepository` — no mocks
- All test callbacks `async`, all service calls `await`-ed
- No `vi.mock()` — only `vi.fn()` for event bus spies

---

## Assigned To

- `identity-vo-worker` (swarm agent)

## Swarm

- `swarm-1774157276664-nhw71q`
- Task: `task-identity-vos`
