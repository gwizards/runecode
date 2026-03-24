# Task 008 — Architecture Hardening Sprint

**Date:** 2026-03-23
**Version:** v0.5.80 → v0.5.83

---

## Context

Post-audit architecture score is 8.1/10. Remaining violations fall into 4 clear buckets:

1. **Cross-context domain imports** — bounded contexts import VOs directly from sibling contexts instead of through the shared kernel shims. Breaks DDD isolation.
2. **HTTP/WS security surface** — 55+ HTTP endpoints have no auth; WS has no Origin header check (Cross-Site WebSocket Hijacking risk).
3. **Shared kernel barrel gap** — `SessionId` and `UserId` shims exist but aren't exported from `shared/index.ts`, forcing consumers to reach into sibling contexts.
4. **Architecture housekeeping** — ADR-001 missing codec exception clause; `Agents.tsx` bypasses infra adapter for two Tauri calls.

---

## Acceptance Criteria

- [ ] `workspace/types.ts` imports `SessionId` from `../shared/session-id`, `ProjectId` from `../shared/project-id`
- [ ] `analytics/types.ts` imports + re-exports `UserId` from `../shared/user-id`
- [ ] `usage/types.ts` imports `UserId` from `../shared/user-id`
- [ ] `shared/index.ts` exports `SessionId` and `UserId` shims
- [ ] `ruflo/types.ts` `AgentId` imported from `../agent/types` (or new `shared/agent-id.ts` shim)
- [ ] HTTP server generates startup-secret UUID and passes it to frontend at startup
- [ ] All HTTP routes (except `/api/health`) require `X-Startup-Token` header
- [ ] `/ws/claude` WS handler checks `Origin` header against localhost allowlist; rejects non-localhost origins
- [ ] `read_text_file` and `export_agent_to_file` Tauri calls in `Agents.tsx` moved to `agent-client.ts`
- [ ] ADR-001 gains "§6 Codec Exception" clause documenting allowed throws in quantization
- [ ] `npm run build` → 0 errors; 763 tests green

---

## Technical Approach

### A — Cross-context import fixes (src/domain)

**workspace/types.ts (lines 13-14):**
```typescript
// Before
import { SessionId } from '../session';
import { ProjectId } from '../project/types';
// After
import { SessionId } from '../shared/session-id';
import { ProjectId } from '../shared/project-id';
```

**usage/types.ts (line 15):**
```typescript
// Before
import { UserId } from '../identity/types';
// After
import { UserId } from '../shared/user-id';
```

**analytics/types.ts (lines 12, 22):**
```typescript
// Before
import { UserId } from '../identity/types';
export { UserId } from '../identity/types';
// After
import { UserId } from '../shared/user-id';
export { UserId } from '../shared/user-id';
```

**shared/index.ts — add exports:**
```typescript
export { SessionId } from './session-id';
export { UserId } from './user-id';
```

**ruflo/types.ts — verify AgentId shim is correct (already done in R4).**

### B — HTTP startup-secret middleware

1. In `main.rs`: generate `let startup_secret = uuid::Uuid::new_v4().to_string();`
2. Add `startup_secret: String` to `AppState` struct in web_server.rs
3. Add Tauri command `get_startup_secret() → String` that returns the secret (IPC only, not HTTP)
4. Add axum middleware function:
   ```rust
   async fn require_startup_token(
       State(state): State<Arc<AppState>>,
       headers: HeaderMap,
       request: Request,
       next: Next,
   ) -> Response {
       let path = request.uri().path();
       if path == "/api/health" {
           return next.run(request).await;
       }
       let token = headers.get("X-Startup-Token")
           .and_then(|v| v.to_str().ok())
           .unwrap_or("");
       if token != state.startup_secret {
           return (StatusCode::UNAUTHORIZED, "Unauthorized").into_response();
       }
       next.run(request).await
   }
   ```
5. Apply middleware: `.layer(from_fn_with_state(state.clone(), require_startup_token))`
6. Frontend: fetch secret via Tauri command at startup and store; attach to all HTTP calls

### C — WS Origin validation

In the `/ws/claude` handler (web_server.rs), extract `Origin` header before upgrade:
```rust
// Allow only localhost origins
let origin = headers.get("origin")
    .or_else(|| headers.get("Origin"))
    .and_then(|v| v.to_str().ok())
    .unwrap_or("");
let allowed = origin.is_empty()  // native Tauri webview has no Origin
    || origin.starts_with("http://localhost")
    || origin.starts_with("http://127.0.0.1");
if !allowed {
    return (StatusCode::FORBIDDEN, "Origin not allowed").into_response();
}
```

### D — Agents.tsx direct invoke → agent-client.ts

Move to `src/infrastructure/tauri/agent-client.ts`:
```typescript
export async function readAgentFile(path: string): Promise<string> { ... }
export async function exportAgentToFile(agentId: number, filePath: string): Promise<void> { ... }
```
Then call via `api.agents.readFile` / `api.agents.exportToFile`.

### E — ADR-001 codec exception amendment

Add section §6 to `docs/adr/001-strict-ddd-enforcement.md`:
```markdown
## §6 Codec / Algorithmic Exception

Mathematical pre-condition violations in codec and quantizer code MAY throw:
- `src/domain/shared/quantization.ts` — dimension mismatch, unknown enum codes
- `src/domain/ruflo/quantization.ts` — untrained codebook, K-means invariants

These are programmer errors (not user-input errors) and throwing is idiomatic.
They MUST NOT accept external input directly without prior validation.
```

---

## Out of Scope (deferred to next sprint)

- God-object decomposition (web_server.rs 3388L, api.ts 2039L, ClaudeCodeSession.tsx)
- DDD store layer migration (usage/store.ts, ruflo/store.ts — requires composition root changes)
- Split shared/quantization.ts (1216L) into per-context quantizers

---

## Test Requirements

- All existing 763 TypeScript tests must pass
- Build must be clean (`npm run build`, `cargo check`)
- No new test files required (changes are structural, not behavioral)
