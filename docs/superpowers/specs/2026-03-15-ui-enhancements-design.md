# Opcode UI Enhancements Design Spec

## Summary

Six interconnected improvements to the Opcode desktop/web application: smart auto-scroll, headless server mode, agent tabs for parallel/teammate agents, a project context sidebar, display polish across all rendering, and first-class superpowers integration.

## Features

### 1. Smart Auto-Scroll + Jump Button

**Problem:** Users lose their place when streaming output pushes content down, and have no quick way to return to the bottom.

**Design:**

- **Smart auto-scroll:** When the user is at the bottom (within ~50px threshold), new content auto-scrolls. When the user scrolls up manually, auto-scroll pauses. When the user scrolls back to the bottom, auto-scroll re-engages.
- **Jump-to-bottom button:** A floating circular button appears in the bottom-right of the chat area when scrolled up. Shows a down-arrow icon + unread message count badge (e.g., "↓ 12"). Click to instantly scroll to bottom and re-engage auto-scroll. Smooth fade in/out animation.
- **Settings toggle:** New setting in `Settings.tsx`: "Auto-scroll to bottom" (on by default). When off, user must manually scroll or click the jump button.

**Components:**
- New: `ScrollToBottomButton.tsx` — receives ref to scroll container and virtualizer instance
- Modified: `ClaudeCodeSession.tsx` — integrate smart scroll logic with existing `@tanstack/react-virtual`
- Modified: `Settings.tsx` — add auto-scroll toggle

### 2. Headless Server Mode

**Problem:** Users want to run Opcode without the Tauri desktop wrapper, accessing it from any browser.

**Design:**

The existing web server infrastructure (`web_main.rs`, `web_server.rs`, `apiAdapter.ts`) already provides WebSocket streaming, REST API, and dual-mode frontend support. Changes needed:

- **CLI interface:** `opcode serve` (or `opcode --server`) starts the headless web mode. Prints `Opcode running at http://localhost:8080` on startup. Supports `--port` and `--host` flags (already implemented). Add `--open` flag to auto-launch browser.
- **Embedded frontend:** The Vite-built React app should be served by the Axum server. Either embed assets in the binary at compile time (via `rust-embed` or `include_dir`) or serve from a known install path.
- **Feature parity for new features:** All new features in this spec (sidebar endpoints, agent lifecycle events, skills catalog) must ship with both Tauri IPC commands and REST/WebSocket equivalents from the start, using the existing `apiAdapter.ts` dual-mode pattern. Existing Tauri-only commands outside this spec's scope are not addressed here.
- **Single binary:** The web server binary should be self-contained — no separate frontend build step at runtime.

**Components:**
- Modified: `web_main.rs` — add `--open` flag, improve startup messaging
- Modified: `web_server.rs` — add static file serving for embedded frontend assets, add new endpoints for sidebar features
- Modified: `Cargo.toml` — add `rust-embed` or similar for asset embedding
- Modified: build pipeline — ensure frontend build is embedded in the web binary

### 3. Agent Tabs + Status Badge

**Problem:** When Claude spawns parallel agents or teammates, there's no way to monitor their individual progress or output in real-time.

**Design:**

- **Agent tabs:** When Claude spawns a parallel agent or teammate, a new tab auto-appears in the tab bar. Tab label shows agent name + status dot (green = running, blue = thinking, red = failed, gray = completed). Tab content reuses `AgentExecution.tsx` / `StreamMessage.tsx` rendering. Completed agent tabs persist until dismissed so output can be reviewed. Completed tabs show a dimmed style (muted border or checkmark icon).
- **Tab lifecycle:** Each agent tab has a close button (×). Closing a completed/failed agent tab removes it from the tab bar. Closing a *running* agent tab shows a confirmation dialog ("Agent is still running. Stop it?") — confirming kills the agent process and removes the tab. If more than 6 agent tabs are open, overflow tabs collapse into a "+" dropdown menu.
- **Status badge:** Small badge in the tab bar area showing running agent count (e.g., "3 running") with a pulsing dot. Clicking the badge opens a dropdown summary of all agents with quick-jump links to their tabs. Badge disappears when no agents are active.

