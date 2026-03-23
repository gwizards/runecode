---
name: audit-and-fix
description: 5-round swarm audit and fix of the entire codebase using RuFlo agents. Works with any tech stack.
---

# /audit-and-fix — 5-Round Swarm Audit & Fix

Run a full iterative audit of the project using a RuFlo MCP swarm. Works with any language or framework — the agents inspect the actual codebase to determine what applies.

Each round dispatches 4 parallel specialist agents (correctness, security, quality, architecture), collects findings, dispatches fixers for Critical/High issues, verifies the build, and commits. Five rounds converge toward zero critical issues.

---

## Step 0 — Project Inspection & Swarm Initialization

First, inspect the project to understand the tech stack:

```bash
ls -la                          # root structure
cat package.json 2>/dev/null || cat Cargo.toml 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null || cat pom.xml 2>/dev/null
ls src/ src-tauri/ lib/ app/ 2>/dev/null | head -20
```

Then initialize the swarm in ONE message:

```javascript
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  maxAgents: 15,
  strategy: "specialized",
  config: { consensus: "raft", memoryNamespace: "audit-fix" }
})

mcp__claude-flow__memory_store({
  key: "audit-fix-state",
  namespace: "audit-fix",
  value: {
    projectRoot: "<detected root>",
    techStack: "<detected stack: languages, frameworks, build tools>",
    buildCommand: "<detected: npm run build / cargo check / go build / pytest / mvn compile / etc>",
    testCommand: "<detected: npm test / cargo test / go test / pytest / etc>",
    round: 0,
    totalFindings: 0,
    totalFixed: 0,
    rounds: []
  }
})

mcp__claude-flow__agent_spawn({ agentType: "planner",         agentId: "queen",         model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "coder",           agentId: "fixer-core",    model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "coder",           agentId: "fixer-ui",      model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "security-auditor",agentId: "sec-auditor",   model: "sonnet" })
mcp__claude-flow__agent_spawn({ agentType: "reviewer",        agentId: "verifier",      model: "sonnet" })
```

---

## Rounds 1–5

Repeat the following block **exactly 5 times**, incrementing ROUND (1 → 5). Do not skip rounds. Each round focuses on a narrower, higher-confidence set of issues as earlier rounds resolve the most impactful problems.

---

### ROUND N — Audit Phase

Dispatch all 4 agents in **ONE message** with `run_in_background: true`:

---

**Agent 1 — Correctness & Runtime Safety**

```
Audit the codebase in <projectRoot> for Round N. Focus on runtime correctness.

Before auditing, identify the tech stack (languages, frameworks, build system).

Universal correctness checks (apply to any stack):
- Null/nil dereferences and missing null checks at boundaries
- Unchecked errors / ignored return values / swallowed exceptions
- Async/concurrent correctness: blocking calls on async threads, race conditions,
  missing locks, double-free, use-after-free
- Resource leaks: file handles, sockets, threads, timers, event listeners not cleaned up
- Integer overflow/underflow in arithmetic used for sizing or indexing
- Off-by-one errors in loops and slice/array accesses

Language-specific additions (apply whatever fits the stack):
- If Rust: unwrap/expect panics, missing spawn_blocking for blocking I/O in async fns
- If TypeScript/JS: setState after unmount, missing useEffect cleanup, stale closures
- If Go: goroutine leaks, unchecked errors, defer in loops
- If Python: mutable default arguments, except bare, resource management without context managers
- If Java/Kotlin: NullPointerException chains, unclosed streams, thread-safety in shared state

Rounds deepen each pass:
- Round 1: most obvious (panics, unchecked errors, unguarded nulls)
- Round 2: concurrency and resource management
- Round 3: edge cases in error paths and recovery logic
- Round 4: subtle invariant violations, type confusion
- Round 5: full correctness review — anything missed in rounds 1–4

Output: severity table (Critical/High/Medium/Low) with file:line and one-line description.
Save to logs/audit-round-N-correctness.md (create logs/ if needed).
```

---

**Agent 2 — Security**

