# Alpha Team: Storage, Usage & Analytics — Rust Migration Analysis

_Audit date: 2026-03-22 | Analyst: Team Alpha-3 (alpha-storage)_

---

## Summary

RuneCode already has significant Rust coverage in the right places: the checkpoint system is
fully Rust (tokio, sha2, zstd, serde), the admin storage commands use rusqlite directly, and
the JSONL-based usage stats reader is also Rust. The remaining TypeScript layers that are
worth migrating to Rust fall into two categories:

1. **High-correctness risk**: the `UsageLedger` aggregate accumulates `costUsd` with raw
   float addition across every API call. This is the single most dangerous piece of code to
   leave in TS: floating-point drift accumulates silently.

2. **Background infrastructure**: the analytics pipeline (event queue + flush interval +
   PostHog HTTP) runs entirely in the JS event loop. Moving batching and retry to a tokio
   background task would make it fire-and-forget from the React layer and survive renderer
   crashes.

The session aggregate, consent store, and React hooks are UI-adjacent and belong in
TypeScript — migrating them would cost more than it gains.

---

## Storage Inventory

| Subsystem | Current layer | Rust candidate | Effort |
|---|---|---|---|
| Agent DB (agents, agent_runs, app_settings) | Rust — `rusqlite` via `AgentDb` Mutex | Already Rust — complete | — |
| Usage stats reader (JSONL files from `~/.claude`) | Rust — `commands/usage.rs`, filesystem walk + `serde_json` | Already Rust — complete | — |
| UsageLedger aggregate (open/addRecord/seal, snapshot) | TypeScript — `InMemoryUsageLedgerRepository` (in-process Map) | Tauri command + SQLite table | High |
| UsageLedger repository — persistence | TypeScript — in-memory only (no durable write) | `rusqlite` INSERT/UPDATE | High |
| Session aggregate (status, tokenUsage, output) | TypeScript — in-memory | Keep in TS (UI-bound) | — |
| Analytics consent + settings | TypeScript — `localStorage` | Keep in TS (browser API needed) | — |
| Analytics event queue + flush interval | TypeScript — `setInterval` in renderer | Tauri command → tokio task | Medium |
| Analytics PostHog HTTP call | TypeScript — posthog-js SDK | Keep in TS (SDK dependency) | — |
| Checkpoint metadata + file snapshots | Rust — `checkpoint/storage.rs` + zstd + SHA-256 | Already Rust — complete | — |
| Checkpoint timeline tree | Rust — JSON on disk via `serde_json` | Already Rust — complete | — |
| Checkpoint state (session → manager map) | Rust — `checkpoint/state.rs` + `Arc<RwLock<...>>` | Already Rust — complete | — |

---

## Usage/Ledger — Precision & Correctness Concerns

### Current float accumulation (critical issue)

`UsageLedger.summary()` in `/src/domain/usage/types.ts` lines 291-319 accumulates cost:

```typescript
let totalCostUsd = 0;
for (const r of this._records) {
  totalCostUsd += r.costUsd;   // IEEE-754 float addition, unbounded drift
}
```

Each `RawUsageRecord` carries a `costUsd: number` (JavaScript `f64`). Adding many small
floats produces well-known rounding drift. For example:
- 1000 calls at $0.001 each should total $1.000000 exactly
- IEEE-754 f64 addition gives $0.9999999999999... or $1.0000000000001...

`getTotalCost()` in the service then does a second-order `reduce` over all ledgers, doubling
the accumulation surface. There is no integer guard anywhere in the chain.

The Rust `usage.rs` file (`calculate_cost`) uses f64 multiplication per call and
then accumulates with `total_cost += entry.cost` — the same pattern. Both layers need
remediation.

### Recommendation for Rust migration

Represent `costUsd` internally as **micro-dollars (i64, 1_000_000 = $1.00)** in a new
`UsageLedgerRecord` SQLite table. Accept float from callers at the boundary, convert
immediately via `(cost_usd * 1_000_000.0).round() as i64`. Return float to the front-end
only at the read boundary. This is the Go pitfall pattern from `CLAUDE.md` applied here.

