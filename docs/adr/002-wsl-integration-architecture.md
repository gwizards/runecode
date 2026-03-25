# ADR-002: WSL Integration Architecture

## Status: Accepted (2026-03-25)

## Context

RuneCode runs as a Windows desktop app (Tauri 2) but needs to execute
Claude Code, npm, git, and other tools inside WSL2 Linux distributions.

## Decision

1. **Command execution**: `wsl -e /bin/bash -lc "cmd"` (never `wsl -- bash -lc`)
2. **File access**: UNC paths (`\\wsl.localhost\` or `\\wsl$\`) as primary,
   wsl.exe as fallback
3. **Path conversion**: `C:\Users\foo` -> `/mnt/c/Users/foo` via
   `windowsToWslPath()`
4. **Parameter threading**: `wsl_distro: Option<String>` on all
   process-spawning Tauri commands
5. **Login shell required**: `-e /bin/bash -lc` loads nvm/conda PATH
6. **Complex scripts**: Piped via stdin to avoid quoting issues
7. **UNC caching**: `UNC_CACHE` static per distro to avoid repeated
   wsl.exe spawns
8. **No CSP**: Custom CSP breaks Tauri 2 IPC on Windows

## Consequences

- 30+ Tauri commands accept `wsl_distro` parameter
- Frontend uses `wslParam()` from `platformMode.ts` for all invoke calls
- `wsl_command()` in ruflo auto-rewrites `npx @claude-flow/cli` to
  `claude-flow`
- `guard_path_within_home` skipped for WSL Linux paths
