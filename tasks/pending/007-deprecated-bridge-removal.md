# 007 — Deprecated Bridge Removal

**Created**: 2026-03-22
**Version target**: v0.5.18
**ADR-001**: bridges must be removed within 2 sprints of VO migration

---

## Audit Findings (2026-03-22)

### ✅ All Critical/High/Medium — CLEAN
| Check | Result |
|-------|--------|
| `throw new Error` in domain layer | **0** |
| Branded string IDs | **0** |
| Ports (10 contexts) | **All present** |
| ADR-001 | **Exists** |
| Identity VOs (`UserId`, `Email`, `DisplayName`) | **Complete** |
| `UserProfileAggregate.fromSnapshot()` | **Complete** |
| Security audit (7 findings) | **All fixed in v0.5.17** |
| Tests | **763 green** |

### ⚠️ Low — Deprecated Bridges (18 total, overdue per ADR-001)

| File | Bridge | Replaces |
|------|--------|---------|
| `agent/types.ts:34` | `toAgentId()` | `AgentId.create()` |
| `agent/types.ts:40` | `unsafeAgentId()` | `AgentId.create()` |
| `workspace/types.ts:69` | `toTabId()` | `TabId.create()` |
| `workspace/types.ts:72` | `toWorkspaceId()` | `WorkspaceId.create()` |
| `usage/types.ts:81` | `toLedgerId()` | `LedgerId.create()` |
| `usage/types.ts:86` | `toSessionId()` | `SessionId.create()` |
| `usage/types.ts:91` | `toProjectId()` | `ProjectId.create()` |
| `analytics/types.ts:52` | `toAnalyticsSessionId()` | `AnalyticsSessionId.create()` |
| `analytics/types.ts:80` | `toConsentId()` | `ConsentId.create()` |
| `mcp/types.ts:42` | `toServerId()` | `ServerId.create()` |
| `project/types.ts:34` | `toProjectId()` | `ProjectId.create()` |
| `session/types.ts:59` | `toSessionId()` | `SessionId.create()` |
| `session/types.ts:94` | `toProjectId()` | `ProjectId.create()` |
| `session/types.ts:54` | `SessionIdVO` alias | `SessionId` directly |
| `session/types.ts:56` | `SessionIdVO` alias | `SessionId` directly |

---

## Acceptance Criteria

1. All `@deprecated` bridge functions removed from `src/domain/**`
2. All callers (service.ts, repository.ts, store.ts, tests) updated to use class VO factory directly
3. `grep -rn "@deprecated" src/domain --include="*.ts" | grep -v "\.test\."` returns 0 (excluding non-bridge deprecations like `DOMAIN_EVENT_TYPES` alias and `captureEvent`)
4. 763+ tests still green, `npm run build` passes

## Technical Approach

For each bridge `toFooId(raw)`:
1. Find all callers: `grep -rn "toFooId\|toAgentId\|..." src/ --include="*.ts" | grep -v "\.test\."`
2. Replace each call site: `toFooId(x)` → `FooId.create(x)` (caller must handle Result)
3. Remove the bridge function declaration
4. Run build + tests

## Out of Scope
- `@deprecated DOMAIN_EVENT_TYPES` alias (ruflo/domain-events.ts) — separate concern
- `@deprecated captureEvent()` (analytics) — API deprecation, not VO bridge
- `@deprecated tryFromSnapshot` (mcp) — separate concern

## Dependencies
- Task 006 (security remediation) — COMPLETED ✓