```rust
// Proposed Tauri command — boundary conversion only
pub fn record_usage(cost_usd: f64, input_tokens: u64, ...) -> Result<(), String> {
    let cost_microdollars: i64 = (cost_usd * 1_000_000.0).round() as i64;
    conn.execute(
        "INSERT INTO usage_records (cost_microdollars, input_tokens, ...) VALUES (?1, ?2, ...)",
        params![cost_microdollars, input_tokens, ...],
    )?;
    Ok(())
}
```

### Model pricing constants are f64 in Rust (secondary issue)

`commands/usage.rs` lines 67-76 define pricing as raw `f64` constants and multiplies:

```rust
const SONNET_4_INPUT_PRICE: f64 = 3.0;  // per million tokens
let cost = (input_tokens * input_price / 1_000_000.0) + ...;
```

This is acceptable for the display-only stats reader that reads historical JSONL. It does
not accumulate state. However if this calculation is ever persisted, it should switch to
integer micro-dollars.

### The `recordTokenUsage` split bug

`UsageApplicationService.recordTokenUsage()` in `service.ts` lines 204-205:

```typescript
const half = Math.floor(tokens / 2);
// inputTokens = half, outputTokens = tokens - half
```

For odd token counts (e.g. 101 tokens), this silently assigns 50 input + 51 output. The
split is irreversible and the model field is hardcoded to `'unknown'`. This facade method
is a precision hazard: callers who have the real per-direction token breakdown should use
`recordUsage()` directly. The Rust migration is a good opportunity to remove this facade.

---

## Analytics Pipeline — Event Batching Migration Design

### Current TypeScript architecture

```
React component
  → useAnalytics() hook (661 lines, ~350 lines of pure event dispatch wrappers)
  → analytics.track() [AnalyticsService singleton]
  → eventQueue.push() + flushEvents() [setInterval 5s]
  → posthog-js SDK (HTTP to us.i.posthog.com)
```

The `AnalyticsService` in `analytics-service.ts` holds a `AnalyticsEvent[]` queue in
memory and flushes every 5 seconds via `setInterval`. If the renderer crashes or the user
hard-closes the window, queued events are lost. There is no retry, no WAL, no backoff.

### What is UI binding vs pure event logic in `useAnalytics.ts`

The 661-line hook file breaks down as:

- Lines 1-43 (`useAnalytics`, `useTrackEvent`): thin React wrappers — must stay in TS.
- Lines 44-354 (`useTrackEvent` body): 310 lines of 1:1 forwarding from hook method →
  `eventBuilders.*` → `analytics.track()`. This is **pure dispatch with zero UI logic**:
  it creates a typed object and calls track. It could be replaced by a single Tauri command
  call per event with no behaviour loss.
- Lines 355-661 (composite hooks: `useWorkflowTracking`, `useAIInteractionTracking`,
  `useFeatureAdoptionTracking`, etc.): these hold `useRef` state across renders — they are
  UI-lifecycle-bound and must stay in TypeScript.

### Proposed Rust analytics backend (tokio task)

```rust
// src-tauri/src/analytics/mod.rs

pub struct AnalyticsBackend {
    queue: Arc<Mutex<Vec<AnalyticsEvent>>>,
    endpoint: String,
}

impl AnalyticsBackend {
    pub async fn start_flush_loop(self: Arc<Self>) {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            self.flush().await;
        }
    }

    async fn flush(&self) {
        let events = { self.queue.lock().unwrap().drain(..).collect::<Vec<_>>() };
        if events.is_empty() { return; }
        // HTTP POST to PostHog batch endpoint with exponential backoff
        // reqwest + tokio — no JS event loop dependency
    }
}

// Tauri command (called from React)
#[tauri::command]
pub async fn analytics_track(
    state: State<'_, AnalyticsBackend>,
    event_name: String,
    properties: serde_json::Value,
) -> Result<(), String> {
    state.queue.lock().unwrap().push(AnalyticsEvent { event_name, properties, ... });
    Ok(())
}
```

