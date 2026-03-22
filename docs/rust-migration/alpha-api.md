# Alpha Team: API Layer — Rust Migration Analysis

> Analyst: Team Alpha-2 (alpha-api)
> Date: 2026-03-22
> Files analysed: `src/lib/api.ts` (2054 lines), `src/lib/apiAdapter.ts` (826 lines),
> `src/infrastructure/tauri/session-client.ts` (442 lines),
> `src/infrastructure/tauri/project-client.ts` (306 lines),
> `src/infrastructure/tauri/storage-client.ts` (254 lines),
> `src-tauri/src/web_server.rs` (2300+ lines)

---

## Summary

The TypeScript API layer is **already well-decomposed** into two distinct transport paths
that share a single `apiCall` entry-point (`apiAdapter.ts:386`):

1. **Tauri IPC path** — `invoke()` from `@tauri-apps/api/core` dispatches directly to
   registered Rust `#[tauri::command]` handlers. This path already executes in Rust; no
   migration needed.
2. **Web/REST path** — a plain `fetch()` client that speaks to the embedded Axum server
   (`web_server.rs`). This path is used when the app runs as a browser-facing web server
   (e.g. remote access via SSH or a hosted demo), and also as the fallback when the Tauri
   IPC invoke fails.

The most impactful migration targets are:

- **WebSocket session management** — currently split across TS (`apiAdapter.ts:19–255`) and
  Rust (`web_server.rs:964–1511`). The Rust side spawns the `claude` subprocess correctly
  but its wire protocol differs from the richer TS-side protocol (no `init_agent`,
  `rewind_files`, `stop_task`, `set_model`, `set_permission_mode` messages). Unifying this
  in Rust (P1) eliminates the two-headed protocol and the persistent `sessionSockets` map
  maintained in JS heap.
- **GitHub agent fetching** — currently routed through Rust commands (Tauri path: `api.ts:578`)
  but in web mode falls back to a stub (`web_server.rs:1735–1736`). Rust `reqwest` should
  own all outbound HTTP, removing the need for the frontend to touch external URLs.
- **Checkpoint management** — already substantially in Rust (`checkpoint` module, called
  from `web_server.rs:2051–2320`). The TS wrappers in `session-client.ts:238–442` are
  thin pass-throughs; no business logic lives in TS.
- **`getSetting` / `saveSetting` localStorage mirror** — `storage-client.ts:131–178`
  contains a dual-write pattern (localStorage + SQLite). This is application logic that
  should be encapsulated in a Rust key-value store with a single Tauri IPC command, not
  spread across the adapter.

`api.ts` and the three infrastructure clients are **not** candidates for Rust migration;
they are UI-binding glue. `apiAdapter.ts` contains genuine infrastructure logic (WebSocket
lifecycle, environment detection, command-to-endpoint mapping) that belongs partly in Rust
and partly in a slimmer TS adapter.

---

## API Inventory

