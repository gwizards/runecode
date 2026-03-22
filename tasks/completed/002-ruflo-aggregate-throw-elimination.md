# DDD Refactoring Plan — Ruflo Aggregate Throw Elimination (Phase 5)

## Current State (v0.5.11)

All 9 bounded contexts have zero throws in `types.ts` files. Identity VOs
(UserId, Email, DisplayName) are fully implemented and wired. The **single
remaining DDD violation** is in the ruflo domain aggregate layer:

### Leaky domains audit

| File | Throws | Pattern |
|------|--------|---------|
| `ruflo/aggregates/installation.aggregate.ts` | 4 | state guards + input validation |
| `ruflo/aggregates/swarm.aggregate.ts` | 7 | factory + state guards + agent management |

Everything else is clean:
- `ruflo/store.ts` — Zustand UI layer, throws on service errors (acceptable — not domain)
- `ruflo/quantization.ts` — algorithmic preconditions (programming errors, not domain invariants)
- `ruflo/memory-store.ts` — same as above

### Exact throws to eliminate

**`installation.aggregate.ts`:**
```
:83  if (this.isInstalled) throw new Error('Already installed')
:84  if (!version.trim()) throw new Error('Version string required')
:104 if (!this.isInstalled) throw new Error('Must be installed before activating MCP')
:114 if (!this.isInstalled) throw new Error('Must be installed before changing backend')
```

**`swarm.aggregate.ts`:**
```
:51  if (!topologyResult.ok) throw new Error(topologyResult.error)
:54  if (maxAgents < 1) throw new Error('maxAgents must be at least 1')
:58  if (!swarmIdResult.ok) throw new Error(swarmIdResult.error)
:137 throw new Error(...)   — addAgent() topology mismatch guard
:141 if (!agent.id.trim()) throw new Error('Agent ID must not be empty')
:143 throw new Error('Agent already exists')
:157 if (idx === -1) throw new Error('Agent not found')
```

## Acceptance Criteria

1. **Zero `throw new Error` in both aggregate files**
2. All aggregate methods that currently throw → return `Result<T>` or `Result<void>`
3. `RuFloSwarmAggregate.create()` → `Result<RuFloSwarmAggregate>`
4. All callers updated: `ruflo-application.service.ts`, tests, repository
5. `npm run build` clean, `npm test` passing (expect 757+ tests)
6. New tests cover each `Err` path

## Technical Approach

### Installation aggregate — convert void methods to Result<void>

```typescript
// BEFORE:
markInstalled(version: string, isSupported: boolean): void {
  if (this.isInstalled) throw new Error('Already installed');
  if (!version.trim()) throw new Error('Version string required');
  ...
}

// AFTER:
markInstalled(version: string, isSupported: boolean): Result<void> {
  if (this.isInstalled) return Err('Already installed');
  if (!version.trim()) return Err('Version string required');
  ...
  return Ok(undefined);
}

activateMcp(namespace: string): Result<void> {
  if (!this.isInstalled) return Err('Must be installed before activating MCP');
  ...
  return Ok(undefined);
}

changeBackend(backend: MemoryBackend): Result<void> {
  if (!this.isInstalled) return Err('Must be installed before changing backend');
  ...
  return Ok(undefined);
}
```

### Swarm aggregate — factory and methods to Result<T>

```typescript
// BEFORE:
static create(params: { id: string; ... }): RuFloSwarmAggregate {
  if (!topologyResult.ok) throw new Error(topologyResult.error);
  if (maxAgents < 1) throw new Error('maxAgents must be at least 1');
  if (!swarmIdResult.ok) throw new Error(swarmIdResult.error);
  ...
}

// AFTER:
static create(params: { id: string; ... }): Result<RuFloSwarmAggregate> {
  const topologyResult = SwarmTopology.create(params.topology);
  if (!topologyResult.ok) return Err(topologyResult.error);
  const maxAgents = params.maxAgents ?? 15;
  if (maxAgents < 1) return Err('maxAgents must be at least 1');
  const swarmIdResult = toSwarmId(params.id);
  if (!swarmIdResult.ok) return Err(swarmIdResult.error);
  ...
  return Ok(swarm);
}

addAgent(agent: RuFloAgent): Result<void> { ... }
removeAgent(agentId: string): Result<void> { ... }
```

## Agent Assignment

### Agent `fix-ruflo-aggregates`
- Files: `src/domain/ruflo/aggregates/installation.aggregate.ts`
          `src/domain/ruflo/aggregates/swarm.aggregate.ts`
- Also update: `src/domain/ruflo/application/ruflo-application.service.ts`
- Also update: `src/domain/ruflo/ddd-v9.test.ts`
              `src/domain/ruflo/ruflo-application-service.test.ts`
- Run build + tests to confirm

## Dependencies

- Identity VOs: COMPLETE (UserId, Email, DisplayName) — do not re-implement
- Throw elimination in types.ts: COMPLETE (v0.5.11) — do not re-implement
- This task only touches ruflo/aggregates/ and their callers

## Out of Scope

- `ruflo/quantization.ts` — algorithmic preconditions, not domain invariants
- `ruflo/memory-store.ts` — infrastructure
- `ruflo/store.ts` — Zustand UI layer
- Any domain outside ruflo
