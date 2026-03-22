# 005 — DDD Identity VO Hardening + ADR-001 + Remaining Aggregate Violations

**Created**: 2026-03-22
**Version target**: v0.5.16

---

## Audit Findings (2026-03-22)

### ✅ Passing (no work needed)
| Check | Result |
|-------|--------|
| `throw new Error` in domain layer | **0** |
| Branded string IDs (`readonly _brand`) | **0** |
| Ports coverage (IXxx.ts + index.ts) | **All 10 contexts** |
| Identity VOs: `UserId`, `Email`, `DisplayName` | **Complete** |
| Identity aggregate, service, repository, tests | **Complete (408 tests)** |

### ❌ Violations
| Severity | File | Issue |
|----------|------|-------|
| **High** | `docs/adr/` | **Zero ADRs exist** — ADR-001 must be generated |
| **Medium** | `src/domain/workspace/types.ts:231` | `WorkspaceAggregate.create()` returns `WorkspaceAggregate`, not `Result<WorkspaceAggregate>` — infallible but inconsistent with DDD convention |
| **Medium** | `src/domain/identity/aggregate.ts` | `fromSnapshot()` missing — no rehydration path from persistence |
| **Low** | `src/domain/identity/aggregate.ts` | Uses `pullEvents()` (draining splice); other aggregates use `events` getter + `clearEvents()` — inconsistent pattern |
| **Low** | `@deprecated` bridge functions | `toProjectId`, `toAgentId`, `toTabId` etc. still in codebase — allowed per ADR-001 but must track removal timeline |

---

## Acceptance Criteria

1. `docs/adr/001-strict-ddd-enforcement.md` exists and is committed
2. `UserProfileAggregate.fromSnapshot()` implemented and tested
3. `WorkspaceAggregate.create()` assessed — either wrapped in `Result<T>` or documented as intentionally infallible (no validation needed for generate()-based construction)
4. ADR-001 stored in RuFlo memory (`architecture-decisions` namespace)
5. All 757+ tests still green, `npm run build` passes

---

## Technical Approach

### ADR-001 (Priority 1)
- Generate `docs/adr/001-strict-ddd-enforcement.md`
- Store in `mcp__claude-flow__memory_store` under `architecture-decisions` namespace
- Reference commit hash

### Identity `fromSnapshot()` (Priority 2)
```typescript
static fromSnapshot(raw: UserProfileSnapshot): Result<UserProfileAggregate> {
  const userIdResult = UserId.create(raw.userId);
  if (!userIdResult.ok) return userIdResult;
  const emailResult = Email.create(raw.email);
  if (!emailResult.ok) return emailResult;
  const displayNameResult = DisplayName.create(raw.displayName);
  if (!displayNameResult.ok) return displayNameResult;

  const agg = new UserProfileAggregate(
    userIdResult.value, emailResult.value, displayNameResult.value
  );
  if (raw.deleted) agg._deleted = true;  // use private setter or reconstruct
  return Ok(agg);
}
```

### WorkspaceAggregate.create() assessment (Priority 3)
- `create(sessionId, projectId)` generates IDs internally — never fails
- Solution: document as intentionally infallible in JSDoc, no Result wrapping needed
- Alternatively: wrap in `Result<WorkspaceAggregate>` for consistency

---

## Dependencies
- Task 004 (ProjectId VO consolidation) — COMPLETED ✓

## Out of Scope
- New bounded contexts
- Removing `@deprecated` bridges (2-sprint timeline per ADR-001)
- Ruflo/command domain VOs (separate task)

## Test Requirements
- `identity.test.ts`: add `fromSnapshot()` round-trip tests
- All existing 757 tests must stay green
