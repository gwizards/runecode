<div align="center">
  <img src="public/runecode-logo.svg" alt="RuneCode Logo" width="140" height="140">

  <h1>RuneCode</h1>

  <p><strong>The autonomous development environment that turns Claude Code<br>into a full-featured desktop IDE with AI swarm orchestration.</strong></p>

  <p>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/github/v/release/gwizards/runecode?style=for-the-badge&color=8b5cf6&label=Release" alt="Latest Release"></a>
    <a href="https://github.com/gwizards/runecode/stargazers"><img src="https://img.shields.io/github/stars/gwizards/runecode?style=for-the-badge&color=e9d5ff&label=Stars" alt="Stars"></a>
    <a href="https://discord.com/invite/KYwhHVzUsY"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
    <a href="https://runecode.sh"><img src="https://img.shields.io/badge/runecode.sh-website-6d28d9?style=for-the-badge" alt="Website"></a>
  </p>

  <h3>Download</h3>

  <p>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/Windows-.msi%20%2F%20.exe-0078d4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"></a>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/Linux-.AppImage%20%2F%20.deb-f97316?style=for-the-badge&logo=linux&logoColor=white" alt="Linux"></a>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/macOS-.dmg_(Universal)-888888?style=for-the-badge&logo=apple&logoColor=white" alt="macOS"></a>
  </p>

  <sub>Created by <a href="https://www.youtube.com/@MrPoltiOfficial"><strong>Mr Polti</strong></a> from <a href="https://www.wizards.us"><strong>Wizards</strong></a></sub>
</div>

---

## Why RuneCode?

- **Real desktop GUI for Claude Code** -- A glassmorphic, dark-first interface that replaces the terminal. Multi-tab workspaces, session timelines, rich tool widgets, and a command palette -- everything you wish the CLI had.

- **AI agents you can build, run, and monitor** -- Create custom agents with their own system prompts, models, and permissions. Run them in isolated processes. Watch their output stream in real-time with token and cost metrics.

- **Swarm orchestration with RuFlo** -- Coordinate 60+ specialized agent types (coder, tester, reviewer, architect, security auditor) through a hierarchical swarm with HNSW-indexed semantic memory. One-click setup.

- **First-class WSL2 support** -- The only Claude Code GUI that treats Windows + WSL as a first-class platform. Auto-detection, path conversion, guided installation, and full command routing through your Linux environment.

- **Runs everywhere** -- Native installers for Windows, macOS (Universal Binary), and Linux. Or run `runecode serve` for headless server mode accessible from any browser.

---

## Screenshots

<!-- TODO: Add screenshots of the main interface, agent builder, swarm dashboard, and WSL setup wizard.
     Place images in docs/screenshots/ and reference them here. Recommended dimensions: 1280x800. -->

<!--
<div align="center">
  <img src="docs/screenshots/main-workspace.png" alt="RuneCode main workspace showing multi-tab Claude Code sessions with glassmorphic UI" width="800">
  <br><br>
  <img src="docs/screenshots/agent-builder.png" alt="Custom agent builder with model selection and permission controls" width="800">
  <br><br>
  <img src="docs/screenshots/ruflo-swarm.png" alt="RuFlo swarm dashboard showing hierarchical agent orchestration" width="800">
  <br><br>
  <img src="docs/screenshots/wsl-setup.png" alt="WSL2 setup wizard with distro detection and guided installation" width="800">
</div>
-->

---

## Quick Start

