// RuFloEvent was removed in v0.5.27.
// The ruflo command handlers emit ad-hoc Tauri events directly via app.emit(),
// which is idiomatic for this codebase. A typed domain event layer was not needed.