| Command / function | Transport (current) | Currently lives in | Migrate to Rust? | Rationale |
|---|---|---|---|---|
| `execute_claude_code` | Tauri IPC → Rust `#[command]`; Web → WS | `apiAdapter.ts:413–437` (WS init) | Partially — WS server protocol upgrade | Rust owns process spawn; TS owns UI event dispatch |
| `continue_claude_code` | Same as execute | `apiAdapter.ts:413` | Same | Same |
| `resume_claude_code` | Same as execute | `apiAdapter.ts:413` | Same | Same |
| `cancel_claude_execution` | Tauri IPC or WS `interrupt` msg | `apiAdapter.ts:402–408` | No | Interrupt is a WS message send; trivial in TS |
| `initSession` | WS (web mode only) | `apiAdapter.ts:53–189` | Protocol only (P1) | Move advanced message types to Rust WS handler |
| `sendPrompt` | WS (web mode only) | `apiAdapter.ts:194–205` | Protocol only | Follow-up turn — pure WS send |
| `interruptSession` | WS (web mode only) | `apiAdapter.ts:210–215` | Protocol only | |
| `setSessionModel` | WS (web mode only) | `apiAdapter.ts:220–225` | Protocol only | |
| `setSessionPermissionMode` | WS (web mode only) | `apiAdapter.ts:230–235` | Protocol only | |
| `rewindSessionFiles` | WS (web mode only) | `apiAdapter.ts:240–245` | Yes — file I/O (P1) | Rewind is filesystem mutation; belongs in Rust |
| `stopSessionTask` | WS (web mode only) | `apiAdapter.ts:250–255` | Protocol only | |
| `initAgentSession` | WS (web mode only) | `apiAdapter.ts:696–749` | Protocol only (P1) | `init_agent` msg type not handled by Rust WS yet |
| `list_projects` | Tauri IPC | `project-client.ts:32` | Already in Rust | `commands::claude::list_projects` |
| `create_project` | Tauri IPC | `project-client.ts:51` | Already in Rust | |
| `initialize_project` | Tauri IPC + REST fallback | `project-client.ts:66–85` | Partial — remove REST fallback (P2) | Fallback raw `fetch('/api/project/init')` at line 72 |
| `get_project_sessions` | Tauri IPC | `project-client.ts:92` | Already in Rust | |
| `get_claude_settings` | Tauri IPC | `project-client.ts:110` | Already in Rust | |
| `save_claude_settings` | Tauri IPC | `project-client.ts:133` | Already in Rust | |
| `get_system_prompt` | Tauri IPC | `project-client.ts:146` | Already in Rust | |
| `save_system_prompt` | Tauri IPC | `project-client.ts:160` | Already in Rust | |
| `find_claude_md_files` | Tauri IPC | `project-client.ts:174` | Already in Rust | |
| `read_claude_md_file` | Tauri IPC | `project-client.ts:189` | Already in Rust | |
| `save_claude_md_file` | Tauri IPC | `project-client.ts:204` | Already in Rust | |
| `check_claude_version` | Tauri IPC | `project-client.ts:217` | Already in Rust | |
| `check_node_installed` | Tauri IPC | `project-client.ts:226` | Already in Rust | |
| `install_node` | Tauri IPC | `project-client.ts:235` | Already in Rust | |
| `install_claude_code` | Tauri IPC | `project-client.ts:239` | Already in Rust | |
| `get_claude_binary_path` | Tauri IPC | `project-client.ts:247` | Already in Rust | |
| `set_claude_binary_path` | Tauri IPC | `project-client.ts:261` | Already in Rust | |
| `list_claude_installations` | Tauri IPC | `project-client.ts:274` | Already in Rust | |
| `list_directory_contents` | Tauri IPC | `project-client.ts:287` | Already in Rust | |
| `search_files` | Tauri IPC | `project-client.ts:299` | Already in Rust | |
| `open_new_session` | Tauri IPC | `session-client.ts:20` | Already in Rust | |
| `get_session_output` | Tauri IPC | `session-client.ts:34` | Already in Rust | |
| `get_live_session_output` | Tauri IPC | `session-client.ts:48` | Already in Rust | |
| `stream_session_output` | Tauri IPC | `session-client.ts:62` | Already in Rust | |
| `load_session_history` | Tauri IPC | `session-client.ts:74` | Already in Rust | |
| `load_agent_session_history` | Tauri IPC | `session-client.ts:90` | Already in Rust | |
| `list_running_claude_sessions` | Tauri IPC | `session-client.ts:155` | Already in Rust | |
| `get_claude_session_output` | Tauri IPC | `session-client.ts:169` | Already in Rust | |
| `get_usage_stats` | Tauri IPC | `session-client.ts:177` | Already in Rust | |
| `get_usage_by_date_range` | Tauri IPC | `session-client.ts:192` | Already in Rust | |
| `get_session_stats` | Tauri IPC | `session-client.ts:208` | Already in Rust | |
| `get_usage_details` | Tauri IPC | `session-client.ts:226` | Already in Rust | |
| `create_checkpoint` | Tauri IPC | `session-client.ts:238` | Already in Rust | `checkpoint` module |
| `restore_checkpoint` | Tauri IPC | `session-client.ts:251` | Already in Rust | |
| `list_checkpoints` | Tauri IPC | `session-client.ts:263` | Already in Rust | |
| `fork_from_checkpoint` | Tauri IPC | `session-client.ts:274` | Already in Rust | |
| `get_session_timeline` | Tauri IPC | `session-client.ts:295` | Already in Rust | |
| `update_checkpoint_settings` | Tauri IPC | `session-client.ts:306` | Already in Rust | |
| `get_checkpoint_diff` | Tauri IPC | `session-client.ts:325` | Already in Rust | |
| `track_checkpoint_message` | Tauri IPC | `session-client.ts:347` | Already in Rust | |
| `check_auto_checkpoint` | Tauri IPC | `session-client.ts:364` | Already in Rust | |
| `cleanup_old_checkpoints` | Tauri IPC | `session-client.ts:381` | Already in Rust | |
| `get_checkpoint_settings` | Tauri IPC | `session-client.ts:403` | Already in Rust | |
| `clear_checkpoint_manager` | Tauri IPC | `session-client.ts:424` | Already in Rust | |
| `track_session_messages` | Tauri IPC | `session-client.ts:436` | Already in Rust | |
| `storage_list_tables` | Tauri IPC | `storage-client.ts:10` | Already in Rust | |
| `storage_read_table` | Tauri IPC | `storage-client.ts:28` | Already in Rust | |
| `storage_update_row` | Tauri IPC | `storage-client.ts:50` | Already in Rust | |
| `storage_delete_row` | Tauri IPC | `storage-client.ts:69` | Already in Rust | |
| `storage_insert_row` | Tauri IPC | `storage-client.ts:87` | Already in Rust | |
| `storage_execute_sql` | Tauri IPC | `storage-client.ts:104` | Already in Rust | |
| `storage_reset_database` | Tauri IPC | `storage-client.ts:117` | Already in Rust | |
| `getSetting` (key-value) | Tauri IPC + localStorage mirror | `storage-client.ts:131–148` | Yes — P2 (encapsulate in Rust) | localStorage mirror is ad-hoc cache; Rust can own the cache |
| `saveSetting` (key-value) | Tauri IPC + localStorage mirror | `storage-client.ts:157–178` | Yes — P2 | Dual-write pattern should be a single Rust command |
| `get_hooks_config` | Tauri IPC | `storage-client.ts:186` | Already in Rust | |
| `update_hooks_config` | Tauri IPC | `storage-client.ts:205` | Already in Rust | |
| `validate_hook_command` | Tauri IPC | `storage-client.ts:223` | Already in Rust | |
| `getMergedHooksConfig` | TS (3× IPC + JS merge) | `storage-client.ts:239–253` | Yes — P2 | Merge logic belongs in Rust; 3× IPC round-trips → 1 |
| `fetch_github_agents` | Tauri IPC (Rust calls GitHub API) | `api.ts:578` | Already in Rust | |
| `fetch_github_agent_content` | Tauri IPC | `api.ts:593` | Already in Rust | |
| `updateAgent` (PUT) | Raw `fetch()` PUT | `api.ts:826–843` | Yes — P2 | Bypasses apiCall; duplicate REST path in TS |
| `deleteAgent` (DELETE) | Raw `fetch()` DELETE | `api.ts:850–862` | Yes — P2 | Same — HTTP verbs not handled by apiCall |
| `check_ruflo_installed` | Tauri IPC | `api.ts:1922` | Already in Rust | |
| `install_ruflo` | Tauri IPC | `api.ts:1932` | Already in Rust | |
| `activate_ruflo_mcp` | Tauri IPC | `api.ts:1942` | Already in Rust | |
| `deactivate_ruflo_mcp` | Tauri IPC | `api.ts:1952` | Already in Rust | |
| `get_ruflo_project_status` | Tauri IPC | `api.ts:1991` | Already in Rust | |
| `get_ruflo_swarm_status` | Tauri IPC | `api.ts:2001` | Already in Rust | |
| `get_ruflo_memory_stats` | Tauri IPC | `api.ts:2015` | Already in Rust | |
| `sync_ruflo_memory_local` | Tauri IPC | `api.ts:2025` | Already in Rust | |
| `consolidate_ruflo_memory` | Tauri IPC | `api.ts:2035` | Already in Rust | |
| `set_ruflo_memory_backend` | Tauri IPC | `api.ts:2045` | Already in Rust | |

