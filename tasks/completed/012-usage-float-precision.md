# Task 012 — Fix Float Arithmetic in Usage/Billing

**Priority:** Critical (Data Correctness) | **Sprint:** 1 | **Estimate:** 1 day

## Context

`UsageLedger.summary()` in `src/domain/usage/service.ts` accumulates `costUsd` with IEEE-754 float addition across every API record. `getTotalCost()` runs a second-order `reduce` over all ledgers. Silent rounding drift compounds on every call. The same bug exists in `src-tauri/src/commands/usage.rs` statistics accumulation.

Secondary bug: `recordTokenUsage()` silently splits odd token counts 50/50 and hardcodes `model: 'unknown'`, discarding billing precision.

## Acceptance Criteria

- [ ] `costUsd` is stored and accumulated as `number` of **micro-dollars** (`i64`-safe integer, multiply by 1,000,000)
- [ ] `RawUsageRecord.costMicroUsd: number` replaces `costUsd: number` (or both fields coexist with costUsd as display-only)
- [ ] All arithmetic uses integer addition, never float accumulation
- [ ] `recordTokenUsage()` accepts the actual model name as a parameter (no more hardcoded `'unknown'`)
- [ ] Odd token counts are handled by ceiling-division, not silent floor-split
- [ ] `commands/usage.rs` updated to use the same integer accumulation
- [ ] Existing usage tests pass; add a test showing 0.1 + 0.2 micro-dollar accumulation is exact

## Technical Approach

```typescript
// Before
costUsd: number  // IEEE-754 accumulation

// After
costMicroUsd: number  // integer micro-dollars, multiply by 1_000_000 on input
                      // divide by 1_000_000 only for display
```

```rust
// Before (usage.rs)
total_cost += record.cost_usd;

// After
total_cost_micro += record.cost_micro_usd; // i64 accumulation
let display_cost = total_cost_micro as f64 / 1_000_000.0; // display only
```

## Dependencies

- Task 013 (UsageLedger persistence) should follow this fix