**Data flow:**
- Rust backend already tracks running agents in `commands/agents.rs` with a process registry
- Frontend subscribes to agent lifecycle events (start, output, complete, error) via Tauri IPC or WebSocket
- Extend `agentStore.ts` (Zustand) to track live agent states for the tab bar and badge

**Components:**
- Modified: `TabManager.tsx` — add agent tab type, status dot rendering, status badge
- Modified: `TabContent.tsx` — route agent tabs to agent output viewer
- Modified: `agentStore.ts` — track live agent states (status, elapsed time, token count)
- New: `AgentStatusBadge.tsx` — badge + dropdown component
- Modified: `commands/agents.rs` — ensure lifecycle events are emitted for all agent state changes
- Modified: `web_server.rs` — add `/api/agents/live` endpoint returning currently running agents with status

### 4. Project Context Sidebar

**Problem:** Users lack at-a-glance context about the project, session, running agents, and available tools while chatting.

**Design:**

A collapsible right sidebar with four independently collapsible sections:

**4a — Project Info (auto-detected + editable)**
- Auto-parses on project load: `package.json`, `Cargo.toml`, `README.md`, `CLAUDE.md`, `.git/config`
- Displays: project name, tech stack labels/icons, description, repo URL
- "Edit" button to override/add info manually, stored in `.opcode/project.json`:
  ```json
  {
    "name": "My Project",
    "description": "Optional override",
    "techStack": ["React", "Rust", "SQLite"],
    "repoUrl": "https://github.com/user/repo",
    "entryPoints": ["src/main.tsx", "src-tauri/src/main.rs"],
    "notes": "Free-form project notes"
  }
  ```
  Auto-detected values are used as defaults; any field in `project.json` overrides the auto-detected value. Missing fields fall back to auto-detection.
- Shows key file paths (entry points, config files)

**4b — Live Context**
- Current git branch + dirty file count
- List of recently modified files (files touched by tool calls — Write, Edit, MultiEdit — in the current chat session, tracked in frontend message state)
- Last error/warning: extracted from the most recent tool result message in the stream that had a non-zero exit code or error status (already parsed by `StreamMessage.tsx`). Not a new backend feature — reads from existing frontend message state.
- Updates in real-time as the session progresses

**4c — Session Stats**
- Tokens used (input/output breakdown)
- Estimated cost
- Elapsed time
- Files modified count
- Tools called count
- Refreshes live during streaming

**4d — Skills & Superpowers**
- Lists installed plugins and their skills, grouped by plugin
- Each skill shows: name and one-line description (from YAML frontmatter)
- Status indicator when a skill is actively in use (pulsing dot)
- Click a skill to see full description in a popover
- Future: click to manually invoke a skill

**Sidebar behavior:**
- Collapsible via toggle button + keyboard shortcut
- Width is resizable using the existing `split-pane.tsx` component
- Sidebar state (open/closed, width) persists via localStorage
- Auto-collapses on narrow windows (responsive breakpoint)

**Backend support:**
- New endpoint: `GET /api/project-info` — scans project files, returns structured metadata
- New endpoint: `GET /api/session-stats` — returns live token/cost/time data
- Skills catalog: discovered from Claude Code's plugin system. Discovery algorithm:
  1. Read `~/.claude/plugins/installed_plugins.json` to get list of installed plugins with their `installPath` values
  2. For each plugin, read `<installPath>/.claude-plugin/plugin.json` for plugin metadata (`name`, `description`, `version`, `author`)
  3. Walk `<installPath>/skills/*/` directories — each subdirectory is a skill
  4. Parse each skill's `.md` file YAML frontmatter for `name` and `description` (these are the guaranteed fields; other optional fields may be present)
  5. The `/api/skills` endpoint returns a list grouped by plugin, with each skill containing its parsed frontmatter fields
- New Tauri IPC commands mirroring these endpoints

**Components:**
- New: `ProjectSidebar.tsx` — main sidebar container with collapse/resize logic
- New: `ProjectInfoSection.tsx` — project metadata display + edit
- New: `LiveContextSection.tsx` — git branch, modified files, errors
- New: `SessionStatsSection.tsx` — tokens, cost, time, files
- New: `SkillsCatalogSection.tsx` — plugin/skill browser with popovers
- Modified: `App.tsx` or layout component — integrate sidebar into main layout
- Modified: `web_server.rs` — add project-info and session-stats endpoints

