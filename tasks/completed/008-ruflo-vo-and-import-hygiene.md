# 008 — RuFlo VO Migration + Cross-Domain Import Hygiene

**Created**: 2026-03-22
**Version target**: v0.5.19

---

## Audit Findings (deeper scan — 2026-03-22)

Previous standard checks (grep for `readonly _brand`) missed the ruflo context
because it uses `unique symbol` branding instead of `_brand`. Deeper scan revealed:

### ❌ High — ruflo branded string VOs (unique symbol pattern)

`src/domain/ruflo/types.ts` still uses the banned branded-string pattern:

```typescript
// ❌ Both of these violate ADR-001
declare const _agentId: unique symbol;
export type AgentId = string & { readonly [_agentId]: true };

declare const _swarmId: unique symbol;
export type SwarmId = string & { readonly [_swarmId]: true };
```

With deprecated bridge functions `toAgentId()` and `toSwarmId()` that do `Ok(raw as AgentId)`.

**Fix**: Convert both to class VOs following ADR-001 contract.

### ❌ Medium — Cross-domain import leakage (7 files)

Files importing directly from `*/types` or `*/aggregate` internals
instead of through the public barrel `*/index`:

| File | Leaky import | Should be |
|------|-------------|-----------|
| `workspace/types.ts` | `from '../session/types'` | `from '../session'` |
| `workspace/service.ts` | `from '../session/types'` | `from '../session'` |
| `workspace/service.ts` | `from '../project/types'` | `from '../project'` |
| `workspace/repository.ts` | `from '../session/types'` | `from '../session'` |
| `workspace/store.ts` | `from '../session/types'` | `from '../session'` |
| `workspace/store.ts` | `from '../project/types'` | `from '../project'` |
| `usage/types.ts` | `from '../identity/types'` | `from '../identity'` |
| `analytics/types.ts` | `from '../identity/types'` | `from '../identity'` |

### ❌ Low — Missing `generate()` on CommandId

`src/domain/command/types.ts`: `CommandId` has `unsafeFrom()` but no `generate()`.
ADR-001 requires all ID VOs to have `static generate(): T`.

---

## Acceptance Criteria

1. `ruflo/types.ts`: `AgentId` and `SwarmId` are class VOs, `toAgentId()`/`toSwarmId()` removed
2. All 8 cross-domain imports go through public barrels, not internals
3. `CommandId.generate()` added
4. `grep -rn "unique symbol" src/domain` returns 0 (or only in infra/tests)
5. 763+ tests green, `npm run build` passes

## Technical Approach

### RuFlo AgentId / SwarmId

```typescript
export class AgentId {
  private constructor(readonly value: string) {}
  static create(raw: string): Result<AgentId> {
    if (!raw?.trim()) return Err('AgentId cannot be empty');
    return Ok(new AgentId(raw.trim()));
  }
  static generate(): AgentId { return new AgentId(crypto.randomUUID()); }
  equals(o: AgentId): boolean { return this.value === o.value; }
  toString(): string { return this.value; }
}
```

Note: ruflo's `AgentId` is separate from `domain/agent/AgentId` — ruflo maps
external MCP API agent IDs, agent domain owns live agent lifecycle.

### Cross-domain import fix

Change `import type { SessionId } from '../session/types'`
to `import type { SessionId } from '../session'`

These are type-only imports so the barrel re-export handles them cleanly.

## Dependencies
- Task 007 (deprecated bridge removal) — COMPLETED ✓
