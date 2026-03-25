# ADR-006: Build and CI Architecture

## Status: Accepted (2026-03-25)

## Context
RuneCode ships as a cross-platform desktop app with CI-built binaries for Windows, Linux, and macOS.

## Decision
1. **Build & Release on every push to main**: `build-and-release.yml` builds all platforms
2. **cancel-in-progress: false**: Builds queue, never cancel — ensures every push produces artifacts
3. **Version from tauri.conf.json**: CI reads version from config, creates/updates release tag
4. **Bun for frontend**: `bun install` + `bun run build` for speed
5. **Rust caching**: `Swatinem/rust-cache` for Cargo dependencies
6. **Bun caching**: `actions/cache` for node_modules per platform
7. **paths-ignore**: Docs-only commits don't trigger builds
8. **Build Test only on PRs**: Main pushes handled by Build & Release (no duplicate)
9. **macOS conditional**: Skipped when Apple signing secrets absent
10. **DevTools enabled**: `devtools` Cargo feature + F12 keyboard shortcut in all builds

## Consequences
- ~10 min build time per push (Linux + Windows in parallel)
- Every version bump creates a distinct GitHub release
- ~50% CI minutes saved vs. original duplicate-build setup