```
Security audit of <projectRoot> for Round N.

Universal security checks (apply to any stack):
- Injection: SQL, command, path traversal, LDAP, template injection via user-supplied input
- Authentication/authorization: missing auth checks, hardcoded credentials, insecure defaults
- Secrets: grep for hardcoded API keys, tokens, passwords, private keys in source files
- Input validation: user input reaching sensitive operations (file I/O, subprocess, DB) without sanitization
- Dependency vulnerabilities: run the stack's audit tool (npm audit, cargo audit, pip-audit,
  govulncheck, mvn dependency-check, etc.) and report findings
- Sensitive data in logs: passwords, tokens, PII written to log output
- CSRF/XSS/CORS misconfigurations in web-facing components

Platform-specific additions:
- If Tauri/Electron: capability/permission scope, IPC input validation, file:// URL exposure
- If web API: rate limiting absent, IDOR on resource IDs, missing HTTPS enforcement
- If CLI: shell injection via subprocess arguments, temp file race conditions

Rounds deepen each pass:
- Round 1: secrets, obvious injection points, capability misconfigurations
- Round 2: input validation coverage across all entry points
- Round 3: auth/authz gaps, session management
- Round 4: dependency CVEs and supply-chain issues
- Round 5: full threat model review

Output: severity table with file:line and specific remediation.
Save to logs/audit-round-N-security.md
```

---

**Agent 3 — Code Quality & Maintainability**

```
Code quality audit of <projectRoot> for Round N.

Universal quality checks:
- Dead code: unused functions, variables, imports, exports
- Duplication: copy-paste blocks > 10 lines that should be extracted
- God objects/functions: single functions > 200 lines or classes/components with > 10 responsibilities
- Magic numbers/strings: hardcoded values that should be named constants
- Error message quality: vague errors like "something went wrong" with no context
- Test coverage gaps: critical paths with no tests
- Commented-out code blocks left in production files

Language/framework-specific:
- TypeScript: `any` casts on external data, non-null assertions on API responses
- Rust: `.clone()` where references suffice, unnecessary heap allocations
- Python: f-string vs % vs .format() inconsistency, list comprehensions vs loops
- Go: error wrapping inconsistency, named return value misuse

Rounds deepen:
- Round 1: dead code, obvious duplication, magic values
- Round 2: god objects, complex functions needing extraction
- Round 3: test coverage gaps on critical paths
- Round 4: API design consistency, error message quality
- Round 5: overall maintainability score — remaining tech debt

Output: severity table. Save to logs/audit-round-N-quality.md
```

---

**Agent 4 — Architecture & Domain Integrity**

```
Architecture audit of <projectRoot> for Round N.

Universal architecture checks:
- Dependency direction: lower layers (domain/core) must not import from higher layers (UI/infra)
- Circular dependencies between modules/packages
- Inconsistent error handling patterns across the codebase (some throw, some return Result/Either)
- Missing abstraction boundaries: direct DB/service calls from UI components
- Configuration scattered across code vs centralized config
- Environment-specific code mixed with business logic

DDD-specific (if domain/ or similar bounded context structure exists):
- Aggregates with public setters or mutable internal state
- Value objects that use primitives instead of typed wrappers
- Domain objects that throw instead of returning Result/Either/Option
- Missing repository/port interfaces (direct infra access from domain)
- Domain events not typed (raw strings instead of typed constants)

Rounds deepen:
- Round 1: dependency direction violations, circular deps
- Round 2: error handling inconsistency across layers
- Round 3: abstraction boundary gaps
- Round 4: DDD invariant violations (if applicable)
- Round 5: full architecture review — cohesion and coupling metrics

Output: severity table. Save to logs/audit-round-N-architecture.md
```

After all 4 audit agents complete, store findings in swarm memory:

```javascript
mcp__claude-flow__memory_store({
  key: "audit-round-N-findings",
  namespace: "audit-fix",
  value: {
    round: N,
    criticalCount: "<count>",
    highCount: "<count>",
    topFindings: ["<top 5 critical/high items with file:line>"]
  },
  upsert: true
})
```

---

### ROUND N — Fix Phase

Read all 4 `logs/audit-round-N-*.md` files. Triage:
- **Critical + High**: fix this round
- **Medium**: fix only if the change is < 20 lines and self-contained
- **Low**: log, do not fix

Dispatch parallel fixers in **ONE message** for non-overlapping file groups:

**Fixer A — Core/Backend files** (`run_in_background: true`, subagent_type: "coder")
```
Fix all Critical and High findings from logs/audit-round-N-correctness.md and
logs/audit-round-N-architecture.md that are in backend/core/server files.

Rules:
- Read each file before editing
- One minimal fix per issue — no refactoring beyond the finding
- After all edits, run the project's build command and verify 0 errors
- Report: list of fixes applied (file:line → description)
- Report: list of items skipped with reason
```

**Fixer B — Frontend/UI files** (`run_in_background: true`, subagent_type: "coder")
```
Fix all Critical and High findings from logs/audit-round-N-correctness.md and
logs/audit-round-N-quality.md that are in frontend/UI/client files.

Rules:
- Read each file before editing
- Do not touch backend/core files (non-overlapping with Fixer A)
- Report: list of fixes applied and skipped
```

