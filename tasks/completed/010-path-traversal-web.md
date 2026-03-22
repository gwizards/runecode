# Task 010 — Fix Path Traversal in Web Server

**Priority:** Critical (Security) | **Sprint:** 1 | **Estimate:** 0.5 days

## Context

`web_server.rs:2566` — `list_directory_contents` in web mode has no path restriction. Any network-accessible requester can enumerate arbitrary filesystem paths. The Tauri command version (`claude.rs:1424`) correctly restricts to the home directory via `canonicalize()` + home-dir prefix check. The web handler skips this check entirely.

## Acceptance Criteria

- [ ] `list_directory_contents` in `web_server.rs` applies the same canonicalize + home-dir prefix guard as `claude.rs:1424`
- [ ] Requests for paths outside `$HOME` return HTTP 403 Forbidden
- [ ] Symlinks that escape `$HOME` are rejected (canonicalize resolves them first)
- [ ] A unit test covers the path outside home case
- [ ] Existing directory listing tests still pass

## Technical Approach

Extract the path-guard logic from `claude.rs:1424` into a shared function in a new `src-tauri/src/path_guard.rs`:

```rust
pub fn require_within_home(path: &std::path::Path) -> anyhow::Result<std::path::PathBuf> {
    let canonical = path.canonicalize()
        .context("path does not exist or is not accessible")?;
    let home = dirs::home_dir().context("cannot determine home directory")?;
    if !canonical.starts_with(&home) {
        anyhow::bail!("path outside home directory: {}", canonical.display());
    }
    Ok(canonical)
}
```

Call `require_within_home` at the top of `list_directory_contents` before any directory read. Return `(StatusCode::FORBIDDEN, "Access denied")` on error.

## Dependencies

- None
