# ADR-003: Tauri 2 Security Model

## Status: Accepted (2026-03-24)

## Context

Tauri 2 desktop app needs defense-in-depth without breaking IPC.

## Decision

1. **No custom CSP**: Tauri 2 overrides `script-src` with auto-generated
   hashes, dropping `unsafe-inline`/`data:` -- this breaks its own script
   injection. Remove CSP entirely.
2. **Startup token**: UUID generated at launch, required on all HTTP
   endpoints via `X-Startup-Token` header
3. **Path guards**: `guard_path_within_home()` on all file operations
   (68 calls)
4. **Silent commands**: `CREATE_NO_WINDOW` on all `Command::new` via
   `silent_command()`
5. **WSL validation**: `validate_distro_name()` before shell invocations
6. **Origin validation**: WS connections reject non-localhost origins
7. **Flags whitelist**: Terminal server only accepts known-safe Claude CLI
   flags

## Consequences

- 0 CVEs, 0 critical security findings
- All Tauri IPC works correctly on Windows WebView2
