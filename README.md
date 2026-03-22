
<div align="center">
  <img src="public/runecode-logo.svg" alt="RuneCode" width="120" height="120">

  <h1>RuneCode</h1>

  <p>
    <strong>A blazingly fast, beautiful desktop engine that turns Claude Code into a fully autonomous, local developer.</strong>
  </p>

  <p>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/github/v/release/gwizards/runecode?style=for-the-badge&color=8b5cf6&label=Latest" alt="Latest Release"></a>
    <a href="https://runecode.sh"><img src="https://img.shields.io/badge/runecode.sh-website-6d28d9?style=for-the-badge" alt="Website"></a>
    <a href="https://discord.com/invite/KYwhHVzUsY"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
    <a href="https://github.com/gwizards/runecode/releases"><img src="https://img.shields.io/badge/All_Releases-📦-gray?style=for-the-badge" alt="All Releases"></a>
  </p>

  <h3>⬇️ Download Latest Release</h3>

  <p>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/Windows-.msi%20%2F%20.exe-0078d4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows"></a>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/Linux-.AppImage%20%2F%20.deb-f97316?style=for-the-badge&logo=linux&logoColor=white" alt="Linux"></a>
    <a href="https://github.com/gwizards/runecode/releases/latest"><img src="https://img.shields.io/badge/macOS-.dmg-888888?style=for-the-badge&logo=apple&logoColor=white" alt="macOS"></a>
  </p>

  <p>
    Created by <a href="https://www.youtube.com/@MrPoltiOfficial"><strong>Mr Polti</strong></a> from <a href="https://www.wizards.us"><strong>Wizards</strong></a>
  </p>
</div>

---

## What is RuneCode?

RuneCode is the ultimate command center for [Claude Code](https://claude.ai/code). It wraps the CLI in a glassmorphic desktop interface that makes AI-assisted development beautiful, powerful, and autonomous.

**For Vibe Coders** — zero-friction local execution with an aesthetic that looks incredible in screenshots and demo videos.

**For Teams** — sandboxed security, audit logging, and human-in-the-loop controls are on the roadmap.

### Why RuneCode?

- **Aesthetic superiority** — Glassmorphic design language with rune-themed accents. Dark-first, screenshot-worthy UI.
- **Native SDK integration** — Powered by the official Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`), not CLI hacks.
- **Agentic power** — Create custom AI agents, run them in isolated processes, monitor them in real-time with live status tabs.
- **Zero friction** — Works with your existing Claude subscription. No API keys, no Docker, no configuration.
- **Blazingly fast** — Built with Tauri 2 (Rust backend) and React 19. Sub-2-second builds with Vite 8 + Rolldown.

## Features

### Claude Agent SDK Integration

RuneCode integrates directly with the [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) — the same programmatic interface used by VS Code and other first-party integrations. This means:

- **Native streaming** — Real-time message streaming via async generators, not stdout parsing
- **Session management** — `listSessions()` and `getSessionMessages()` for browsing all your Claude Code projects and conversation history
- **Multi-turn conversations** — Resume, continue, and fork sessions natively
- **Tool orchestration** — Full access to Read, Edit, Write, Bash, Glob, Grep, WebFetch, WebSearch, and all MCP tools
- **Permission control** — Configurable permission modes (default, acceptEdits, bypassPermissions)
- **Works with Claude subscriptions** — Uses the same authentication as your Claude Code CLI (Pro, Max, Team, Enterprise)

```typescript
// How RuneCode talks to Claude under the hood
import { query, listSessions, getSessionMessages } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Fix the auth bug",
  options: { cwd: "/path/to/project", settingSources: ["user", "project"] }
})) {
  // Stream messages directly to the UI — no process spawning needed
}
```

### Interactive Claude Code Sessions
Launch and manage Claude Code sessions with a polished visual interface. Smart auto-scroll follows new output, pauses when you scroll up, and shows an unread count to jump back down. Rich rendering of tool calls, code diffs, file reads, bash commands, and thinking blocks.

### Multi-Tab Workspace
Open multiple projects and sessions simultaneously in a tabbed interface. Each tab maintains its own state, session history, and connection. Switch between projects without losing context.

### Project & Session Browser
Browse all your Claude Code projects and sessions from a unified interface. Sessions show first-message previews, timestamps, and pagination. Click any session to load its full conversation history with rendered tool widgets.

### Custom AI Agents
Design specialized agents with custom system prompts, model selection, and permission controls. Run them in isolated background processes. Monitor every running agent with live status tabs — green for running, red for failed, gray for done.

### Project Context Sidebar
A collapsible right sidebar with live sections:
- **Project Info** — auto-detected tech stack, name, description (from package.json, Cargo.toml, etc.)
- **Context** — current git branch, modified files
- **Usage** — tokens, cost, session count
- **Resources** — live CPU/RAM bars
- **Agents, Plugins, Skills** — browse installed components

### Slash Command Picker
Type `/` to open a searchable command palette with tabs for default and custom commands. Cached for instant access, with keyboard navigation and auto-refresh.

### CLAUDE.md Memory Viewer
Browse and edit CLAUDE.md files (project memory) directly from the session view. Supports global, project, and local scopes.

### Usage Analytics
Track Claude API costs with visual charts broken down by model, project, and time period. Export data for accounting.

### MCP Server Management
Manage Model Context Protocol servers from a central UI. Add, configure, test connections, and import from Claude Desktop. 170+ MCP services supported.

### Timeline & Checkpoints
Create checkpoints during sessions, navigate a visual timeline, fork sessions from any point, and see diffs between checkpoints.

### Tool Widgets
Rich visual rendering for every Claude Code tool:
- **Code tools** — Read, Edit, Write, MultiEdit with syntax-highlighted diffs
- **Search tools** — Glob, Grep with match highlighting
- **System tools** — Bash with command/output display, LS with file listings
- **Web tools** — WebFetch, WebSearch with result cards
- **Planning tools** — TodoWrite with task lists, Thinking with expandable blocks
- **Notifications** — Task notifications, skill badges, system reminders

### Dev Mode (Frontend-Only)
Run `npm run dev` for frontend development without the Tauri backend. The Vite dev server serves real data from `~/.claude/` via the Agent SDK — real projects, real sessions, real chat execution.

### Headless / Server Mode
Run RuneCode without the desktop wrapper:
```bash
runecode serve --port 8080 --open
```
Access the full UI from any browser. The frontend is embedded in the binary — no separate build step.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Claude Integration** | `@anthropic-ai/claude-agent-sdk` (official Agent SDK) |
| **Frontend** | React 19.2, TypeScript 5.9, Vite 8 (Rolldown) |
| **Styling** | Tailwind CSS v4, glassmorphic design tokens |
| **Components** | shadcn/ui (Radix primitives), Shiki (syntax highlighting) |
| **State** | Zustand, @tanstack/react-query |
| **Animation** | Motion (formerly Framer Motion) |
| **Backend** | Rust, Tauri 2, Axum |
| **Database** | SQLite (rusqlite) |
| **Dev Server** | Vite + Agent SDK (WebSocket streaming, no Tauri needed) |
| **Package Manager** | Bun |

## Installation

### Prerequisites
- [Claude Code CLI](https://claude.ai/code) installed and in your PATH

> **Windows users**: no extra software needed. WebView2 ships with Windows 11 and is auto-installed on Windows 10. The `.msi` / `.exe` installers are standalone — no C++ Build Tools, no Rust, no Visual Studio required.

### Download

**[Download the latest release →](https://github.com/gwizards/runecode/releases/latest)** · [All releases](https://github.com/gwizards/runecode/releases)

| Platform | Format |
|----------|--------|
| Windows | `.msi` or `.exe` installer |
| Linux | `.AppImage` or `.deb` |
| macOS | `.dmg` |

SHA256 checksums are included on every release page.

## Build from Source

### Requirements
- **Rust** 1.70+ — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Bun** — `curl -fsSL https://bun.sh/install | bash`
- **Git**