---

## Already-in-Rust (what web_server.rs already handles)

The Axum server in `web_server.rs` already implements real (non-stub) logic for:

| Handler (Rust fn) | Route | Status |
|---|---|---|
| `get_projects` (line 172) | `GET /api/projects` | Full — calls `commands::claude::list_projects` |
| `get_sessions` (line 180) | `GET /api/projects/:id/sessions` | Full |
| `get_usage` (line 229) | `GET /api/usage` | Full — reads JSONL files from `~/.claude` |
| `get_usage_range` (line 245) | `GET /api/usage/range` | Full |
| `get_usage_sessions` (line 270) | `GET /api/usage/sessions` | Full |
| `get_usage_details` (line 286) | `GET /api/usage/details` | Full |
| `get_usage_window` (line 301) | `GET /api/usage/window` | Full — 5-hour rolling token window |
| `get_usage_cost` (line 421) | `GET /api/usage/cost` | Full — shells out to `claude -p /cost` |
| `load_session_history` (line 887) | `GET /api/sessions/:id/history/:pid` | Full |
| `cancel_claude_execution` (line 932) | `POST /api/sessions/:id/cancel` | Full — sends `__CANCEL__` via mpsc channel |
| `claude_websocket_handler` (line 964) | `GET /ws/claude` | Partial — handles `execute`/`continue`/`resume`; missing `init`, `init_agent`, `interrupt`, `rewind_files`, `set_model`, `set_permission_mode`, `stop_task` |
| `execute_claude_command` (line 1156) | (internal, called from WS) | Full subprocess spawn + stdout streaming |
| `continue_claude_command` (line 1306) | (internal) | Full (`claude -c -p …`) |
| `resume_claude_command` (line ~1380) | (internal) | Full (`claude -r <session_id> …`) |
| `find_claude_md_files` (line 1569) | `GET /api/claude-md` | Full — filesystem walk with path canonicalization |
| `read_claude_md_file` (line 1625) | `GET /api/claude-md/read` | Full — restricted to `*.md` files under `$HOME` |
| `get_home_directory` (line 1539) | `GET /api/home-directory` | Full |
| `get_integrations` (line 540) | `GET /api/integrations` | Full — reads `~/.runecode/integrations.json` |
| `save_integrations` (line 555) | `POST /api/integrations` | Full |
| `init_project` (line 611) | `POST /api/project/init` | Full |
| `get_project_info` (line 636) | `GET /api/project/info` | Full |
| `get_skills_catalog_web` (line 660) | `GET /api/skills` | Full |
| `get_auth_status` (line 200) | `GET /api/auth/status` | Full — shells out to `claude auth status` |
| `list_claude_installations` (line 480) | `GET /api/settings/claude/installations` | Full |
| `get_claude_binary_path_web` (line 494) | `GET /api/settings/claude/binary-path` | Full |
| `create_checkpoint_handler` (line 2051) | `GET /api/checkpoints/create` | Full |
| `restore_checkpoint_handler` (line 2085) | `GET /api/checkpoints/restore` | Full |
| `get_checkpoint_diff_handler` (line 2152) | `GET /api/checkpoints/:id/diff` | Full |
| `fork_from_checkpoint` (line 2225) | `GET /api/checkpoints/fork` | Full |

