# Task 003 — Class VO Migration: Remaining Branded String IDs

## Context

Identity domain (UserId, Email, DisplayName) is complete with class VOs.
Nine ID types across six bounded contexts remain as raw branded string types.
These are a DDD violation: branded strings encode no invariants and permit
construction without validation.

## Current State

| Type | File | Brand |
|------|------|-------|
| `AgentId` | `src/domain/agent/types.ts:19` | `'AgentId'` |
| `TabId` | `src/domain/workspace/types.ts:26` | `'TabId'` |
| `WorkspaceId` | `src/domain/workspace/types.ts:27` | `'WorkspaceId'` |
| `LedgerId` | `src/domain/usage/types.ts:21` | `'LedgerId'` |
| `SessionId` (usage) | `src/domain/usage/types.ts:22` | `'SessionId'` |
| `ProjectId` (usage) | `src/domain/usage/types.ts:23` | `'ProjectId'` |
| `AnalyticsSessionId` | `src/domain/analytics/types.ts:31` | `'SessionId'` |
| `ConsentId` | `src/domain/analytics/types.ts:40` | `'ConsentId'` |
| `ServerId` | `src/domain/mcp/types.ts:21` | `'ServerId'` |

Note: `SessionId`/`ProjectId` in session/types.ts are also branded strings —
treat those too.

## Acceptance Criteria

1. Each ID listed above becomes a class VO following the Identity pattern:
   ```typescript
   class FooId {
     private constructor(readonly value: string) {}
     static create(raw: string): Result<FooId> { ... }
     static generate(): FooId { ... }
     equals(other: FooId): boolean { return this.value === other.value; }
     toString(): string { return this.value; }
   }
   ```
2. Existing factory functions (`toFooId()`) become deprecated bridges:
   ```typescript
   /** @deprecated Use FooId.create() */
   export function toFooId(raw: string): Result<FooId> { return FooId.create(raw); }
   ```
3. `npm run build` passes with 0 TS errors.
4. `npm test` passes — all existing tests green.
5. `npm run lint` passes.
6. No `throw new Error` introduced in domain types.

## Technical Approach

Work domain by domain — never touch two domains in the same file edit to avoid
merge conflicts between parallel agents:

- **Agent A**: `agent/types.ts` → `AgentId` class VO
- **Agent B**: `workspace/types.ts` → `TabId`, `WorkspaceId` class VOs
- **Agent C**: `usage/types.ts` → `LedgerId`, `SessionId`, `ProjectId` class VOs
- **Agent D**: `analytics/types.ts` → `AnalyticsSessionId`, `ConsentId` class VOs
- **Agent E**: `mcp/types.ts` + `session/types.ts` → `ServerId`, `SessionId`, `ProjectId` class VOs

Each agent must also:
- Update all callers **within the same domain** that construct IDs via cast or factory
- Keep deprecated bridge functions for cross-domain callers
- Run a targeted tsc check after edits

## Dependencies

- Requires `src/domain/shared/result.ts` — already present
- Identity VO pattern at `src/domain/identity/types.ts` — use as reference
- `npm run build` must be the final gate

## Out of Scope

- Shared `ProjectId` consolidation (it is duplicated in project/session/usage — leave for a future task)
- Infra layer adapters (no changes to repository.ts files)
- Test file rewrites beyond fixing broken call sites

## Test Requirements

- All existing tests must remain green
- No new test files required (class VOs are already tested indirectly)