#### Linux
```bash
sudo apt update && sudo apt install -y \
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev \
  librsvg2-dev patchelf build-essential libssl-dev libxdo-dev \
  libsoup-3.0-dev libjavascriptcoregtk-4.1-dev
```

#### macOS
```bash
xcode-select --install
```

#### Windows (build from source only)
Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) if not already present. These are compiler requirements — not needed to run the installer.

### Build

```bash
git clone https://github.com/gwizards/runecode.git
cd runecode
bun install
bun run tauri build
```

The executable will be in `src-tauri/target/release/runecode`.

### Development

```bash
bun run tauri dev     # Desktop app with hot reload (Rust + React)
bun run dev           # Frontend only — uses Agent SDK for real data
runecode serve        # Headless server mode
```

**Dev mode** (`bun run dev`) runs the full UI without Tauri. The Vite dev server uses the Claude Agent SDK directly to serve real project data, session history, and chat execution via WebSocket. No Rust compilation needed for frontend development.

## Project Structure

```
runecode/
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── widgets/            # Individual tool widgets
│   │   ├── sidebar/            # Sidebar sections (RuFlo, resources, agents)
│   │   └── ui/                 # shadcn/ui primitives
│   ├── domain/                 # Domain-Driven Design bounded contexts
│   │   ├── agent/              # AgentId VO, agent aggregates
│   │   ├── analytics/          # Analytics session tracking
│   │   ├── identity/           # UserId, Email, DisplayName VOs
│   │   ├── mcp/                # MCP server management
│   │   ├── project/            # ProjectId VO, project status
│   │   ├── ruflo/              # RuFlo swarm integration (AgentId, SwarmId VOs)
│   │   ├── session/            # Session aggregates
│   │   ├── shared/             # Result<T> monad, shared kernel
│   │   ├── usage/              # Token/cost tracking (integer micro-USD)
│   │   └── workspace/          # TabId, WorkspaceId VOs
│   ├── integrations/           # Partner integration framework
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # API client, utilities
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── commands/           # Tauri commands (claude, agents, resources, usage)
│       ├── path_guard.rs       # Path traversal protection
│       ├── ws_types.rs         # WebSocket protocol (9 message types)
│       ├── web_server.rs       # Axum server for headless mode
│       └── main.rs             # Desktop entry point
├── docs/
│   ├── adr/                    # Architecture Decision Records
│   └── rust-migration/         # Rust migration plan & audit reports
└── public/                     # Static assets
```

## Security

- **Process Isolation** — agents run in separate processes
- **Permission Control** — configurable permission modes per session (default, acceptEdits, bypassPermissions)
- **Path Guard** — all file operations canonicalize paths and enforce home-directory boundaries (prevents traversal attacks)
- **Local Storage** — all data stays on your machine; SQLite with WAL mode for crash safety
- **Secret Detection** — warns about plaintext .env files
- **Open Source** — full transparency through AGPL-3.0

## Contributing

We welcome contributions. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

[AGPL-3.0](LICENSE)

---

<div align="center">
  <p>
    <strong>Created by <a href="https://www.youtube.com/@MrPoltiOfficial">Mr Polti</a> from <a href="https://www.wizards.us">Wizards</a></strong>
  </p>
  <p>
    <a href="https://runecode.sh">runecode.sh</a>
    ·
    <a href="https://github.com/gwizards/runecode/issues">Report Bug</a>
    ·
    <a href="https://github.com/gwizards/runecode/issues">Request Feature</a>
  </p>
</div>
