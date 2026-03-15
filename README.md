
<div align="center">
  <img src="public/runecode-icon.svg" alt="RuneCode" width="120" height="120">

  <h1>RuneCode</h1>

  <p>
    <strong>A blazingly fast, beautiful desktop engine that turns Claude Code into a fully autonomous, local developer.</strong>
  </p>

  <p>
    <a href="https://runecode.sh"><img src="https://img.shields.io/badge/runecode.sh-8b5cf6?style=for-the-badge" alt="Website"></a>
    <a href="#features"><img src="https://img.shields.io/badge/Features-✨-blue?style=for-the-badge" alt="Features"></a>
    <a href="#installation"><img src="https://img.shields.io/badge/Install-🚀-green?style=for-the-badge" alt="Installation"></a>
    <a href="https://discord.com/invite/KYwhHVzUsY"><img src="https://img.shields.io/badge/Discord-Join-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Discord"></a>
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
- **Agentic power** — Create custom AI agents, run them in isolated processes, monitor them in real-time with live status tabs.
- **Zero friction** — Connect Claude to your local machine without configuring Docker or writing custom MCP servers.
- **Blazingly fast** — Built with Tauri 2 (Rust backend) and React 19. Sub-2-second builds with Vite 8 + Rolldown.

## Features

### Interactive Claude Code Sessions
Launch and manage Claude Code sessions with a polished visual interface. Smart auto-scroll follows new output, pauses when you scroll up, and shows an unread count to jump back down.

### Custom AI Agents
Design specialized agents with custom system prompts, model selection, and permission controls. Run them in isolated background processes. Monitor every running agent with live status tabs — green for running, red for failed, gray for done.

### Project Context Sidebar
A collapsible right sidebar with five live sections:
- **Project Info** — auto-detected tech stack, name, description (from package.json, Cargo.toml, etc.)
- **Live Context** — current git branch, modified files, last error
- **Session Stats** — tokens, cost, elapsed time, files modified
- **Resources** — live CPU/RAM bars with cloud eject alerts
- **Skills Catalog** — browse installed plugins and skills with active indicators

### Opinionated Stack Defaults
RuneCode ships with smart recommendations for a production-ready AI development stack:
- **Compute** — resource monitoring with automatic cloud eject to Railway/DigitalOcean when local hardware is overloaded
- **Security** — scans for plaintext `.env` files and recommends Infisical for secure secret injection
- **Intelligence** — unified LLM gateway recommendation for multi-model access in custom agents
- **Observability** — Helicone-powered cost guard with live session cost tracking and limit alerts

### Usage Analytics
Track Claude API costs with visual charts broken down by model, project, and time period. Export data for accounting.

### MCP Server Management
Manage Model Context Protocol servers from a central UI. Add, configure, test connections, and import from Claude Desktop.

### Timeline & Checkpoints
Create checkpoints during sessions, navigate a visual timeline, fork sessions from any point, and see diffs between checkpoints.

### Headless / Server Mode
Run RuneCode without the desktop wrapper:
```bash
runecode serve --port 8080 --open
```
Access the full UI from any browser. The frontend is embedded in the binary — no separate build step.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19.2, TypeScript 5.9, Vite 8 (Rolldown) |
| **Styling** | Tailwind CSS v4, glassmorphic design tokens |
| **Components** | shadcn/ui (Radix primitives), Shiki (syntax highlighting) |
| **State** | Zustand, @tanstack/react-query |
| **Animation** | Motion (formerly Framer Motion) |
| **Backend** | Rust, Tauri 2, Axum |
| **Database** | SQLite (rusqlite) |
| **Package Manager** | Bun |

## Installation

### Prerequisites
- [Claude Code CLI](https://claude.ai/code) installed and in your PATH

### Download
Pre-built binaries coming soon. For now, build from source.

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

#### Windows
Install [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) and [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/).

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
bun run tauri dev     # Desktop with hot reload
bun run dev           # Frontend only
runecode serve        # Headless server mode
```

## Project Structure

```
runecode/
├── src/                        # React frontend
│   ├── components/             # UI components
│   │   ├── widgets/            # Individual tool widgets (21 files)
│   │   ├── sidebar/            # Sidebar sections
│   │   └── ui/                 # shadcn/ui primitives
│   ├── integrations/           # Partner integration framework
│   │   ├── compute/            # Resource monitor, cloud eject
│   │   ├── security/           # .env scanner, warnings
│   │   ├── intelligence/       # LLM gateway recommendation
│   │   └── observability/      # Helicone cost guard
│   ├── stores/                 # Zustand state (agent, session)
│   ├── hooks/                  # Custom React hooks
│   └── lib/                    # API client, utilities
├── src-tauri/                  # Rust backend
│   └── src/
│       ├── commands/           # Tauri commands (claude, agents, resources, skills, helicone)
│       ├── web_server.rs       # Axum server for headless mode
│       └── main.rs             # Desktop entry point
└── public/                     # Static assets
```

## Security

- **Process Isolation** — agents run in separate processes
- **Permission Control** — configure file and network access per agent
- **Local Storage** — all data stays on your machine
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
