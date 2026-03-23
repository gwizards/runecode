// CliResultCache was removed in v0.5.28.
// The ruflo command module already has a file-based TTL cache (try_read_cache /
// write_cache) that covers the same use case without requiring a separate SQLite
// connection. There was no call site for CliResultCache anywhere in the codebase.