Stubs (return empty/error in web mode, handled in Tauri path by real IPC commands):
agent CRUD, storage CRUD, hooks, MCP management, slash commands, proxy settings,
`save_claude_settings`, `save_system_prompt`, `save_claude_md_file`.

---

## Migration Priority: P1 / P2 / P3

### P1 — High Impact, Do First

**1. WebSocket protocol unification**
- Problem: The TS `initSession` (`apiAdapter.ts:53–189`) sends messages with types
  `init`, `init_agent`, `prompt`, `interrupt`, `rewind_files`, `set_model`,
  `set_permission_mode`, `stop_task`, `close`. The Rust `claude_websocket_handler`
  (`web_server.rs:964–1153`) only recognises the old `ClaudeExecutionRequest` struct
  (`command_type: "execute"|"continue"|"resume"`). All the richer message types are
  silently dropped — this means `interrupt`, `rewind_files`, `set_model` etc. are dead
  in web mode.
- Migration: Replace `ClaudeExecutionRequest` with a `WsClientMessage` enum covering all
  types. Implement `rewind_files` as a Rust filesystem operation. This also requires
  upgrading `web_server.rs` to track the active Claude process handle so `interrupt` can
  send SIGINT.
- Effort: **5–8 days**

**2. `init_agent` message type (agent sessions via WebSocket)**
- Problem: `apiAdapter.ts:696–749` sends `type: "init_agent"` but the Rust WS handler
  never matches it (`web_server.rs:1017`: only parses `ClaudeExecutionRequest`). Agent
  sessions therefore fail silently in web mode.
