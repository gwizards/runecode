# Security Audit — RuneCode
**Date**: 2026-03-22
**Auditor**: security-auditor agent
**Scope**: Static analysis — read-only, no code changes made
**Codebase version**: v0.5.15

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 3 |
| Medium   | 3 |
| Low      | 3 |
| Info     | 2 |

---

## Findings

---

### [HIGH] CSP Allows `unsafe-eval` in script-src

**File**: `src-tauri/tauri.conf.json:27`
**Issue**: The Content Security Policy includes `'unsafe-eval'` in `script-src`. This permits dynamic code execution via `eval()`, `new Function()`, and similar APIs within the Tauri WebView. If an attacker can inject content into the page (e.g., via a stored prompt in AI output rendered without proper escaping), `unsafe-eval` removes a critical line of defence against XSS escalation.
**Recommendation**: Remove `'unsafe-eval'` from `script-src`. Audit why it was added — Shiki and React production builds do not require `eval`. If a bundler or polyfill introduces it, replace with a nonce-based or hash-based CSP directive instead.

---

### [HIGH] `find_claude_md_files` Endpoint Reads Arbitrary Paths Under `$HOME` Without Canonicalization

**File**: `src-tauri/src/web_server.rs:1568-1614`
**Issue**: The `/api/claude-md/find` endpoint accepts a `projectPath` query parameter from the web client and directly constructs file paths (`format!("{}/CLAUDE.md", project_path)`) without calling `canonicalize()` or verifying the resulting path stays within the intended directory. A crafted value such as `../../etc` would resolve to `../../etc/CLAUDE.md` — which does not exist — but more targeted values could resolve real files if they happen to be named `CLAUDE.md`. The `read_claude_md_file` endpoint (`/api/claude-md/read`) does apply `canonicalize()` and a `$HOME` prefix check correctly, but `find_claude_md_files` does not apply equivalent guards before reading and returning file contents.
**Recommendation**: Apply `canonicalize()` on the constructed path before `read_to_string`, and verify the canonical path starts with a known safe prefix (e.g., the user home directory) before reading the file.

---

### [HIGH] Web Server Binds with `Any` on `allow_headers` in CORS Configuration

**File**: `src-tauri/src/web_server.rs:2621-2624`
**Issue**: The CORS layer correctly restricts `allow_origin` to localhost addresses, but uses `tower_http::cors::Any` for `allow_headers`. This means any request header — including custom headers used for auth or state mutation — is permitted from any of the allowed origins. While localhost restriction provides the primary protection, permitting all headers unnecessarily broadens the attack surface for localhost-resident malicious pages (e.g., a locally-served attacker page on port 1420).
**Recommendation**: Replace `allow_headers(Any)` with an explicit allowlist: `allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])` or equivalent minimal set.

---

### [MEDIUM] `dangerouslySetInnerHTML` Used with AI-Generated Code Content (No Sanitization)

**Files**:
- `src/components/ShikiCodeBlock.tsx:29`
- `src/components/widgets/EditWidget.tsx:67,134`
- `src/components/widgets/WriteWidget.tsx:55,99`
- `src/components/widgets/ReadWidget.tsx:273`
- `src/components/widgets/MultiEditWidget.tsx:85`
- `src/components/widgets/MCPWidget.tsx:134`

**Issue**: All these components use `dangerouslySetInnerHTML={{ __html: highlightCode(...) }}` where the `code` argument comes from AI-streamed or user-controlled content. The `highlightCode` function in `src/hooks/useShiki.ts` uses Shiki's `codeToHtml()`, which escapes HTML characters in its catch block but not in the primary path. Shiki's primary output is HTML that contains syntax-highlighted `<span>` elements — the library itself escapes the code content within those spans. However, the language parameter (`lang`) is passed to `highlighter.loadLanguage(lang as any)` without validation, and the theme parameter is passed without validation. A maliciously named language string or a corrupted Shiki grammar could potentially inject HTML into the output. Because the fallback path does escape content, risk is conditional on Shiki's own security posture.
**Recommendation**: (1) Validate the `lang` parameter against a known allowlist of language identifiers before passing to `codeToHtml`. (2) Consider wrapping `highlightCode` output with DOMPurify before injection, which would eliminate this class of risk entirely. This is especially important given that code content originates from an LLM.