The React side simplifies to a single `invoke('analytics_track', { ... })` per event. The
310-line forwarding section of `useTrackEvent` collapses to thin typed wrappers around that
single command.

**Benefit**: events survive renderer reloads, retry is handled in Rust, no `setInterval`
competing with the JS event loop.

**Constraint**: the PostHog `onLoaded` callback and `opt_in_capturing` call at init time
must remain in TS because they depend on the posthog-js SDK's browser API. Only the
queueing/batching/HTTP leg moves to Rust.

---

## Already-in-Rust: Checkpoint System Assessment

The checkpoint system (`src-tauri/src/checkpoint/`) is well-implemented and does not need
migration. Key properties confirmed:

| Property | Assessment |
|---|---|
| Content integrity | SHA-256 via `sha2` crate on every file snapshot — correct |
| Compression | `zstd` level 3 for both message JSONL and file content — correct |
| Content-addressable storage | Files stored by hash in `content_pool/`, deduplicated across checkpoints — good |
| Path traversal protection | `canonicalize()` + `starts_with(canonical_project)` on both track and restore — correct |
| Concurrency | `Arc<RwLock<...>>` for `FileTracker`, `SessionTimeline`, `current_messages` — correct |
| Session lifecycle | `CheckpointState` holds a `HashMap<session_id, Arc<CheckpointManager>>` — correct |
| GC | `garbage_collect_content()` removes orphaned hash files after checkpoint pruning — correct |
| Branching | Timeline tree supports forks via `parent_checkpoint_id` and `children` — complete |

One observation: `create_checkpoint` does a full project walk (via the inner
`collect_files` closure) on every checkpoint invocation to ensure all files are tracked.
This is `O(total files)` blocking I/O on the async runtime thread because it uses
`std::fs::read_dir` synchronously inside a tokio context. For large projects this will
starve other tasks. Recommend wrapping this walk in `tokio::task::spawn_blocking`.

---

## Migration Priority

### P1 — Fix now (correctness/data-integrity)

1. **UsageLedger cost accumulation**: convert `costUsd` to integer micro-dollars at the
   Tauri boundary. Add a `usage_records` SQLite table managed by the existing `AgentDb`
   connection. This removes the in-memory-only limitation (ledgers are lost on app restart)
   and eliminates float accumulation.

2. **Remove `recordTokenUsage` facade**: the silent 50/50 token split loses billing
   precision. Callers should provide explicit per-direction counts.

3. **Persist ledgers to SQLite**: `InMemoryUsageLedgerRepository` is the only
   implementation. App restart currently wipes all open ledgers. The Rust
   `commands/usage.rs` already reads from `~/.claude` JSONL but does not write. A
   `usage_ledgers` SQLite table with JSON-serialized records column would close this gap
   with minimal effort.

### P2 — High value, moderate effort

4. **Analytics event queue to Rust tokio task**: replace `setInterval` + posthog-js queue
   with a Tauri-managed `tokio::time::interval` flush loop. Adds durability and retry.
   Requires adding `reqwest` to Cargo.toml.

5. **Session persistence via SQLite**: `SessionApplicationService` and
   `SessionApplicationService.repo` are in-memory only. Session state (status, tokenUsage,
   output) is lost on restart. A `sessions` table in the agent DB would fix this with the
   existing `rusqlite` infrastructure.

### P3 — Nice to have, low urgency

6. **`searchByEmbedding` in Rust**: `InMemoryUsageLedgerRepository.searchByEmbedding()`
   implements int8 cosine similarity over 6-element feature vectors. Moving this to Rust
   (with `ndarray` or manual SIMD) is premature — the vector is only 6 dimensions and the
   TS implementation is correct and tested.

