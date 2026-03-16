# Contributing to RuneCode

Thanks for your interest in contributing to [RuneCode](https://runecode.sh) — the glassmorphic desktop engine for Claude Code, created by [Mr Polti](https://www.youtube.com/@MrPoltiOfficial) from [Wizards](https://www.wizards.us).

Before contributing, check existing [issues](https://github.com/gwizards/runecode/issues) and pull requests to avoid duplicate work.

## Getting Started

```bash
git clone https://github.com/gwizards/runecode.git
cd runecode
bun install
bun run tauri dev     # Desktop with hot reload
bun run dev           # Frontend only
```

### Prerequisites

- **Rust** 1.70+
- **Bun**
- **Git**
- Platform-specific dependencies (see [README](README.md#build-from-source))

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite 8 (Rolldown) |
| **Styling** | Tailwind CSS v4, glassmorphic design tokens |
| **Desktop** | Tauri 2 (Rust backend) |
| **Server** | Axum (headless mode) |

RuneCode uses a **glassmorphic design language** with rune-themed accents and a dark-first aesthetic. All UI contributions should follow this visual direction.

## Project Structure

```
runecode/
├── src/                        # React frontend
│   ├── components/             # UI components (widgets, sidebar, shadcn/ui)
│   ├── integrations/           # Partner integration framework
│   │   ├── compute/            # Resource monitor, cloud eject
│   │   ├── security/           # .env scanner, warnings
│   │   ├── intelligence/       # LLM gateway recommendation
│   │   └── observability/      # Helicone cost guard
│   ├── stores/                 # Zustand state
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # API client, utilities
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── commands/           # Tauri commands
│       ├── web_server.rs       # Axum server for headless mode
│       └── main.rs             # Desktop entry point
└── public/                     # Static assets
```

### Partner Integrations (`src/integrations/`)

The integrations framework provides opinionated stack defaults for compute, security, intelligence, and observability. When adding a new integration, follow the existing pattern in `src/integrations/` and register it with the sidebar skills catalog.

## Pull Request Guidelines

Use these title prefixes:

- `Feature:` new features
- `Fix:` bug fixes
- `Docs:` documentation changes
- `Refactor:` code refactoring
- `Improve:` performance improvements

Include a clear description of the problem, your approach, and any limitations. Sync your fork with the latest `main` before opening a PR.

## Coding Standards

### Frontend (React / TypeScript)

- TypeScript for all new code
- Functional components with hooks
- Tailwind CSS v4 for styling — use existing glassmorphic design tokens
- JSDoc comments for exported functions and components

### Backend (Rust)

- `cargo fmt` before committing
- `cargo clippy` with no warnings
- Handle all `Result` types explicitly
- Document public APIs with `///` comments

### Security

- Validate all inputs from the frontend
- Use prepared statements for database operations
- Never log sensitive data (tokens, passwords, etc.)
- Use secure defaults for all configurations

## Testing

- Add tests for new functionality
- Run `cargo test` for Rust code
- Test the application manually before submitting
- Ensure all existing tests pass

## License

By contributing, you agree that your contributions will be licensed under [AGPL-3.0](LICENSE).

---

<div align="center">
  <a href="https://runecode.sh">runecode.sh</a> · <a href="https://github.com/gwizards/runecode/issues">Report Bug</a> · <a href="https://github.com/gwizards/runecode/issues">Request Feature</a>
</div>