---

### [MEDIUM] `npm` Dependency: `mdast-util-to-hast` — Unsanitized Class Attribute (GHSA-4fh9-h7wg-q85m, Severity: Moderate)

**File**: `package.json` (transitive dependency)
**Issue**: `mdast-util-to-hast` versions 13.0.0–13.2.0 pass class attributes through without sanitization. This is a moderate advisory meaning user-controlled Markdown that is converted to HTML could produce class values containing unexpected content. If this output is rendered in the DOM, it could be used for CSS-based attacks or bypass class-based access controls.
**Recommendation**: Run `npm audit fix` to upgrade to the patched version. Verify the patched version is being used: `npm ls mdast-util-to-hast`.

---

### [MEDIUM] `npm` Dependency: `diff` — Denial of Service in `parsePatch`/`applyPatch` (GHSA-73rr-hh4g-fpgx, Severity: Low–Medium)

**File**: `package.json` (transitive dependency)
**Issue**: `diff` versions 6.0.0–8.0.2 have a DoS vulnerability triggered by crafted patch inputs to `parsePatch` and `applyPatch`. If RuneCode passes AI-generated or file-derived diffs to these functions, a malicious input could cause the application to hang.
**Recommendation**: Run `npm audit fix`. If the fix introduces a major version bump, test diff-related functionality (checkpoint restore, file comparison views) after upgrade.

---

### [LOW] `unwrap()` Calls on `Mutex::lock()` in Production Async Code

**File**: `src-tauri/src/commands/claude.rs:1304,1319,1332,1337,1352,1378,1389,1400`
**Issue**: Multiple `Mutex::lock().unwrap()` calls exist in production (non-test) async task closures. In Rust, `Mutex::lock()` returns an error only if the mutex is poisoned (i.e., a thread panicked while holding the lock). In a Tauri desktop app with tokio tasks, a poisoned mutex would cause all subsequent lock attempts to panic, crashing the relevant command handler. The impact is a denial-of-service against the running session rather than a security breach.
**Recommendation**: Replace `.unwrap()` with `.unwrap_or_else(|e| e.into_inner())` to recover from poisoned mutexes gracefully, or propagate the error with `?`.

---

### [LOW] `unwrap()` on `components.last()` in Slash Commands

**File**: `src-tauri/src/commands/slash_commands.rs:108`
**Issue**: `components.last().unwrap()` assumes the components vector is non-empty. If a slash command path has no components (e.g., an empty string), this will panic in release builds.
**Recommendation**: Replace with `.and_then(|c| c.last()).unwrap_or("")` or a proper error return.

---

### [LOW] TypeScript `unwrap()` on Repository Snapshots May Panic at Runtime

**Files**:
- `src/domain/agent/repository.ts:26,39,44`
- `src/domain/usage/repository.ts:63,69,86,96`
- `src/domain/project/repository.ts:31,36,50`

**Issue**: The `unwrap()` helper (defined in `src/domain/shared/result.ts:35`) throws an `Error` if called on an `Err` result. These calls appear in repository methods that reconstitute aggregates from snapshots stored in in-memory maps. If a snapshot is malformed or was persisted in an inconsistent state (e.g., after a crash mid-write), `fromSnapshot()` would return an `Err` and `unwrap()` would throw an unhandled exception, crashing the affected UI path. The risk is data-dependent rather than attacker-controlled in normal use.
**Recommendation**: Replace `unwrap()` calls in repository production code with explicit error handling (`match`/`if let Err`), returning a `Result` from the repository method so callers can display an error rather than receiving an uncaught exception.

---