**Fixer C — Security** (`run_in_background: true`, subagent_type: "coder")
```
Fix all Critical and High findings from logs/audit-round-N-security.md.

Rules:
- Config/capability fixes (lowest risk): apply immediately
- Simple guards/validation: apply if change is < 15 lines
- Architectural security issues: document as deferred with recommended approach
- Report: applied, deferred list
```

Wait for all fixers to complete before proceeding.

---

### ROUND N — Verify Phase

Dispatch verifier (subagent_type: "tester"):

```
Verify all Round N fixes in <projectRoot>.

1. Run the project's build command: <buildCommand>
   → Must produce 0 errors. List any errors if present — do NOT fix here.

2. Run the project's test command: <testCommand>
   → Report pass/fail and any new failures introduced this round.

3. Run any available linter: (eslint, clippy, golangci-lint, pylint, etc.)
   → Report new warnings/errors introduced this round.

4. Sanity-check the top 3 Critical findings from this round were actually fixed:
   → Re-run the specific grep/check that identified each one.

Report format:
- Build: PASS / FAIL (with error output)
- Tests: PASS / FAIL (N passed, N failed, N new failures)
- Lint: PASS / FAIL
- Critical fixes verified: list
- Issues introduced this round: list (must be empty for a clean commit)
```

---

### ROUND N — Commit

After verifier reports build PASS and no new issues introduced:

```bash
# Detect and bump patch version (works for package.json, Cargo.toml, pyproject.toml, version.go)
if [ -f package.json ]; then
  CURRENT=$(node -p "require('./package.json').version")
  NEXT=$(node -p "const v='${CURRENT}'.split('.'); v[2]=parseInt(v[2])+1; v.join('.')")
  sed -i "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEXT}\"/" package.json
  # Also bump Cargo.toml if present
  [ -f src-tauri/Cargo.toml ] && sed -i "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" src-tauri/Cargo.toml
elif [ -f Cargo.toml ]; then
  CURRENT=$(grep '^version' Cargo.toml | head -1 | sed 's/.*= *"\(.*\)"/\1/')
  NEXT=$(echo $CURRENT | awk -F. '{print $1"."$2"."$3+1}')
  sed -i "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" Cargo.toml
fi

git add -A
git commit -m "fix(audit): round N/5 — <1-line summary of top 3 fixes> (v${NEXT:-$(date +%Y%m%d)})

Co-Authored-By: claude-flow <ruv@ruv.net>"
```

If build FAILS: revert breaking files (`git checkout -- <file>`), mark those findings as "deferred", then commit the successful fixes only.

Update swarm memory:

```javascript
mcp__claude-flow__memory_store({
  key: "audit-fix-state",
  namespace: "audit-fix",
  value: {
    round: N,
    buildStatus: "PASS",
    criticalFixed: "<count>",
    highFixed: "<count>",
    deferred: ["<list>"]
  },
  upsert: true
})
```

---

## After Round 5 — Final Report

Write `logs/audit-fix-final-report.md`:

```markdown
# Audit & Fix Report — 5 Rounds
**Project:** <name>  **Stack:** <stack>  **Date:** <ISO date>

## Results by Round
| Round | Critical | High | Medium | Build | Tests |
|-------|----------|------|--------|-------|-------|
| 1     | N fixed  | N    | N      | PASS  | PASS  |
| 2     | N fixed  | N    | N      | PASS  | PASS  |
| 3     | N fixed  | N    | N      | PASS  | PASS  |
| 4     | N fixed  | N    | N      | PASS  | PASS  |
| 5     | N fixed  | N    | N      | PASS  | PASS  |

## Remaining Open Items
<anything not fixed, with severity and file:line>

## Deferred (requires architectural refactoring)
<list with recommended approach for each>

## Build & Test Status
<final build + test results>
```

Append to `logs/swarm_log.txt`:
```
[COMPLETED] <ISO-8601> — audit-and-fix (5 rounds)
Stack: <stack> | Critical fixed: N | High fixed: N | Build: PASS
```

Push to remote (if git remote exists):
```bash
git remote -v | grep -q push && git push
```

---

## Behavioral Rules

- Run all 5 rounds regardless of how many issues are found — later rounds catch subtler issues
- Each round's 4 audit agents always run in ONE parallel message
- Each round's 3 fixer agents always run in ONE parallel message (non-overlapping files)
- Never fix issues not found in the current round's audit logs
- Always run the build before committing — no broken builds ever committed
- If a fix breaks the build: revert it, mark as deferred, continue with remaining fixes
- Medium and Low findings are tracked but not fixed unless trivial (< 5 lines, zero risk)
- The verifier agent must always run before any commit
