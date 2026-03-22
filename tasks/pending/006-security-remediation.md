# 006 — Security Remediation (audit 2026-03-22)

**Created**: 2026-03-22
**Version target**: v0.5.17
**Source**: `logs/security-audit-2026-03-22.md`

---

## Priority 1 — High (fix before next release)

### H1: Remove `unsafe-eval` from CSP (`src-tauri/tauri.conf.json:27`)
The CSP `script-src` allows `'unsafe-eval'`. Combined with the `fs` plugin
having `$HOME/**` read/write scope, a XSS + eval chain gives an attacker full
filesystem access to the user's home directory.

**Fix**: Remove `'unsafe-eval'` from `script-src`. If Shiki or a bundled asset
requires it, use a nonce-based approach or precompile the grammar at build time.

**Test**: Load app, verify syntax highlighting still works, CSP header has no `unsafe-eval`.

---

### H2: Path canonicalization in `find_claude_md_files` (`web_server.rs:1568-1614`)
`/api/claude-md/find` endpoint builds paths from raw `projectPath` query param
using string formatting without `canonicalize()`. The sibling `read_claude_md_file`
endpoint does it correctly — apply the same pattern here.

**Fix**:
```rust
let canonical = std::fs::canonicalize(&project_path)
    .map_err(|_| "Invalid project path")?;
// then use canonical instead of raw project_path
```

**Test**: Pass `../../../etc/passwd` as projectPath — must return 400/403.

---

### H3: CORS `allow_headers(Any)` (`web_server.rs:2621-2624`)
All request headers are permitted (origin is correctly localhost-only, but headers
should be narrowed).

**Fix**: Replace `allow_headers(Any)` with explicit allowlist:
```rust
.allow_headers([
    axum::http::header::CONTENT_TYPE,
    axum::http::header::AUTHORIZATION,
    axum::http::header::ACCEPT,
])
```

---

## Priority 2 — Medium

### M1: npm CVEs — run `npm audit fix`
- GHSA-4fh9-h7wg-q85m (`mdast-util-to-hast` XSS via class attribute)
- GHSA-73rr-hh4g-fpgx (`diff` package DoS)

**Fix**: `npm audit fix` (check for breaking changes before committing)

### M2: `dangerouslySetInnerHTML` + unvalidated `lang` parameter
8 component files inject Shiki output without sanitizing the `lang` param
against a known language allowlist before `highlighter.loadLanguage()`.

**Fix**: Validate `lang` against `BUNDLED_LANGUAGES` from `shiki` before use.
Add `DOMPurify.sanitize()` around the HTML output before `__html` injection,
or switch to a safer API (`codeToHtml` with allowlisted lang).

---

## Priority 3 — Low

### L1: Rust `unwrap()` on Mutex lock (`commands/claude.rs`)
Replace `.unwrap()` with `.unwrap_or_else(|e| e.into_inner())` to prevent panic
on mutex poisoning.

### L2: Rust `unwrap()` on `components.last()` (`slash_commands.rs:108`)
Replace with `components.last().ok_or("empty path")?` to prevent panic on
empty path.

### L3: TS `unwrap()` in repository layer (3 files)
Already tracked — `unwrap()` in infra/repository is acceptable per ADR-001
(infra layer only), but should be caught by error boundary in the service layer.
No change needed unless repository is called without a service wrapper.

---

## Acceptance Criteria
- [ ] `unsafe-eval` removed from CSP and app still functional
- [ ] Path traversal test passes for `find_claude_md_files`
- [ ] CORS headers narrowed to explicit allowlist
- [ ] `npm audit fix` applied, no breaking changes
- [ ] `lang` param validated against allowlist before `loadLanguage()`
- [ ] 2 Rust panics converted to recoverable errors
- [ ] All 763+ tests green, `cargo check` clean

## Dependencies
- Task 005 (Identity VO + ADR-001) — COMPLETED ✓
