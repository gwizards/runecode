# RuneCode — Autonomous Project Manager

## PROJECT

- **Stack**: Tauri 2.x (Rust) + React 19 + TypeScript + Vite 8
- **Architecture**: DDD · 10 bounded contexts · Result<T> monads · hexagonal ports
- **Files**: max 500 lines · typed public APIs · validated at boundaries
- **Version**: bump ALL 3 files (package.json, Cargo.toml, tauri.conf.json) before every push

## BUILD & TEST

```bash
npm run build              # TypeScript — must pass before commit
npx vitest run             # 763+ tests — must pass before commit
cargo check --manifest-path src-tauri/Cargo.toml  # Rust — zero errors
```

## COMMIT PROTOCOL

```bash
# 1. Bump version
CURRENT=$(node -p "require('./package.json').version") && NEXT=$(node -p "const v='${CURRENT}'.split('.'); v[2]=parseInt(v[2])+1; v.join('.')") && sed -i "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEXT}\"/" package.json && sed -i "s/^version = \"${CURRENT}\"/version = \"${NEXT}\"/" src-tauri/Cargo.toml && sed -i "s/\"version\": \"${CURRENT}\"/\"version\": \"${NEXT}\"/" src-tauri/tauri.conf.json

# 2. Commit with conventional commit + co-author
git commit -m "$(cat <<'EOF'
<type>(<scope>): <description> (v<version>)

<body>

Co-Authored-By: claude-flow <ruv@ruv.net>
EOF
)"

# 3. Push (triggers CI build + release)
git push runecode main
```

Types: `feat` · `fix` · `refactor` · `test` · `docs` · `chore`

## BEHAVIORAL RULES

- Do exactly what was asked — nothing more, nothing less
- ALWAYS read a file before editing it
- ALWAYS prefer editing existing files over creating new ones
- ALWAYS run build + tests before committing
- ALWAYS bump version before pushing
- NEVER commit secrets, `.env` files, or credentials
- NEVER save files to root — use `/src`, `/tests`, `/docs`, `/config`
- Use parallel agents (`run_in_background: true`) for multi-file tasks
- Batch all related operations in ONE message

## WSL INTEGRATION (CRITICAL)

When modifying WSL-related code:

- **Commands**: Use `wsl -e /bin/bash -lc "cmd"` — NEVER `wsl -- bash -lc`
- **File reads**: Use UNC paths (`\\wsl.localhost\` or `\\wsl$\`) as primary
- **Login shell**: Required for nvm/conda — `-e /bin/bash -lc` loads PATH
- **Complex scripts**: Pipe via stdin to `wsl -e /bin/bash -l`, not `-lc` arg
- **Path guards**: Skip `guard_path_within_home` for WSL Linux paths
- **Cache**: UNC paths cached per distro in `UNC_CACHE` static
- **No .cmd**: Strip `.cmd` suffix when routing through WSL
- **CSP**: Do NOT add `csp` to tauri.conf.json — Tauri 2 overrides break IPC

## SECURITY

- `silent_command()` on all `Command::new` calls (CREATE_NO_WINDOW on Windows)
- `guard_path_within_home()` / `require_within_home()` on all file ops
- `validate_distro_name()` before WSL shell invocations
- Startup token on all HTTP endpoints + terminal WS
- No custom CSP — Tauri manages its own

## AGENT ROUTING

| Complexity | Model | Use for |
|-----------|-------|---------|
| Simple / mechanical | `haiku` | File edits, formatting, type fixes |
| Standard | `sonnet` | Features, reviews, bug fixes |
| Architecture / security | `opus` | Design decisions, audits |

## SWARM (RuFlo)

For multi-file tasks, use Claude Code Agent tool with `run_in_background: true`.
For single-file edits — handle directly, no swarm needed.

## SUPPORT

- Repo: https://github.com/gwizards/runecode
- RuFlo: https://github.com/ruvnet/claude-flow
