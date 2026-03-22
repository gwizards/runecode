# Task 013 — Persist UsageLedger to SQLite

**Priority:** Critical (Data Loss) | **Sprint:** 1 | **Estimate:** 1.5 days

## Context

`InMemoryUsageLedgerRepository` in `src/domain/usage/repository.ts` is a TypeScript `Map`. All usage and billing data is lost on every app restart. The existing `commands/usage.rs` only reads JSONL from `~/.claude` for display-only statistics — it does not persist the domain `UsageLedger` aggregate.

## Acceptance Criteria

- [ ] A new `usage_ledgers` table in the existing rusqlite DB stores ledger state
- [ ] Two new Tauri commands: `persist_usage_ledger(ledger: RawLedger)` and `load_usage_ledgers() -> Vec<RawLedger>`
- [ ] `UsageApplicationService` calls `persist_usage_ledger` after every `recordTokenUsage` or `recordCost`
- [ ] On app start, `load_usage_ledgers` rehydrates `InMemoryUsageLedgerRepository`
- [ ] Migration: existing JSONL data from `~/.claude` is imported once on first run
- [ ] All existing usage tests pass; add persistence round-trip tests

## Technical Approach

```sql
CREATE TABLE IF NOT EXISTS usage_ledgers (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    session_id TEXT,
    records_json TEXT NOT NULL,  -- JSON array of UsageRecord (costMicroUsd after Task 012)
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_ledgers_project ON usage_ledgers(project_id);
```

```rust
// src-tauri/src/commands/usage.rs (additions)
#[tauri::command]
pub async fn persist_usage_ledger(
    state: tauri::State<'_, AppState>,
    ledger: RawLedger,
) -> Result<(), String> { ... }

#[tauri::command]
pub async fn load_usage_ledgers(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<RawLedger>, String> { ... }
```

## Dependencies

- Task 012 (float precision fix) must land first — persist with `costMicroUsd`