- Migration: Add `init_agent` handling in Rust WS handler. Wire to `commands::agents`
  module with `--agent-name` flag passed to the `claude` subprocess.
- Effort: **2–3 days**

**3. `rewindSessionFiles` implementation in Rust**
- Problem: `apiAdapter.ts:240–245` sends `{type: "rewind_files", user_message_id, dry_run}`
  over WS. No server-side handler exists. File rewind (git-based snapshot restoration) is
  file I/O — it must be in Rust.
- Migration: Implement `handle_rewind_files` in `web_server.rs` WS handler, delegating to
  the checkpoint module's snapshot restore.
- Effort: **2–3 days** (checkpoint module already has the primitives)

### P2 — Medium Impact

**4. Remove raw `fetch()` in `api.ts:826–862` (PUT/DELETE for agents)**
- `updateAgent` (line 826) and `deleteAgent` (line 850) bypass `apiCall` entirely and call
  `fetch()` with `PUT`/`DELETE` verbs because `apiCall` only supports GET/POST.
- Migration: Either extend `apiCall` to accept a method parameter, or — better — add
  `PUT /api/agents/:name` and `DELETE /api/agents/:name` handlers in Rust that actually
  implement agent management (not the current stubs at lines 1683–1700).
- Effort: **1–2 days**

**5. Consolidate `getSetting` / `saveSetting` localStorage mirror**
- `storage-client.ts:131–178` performs a dual-write: always writes to `localStorage` as a
  cache, then persists to SQLite. This cache logic is invisible to the Rust layer.
- Migration: Add a `get_app_setting(key)` / `set_app_setting(key, value)` Tauri command
  that manages an in-process cache (e.g. `DashMap`) plus SQLite write. Remove the
  `localStorage` coupling from TS.
- Effort: **1 day**

**6. `getMergedHooksConfig` as a single Rust command**
- `storage-client.ts:239–253` makes three sequential `getHooksConfig` IPC calls then
  merges in TS using `HooksManager.mergeConfigs`. This is three IPC round-trips for what
  could be one.
- Migration: Add `get_merged_hooks_config(projectPath)` Tauri command.
- Effort: **0.5 day**

**7. Remove the raw `fetch('/api/project/init')` fallback in `project-client.ts:71–84`**
- The `initialize_project` function falls back to a raw `fetch` call when the Tauri IPC
  invoke fails. This fallback is untested and creates a second codepath.
- Migration: Remove the fallback now that `POST /api/project/init` is implemented in Rust
  (`web_server.rs:611–633`). The Tauri IPC path should be the only path.
- Effort: **0.5 day**

### P3 — Low Impact / Nice to Have

**8. Replace `fetch()` outbound HTTP calls with `reqwest` in Rust**
- The only remaining outbound external HTTP call from TS is through the Tauri IPC path to
  `commands/agents.rs` which already calls GitHub from Rust. No raw external `fetch()` in
  the TS API layer.
- `web_server.rs:200–225` shells out to `claude auth status` — this could be a proper
  `reqwest` API call if Anthropic exposes a REST endpoint.
- Effort: **low priority**

**9. Deduplicate `api.ts` and the infrastructure clients**
- `api.ts` (2054 lines) duplicates every method from the three `*-client.ts` files
  (`session-client.ts`, `project-client.ts`, `storage-client.ts`). There are two call
  sites for everything. The `api` namespace object is a legacy aggregation — callers should
  use the domain clients directly.
- Migration: Mark `api.ts` methods as `@deprecated`, redirect callers to the domain
  clients, then delete `api.ts` in a follow-up.
- Effort: **2–3 days (refactoring, not Rust work)**

---

## Rust Crate Recommendations

