# ADR-001: Strict DDD Enforcement — Value Objects, Aggregate Roots, No Leaky Domains

**Status**: Accepted
**Date**: 2026-03-22
**Deciders**: Engineering team (RuneCode / Wizards)

---

## Context

The RuneCode domain layer must be the single source of truth for all business
invariants. Historically, leaky domains (branded strings, throws in domain
types, missing hexagonal ports) allowed invalid state to propagate across
bounded contexts and made the system brittle under refactoring.

After completing the DDD v20 migration (Tasks 001–004), the codebase reached:
- Zero `throw new Error` in domain types/aggregates
- Zero branded string ID types (`readonly _brand`)
- Full hexagonal ports coverage across all 10 bounded contexts

This ADR codifies those standards as the permanent law of the domain layer.

---

## Decision

### 1. No Throws in Domain Layer
All validation in `src/domain/**` must return `Result<T>` — never throw.

```typescript
// ✅ Correct
static create(raw: string): Result<FooId> {
  if (!raw?.trim()) return Err('FooId cannot be empty');
  return Ok(new FooId(raw.trim()));
}

// ❌ Forbidden
static create(raw: string): FooId {
  if (!raw) throw new Error('empty'); // NEVER in domain layer
  return raw as FooId;
}
```

**Exception**: `unwrap()` in `shared/result.ts` may throw — it is intentionally
restricted to infrastructure adapters and test code only.

---

### 2. Class Value Objects for All ID Types

Every ID type uses the canonical VO pattern:

```typescript
export class FooId {
  private constructor(readonly value: string) {}

  static create(raw: string): Result<FooId> {
    if (!raw?.trim()) return Err('FooId cannot be empty');
    return Ok(new FooId(raw.trim()));
  }

  static generate(): FooId { return new FooId(crypto.randomUUID()); }

  equals(other: FooId): boolean { return this.value === other.value; }

  toString(): string { return this.value; }
}
```

No branded strings (`type FooId = string & { _brand: 'FooId' }`) are permitted.

---

### 3. Aggregate Roots

Every aggregate must:
- Use a **private constructor** — no `new Aggregate()` outside the class
- Expose **`static create(...): Result<T>`** as the primary factory
- Expose **`static fromSnapshot(raw: RawT): Result<T>`** for rehydration
- Expose **`toSnapshot(): RawT`** for persistence serialisation
- Accumulate domain events internally, flushed via `pullEvents()` or `clearEvents()`
- Never expose public setters — all mutation via named command methods

---

### 4. Hexagonal Ports

Every bounded context must have:
```
src/domain/<context>/ports/
├── IXxxRepository.ts   ← interface, no imports from outside domain
└── index.ts            ← export type { IXxxRepository }
```

Application services depend only on the port interface, never the adapter.

---

### 5. Single Source of Truth in Shared Kernel

`src/domain/shared/` may re-export types from canonical bounded contexts but
must **never duplicate** type definitions. When a type moves to its canonical
location, the shared re-export becomes a pure `export { ... } from '../context/types'`.

---

### 6. Result Propagation

Callers of `create()` factories must propagate `Result<T>` — no silent unwrap:

```typescript
// ✅ Correct
const idResult = FooId.create(raw);
if (!idResult.ok) return Err(idResult.error);
const id = idResult.value;

// ❌ Forbidden outside tests/infra
const id = FooId.create(raw).value!;
```

---

### 7. Map Keys

Class VO instances **must never be used as `Map<VO, V>` keys** — JavaScript
Maps use `Object.is` (reference equality). Always use `.toString()` as the key:

```typescript
// ✅
const map = new Map<string, V>();
map.set(id.toString(), value);

// ❌
const map = new Map<FooId, V>(); // breaks — two instances with same value are different keys
```

---

### 8. Deprecated Bridge Functions

Legacy bridge functions (`toFooId()`, `toAgentId()`, etc.) are permitted
temporarily for cross-domain backward compatibility. They must:
- Be tagged `@deprecated` with JSDoc
- Delegate to the class VO factory
- Be removed within 2 sprints of the VO migration completing

---

## Consequences

**Positive:**
- Invalid state is impossible to construct in the domain layer
- All boundaries (persistence, API, UI) are validated by the domain
- Refactoring is safe — the type system encodes invariants

**Negative:**
- Higher upfront cost: factory methods and Result propagation at every boundary
- Tests must compare `.toString()` or `.value` when asserting IDs against strings
- Map usage requires `.toString()` discipline

---

## Compliance Checks (run in CI)

```bash
# Must return 0 lines
grep -rn "throw new Error" src/domain --include="*.ts" \
  | grep -v "result\.ts\|\.test\.\|store\.ts\|memory-store\.ts\|quantization"

# Must return 0 lines
grep -rn "readonly _brand" src/domain --include="*.ts" | grep -v "\.test\."
```

---

## Related

- Task 001: DDD throw elimination
- Task 002: RuFlo aggregate throw elimination
- Task 003: Class VO migration (9 ID types across 6 contexts)
- Task 004: ProjectId VO consolidation + shared kernel
- Task 005: Identity VO hardening + fromSnapshot()
