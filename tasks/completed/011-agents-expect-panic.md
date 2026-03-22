# Task 011 — Fix Panic in agents.rs (expect → Result)

**Priority:** Critical | **Sprint:** 1 | **Estimate:** 0.5 days

## Context

`src-tauri/src/commands/agents.rs:890` contains `.expect("Failed to get app data dir")` inside an async Tauri command. When this panics, the Tokio runtime thread unwinds, leaving all agent runs stuck in `status='running'` with no cleanup path. The app appears hung until restart.

## Acceptance Criteria

- [ ] All `.expect(...)` and `.unwrap()` calls in async Tauri command functions in `agents.rs` are replaced with `?` propagation or explicit `anyhow::bail!`
- [ ] Failed `app_data_dir` lookup returns a user-friendly `Err("Could not determine app data directory")` to the frontend
- [ ] Agents stuck in `running` state are cleaned up on command error (set status to `error`)
- [ ] `cargo clippy -- -D clippy::unwrap_in_result` passes for `agents.rs`

## Technical Approach

```rust
// Before
let data_dir = app.path().app_data_dir().expect("Failed to get app data dir");

// After
let data_dir = app.path().app_data_dir()
    .context("Failed to get app data directory")?;
```

For any agent stuck in `running` state on error path, add cleanup:
```rust
if let Err(e) = result {
    db.set_agent_status(agent_id, "error").ok();
    return Err(e);
}
```

## Dependencies

- None (self-contained to agents.rs)