| Need | Crate | Notes |
|---|---|---|
| Async HTTP server | `axum` | Already used. Keep at `0.7.x` |
| WebSocket (server) | `axum::extract::ws` | Already used. Sufficient for current load |
| WebSocket (client) | `tokio-tungstenite` | Not needed today; only if RuneCode must connect to external WS services |
| Outbound HTTP | `reqwest` | Already used transitively (likely via `commands/agents.rs` for GitHub). Pin to `0.11/0.12` with `rustls` feature; avoid `openssl` |
| SSE / streaming | `tokio-stream` + Axum `Body::from_stream` | For future SSE endpoint to replace some WS polling. Simpler than a full SSE crate |
| Async runtime | `tokio` | Already used. Keep `full` feature |
| Process management | `tokio::process::Command` | Already used in `execute_claude_command`. Sufficient |
| JSON | `serde_json` | Already used |
| UUID | `uuid` | Already used (`uuid::Uuid::new_v4`) |
| Concurrent state | `tokio::sync::{Mutex, RwLock}` + `dashmap` | `dashmap` for the `active_sessions` map; avoids `Mutex` contention on read-heavy lookups |
| File hashing | `sha2` | For checkpoint content-addressable storage (already implemented via `CheckpointStorage::calculate_file_hash`) |

**What to avoid:**

- `eventsource-client` — not needed. The app uses WebSocket, not SSE inbound.
- `hyper` directly — let `axum` manage the HTTP layer.
- `actix-web` — the codebase is committed to `axum`; do not introduce a second HTTP framework.

---

## Risk & Effort Estimate

| Item | Risk | Effort | Notes |
|---|---|---|---|
| P1: WS protocol unification | High | 5–8 days | Regression risk on all streaming flows. Needs integration tests covering `execute`, `continue`, `resume`, `interrupt`, `init_agent`, `rewind_files` |
| P1: `init_agent` support | Medium | 2–3 days | Blocked on agent subprocess flags in Claude CLI |
| P1: `rewindSessionFiles` in Rust | Medium | 2–3 days | Checkpoint module already has file snapshots |
| P2: PUT/DELETE agent endpoints | Low | 1–2 days | Straightforward Axum route additions |
| P2: `getSetting`/`saveSetting` consolidation | Low | 1 day | SQLite already accessible in Rust |
| P2: Merged hooks config command | Low | 0.5 day | Pure Rust aggregation |
| P2: Remove initialize_project fallback | Low | 0.5 day | One line deletion + verification |
| P3: `api.ts` deprecation | Low | 2–3 days | TS refactor only; no Rust changes |

**Total estimated effort:** 15–22 days for P1+P2 items.

**Primary risk area:** The WebSocket handler in `web_server.rs` is the critical path for all
Claude execution. Any protocol change here affects every session. The current handler has
verbose `[TRACE]` logging at every line (lines 968–1153) — this should be replaced with
`tracing::debug!` macros before the handler is expanded further, to avoid production log
spam.

---

## Streaming / SSE / WebSocket Considerations

### Current architecture

```
Browser ←—WS—→ web_server.rs:claude_websocket_handler
                        |
                   tokio::spawn → execute_claude_command
                                        |
                              tokio::process::Command (claude --output-format stream-json)
                                        |
                            AsyncBufReader line-by-line → mpsc channel → WS forward_task
```

The current design is correct in structure. Key issues:

1. **One WS connection = one Claude process.** There is no multiplexing. Multi-turn
   conversations require the TS layer to track `connectionId` and route follow-up prompts.
   The `active_sessions` map (line 96) stores `mpsc::Sender<String>` keyed by a UUID, but
   the TS `initSession` function uses its own `conn_${Date.now()}_${randomUUID}` as the key
   (`apiAdapter.ts:73`) and this key is never communicated to Rust. The cancel endpoint
   (`web_server.rs:932`) uses the session_id from the URL path, but the TS cancel code
   sends an `interrupt` WS message, not an HTTP DELETE — these two paths are not connected.