### [INFO] `macOSPrivateApi: true` Enabled in Tauri Configuration

**File**: `src-tauri/tauri.conf.json:12`
**Issue**: `macOSPrivateApi: true` enables access to private macOS APIs (required for some Tauri transparency/vibrancy effects). This is a known, intentional Tauri setting, but it means the app uses undocumented APIs that could change across macOS versions without notice, and App Store submission requires justification.
**Note**: Not a vulnerability in the current context but warrants documentation for App Store review and macOS compatibility planning.

---

### [INFO] `fs` Plugin Scope Grants Read/Write Access to Entire `$HOME/**`

**File**: `src-tauri/tauri.conf.json:40-53`
**Issue**: The Tauri `fs` plugin scope is configured as `["$HOME/**"]`, granting the frontend JavaScript layer permission to read and write any file under the user's home directory. This is a very broad scope — it includes `~/.ssh`, `~/.gnupg`, browser profile directories, credential stores, and any other sensitive material. While this may be intentional for a developer IDE tool, it means any XSS vulnerability in the WebView would give the attacker full read/write access to all user files.
**Recommendation**: Evaluate whether the full `$HOME/**` scope is necessary, or whether a more constrained scope (e.g., `["$HOME/.claude/**", "$HOME/projects/**"]`) would cover actual use cases. The combination of `unsafe-eval` in the CSP and `$HOME/**` fs scope creates a high-impact XSS attack chain.

---

## Categories with No Findings

- **Hardcoded secrets / API keys**: None found. The grep for `sk-`, `apikey`, `api_key`, `secret`, `password`, `bearer` in TypeScript source returned only innocuous token-count field names (e.g., `total_tokens`, `input_tokens`) — no credential literals.
- **SQL / NoSQL injection**: Not applicable — no database query layer exists in the scanned TypeScript source.
- **Command injection**: The web server spawns the `claude` binary with arguments constructed from user input (project path, model, prompt). The `project_path` is passed as `cmd.current_dir()` — not as a shell argument — and `cmd.args()` is used rather than a shell string, which prevents shell injection. No `shell: true` or `sh -c` pattern was found.
- **Insecure deserialization**: Not applicable — all JSON parsing uses `serde_json` (Rust) or `JSON.parse` (TypeScript) with typed schemas. No binary deserialization found.
- **Authentication / session management**: Not applicable — RuneCode is a local desktop app; there is no user authentication system.
- **Cryptographic weaknesses**: Not applicable — no custom cryptography. File hashing uses SHA-256 (`sha2` crate). No MD5 or SHA-1 usage found.
- **SSRF**: Not applicable — the app does not make server-side HTTP requests to user-supplied URLs.
- **Path traversal in Rust (read_claude_md_file endpoint)**: Correctly mitigated — `canonicalize()` is called and the result is checked against `$HOME` before reading.
- **Path traversal in Rust (checkpoint storage)**: The content pool uses SHA-256 hashes as filenames (hex strings only), and `canonicalize()` is used in `CheckpointManager`. No traversal vector found.
- **`dangerouslySetInnerHTML` with non-code content**: All occurrences use `highlightCode()` output (Shiki), not raw user strings or AI text output directly.

---

## Prioritized Remediation Order

1. Remove `'unsafe-eval'` from CSP — eliminates XSS escalation path that compounds the broad `$HOME/**` fs scope (HIGH)
2. Add `canonicalize()` + home-directory prefix check to `find_claude_md_files` (HIGH)
3. Narrow `allow_headers(Any)` to an explicit set in CORS config (HIGH)
4. Run `npm audit fix` for `diff` and `mdast-util-to-hast` (MEDIUM — automated fix)
5. Validate `lang` parameter in `highlightCode` against a known allowlist (MEDIUM)
6. Narrow Tauri `fs` plugin scope from `$HOME/**` to the minimum required paths (INFO → mitigates XSS impact)
7. Replace `unwrap()` in repository and Rust mutex code with proper error handling (LOW)