### 5. Display Polish

**Problem:** Visual density, tool widgets, and message layout lack consistency and scannability.

**Design:**

**Message layout:**
- Clearer visual distinction between user/assistant/system messages via subtle background tint and left border color
- System messages styled more subtly (smaller font, muted color)
- Consistent spacing between messages

**Tool widget polish:**
- `BashWidget` — cleaner terminal look, better command vs output distinction, exit code badge
- `ReadWidget` — file path header with icon, subtler line numbers
- `EditWidget` / `MultiEditWidget` — tighter diff view with green/red coloring
- `GrepWidget` / `GlobWidget` — clean results list with file icons
- All widgets get consistent border-radius, padding, and header styling

**Information density:**
- Collapsible tool outputs by default (show header + summary, expand for full content)
- "Thinking" blocks collapsed by default with toggle
- Long code blocks get max-height with scroll + "Show all" button

**Typography & spacing:**
- Consistent font sizing hierarchy
- Better use of existing Tailwind design tokens
- Both dark and light themes polished equally

**Components:**
- Modified: `StreamMessage.tsx` — message layout improvements
- Modified: `ToolWidgets.tsx` — all widget visual updates (this 106KB file should be split into individual widget files as part of this work)
- Modified: `styles.css` — global spacing and typography tokens

### 6. Superpowers Integration

**Problem:** Superpowers skills are invisible — users don't know what's available or when skills are active.

**Design:**

The skills catalog display is covered by Section 4d. This section covers **execution visibility** — detecting and displaying when skills are active.

**Skill detection mechanism:**
- Claude's stream output includes tool calls (e.g., `Skill` tool invocations) and subagent spawns. The frontend already parses these in `StreamMessage.tsx`.
- When a `Skill` tool call is detected in the message stream, extract the skill name from the tool input parameters.
- Maintain a `Set<string>` of active skill names in the session store, updated on skill tool-call start and completion.

**Execution indicator (inline):**
- When a `Skill` tool call appears in the stream, `StreamMessage.tsx` renders a small badge above the tool output: `"⚡ Using: brainstorming"` with the skill's accent color.
- Badge is part of the existing tool widget rendering pipeline — implemented as a `SkillBadgeWidget` in the tool widget system.

**Skill status in sidebar:**
- `SkillsCatalogSection.tsx` reads active skill names from the session store.
- Active skills show a pulsing green dot next to their name in the catalog list.
- When the skill completes, the dot transitions to a checkmark for 5 seconds, then disappears.

**Components:**
- New: `SkillBadgeWidget.tsx` — inline badge rendered by `StreamMessage.tsx` for Skill tool calls
- Modified: `StreamMessage.tsx` — detect Skill tool calls and render SkillBadgeWidget
- Modified: `sessionStore.ts` — add `activeSkills: Set<string>` state
- Modified: `SkillsCatalogSection.tsx` — read active skills and show status indicators

## Architecture

### Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  Tab Bar  [Chat] [Agent: reviewer ●] [Agent: tests ●]  [3▶] │
├────────────────────────────────────────────┬─────────────────┤
│                                            │  PROJECT INFO   │
│           Main Chat Area                   │  LIVE CONTEXT   │
│           (polished rendering +            │  SESSION STATS  │
│            smart auto-scroll)              │  SKILLS (8)     │
│                                            │                 │
│                              [↓ 12]        │                 │
├────────────────────────────────────────────┴─────────────────┤
│  [Prompt Input]                                              │
└──────────────────────────────────────────────────────────────┘
```

### New Files

| File | Purpose |
|------|---------|
| `ScrollToBottomButton.tsx` | Floating jump-to-bottom button |
| `AgentStatusBadge.tsx` | Tab bar agent count badge + dropdown |
| `ProjectSidebar.tsx` | Sidebar container with collapse/resize |
| `ProjectInfoSection.tsx` | Auto-detected project metadata |
| `LiveContextSection.tsx` | Git branch, modified files, errors |
| `SessionStatsSection.tsx` | Tokens, cost, time stats |
| `SkillsCatalogSection.tsx` | Plugin/skill browser |
| `SkillBadgeWidget.tsx` | Inline skill execution indicator in chat stream |
| `BashWidget.tsx`, `ReadWidget.tsx`, etc. | Individual widget files from ToolWidgets.tsx split (Phase 0) |

### Modified Files

| File | Changes |
|------|---------|
| `ClaudeCodeSession.tsx` | Smart scroll logic integration |
| `Settings.tsx` | Auto-scroll toggle |
| `TabManager.tsx` | Agent tab type, status dots, badge |
| `TabContent.tsx` | Agent tab routing |
| `agentStore.ts` | Live agent state tracking |
| `StreamMessage.tsx` | Message layout polish |
| `ToolWidgets.tsx` | Widget visual updates (+ split into individual files) |
| `App.tsx` | Sidebar integration into layout |
| `web_main.rs` | `--open` flag, startup UX |
| `web_server.rs` | Static asset serving, new API endpoints |
| `commands/agents.rs` | Agent lifecycle event emission |
| `styles.css` | Global spacing/typography tokens |

### API Endpoints (New)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/project-info` | GET | Project metadata (tech stack, name, description) |
| `/api/session-stats` | GET | Live session statistics |
| `/api/skills` | GET | Installed plugins and skills catalog |
| `/api/agents/live` | GET | Currently running agents with status |

## Implementation Phases

**Phase 0 — Refactor prerequisite:** Split `ToolWidgets.tsx` (106KB) into individual widget files (`BashWidget.tsx`, `ReadWidget.tsx`, `EditWidget.tsx`, etc.) with a barrel export. No visual changes — pure file structure refactor. This must land first to reduce merge conflicts in later phases.

**Phase 1 — Foundation:** Smart auto-scroll (`ScrollToBottomButton.tsx`, scroll logic in `ClaudeCodeSession.tsx`, settings toggle). Headless server mode polish (`--open` flag, embedded frontend assets). Basic sidebar shell (`ProjectSidebar.tsx` — empty collapsible/resizable panel integrated into `App.tsx` layout, with placeholder sections). Phase 1 is shippable: auto-scroll works, `opcode serve` works, sidebar opens/closes but sections are empty.

**Phase 2 — Agent System:** Agent tabs in `TabManager.tsx` with status dots, tab lifecycle (close/confirm/overflow), `AgentStatusBadge.tsx` dropdown, extend `agentStore.ts` for live tracking, agent lifecycle events from `commands/agents.rs`. `/api/agents/live` endpoint in `web_server.rs`.

**Phase 3 — Sidebar Content:** `ProjectInfoSection.tsx` (auto-detection + `.opcode/project.json` overrides), `LiveContextSection.tsx` (git branch, modified files — sourced from existing session state, not new backend parsing), `SessionStatsSection.tsx` (tokens/cost/time from existing usage tracking). Backend endpoints: `/api/project-info`, `/api/session-stats`.

**Phase 4 — Display Polish:** Message layout improvements in `StreamMessage.tsx`, individual widget visual updates across the split widget files, collapsible tool outputs, typography/spacing tokens in `styles.css`.

**Phase 5 — Superpowers:** `SkillsCatalogSection.tsx` in sidebar, `SkillBadgeWidget.tsx` for inline execution indicators, active skill tracking in `sessionStore.ts`. Backend endpoint: `/api/skills`.

## Risks & Mitigations

- **ToolWidgets.tsx is 106KB:** Split into individual widget files before polishing. This reduces merge conflicts and makes each widget independently testable.
- **Web feature parity:** New features must have both Tauri IPC and REST/WebSocket implementations from the start. Use the existing `apiAdapter.ts` pattern.
- **Sidebar on small screens:** Auto-collapse below a responsive breakpoint (e.g., 1024px). Sidebar state persists so it reopens when window expands.
- **Performance with many agents:** Agent tabs use the same virtual scrolling as the main chat. Agent store updates are batched to avoid excessive re-renders.