2. **`stream-json` output not fully parsed.** `execute_claude_command` streams raw JSONL
   lines as `{"type":"output","content":"<line>"}` without parsing them. The TS
   `apiAdapter.ts:122–135` wraps each message in a `CustomEvent('claude-output')`. This
   double-wrapping means the frontend receives the raw JSONL line as a string inside a
   `content` field, and must parse it again.

   **Recommendation:** Parse the JSONL in Rust and send typed messages:
   `{"type":"message","content":{...parsed...},"session_id":"..."}` — matching the
   protocol the TS layer already expects (line 121–129 of `apiAdapter.ts`).

3. **No backpressure.** The `mpsc::channel::<String>(100)` buffer (line 974) will drop
   messages if the WS client stalls. Use `tokio::sync::mpsc::channel` with a bounded buffer
   and handle the `SendError` case gracefully.

4. **`forward_task.abort()` on disconnect** (line 1151) immediately kills the forward task
   but does not cancel the `execute_claude_command` spawned task. A running Claude process
   continues after the WS closes. Add a `CancellationToken` from the `tokio-util` crate,
   or at minimum send `SIGTERM` to the child process on WS close.

### WebSocket message types (current TS-side protocol)

The TS `initSession` function sends the following messages that Rust must handle:

| `type` field | Sent by TS | Handled in Rust WS? |
|---|---|---|
| `init` | On session start | No — parsed as `ClaudeExecutionRequest` only |
| `init_agent` | On agent session start | No |
| `prompt` | On follow-up turn | No |
| `interrupt` | On user cancel | No |
| `rewind_files` | On checkpoint rewind | No |
| `set_model` | On model change | No |
| `set_permission_mode` | On permission change | No |
| `stop_task` | On background task stop | No |
| `close` | On tab close | No (WS close frame handles disconnect) |

The Rust WS handler only reads: `command_type: "execute" | "continue" | "resume"` inside
a `ClaudeExecutionRequest` struct. All other message types fall into the `Err(e)` parse
branch and send back an error.

---

## IPC Contract (new or changed Tauri commands)

The following new Tauri `#[command]` functions should be added or modified as part of this
migration:

### New commands

```rust
// P2: Replace getSetting + saveSetting dual-write pattern
#[tauri::command]
async fn get_app_setting(key: String, state: State<AppState>) -> Result<Option<String>, String>;

#[tauri::command]
async fn set_app_setting(key: String, value: String, state: State<AppState>) -> Result<(), String>;

// P2: Single-trip merged hooks configuration
#[tauri::command]
async fn get_merged_hooks_config(project_path: String) -> Result<HooksConfiguration, String>;
```

### Modified commands (web_server.rs WS handler only — Tauri IPC unchanged)

The `claude_websocket_handler` function and its `ClaudeExecutionRequest` struct should be
replaced with a `WsClientMessage` enum. This is not a new Tauri command — it is an internal
Rust change to the WS protocol.

```rust
// Replace ClaudeExecutionRequest (web_server.rs:101–109) with:
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum WsClientMessage {
    Init {
        project_path: String,
        text: String,
        model: Option<String>,
        session_id: Option<String>,
        thinking_mode: Option<String>,
        permission_mode: Option<String>,
        effort: Option<String>,
        resume_at: Option<String>,
        teams_enabled: Option<bool>,
        environment: Option<EnvironmentConfig>,
    },
    InitAgent {
        agent_name: String,
        project_path: String,
        text: String,
        model: Option<String>,
        // ...same optional fields
    },
    Prompt { text: String, thinking_mode: Option<String> },
    Interrupt,
    RewindFiles { user_message_id: String, dry_run: bool },
    SetModel { model: String },
    SetPermissionMode { mode: String },
    StopTask { task_id: String },
    Close,
}
```

The WS server responses should be extended to emit `session_id` on all message types, and
`turn_complete` / `rewind_result` / `model_changed` / `permission_mode_changed` /
`subagent_event` / `team_event` types that `apiAdapter.ts:137–178` already expects.

### Removed (after migration)

- The raw `fetch('/api/project/init')` fallback in `project-client.ts:71–84` — remove
  after verifying `initialize_project` Tauri command works in all environments.
- The raw `fetch('/api/agents/:name', {method:'PUT'})` in `api.ts:826–843` — replace with
  `apiCall('update_agent', {...})` once the Rust command is implemented.
- The raw `fetch('/api/agents/:name', {method:'DELETE'})` in `api.ts:850–862` — same.