7. **Checkpoint walk — `spawn_blocking`**: wrap the synchronous `collect_files` walk in
   `tokio::task::spawn_blocking` to prevent blocking the async runtime. Low risk, minor
   latency improvement for large projects.

---

## Rust Crate Recommendations

| Crate | Version | Purpose |
|---|---|---|
| `rusqlite` | current (already used) | SQLite persistence for ledgers and sessions |
| `serde` + `serde_json` | current (already used) | Serialize/deserialize domain snapshots |
| `sha2` | current (already used in checkpoint) | Integrity hashing — reuse in ledger records |
| `tokio` | current (already used) | Background analytics flush loop |
| `reqwest` | 0.12 | HTTP POST to PostHog batch endpoint from tokio task |
| `chrono` | current (already used) | Timestamp handling for ledger openedAt/sealedAt |
| `uuid` | current (already used in checkpoint) | Ledger ID generation — reuse |
| `zstd` | current (already used in checkpoint) | Optional: compress ledger snapshots on disk |
| `anyhow` | current (already used) | Error propagation in new commands |

No new crates are needed for the P1 items. `reqwest` is the only addition required for
the P2 analytics task.

---

## Risk & Effort Estimate

| Item | Risk | Effort | Notes |
|---|---|---|---|
| Float → micro-dollar conversion (P1) | Low | 2–3 days | Additive: new table + Tauri commands; old TS layer can remain during migration |
| SQLite persistence for ledgers (P1) | Medium | 3–5 days | Schema design, migration of in-memory state, IUsageLedgerRepository adapter |
| Remove `recordTokenUsage` (P1) | Low | 0.5 days | Breaking change for any callers — audit usages first |
| Analytics tokio flush loop (P2) | Low | 3–4 days | Requires `reqwest`; PostHog SDK init stays in TS |
| Session persistence (P2) | Medium | 4–6 days | Output array can be large; needs pagination on read |
| Checkpoint `spawn_blocking` fix (P3) | Very Low | 0.5 days | Wrap one closure in spawn_blocking |
| `searchByEmbedding` migration (P3) | Low | 2 days | Not yet worth it — dataset is tiny |

**Total P1 estimate**: 6–9 days of focused work.
**Total P2 estimate**: 7–10 days.

The P1 items are independent of each other and can be parallelised across two engineers.
The float-to-integer conversion is the single highest-leverage change: it eliminates a
silent data-quality bug that compounds with every API call recorded.

---

## Appendix: Files Reviewed

- `/home/koves/GitHub/runecode/src/domain/usage/types.ts` (373 lines)
- `/home/koves/GitHub/runecode/src/domain/usage/service.ts` (255 lines)
- `/home/koves/GitHub/runecode/src/domain/usage/repository.ts` (129 lines)
- `/home/koves/GitHub/runecode/src/domain/usage/ports/IUsageLedgerRepository.ts` (47 lines)
- `/home/koves/GitHub/runecode/src/domain/session/types.ts` (394 lines)
- `/home/koves/GitHub/runecode/src/domain/session/service.ts` (163 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/commands/storage.rs` (628 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/commands/usage.rs` (715 lines)
- `/home/koves/GitHub/runecode/src/infrastructure/analytics/events.ts` (702 lines)
- `/home/koves/GitHub/runecode/src/infrastructure/analytics/analytics-service.ts` (283 lines)
- `/home/koves/GitHub/runecode/src/infrastructure/analytics/types.ts` (447 lines)
- `/home/koves/GitHub/runecode/src/infrastructure/analytics/consent.ts` (139 lines)
- `/home/koves/GitHub/runecode/src/hooks/useAnalytics.ts` (661 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/checkpoint/mod.rs` (263 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/checkpoint/manager.rs` (843 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/checkpoint/storage.rs` (460 lines)
- `/home/koves/GitHub/runecode/src-tauri/src/checkpoint/state.rs` (185 lines)
