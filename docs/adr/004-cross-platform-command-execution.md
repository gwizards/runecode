# ADR-004: Cross-Platform Command Execution

## Status: Accepted (2026-03-24)

## Context

Commands must work on Windows (native), Windows (WSL), Linux, and macOS.

## Decision

1. **PATH separator**: `if cfg!(windows) { ";" } else { ":" }`
2. **NVM detection**: `path_contains_component()` normalizes `\` to `/`
   before matching
3. **Homebrew**: `#[cfg(target_os = "macos")]` only
4. **Node detection**: `where` on Windows, `which` on Unix
5. **.cmd stripping**: `wsl_command()` strips `.cmd` suffix when routing
   through WSL
6. **Home canonicalization**: Both path AND home canonicalized before
   `starts_with` comparison
7. **\\\\?\\ prefix**: Stripped on Windows before passing to `cmd.cwd()`

## Consequences

- Platform-agnostic path handling across 3 OS targets + WSL