**1. Install** -- Download the installer for your platform from the [releases page](https://github.com/gwizards/runecode/releases/latest).

**2. Connect** -- RuneCode uses your existing Claude Code CLI authentication. If you have Claude Code installed and logged in, you are ready to go.

**3. Launch** -- Open RuneCode, select a project directory, and start a session. Type naturally or use `/` to open the command palette.

> **Prerequisite:** [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) must be installed and in your PATH. Works with Pro, Max, Team, and Enterprise subscriptions.

---

## Core Features

### Claude Code Desktop GUI

RuneCode wraps Claude Code in a polished desktop interface built with Tauri 2 and React 19. The glassmorphic dark-first design language is built for extended coding sessions -- high contrast where it matters, subtle transparency where it does not.

Under the hood, RuneCode uses the official [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) for native streaming, session management, and tool orchestration. No stdout parsing, no process hacks.

### Multi-Tab Workspace

Open multiple projects and Claude Code sessions simultaneously. Each tab maintains its own state, history, and connection. Arrange tabs in a grid layout for side-by-side work across repositories. Switch between projects without losing context.

### Session Management

Sessions are first-class objects in RuneCode:

- **Resume** any previous session exactly where you left off
- **Continue** a session with new context
- **Fork** from any checkpoint to explore alternative approaches
- **Visual timeline** with navigable checkpoints and diff previews
- **Session browser** with search, timestamps, and first-message previews

### Rich Tool Widgets

Every Claude Code tool gets a purpose-built visual widget:

| Category | Tools | Rendering |
|----------|-------|-----------|
| **Code** | Read, Edit, Write, MultiEdit | Syntax-highlighted diffs with line numbers |
| **Search** | Glob, Grep | Match highlighting with file context |
| **System** | Bash, LS | Command/output display with ANSI color support |
| **Web** | WebFetch, WebSearch | Result cards with titles, URLs, and snippets |
| **Planning** | TodoWrite, Thinking | Task checklists, expandable reasoning blocks |
| **Notifications** | Task, Skill, System | Badges and inline system reminders |

Smart auto-scroll follows new output, pauses when you scroll up to read, and shows an unread indicator to jump back.

### Slash Command Picker

Type `/` anywhere in the input to open a searchable command palette. Browse default and custom commands in a tabbed interface with keyboard navigation. Commands are cached for instant access and auto-refresh when you add new ones.

### CLAUDE.md Editor

Browse and edit your project memory files directly from the session view. Supports all three scopes:

- **Global** -- `~/.claude/CLAUDE.md` (applies to all projects)
- **Project** -- `./CLAUDE.md` (checked into version control)
- **Local** -- `.claude/settings.local.json` (machine-specific, gitignored)

---

## AI Agents

### Custom Agent Builder

Design specialized agents tailored to your workflow:

- **System prompts** -- Write custom instructions that define the agent's behavior and expertise
- **Model selection** -- Choose the right model for the task (Haiku for speed, Sonnet for balance, Opus for deep reasoning)
- **Permission controls** -- Configure per-agent permission modes: default (ask before edits), acceptEdits (auto-approve file changes), or bypassPermissions (fully autonomous)
- **Isolated execution** -- Each agent runs in its own OS process with independent state

### Agent Marketplace

Share and discover agent configurations:

- **Import** agents from GitHub repositories or local files
- **Export** your custom agents as shareable JSON configs
- **Browse** community-contributed agent templates

### Live Agent Monitoring

Track every running agent in real time:

- **Output streaming** -- Watch agent responses as they arrive
- **Metrics dashboard** -- Tokens consumed, estimated cost, session duration
- **Status indicators** -- Green (running), red (failed), gray (completed)
- **Parallel execution** -- Run multiple agents simultaneously on different tasks

---

## RuFlo AI Swarm

RuFlo is RuneCode's built-in swarm orchestration engine. It coordinates teams of specialized AI agents to tackle complex development tasks that no single agent could handle efficiently.

### Hierarchical Swarm Orchestration

Swarms use a hierarchical topology with Raft consensus. A planner agent decomposes work, coders implement in parallel, testers verify, and reviewers approve -- all coordinated automatically.

**60+ specialized agent types** are available out of the box:

| Category | Agent Types |
|----------|-------------|
| **Core** | `coder`, `tester`, `reviewer`, `planner`, `researcher` |
| **Architecture** | `security-architect`, `security-auditor`, `performance-engineer` |
| **Coordination** | `hierarchical-coordinator`, `mesh-coordinator`, `adaptive-coordinator` |
| **DevOps** | `pr-manager`, `code-review-swarm`, `issue-tracker`, `release-manager` |
| **SPARC** | `sparc-coord`, `sparc-coder`, `specification`, `architecture` |

### MCP Integration

RuFlo integrates with Claude Code through the Model Context Protocol (MCP). The bundled MCP server exposes swarm lifecycle management, task assignment, and memory operations as tool calls that Claude can invoke directly.

### Semantic Memory

Swarms share knowledge through HNSW-indexed semantic memory with hybrid backends. Agents store findings, context, and decisions that persist across sessions and can be queried by any agent in the swarm.

### One-Click Setup

A setup wizard handles the entire RuFlo installation:

1. Installs the CLI (`@claude-flow/cli`)
2. Activates the MCP server
3. Creates slash commands for swarm operations
4. Configures memory namespaces

No manual configuration required.

---

## WSL2 Support

<table>
<tr>
<td width="60%">

RuneCode is the first Claude Code desktop application with **first-class Windows Subsystem for Linux support**. If you develop on Windows but need a Linux environment for your toolchain, RuneCode bridges the gap seamlessly.

### What It Does

- **Auto-detection** -- Discovers installed WSL distros on launch and recommends WSL2
- **Full command routing** -- All 30+ commands (Claude, npm, git, cargo, Docker, etc.) route through your WSL environment
- **Path conversion** -- Automatically translates between Windows and Linux paths (`C:\Users\you` becomes `/mnt/c/Users/you`)
- **tmux teammate mode** -- Enabled by default in WSL for full Linux terminal multiplexing
- **Guided installation** -- A 6-step wizard walks you through WSL + Node.js + Claude Code setup if anything is missing
- **Settings panel** -- Switch between WSL and native Windows mode, pick your distro, install Claude inside WSL, all from the UI

</td>
<td width="40%">

### Onboarding Flow

1. Choose WSL or native Windows
2. RuneCode detects your distros
3. Wizard validates prerequisites
4. Installs missing dependencies
5. Configures routing and paths
6. Ready to code

</td>
</tr>
</table>

> **Why this matters:** Most developers on Windows use WSL for Node.js, Rust, Python, and Docker. Without WSL routing, Claude Code sessions would execute commands in the wrong environment, produce wrong paths, and fail on Linux-only tooling. RuneCode solves this at the platform level.

---

## Developer Experience

### Usage Analytics

Track your Claude API usage with visual charts:

- **Cost breakdown** by model (Haiku, Sonnet, Opus)
- **Token consumption** over time (input, output, cache)
- **Per-project tracking** to understand where your budget goes
- **Time period filtering** -- daily, weekly, monthly views
- **Export** data for accounting and team reporting

### MCP Server Management

Manage Model Context Protocol servers from a central dashboard:

- **170+ MCP services** available for configuration
- **Add and test** connections with a visual interface
- **Import** servers from Claude Desktop configuration
- **Per-server settings** with authentication and endpoint management

### Checkpoint System

Never lose work with RuneCode's checkpoint system:

- **Create checkpoints** at any point during a session
- **Restore** to any previous checkpoint instantly
- **Fork** from any checkpoint to explore alternative approaches
- **View diffs** between any two checkpoints

### Project Context Sidebar

A collapsible right sidebar shows everything relevant to your current project:

| Section | Information |
|---------|-------------|
| **Project Info** | Name, description, detected tech stack (from package.json, Cargo.toml, etc.) |
| **Git Context** | Current branch, modified files, recent commits |
| **Usage** | Session tokens, cumulative cost, session count |
| **Resources** | Live CPU and RAM utilization bars |
| **RuFlo Status** | Active swarm, running agents, task progress |
| **Docker** | Running containers and their status |

### Hooks Editor

Configure pre-command and post-command hooks with a template library:

- **Pre-edit hooks** -- Run linters or formatters before file writes
- **Post-task hooks** -- Trigger builds, tests, or deployments after task completion
- **Template library** -- Common hooks for popular toolchains (ESLint, Prettier, cargo fmt, pytest)
- **Conditional execution** -- Hooks can be scoped to specific file patterns or commands

### Environment Management

Connect to remote development environments:

- **SSH** -- Run Claude Code sessions on remote machines
- **WSL** -- First-class Windows Subsystem for Linux integration
- **Docker** -- Execute inside running containers

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Claude Integration** | `@anthropic-ai/claude-agent-sdk` (official Agent SDK) |
| **Desktop Runtime** | Tauri 2.x, Rust (async Tokio), Axum HTTP/WS server |
| **Database** | SQLite with WAL mode (rusqlite) |
| **Frontend** | React 19, TypeScript 5.9, Vite 8 (Rolldown) |
| **Styling** | Tailwind CSS v4, glassmorphic design tokens |
| **Components** | shadcn/ui (Radix primitives), Shiki (syntax highlighting) |
| **State** | Zustand, TanStack Query |
| **Animation** | Motion (Framer Motion) |
| **Swarm Engine** | RuFlo (`@claude-flow/cli`), MCP integration |
| **Package Manager** | Bun |

---

## Architecture

### Domain-Driven Design

RuneCode's frontend is organized into 10 bounded contexts following DDD principles:

| Context | Responsibility |
|---------|---------------|
| `agent` | Agent lifecycle, AgentId value object |
| `analytics` | Session analytics and tracking |
| `identity` | UserId, Email, DisplayName value objects |
| `mcp` | MCP server management |
| `project` | ProjectId value object, project status |
| `ruflo` | Swarm integration, SwarmId/AgentId VOs |
| `session` | Session aggregates, conversation state |
| `shared` | `Result<T>` monad, shared kernel |
| `usage` | Token/cost tracking (integer micro-USD) |
| `workspace` | TabId, WorkspaceId, layout management |

Each context uses **Value Objects** for type-safe identifiers, **Result monads** for error handling without exceptions, and **hexagonal ports** for clean dependency boundaries.

### Security

| Layer | Protection |
|-------|-----------|
| **Authentication** | Startup token auth, session-scoped credentials |
| **Path Guards** | All file operations canonicalize paths and enforce home-directory boundaries (62 guard calls) |
| **Origin Validation** | HTTP origin checks on all WebSocket and API connections |
| **Process Isolation** | Each agent runs in a separate OS process |
| **Permission Control** | Configurable per-session permission modes |
| **Local Storage** | All data stays on your machine, SQLite with WAL for crash safety |
| **Secret Detection** | Warns about plaintext .env and credential files |
| **Open Source** | Full transparency through AGPL-3.0 |

### Server Mode

Run RuneCode without the desktop window:

```bash
runecode serve --port 8080 --open
```

The frontend is embedded in the binary. The Axum server handles HTTP, WebSocket streaming, and static asset serving. Access the full UI from any browser on your network.

<details>
<summary><strong>Project Structure</strong></summary>

```
runecode/
├── src/                          # React frontend
│   ├── components/               # UI components
│   │   ├── widgets/              # Tool widgets (Read, Edit, Bash, Grep, etc.)
│   │   ├── sidebar/              # Context sidebar sections
│   │   └── ui/                   # shadcn/ui primitives
│   ├── domain/                   # DDD bounded contexts (10 domains)
│   │   ├── agent/                # Agent aggregates, AgentId VO
│   │   ├── analytics/            # Session analytics
│   │   ├── identity/             # UserId, Email, DisplayName VOs
│   │   ├── mcp/                  # MCP server management
│   │   ├── project/              # ProjectId VO, project status
│   │   ├── ruflo/                # Swarm integration
│   │   ├── session/              # Session aggregates
│   │   ├── shared/               # Result<T> monad, shared kernel
│   │   ├── usage/                # Token/cost tracking
│   │   └── workspace/            # TabId, WorkspaceId VOs
│   ├── integrations/             # Partner integration framework
│   ├── hooks/                    # Custom React hooks
│   └── lib/                      # API client, utilities
├── src-tauri/                    # Rust backend
│   └── src/
│       ├── commands/             # Tauri commands (claude, agents, resources, usage)
│       ├── path_guard.rs         # Path traversal protection
│       ├── ws_types.rs           # WebSocket protocol types
│       ├── web_server.rs         # Axum server for headless mode
│       └── main.rs               # Desktop entry point
├── docs/
│   ├── adr/                      # Architecture Decision Records
│   └── rust-migration/           # Migration plans and audit reports
└── public/                       # Static assets
```

</details>

---

## Build from Source

<details>
<summary><strong>Prerequisites</strong></summary>

**All platforms:**

- [Rust](https://rustup.rs/) 1.70+ -- `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [Bun](https://bun.sh/) -- `curl -fsSL https://bun.sh/install | bash`
- Git

**Linux (Debian/Ubuntu):**

```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf build-essential libssl-dev libxdo-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

**macOS:**

```bash
xcode-select --install
```

**Windows (build from source only):**

Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) if not already present. These are compiler requirements -- the pre-built installers do not need them.

</details>

### Build

```bash
git clone https://github.com/gwizards/runecode.git
cd runecode
bun install
bun run tauri build
```

The output binary will be in `src-tauri/target/release/runecode`.

### Development

```bash
# Full desktop app with hot reload (Rust + React)
bun run tauri dev

# Frontend only -- uses Agent SDK directly, no Rust compilation needed
bun run dev

# Type checking
bun run check

# Headless server mode
runecode serve --port 8080
```

**Dev mode** (`bun run dev`) runs the complete UI without the Tauri shell. The Vite dev server uses the Claude Agent SDK directly to serve real project data, session history, and live chat execution over WebSocket. This is the fastest iteration loop for frontend development.

---

## Platform Support

| Platform | Format | Notes |
|----------|--------|-------|
| **Windows** | `.msi` / `.exe` | WebView2 included on Windows 11, auto-installed on 10. Full WSL2 integration. |
| **Linux** | `.AppImage` / `.deb` | Tested on Ubuntu 22.04+, Fedora 38+, Arch |
| **macOS** | `.dmg` | Universal Binary -- Apple Silicon and Intel |
| **Server** | Any browser | `runecode serve` runs headless, UI served over HTTP |

SHA256 checksums are published on every release page.

---

## Contributing

Contributions are welcome. Whether it is a bug report, feature request, documentation improvement, or code contribution -- we appreciate it.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, coding standards, and the pull request process.

A few guidelines:

- RuneCode follows Domain-Driven Design. New features should respect bounded context boundaries.
- All files should stay under 500 lines. If a file is getting long, decompose it.
- Public APIs must be typed. Validate inputs at boundaries.
- Run `bun run build`, `bun run check`, and `cd src-tauri && cargo check` before submitting.

---

## Links

| | |
|---|---|
| **Website** | [runecode.sh](https://runecode.sh) |
| **Discord** | [Join the community](https://discord.com/invite/KYwhHVzUsY) |
| **YouTube** | [Mr Polti](https://www.youtube.com/@MrPoltiOfficial) |
| **Releases** | [All releases](https://github.com/gwizards/runecode/releases) |
| **Issues** | [Report a bug or request a feature](https://github.com/gwizards/runecode/issues) |
| **Wizards** | [wizards.us](https://www.wizards.us) |

---

## License

[AGPL-3.0](LICENSE)

---

<div align="center">
  <p>
    <strong>Built by <a href="https://www.youtube.com/@MrPoltiOfficial">Mr Polti</a> from <a href="https://www.wizards.us">Wizards</a></strong>
  </p>
  <p>
    <a href="https://runecode.sh">runecode.sh</a>
    &middot;
    <a href="https://discord.com/invite/KYwhHVzUsY">Discord</a>
    &middot;
    <a href="https://github.com/gwizards/runecode/issues">Issues</a>
  </p>
</div>
