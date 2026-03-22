# DDD Throw Elimination — Phase 4: Remaining Leaky Domains

## Context

Identity domain VOs are complete (v0.5.10). Six domains still violate DDD Rule Zero:
**domain layer must never throw — all validation returns `Result<T>`.**

Current throw count by domain:
| Domain | Throws | Root Cause |
|--------|--------|-----------|
| command | 9 | `CommandId`, `CommandName`, `CommandScope`, `CommandAggregate.fromSnapshot/addSubcommand` all throw |
| workspace | 5 | `TabId`, `WorkspaceId`, `TabRecord` branded factories throw; no class VOs |
| usage | 12 | Branded `toLedgerId/toSessionId/toProjectId` throw; `UsageRecord.validate()` throws; `UsageLedger.fromSnapshot` throws on bad userId; sealed-ledger checks throw |
| agent | 5 | `AgentId` branded factory throws; `LiveAgentAggregate.fromSnapshot()` throws on bad state |
| session | 4 | Branded `toSessionId/toProjectId` still throw; `SessionAggregate.fromSnapshot()` throws |
| mcp | 4 | `ServerId` branded factory throws; `MCPServerAggregate.enable/disable` throw; `tryFromSnapshot` fallthrough throws |

## Acceptance Criteria

For EACH domain:
1. **Zero `throw new Error` in `types.ts`** (except `unwrap()` which lives in shared/result.ts)
2. All affected factory functions return `Result<T>`
3. **All callers updated** — services/repositories/tests pass
4. `npm run build` clean, `npm test` passes (expect 743+ tests)
5. New tests cover `Err` paths for each converted factory

## Technical Approach

### Pattern (same as Identity, mcp, project):

```typescript
// BEFORE (throw)
export function toCommandId(id: string): CommandId {
  if (!id || !id.trim()) throw new Error('CommandId cannot be empty');
  return id as CommandId;
}

// AFTER (Result<T>)
export class CommandId {
  private constructor(readonly value: string) {}
  static create(raw: string): Result<CommandId> {
    if (!raw || !raw.trim()) return Err('CommandId cannot be empty');
    return Ok(new CommandId(raw.trim()));
  }
  static generate(): CommandId { return new CommandId(crypto.randomUUID()); }
  equals(other: CommandId): boolean { return this.value === other.value; }
  toString(): string { return this.value; }
}
```

### For aggregate methods that throw (enable/disable/fromSnapshot):
```typescript
// BEFORE
enable(): void {
  if (this._status === 'enabled') throw new Error('already enabled');
  this._status = 'enabled';
}

// AFTER
enable(): Result<void> {
  if (this._status === 'enabled') return Err('Server already enabled');
  this._status = 'enabled';
  return Ok(undefined);
}
```

### Backward-compat bridge for branded types (where >20 callers exist):
Add `toBranded(): CommandId` method on class VO — exactly as done for `SessionIdVO.toBranded()`.

## Agent Assignments

### Agent A — `fix-command`
- File: `src/domain/command/types.ts`
- Convert: `CommandId` (throw→class VO), `CommandName` (throw→class VO), `CommandScope` (throw→Result)
- Fix `CommandAggregate.fromSnapshot()` and `addSubcommand()` — return `Result<T>`
- Update `src/domain/command/service.ts` callers
- Update `src/domain/command/command.test.ts`

### Agent B — `fix-workspace`
- File: `src/domain/workspace/types.ts`
- Convert: `TabId` (throw→class VO), `WorkspaceId` (throw→class VO), `TabRecord` create (throw→Result)
- Add `src/domain/workspace/ports/IWorkspaceRepository.ts` if missing class VO port
- Update `src/domain/workspace/service.ts` callers
- Update `src/domain/workspace/workspace.test.ts`

### Agent C — `fix-agent-usage`
- Files: `src/domain/agent/types.ts`, `src/domain/usage/types.ts`
- agent: `AgentId` (throw→class VO), `LiveAgentAggregate.fromSnapshot()` throw→Result
- usage: branded factory throws → `Result<T>`; `UsageRecord.validate()` throw→Result; sealed-ledger checks → Result
- Update callers in both services and tests

### Agent D — `fix-session-mcp`
- Files: `src/domain/session/types.ts`, `src/domain/mcp/types.ts`
- session: remaining `toSessionId/toProjectId` branded throws → Result; `SessionAggregate.fromSnapshot()` throws → Result
- mcp: `ServerId` throw → class VO; `enable()/disable()` throw → `Result<void>`
- Update callers in both services and tests

## Dependencies

- All agents work in parallel — no cross-agent file dependencies
- Identity VOs (UserId, Email, DisplayName) are complete — do NOT re-implement
- Shared kernel: `Result<T>`, `Ok<T>`, `Err<T>`, `unwrap()` — use as-is

## Out of Scope

- Analytics domain (already clean)
- Project domain (1 minor throw acceptable in fromSnapshot guard)
- Ruflo domain (2 throws in infra-boundary guards — acceptable)
- Infrastructure layer, React components, Tauri commands

## Test Requirements

Each agent must add tests covering:
- `Foo.create('')` → `{ ok: false, error: '...' }`
- `Foo.create('  ')` → `{ ok: false }`
- `Foo.create('valid')` → `{ ok: true, value.value === 'valid' }`
- Aggregate method returning `Result<void>` on error path
