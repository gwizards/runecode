# Task 004 — ProjectId Class VO + Shared Kernel Consolidation

## Context

After completing the class VO migration (v0.5.14), two `ProjectId` branded
strings remain:

| File | Used by |
|------|---------|
| `src/domain/shared/project-id.ts` | `analytics/service.ts`, `analytics/types.ts` |
| `src/domain/project/types.ts` | `workspace/service.ts`, `workspace/store.ts`, `workspace/types.ts`, `shared/quantization.ts` |

Both are `string & { readonly _brand: 'ProjectId' }`. Neither is a class VO.
This is a DDD violation: the shared kernel leaks a concrete type that should
belong to the project bounded context.

## Acceptance Criteria

1. `src/domain/project/types.ts` exports a `ProjectId` **class VO**:
   - `private constructor(readonly value: string) {}`
   - `static create(raw: string): Result<ProjectId>`
   - `static generate(): ProjectId`
   - `equals(other: ProjectId): boolean`
   - `toString(): string`
2. `src/domain/shared/project-id.ts` re-exports `ProjectId` and `toProjectId`
   from `project/types.ts` (no new type definition — single source of truth).
3. All callers updated: workspace/, analytics/, shared/quantization.ts.
4. `npm run build` passes — 0 TS errors.
5. `npx vitest run` passes — all 757+ tests green.
6. 0 `throw new Error` introduced in domain types.

## Technical Approach

**Agent A** — `project/types.ts`:
- Replace branded type with class VO
- Keep `toProjectId()` as `@deprecated` bridge
- Fix internal callers in `project/types.ts`, `project/repository.ts`, `project/service.ts`

**Agent B** — `shared/project-id.ts` + consumers:
- Replace the file content with a re-export from `'../project/types'`
- Fix `analytics/types.ts` and `analytics/service.ts` callers
- Fix `workspace/service.ts`, `workspace/store.ts`, `workspace/types.ts`
- Fix `shared/quantization.ts` if it uses ProjectId as a map key

## Dependencies

- `src/domain/shared/result.ts` — present
- `src/domain/identity/types.ts` — reference VO pattern
- Both agents touch different files — no conflict

## Out of Scope

- Usage/session local ProjectId aliases — already class VOs
- Any other shared kernel types

## Test Requirements

- All existing tests must remain green
- No new test files required
