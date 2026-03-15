# Opcode UI Enhancements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enhance the Opcode desktop/web app with smart auto-scroll, headless server mode, agent tabs, a project context sidebar, display polish, and superpowers integration.

**Architecture:** Six phases of incremental improvement. Phase 0 splits the monolithic ToolWidgets.tsx (106KB, 24 widgets) into individual files. Phase 1 adds auto-scroll, server mode polish, and sidebar shell. Phases 2-5 build agent tabs, sidebar content, display polish, and superpowers integration respectively. Each phase is independently shippable.

**Tech Stack:** React 18, TypeScript, Zustand, Tailwind CSS v4, @tanstack/react-virtual, Framer Motion, Rust/Axum (backend), Tauri 2

**Spec:** `docs/superpowers/specs/2026-03-15-ui-enhancements-design.md`

---

## Chunk 1: Phase 0 — ToolWidgets Split

Split `src/components/ToolWidgets.tsx` (106KB, ~3000 lines, 24 widget components) into individual files. Pure refactor — zero visual changes.

### Task 1: Create widget directory and barrel export

**Files:**
- Create: `src/components/widgets/index.ts`
- Create: `src/components/widgets/types.ts`

- [ ] **Step 1: Create the widgets directory**

```bash
mkdir -p src/components/widgets
```

- [ ] **Step 2: Extract shared types and helpers into types.ts**

Read `src/components/ToolWidgets.tsx` and identify all shared types, interfaces, and helper functions used across multiple widgets. Create `src/components/widgets/types.ts` with these shared definitions.

Expected shared items: any common props interfaces, utility functions for formatting, shared constants.

- [ ] **Step 3: Create barrel export file**

Create `src/components/widgets/index.ts` as an empty barrel file. Exports will be added in Tasks 2-4 as widgets are extracted.

```typescript
// src/components/widgets/index.ts
// Re-exports all widget components — populated as widgets are extracted
```

- [ ] **Step 4: Commit scaffold**

```bash
git add src/components/widgets/
git commit -m "refactor: scaffold widgets directory for ToolWidgets split"
```

### Task 2: Extract simple widgets (TodoWidget, LSWidget, SystemWidgets)

**Files:**
- Create: `src/components/widgets/TodoWidget.tsx` (from ToolWidgets.tsx lines ~70-125)
- Create: `src/components/widgets/LSWidget.tsx` (from lines ~127-348, includes LSResultWidget)
- Create: `src/components/widgets/SystemReminderWidget.tsx` (from lines ~1776-1800)
- Create: `src/components/widgets/SystemInitializedWidget.tsx` (from lines ~1801-2005)
- Create: `src/components/widgets/SummaryWidget.tsx` (from lines ~1564-1592)
- Modify: `src/components/widgets/index.ts` — add exports

- [ ] **Step 1: Extract TodoWidget**

Copy the `TodoWidget` function component (lines ~70-125 of ToolWidgets.tsx) into `src/components/widgets/TodoWidget.tsx`. Add necessary imports at the top (React, any shared types from `./types`, lucide-react icons, etc.). Export the component.

- [ ] **Step 2: Extract LSWidget + LSResultWidget**

Copy `LSWidget` and `LSResultWidget` (lines ~127-348) into `src/components/widgets/LSWidget.tsx`. Both are related, so they share a file. Add imports.

- [ ] **Step 3: Extract SystemReminderWidget**

Copy `SystemReminderWidget` (lines ~1776-1800) into `src/components/widgets/SystemReminderWidget.tsx`.

- [ ] **Step 4: Extract SystemInitializedWidget**

Copy `SystemInitializedWidget` (lines ~1801-2005) into `src/components/widgets/SystemInitializedWidget.tsx`.

- [ ] **Step 5: Extract SummaryWidget**

Copy `SummaryWidget` (lines ~1564-1592) into `src/components/widgets/SummaryWidget.tsx`.

- [ ] **Step 6: Update barrel export**

Add all new exports to `src/components/widgets/index.ts`.

- [ ] **Step 7: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

Expected: Build succeeds (widgets not yet consumed from new location).

- [ ] **Step 8: Commit**

```bash
git add src/components/widgets/
git commit -m "refactor: extract simple widgets from ToolWidgets.tsx"
```

### Task 3: Extract medium-complexity widgets (Read, Write, Bash, Glob, Grep)

**Files:**
- Create: `src/components/widgets/ReadWidget.tsx` (from lines ~350-572, includes ReadResultWidget)
- Create: `src/components/widgets/WriteWidget.tsx` (from lines ~699-868)
- Create: `src/components/widgets/BashWidget.tsx` (from lines ~630-697)
- Create: `src/components/widgets/GlobWidget.tsx` (from lines ~574-628)
- Create: `src/components/widgets/GrepWidget.tsx` (from lines ~870-1121)
- Modify: `src/components/widgets/index.ts` — add exports

- [ ] **Step 1: Extract ReadWidget + ReadResultWidget**

Copy `ReadWidget` and `ReadResultWidget` (lines ~350-572) into `src/components/widgets/ReadWidget.tsx`. These are tightly coupled — keep in one file. Add all imports (React, syntax highlighter, shared types).

- [ ] **Step 2: Extract WriteWidget**

Copy `WriteWidget` (lines ~699-868) into `src/components/widgets/WriteWidget.tsx`.

- [ ] **Step 3: Extract BashWidget**

Copy `BashWidget` (lines ~630-697) into `src/components/widgets/BashWidget.tsx`.

- [ ] **Step 4: Extract GlobWidget**

Copy `GlobWidget` (lines ~574-628) into `src/components/widgets/GlobWidget.tsx`.

- [ ] **Step 5: Extract GrepWidget**

Copy `GrepWidget` (lines ~870-1121) into `src/components/widgets/GrepWidget.tsx`.

- [ ] **Step 6: Update barrel export and verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 7: Commit**

```bash
git add src/components/widgets/
git commit -m "refactor: extract Read, Write, Bash, Glob, Grep widgets"
```

### Task 4: Extract complex widgets (Edit, MultiEdit, MCP, Command, Task, Web, Thinking)

**Files:**
- Create: `src/components/widgets/EditWidget.tsx` (from lines ~1123-1287, includes EditResultWidget)
- Create: `src/components/widgets/MultiEditWidget.tsx` (from lines ~1593-1774, includes MultiEditResultWidget)
- Create: `src/components/widgets/MCPWidget.tsx` (from lines ~1289-1459)
- Create: `src/components/widgets/CommandWidget.tsx` (from lines ~1461-1562, includes CommandOutputWidget)
- Create: `src/components/widgets/TaskWidget.tsx` (from lines ~2006-2059)
- Create: `src/components/widgets/WebSearchWidget.tsx` (from lines ~2061-2272)
- Create: `src/components/widgets/WebFetchWidget.tsx` (from lines ~2318-2500)
- Create: `src/components/widgets/ThinkingWidget.tsx` (from lines ~2274-2316)
- Create: `src/components/widgets/TodoReadWidget.tsx` (from lines ~2502-end)
- Modify: `src/components/widgets/index.ts` — add exports

- [ ] **Step 1: Extract EditWidget + EditResultWidget**

Copy into `src/components/widgets/EditWidget.tsx`. These components handle diff rendering and are among the most complex — ensure all diff-related imports are included.

- [ ] **Step 2: Extract MultiEditWidget + MultiEditResultWidget**

Copy into `src/components/widgets/MultiEditWidget.tsx`.

- [ ] **Step 3: Extract MCPWidget**

Copy into `src/components/widgets/MCPWidget.tsx`.

- [ ] **Step 4: Extract CommandWidget + CommandOutputWidget**

Copy into `src/components/widgets/CommandWidget.tsx`.

- [ ] **Step 5: Extract TaskWidget**

Copy into `src/components/widgets/TaskWidget.tsx`.

- [ ] **Step 6: Extract WebSearchWidget**

Copy into `src/components/widgets/WebSearchWidget.tsx`.

- [ ] **Step 7: Extract WebFetchWidget**

Copy into `src/components/widgets/WebFetchWidget.tsx`.

- [ ] **Step 8: Extract ThinkingWidget**

Copy into `src/components/widgets/ThinkingWidget.tsx`.

- [ ] **Step 9: Extract TodoReadWidget**

Copy into `src/components/widgets/TodoReadWidget.tsx`.

- [ ] **Step 10: Update barrel export and verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 11: Commit**

```bash
git add src/components/widgets/
git commit -m "refactor: extract Edit, MultiEdit, MCP, Command, Task, Web, Thinking widgets"
```

### Task 5: Replace ToolWidgets.tsx with re-exports and update consumers

**Files:**
- Modify: `src/components/ToolWidgets.tsx` — replace with re-exports from widgets/
- Modify: `src/components/StreamMessage.tsx` — update imports if needed

- [ ] **Step 1: Replace ToolWidgets.tsx content with barrel re-export**

Replace the entire content of `src/components/ToolWidgets.tsx` with:

```typescript
// This file is kept for backwards compatibility.
// All widgets have been moved to src/components/widgets/
export * from './widgets';
```

- [ ] **Step 2: Verify all imports still resolve**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

Expected: Build succeeds. All consumers of ToolWidgets.tsx still work because the re-export preserves the same public API.

- [ ] **Step 3: Run the app and verify widgets render correctly**

```bash
cd /home/koves/GitHub/opcode && bun run dev
```

Open the app, start a session, and verify tool outputs (Bash, Read, Edit, etc.) render as before.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolWidgets.tsx src/components/widgets/
git commit -m "refactor: complete ToolWidgets.tsx split into individual widget files"
```

---

## Chunk 2: Phase 1 — Foundation (Auto-Scroll, Server Mode, Sidebar Shell)

### Task 6: Smart auto-scroll logic

**Files:**
- Modify: `src/components/ClaudeCodeSession.tsx` (scroll logic at lines ~306-385, scroll buttons at lines ~1445-1505)

- [ ] **Step 1: Add auto-scroll state tracking**

In `ClaudeCodeSession.tsx`, add state variables near the existing `parentRef` (around line 100):

```typescript
const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
const [newMessageCount, setNewMessageCount] = useState(0);
const isAtBottomRef = useRef(true);
```

- [ ] **Step 2: Add scroll position detection**

Add a scroll event handler to the `parentRef` container that detects when the user is near the bottom (within 50px threshold):

```typescript
const handleScroll = useCallback(() => {
  const el = parentRef.current;
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  isAtBottomRef.current = atBottom;
  if (atBottom) {
    setIsUserScrolledUp(false);
    setNewMessageCount(0);
  } else {
    setIsUserScrolledUp(true);
  }
}, []);
```

Attach this to the scroll container's `onScroll` prop.

- [ ] **Step 3: Modify auto-scroll useEffect**

Update the existing auto-scroll useEffect (lines ~306-325) to only scroll when the user is at the bottom:

```typescript
useEffect(() => {
  if (!isAtBottomRef.current) {
    // User has scrolled up — count new messages but don't auto-scroll
    setNewMessageCount(prev => prev + 1);
    return;
  }
  // User is at bottom — auto-scroll
  requestAnimationFrame(() => {
    rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'auto' });
  });
}, [displayableMessages.length]);
```

- [ ] **Step 4: Verify build and test scrolling**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/components/ClaudeCodeSession.tsx
git commit -m "feat: add smart auto-scroll that pauses when user scrolls up"
```

### Task 7: ScrollToBottomButton component

**Files:**
- Create: `src/components/ScrollToBottomButton.tsx`
- Modify: `src/components/ClaudeCodeSession.tsx` — integrate button

- [ ] **Step 1: Create ScrollToBottomButton.tsx**

```typescript
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDown } from 'lucide-react';

interface ScrollToBottomButtonProps {
  visible: boolean;
  newMessageCount: number;
  onClick: () => void;
}

export function ScrollToBottomButton({ visible, newMessageCount, onClick }: ScrollToBottomButtonProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          onClick={onClick}
          className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
          {newMessageCount > 0 && (
            <span className="text-xs font-medium">{newMessageCount}</span>
          )}
        </motion.button>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Integrate into ClaudeCodeSession.tsx**

Import `ScrollToBottomButton` and add it inside the scroll container wrapper (near the existing scroll buttons around line 1445). Add a `scrollToBottom` handler:

```typescript
const scrollToBottom = useCallback(() => {
  rowVirtualizer.scrollToIndex(displayableMessages.length - 1, { align: 'end', behavior: 'smooth' });
  setIsUserScrolledUp(false);
  setNewMessageCount(0);
}, [rowVirtualizer, displayableMessages.length]);
```

Place the button component:
```tsx
<ScrollToBottomButton
  visible={isUserScrolledUp}
  newMessageCount={newMessageCount}
  onClick={scrollToBottom}
/>
```

- [ ] **Step 3: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 4: Commit**

```bash
git add src/components/ScrollToBottomButton.tsx src/components/ClaudeCodeSession.tsx
git commit -m "feat: add scroll-to-bottom button with unread message count"
```

### Task 8: Auto-scroll settings toggle

**Files:**
- Modify: `src/components/Settings.tsx` — add toggle
- Modify: `src/components/ClaudeCodeSession.tsx` — respect setting

- [ ] **Step 1: Add auto-scroll setting to localStorage**

In `ClaudeCodeSession.tsx`, read the setting from localStorage on mount and listen for changes:

```typescript
const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
  const stored = localStorage.getItem('runecode-auto-scroll');
  return stored !== null ? stored === 'true' : true; // default: on
});

// Listen for storage changes (so Settings toggle updates this component)
useEffect(() => {
  const handler = () => {
    const stored = localStorage.getItem('runecode-auto-scroll');
    setAutoScrollEnabled(stored !== null ? stored === 'true' : true);
  };
  window.addEventListener('storage', handler);
  // Also listen for custom event for same-window updates
  window.addEventListener('runecode-settings-changed', handler);
  return () => {
    window.removeEventListener('storage', handler);
    window.removeEventListener('runecode-settings-changed', handler);
  };
}, []);
```

Update the auto-scroll useEffect to check `autoScrollEnabled`:
```typescript
if (!autoScrollEnabled || !isAtBottomRef.current) {
  setNewMessageCount(prev => prev + 1);
  return;
}
```

- [ ] **Step 2: Add toggle in Settings.tsx**

Find the settings sections in `Settings.tsx` and add an "Auto-scroll" toggle. The toggle writes to localStorage and dispatches a custom event so ClaudeCodeSession picks up the change without a page reload:

```tsx
const [autoScrollEnabled, setAutoScrollEnabled] = useState(() => {
  const stored = localStorage.getItem('runecode-auto-scroll');
  return stored !== null ? stored === 'true' : true;
});

<div className="flex items-center justify-between">
  <div>
    <label className="text-sm font-medium">Auto-scroll to bottom</label>
    <p className="text-xs text-muted-foreground">Automatically follow new messages</p>
  </div>
  <Switch
    checked={autoScrollEnabled}
    onCheckedChange={(checked) => {
      localStorage.setItem('runecode-auto-scroll', String(checked));
      window.dispatchEvent(new Event('runecode-settings-changed'));
      setAutoScrollEnabled(checked);
    }}
  />
</div>
```

- [ ] **Step 3: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx src/components/ClaudeCodeSession.tsx
git commit -m "feat: add auto-scroll settings toggle (default: on)"
```

### Task 9: Headless server mode — embedded frontend + --open flag

**Files:**
- Modify: `src-tauri/Cargo.toml` — add rust-embed dependency
- Modify: `src-tauri/src/web_main.rs` — add --open flag
- Modify: `src-tauri/src/web_server.rs` — serve embedded assets

- [ ] **Step 1: Add rust-embed dependency**

Add to `src-tauri/Cargo.toml` under `[dependencies]`:

```toml
rust-embed = { version = "8", features = ["interpolate-folder-path"] }
```

- [ ] **Step 2: Add --open flag to web_main.rs**

Modify the `Args` struct in `src-tauri/src/web_main.rs`:

```rust
#[derive(Parser)]
#[command(name = "opcode-web")]
#[command(about = "Opcode Web Server - Run Opcode in your browser")]
struct Args {
    #[arg(short, long, default_value = "8080")]
    port: u16,

    #[arg(short = 'H', long, default_value = "0.0.0.0")]
    host: String,

    /// Automatically open the browser
    #[arg(long)]
    open: bool,
}
```

After the server starts, add browser opening:

```rust
if args.open {
    let url = format!("http://localhost:{}", args.port);
    let _ = open::that(&url);
}
```

Add `open` crate to Cargo.toml: `open = "5"`.

- [ ] **Step 3: Embed frontend assets in web_server.rs**

Add at the top of `web_server.rs`:

```rust
use rust_embed::Embed;

#[derive(Embed)]
#[folder = "../dist/"]
struct FrontendAssets;
```

Replace the existing static file serving routes (lines ~826-827 for `/assets/*` and `/vite.svg`) with a fallback handler that serves from the embedded assets:

```rust
async fn serve_frontend(uri: axum::http::Uri) -> impl axum::response::IntoResponse {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };

    match FrontendAssets::get(path) {
        Some(content) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            (
                [(axum::http::header::CONTENT_TYPE, mime.as_ref())],
                content.data.into_owned(),
            ).into_response()
        }
        None => {
            // SPA fallback — serve index.html for client-side routing
            match FrontendAssets::get("index.html") {
                Some(content) => {
                    (
                        [(axum::http::header::CONTENT_TYPE, "text/html")],
                        content.data.into_owned(),
                    ).into_response()
                }
                None => axum::http::StatusCode::NOT_FOUND.into_response(),
            }
        }
    }
}
```

Add `mime_guess` dependency to Cargo.toml: `mime_guess = "2"`.

- [ ] **Step 4: Update startup message**

In `web_main.rs`, improve the startup output:

```rust
println!("Opcode running at http://{}:{}", args.host, args.port);
println!("Press Ctrl+C to stop");
```

- [ ] **Step 5: Build frontend then backend to verify**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build --bin opcode-web 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/web_main.rs src-tauri/src/web_server.rs
git commit -m "feat: embed frontend assets in web binary, add --open flag"
```

### Task 10: Sidebar shell (ProjectSidebar.tsx)

**Files:**
- Create: `src/components/ProjectSidebar.tsx`
- Modify: `src/App.tsx` — integrate sidebar into layout

- [ ] **Step 1: Create ProjectSidebar.tsx**

```typescript
import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';

interface ProjectSidebarProps {
  children?: React.ReactNode;
}

const SIDEBAR_WIDTH_KEY = 'opcode-sidebar-width';
const SIDEBAR_OPEN_KEY = 'opcode-sidebar-open';
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

export function ProjectSidebar({ children }: ProjectSidebarProps) {
  const [isOpen, setIsOpen] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_OPEN_KEY);
    return stored !== null ? stored === 'true' : true;
  });

  const [width, setWidth] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return stored ? parseInt(stored, 10) : DEFAULT_WIDTH;
  });

  const [isResizing, setIsResizing] = useState(false);

  const toggleSidebar = useCallback(() => {
    setIsOpen(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_OPEN_KEY, String(next));
      return next;
    });
  }, []);

  const widthRef = useRef(width);
  widthRef.current = width;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const startX = e.clientX;
    const startWidth = widthRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth - (e.clientX - startX)));
      setWidth(newWidth);
      widthRef.current = newWidth;
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(widthRef.current));
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-2 right-2 z-20 p-1.5 rounded-md hover:bg-muted transition-colors"
        title={isOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {isOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="relative flex-shrink-0 border-l border-border bg-background overflow-hidden"
          >
            {/* Resize handle */}
            <div
              onMouseDown={handleMouseDown}
              className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors ${isResizing ? 'bg-primary/30' : ''}`}
            />

            {/* Sidebar content */}
            <div className="h-full overflow-y-auto p-3 space-y-4" style={{ width }}>
              {children || (
                <>
                  <SidebarPlaceholder title="Project Info" />
                  <SidebarPlaceholder title="Live Context" />
                  <SidebarPlaceholder title="Session Stats" />
                  <SidebarPlaceholder title="Skills" />
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SidebarPlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/25 p-3">
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</h3>
      <p className="text-xs text-muted-foreground/50 mt-1">Coming soon</p>
    </div>
  );
}
```

- [ ] **Step 2: Integrate into App.tsx layout**

In `src/App.tsx`, find the main content area where `TabContent` is rendered (around line 420). Wrap the tab content area to include the sidebar:

```tsx
import { ProjectSidebar } from './components/ProjectSidebar';

// Inside the "tabs" case of the main content:
<div className="flex-1 overflow-hidden flex">
  <div className="flex-1 overflow-hidden">
    {/* Existing TabContent */}
  </div>
  <ProjectSidebar />
</div>
```

- [ ] **Step 3: Add responsive auto-collapse**

Add a window resize listener to `ProjectSidebar.tsx` that auto-collapses below 1024px:

```typescript
useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth < 1024) {
      setIsOpen(false);
    }
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

- [ ] **Step 4: Verify build and test sidebar**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

Open the app and verify: sidebar appears on the right, can be toggled open/closed, can be resized by dragging the left edge, and auto-collapses on narrow windows.

- [ ] **Step 5: Commit**

```bash
git add src/components/ProjectSidebar.tsx src/App.tsx
git commit -m "feat: add collapsible project context sidebar shell"
```

---

## Chunk 3: Phase 2 — Agent Tabs + Status Badge

### Task 11: Extend agent store for live tracking

**Files:**
- Modify: `src/stores/agentStore.ts`

- [ ] **Step 1: Add live agent tracking types**

Add to `src/stores/agentStore.ts`:

```typescript
export interface LiveAgent {
  id: string;
  name: string;
  status: 'running' | 'thinking' | 'completed' | 'failed';
  startedAt: number;
  elapsedMs: number;
  tokenCount: number;
  tabId?: string;
}
```

- [ ] **Step 2: Extend the AgentState interface**

Add to the state interface:

```typescript
liveAgents: Map<string, LiveAgent>;
addLiveAgent: (agent: LiveAgent) => void;
updateLiveAgent: (id: string, updates: Partial<LiveAgent>) => void;
removeLiveAgent: (id: string) => void;
getLiveAgentCount: () => number;
```

- [ ] **Step 3: Implement the actions in the store**

Add implementations inside the `create` call:

```typescript
liveAgents: new Map(),
addLiveAgent: (agent) => set(state => {
  const next = new Map(state.liveAgents);
  next.set(agent.id, agent);
  return { liveAgents: next };
}),
updateLiveAgent: (id, updates) => set(state => {
  const next = new Map(state.liveAgents);
  const existing = next.get(id);
  if (existing) next.set(id, { ...existing, ...updates });
  return { liveAgents: next };
}),
removeLiveAgent: (id) => set(state => {
  const next = new Map(state.liveAgents);
  next.delete(id);
  return { liveAgents: next };
}),
getLiveAgentCount: () => get().liveAgents.size,
```

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/stores/agentStore.ts
git commit -m "feat: extend agent store with live agent tracking"
```

### Task 12: Agent tab type and status dots in TabManager

**Files:**
- Modify: `src/contexts/TabContext.tsx` — no changes needed, 'agent-execution' type already exists
- Modify: `src/components/TabManager.tsx` — add status dots, close behavior, overflow

- [ ] **Step 1: Add status dot rendering to tab labels**

In `TabManager.tsx`, find where tab labels are rendered. For tabs with type `'agent-execution'`, add a colored dot before the label based on the agent's status from `agentStore`:

```tsx
import { useAgentStore } from '../stores/agentStore';

// Inside tab label rendering:
const liveAgents = useAgentStore(state => state.liveAgents);

function getAgentStatusDot(tabId: string) {
  const agent = Array.from(liveAgents.values()).find(a => a.tabId === tabId);
  if (!agent) return null;
  const colors = {
    running: 'bg-green-500',
    thinking: 'bg-blue-500',
    completed: 'bg-gray-400',
    failed: 'bg-red-500',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[agent.status]} ${agent.status === 'running' ? 'animate-pulse' : ''}`} />
  );
}
```

- [ ] **Step 2: Add close confirmation for running agents**

When closing a tab of type `'agent-execution'`, check if the agent is still running. If so, show a confirmation dialog:

```tsx
const handleCloseAgentTab = (tabId: string) => {
  const agent = Array.from(liveAgents.values()).find(a => a.tabId === tabId);
  if (agent && agent.status === 'running') {
    if (!window.confirm('Agent is still running. Stop it?')) return;
    // Kill agent process via API
    agentStore.getState().removeLiveAgent(agent.id);
  }
  closeTab(tabId);
};
```

- [ ] **Step 3: Add tab overflow (6+ agent tabs)**

When more than 6 agent tabs exist, collapse extras into a dropdown menu:

```tsx
const agentTabs = tabs.filter(t => t.type === 'agent-execution');
const visibleAgentTabs = agentTabs.slice(0, 6);
const overflowAgentTabs = agentTabs.slice(6);

// Render visible tabs normally, then add overflow dropdown if needed
{overflowAgentTabs.length > 0 && (
  <DropdownMenu>
    <DropdownMenuTrigger className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
      +{overflowAgentTabs.length}
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      {overflowAgentTabs.map(tab => (
        <DropdownMenuItem key={tab.id} onClick={() => setActiveTab(tab.id)}>
          {getAgentStatusDot(tab.id)} {tab.title}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  </DropdownMenu>
)}
```

- [ ] **Step 4: Style completed agent tabs dimmed**

Add conditional styling for completed/failed agent tabs:

```tsx
const isCompletedAgent = tab.type === 'agent-execution' &&
  Array.from(liveAgents.values()).find(a => a.tabId === tab.id)?.status === 'completed';

// Apply dimmed class:
className={`... ${isCompletedAgent ? 'opacity-60' : ''}`}
```

- [ ] **Step 5: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 6: Commit**

```bash
git add src/components/TabManager.tsx
git commit -m "feat: add agent status dots, close confirmation, and tab overflow"
```

### Task 13: AgentStatusBadge component

**Files:**
- Create: `src/components/AgentStatusBadge.tsx`
- Modify: `src/components/TabManager.tsx` — integrate badge

- [ ] **Step 1: Create AgentStatusBadge.tsx**

```typescript
import React from 'react';
import { useAgentStore, LiveAgent } from '../stores/agentStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface AgentStatusBadgeProps {
  onAgentClick: (agentId: string) => void;
}

export function AgentStatusBadge({ onAgentClick }: AgentStatusBadgeProps) {
  const liveAgents = useAgentStore(state => state.liveAgents);
  const agents = Array.from(liveAgents.values());
  const runningCount = agents.filter(a => a.status === 'running' || a.status === 'thinking').length;

  if (runningCount === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        {runningCount} running
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {agents.map(agent => (
          <DropdownMenuItem key={agent.id} onClick={() => onAgentClick(agent.id)}>
            <span className={`w-2 h-2 rounded-full mr-2 ${
              agent.status === 'running' ? 'bg-green-500' :
              agent.status === 'thinking' ? 'bg-blue-500' :
              agent.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
            }`} />
            <span className="flex-1">{agent.name}</span>
            <span className="text-muted-foreground ml-2">
              {Math.round(agent.elapsedMs / 1000)}s
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Integrate into TabManager.tsx**

Import `AgentStatusBadge` and place it in the tab bar, after the tab list:

```tsx
<AgentStatusBadge onAgentClick={(agentId) => {
  const agent = liveAgents.get(agentId);
  if (agent?.tabId) setActiveTab(agent.tabId);
}} />
```

- [ ] **Step 3: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 4: Commit**

```bash
git add src/components/AgentStatusBadge.tsx src/components/TabManager.tsx
git commit -m "feat: add agent status badge with running count and dropdown"
```

### Task 14: Agent lifecycle events from backend

**Files:**
- Modify: `src-tauri/src/commands/agents.rs` — emit lifecycle events
- Modify: `src-tauri/src/web_server.rs` — add `/api/agents/live` endpoint

- [ ] **Step 1: Add agent lifecycle event emission in agents.rs**

Find the agent execution function in `commands/agents.rs`. At key lifecycle points, emit Tauri events:

```rust
// On agent start:
app_handle.emit("agent-lifecycle", serde_json::json!({
    "event": "started",
    "agent_id": agent_id,
    "agent_name": agent_name,
    "timestamp": chrono::Utc::now().timestamp_millis()
})).ok();

// On agent completion:
app_handle.emit("agent-lifecycle", serde_json::json!({
    "event": "completed",
    "agent_id": agent_id,
    "timestamp": chrono::Utc::now().timestamp_millis()
})).ok();

// On agent error:
app_handle.emit("agent-lifecycle", serde_json::json!({
    "event": "failed",
    "agent_id": agent_id,
    "error": error_message,
    "timestamp": chrono::Utc::now().timestamp_millis()
})).ok();
```

- [ ] **Step 2: Add /api/agents/live endpoint in web_server.rs**

Add a new route in the web server's router (near line 789):

```rust
.route("/api/agents/live", get(get_live_agents))
```

Implement the handler:

```rust
async fn get_live_agents(
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let registry = state.process_registry.lock().await;
    let agents: Vec<serde_json::Value> = registry.iter().map(|(id, info)| {
        serde_json::json!({
            "id": id,
            "name": info.agent_name,
            "status": if info.is_running() { "running" } else { "completed" },
            "started_at": info.started_at,
            "pid": info.pid
        })
    }).collect();
    axum::Json(agents)
}
```

- [ ] **Step 3: Subscribe to lifecycle events on frontend**

Create a new hook `src/hooks/useAgentLifecycle.ts` that subscribes to agent events using the dual-mode pattern (Tauri listen + DOM events for web mode, matching `apiAdapter.ts` pattern). On 'started' events, also auto-create an agent tab:

```typescript
import { useEffect } from 'react';
import { useAgentStore } from '../stores/agentStore';

// Import listen with fallback for web mode
const tauriListen = window.__TAURI__ ? (await import('@tauri-apps/api/event')).listen : null;
const listen = tauriListen || ((eventName: string, callback: (event: any) => void) => {
  const handler = (event: any) => callback({ payload: event.detail });
  window.addEventListener(eventName, handler);
  return Promise.resolve(() => window.removeEventListener(eventName, handler));
});

export function useAgentLifecycle(openTab: (type: string, data: any) => void) {
  useEffect(() => {
    const unlisten = listen('agent-lifecycle', (event: any) => {
      const { event: eventType, agent_id, agent_name } = event.payload;
      const store = useAgentStore.getState();

      if (eventType === 'started') {
        const tabId = `agent-${agent_id}`;
        store.addLiveAgent({
          id: agent_id,
          name: agent_name,
          status: 'running',
          startedAt: Date.now(),
          elapsedMs: 0,
          tokenCount: 0,
          tabId,
        });
        // Auto-create agent tab
        openTab('agent-execution', { id: tabId, title: agent_name, agentId: agent_id });
      } else if (eventType === 'completed') {
        // Keep in store with 'completed' status — don't remove until tab is closed
        store.updateLiveAgent(agent_id, { status: 'completed' });
      } else if (eventType === 'failed') {
        store.updateLiveAgent(agent_id, { status: 'failed' });
      }
    });

    return () => { unlisten.then(fn => fn()); };
  }, [openTab]);
}
```

Use this hook in `App.tsx` or wherever the tab context is available.

Note: Completed/failed agents stay in `liveAgents` until their tab is closed. The `removeLiveAgent` action is called from the tab close handler in TabManager (Task 12), not from lifecycle events.
```

- [ ] **Step 4: Verify build (frontend and backend)**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/agents.rs src-tauri/src/web_server.rs src/components/ClaudeCodeSession.tsx
git commit -m "feat: emit agent lifecycle events, add /api/agents/live endpoint"
```

---

## Chunk 4: Phase 3 — Sidebar Content

### Task 15: ProjectInfoSection component

**Files:**
- Create: `src/components/sidebar/ProjectInfoSection.tsx`
- Modify: `src-tauri/src/web_server.rs` — add `/api/project-info` endpoint

- [ ] **Step 1: Create sidebar directory**

```bash
mkdir -p src/components/sidebar
```

- [ ] **Step 2: Add /api/project-info endpoint in web_server.rs**

Add route:
```rust
.route("/api/project-info", get(get_project_info))
```

Implement handler that scans the project directory:

```rust
async fn get_project_info(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let project_path = params.get("path").cloned().unwrap_or_default();
    let path = std::path::Path::new(&project_path);

    let mut info = serde_json::json!({
        "name": path.file_name().and_then(|n| n.to_str()).unwrap_or("Unknown"),
        "techStack": [],
        "description": "",
        "repoUrl": ""
    });

    // Auto-detect from package.json
    let pkg_path = path.join("package.json");
    if pkg_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&pkg_path) {
            if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(name) = pkg.get("name").and_then(|n| n.as_str()) {
                    info["name"] = serde_json::json!(name);
                }
                if let Some(desc) = pkg.get("description").and_then(|d| d.as_str()) {
                    info["description"] = serde_json::json!(desc);
                }
                // Detect tech stack from dependencies
                let mut stack = Vec::new();
                if let Some(deps) = pkg.get("dependencies").and_then(|d| d.as_object()) {
                    if deps.contains_key("react") { stack.push("React"); }
                    if deps.contains_key("vue") { stack.push("Vue"); }
                    if deps.contains_key("svelte") { stack.push("Svelte"); }
                    if deps.contains_key("next") { stack.push("Next.js"); }
                }
                info["techStack"] = serde_json::json!(stack);
            }
        }
    }

    // Auto-detect from Cargo.toml
    if path.join("Cargo.toml").exists() {
        let stack = info["techStack"].as_array_mut().unwrap();
        stack.push(serde_json::json!("Rust"));
    }

    // Override with .opcode/project.json if exists
    let override_path = path.join(".opcode/project.json");
    if override_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&override_path) {
            if let Ok(overrides) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(obj) = overrides.as_object() {
                    for (key, value) in obj {
                        info[key] = value.clone();
                    }
                }
            }
        }
    }

    // Detect git remote URL
    let git_config = path.join(".git/config");
    if git_config.exists() {
        if let Ok(content) = std::fs::read_to_string(&git_config) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("url = ") {
                    info["repoUrl"] = serde_json::json!(trimmed.trim_start_matches("url = "));
                    break;
                }
            }
        }
    }

    axum::Json(info)
}
```

- [ ] **Step 3: Create ProjectInfoSection.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Code2, GitBranch } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';

interface ProjectInfo {
  name: string;
  description: string;
  techStack: string[];
  repoUrl: string;
  entryPoints?: string[];
  notes?: string;
}

interface ProjectInfoSectionProps {
  projectPath: string;
}

export function ProjectInfoSection({ projectPath }: ProjectInfoSectionProps) {
  const [info, setInfo] = useState<ProjectInfo | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Fetch project info via API or Tauri IPC
    fetchProjectInfo(projectPath).then(setInfo);
  }, [projectPath]);

  if (!info) return null;

  return (
    <div className="space-y-2">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1 w-full text-left"
      >
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Project Info</h3>
      </button>

      {!collapsed && (
        <div className="space-y-2 text-sm">
          <div className="font-medium">{info.name}</div>
          {info.description && (
            <p className="text-xs text-muted-foreground">{info.description}</p>
          )}
          {info.techStack.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {info.techStack.map(tech => (
                <span key={tech} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-muted">
                  <Code2 className="h-3 w-3" />
                  {tech}
                </span>
              ))}
            </div>
          )}
          {info.repoUrl && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <GitBranch className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{info.repoUrl}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function fetchProjectInfo(projectPath: string): Promise<ProjectInfo> {
  try {
    // Try Tauri IPC first, fall back to REST
    return await invoke('get_project_info', { projectPath });
  } catch {
    const res = await fetch(`/api/project-info?path=${encodeURIComponent(projectPath)}`);
    return res.json();
  }
}
```

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/components/sidebar/ src-tauri/src/web_server.rs
git commit -m "feat: add ProjectInfoSection with auto-detection and .opcode/project.json overrides"
```

### Task 16: LiveContextSection component

**Files:**
- Create: `src/components/sidebar/LiveContextSection.tsx`

- [ ] **Step 1: Create LiveContextSection.tsx**

This component reads from existing frontend message state — no new backend endpoints needed.

```typescript
import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, GitBranch, FileEdit, AlertCircle } from 'lucide-react';

interface LiveContextSectionProps {
  messages: any[]; // The parsed stream messages from the session
  gitBranch?: string;
  dirtyFileCount?: number;
}

export function LiveContextSection({ messages, gitBranch, dirtyFileCount }: LiveContextSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Extract modified files from Write/Edit/MultiEdit tool calls in messages
  const modifiedFiles = useMemo(() => {
    const files = new Set<string>();
    for (const msg of messages) {
      if (msg?.tool_name && ['Write', 'Edit', 'MultiEdit'].includes(msg.tool_name)) {
        const filePath = msg.tool_input?.file_path || msg.tool_input?.path;
        if (filePath) files.add(filePath);
      }
    }
    return Array.from(files);
  }, [messages]);

  // Extract last error from tool results
  const lastError = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg?.tool_result?.exit_code && msg.tool_result.exit_code !== 0) {
        return { tool: msg.tool_name, message: msg.tool_result.stderr || 'Command failed' };
      }
    }
    return null;
  }, [messages]);

  return (
    <div className="space-y-2">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 w-full text-left">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Live Context</h3>
      </button>

      {!collapsed && (
        <div className="space-y-2 text-sm">
          {gitBranch && (
            <div className="flex items-center gap-1.5 text-xs">
              <GitBranch className="h-3 w-3 text-muted-foreground" />
              <span>{gitBranch}</span>
              {dirtyFileCount !== undefined && dirtyFileCount > 0 && (
                <span className="text-yellow-500 text-xs">({dirtyFileCount} modified)</span>
              )}
            </div>
          )}

          {modifiedFiles.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Files touched this session:</div>
              {modifiedFiles.slice(-5).map(file => (
                <div key={file} className="flex items-center gap-1 text-xs truncate">
                  <FileEdit className="h-3 w-3 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{file.split('/').pop()}</span>
                </div>
              ))}
              {modifiedFiles.length > 5 && (
                <div className="text-xs text-muted-foreground">+{modifiedFiles.length - 5} more</div>
              )}
            </div>
          )}

          {lastError && (
            <div className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 rounded p-2">
              <AlertCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <div className="truncate">
                <div className="font-medium">{lastError.tool}</div>
                <div className="truncate opacity-75">{lastError.message}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 3: Commit**

```bash
git add src/components/sidebar/LiveContextSection.tsx
git commit -m "feat: add LiveContextSection showing branch, modified files, and errors"
```

### Task 17: SessionStatsSection component

**Files:**
- Create: `src/components/sidebar/SessionStatsSection.tsx`
- Modify: `src-tauri/src/web_server.rs` — add `/api/session-stats` endpoint

- [ ] **Step 1: Add /api/session-stats endpoint**

Add route in `web_server.rs`:

```rust
.route("/api/session-stats", get(get_session_stats))
```

Handler returns live session statistics:

```rust
async fn get_session_stats(
    Query(params): Query<HashMap<String, String>>,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    let session_id = params.get("session_id").cloned().unwrap_or_default();
    // Aggregate from session state
    axum::Json(serde_json::json!({
        "input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost_usd": 0.0,
        "elapsed_ms": 0,
        "files_modified": 0,
        "tools_called": 0
    }))
}
```

- [ ] **Step 2: Create SessionStatsSection.tsx**

```typescript
import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Zap, Clock, DollarSign, FileEdit, Wrench } from 'lucide-react';

interface SessionStats {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  elapsedMs: number;
  filesModified: number;
  toolsCalled: number;
}

interface SessionStatsSectionProps {
  stats: SessionStats;
}

export function SessionStatsSection({ stats }: SessionStatsSectionProps) {
  const [collapsed, setCollapsed] = useState(false);

  const formatTokens = (n: number) => n > 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  return (
    <div className="space-y-2">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 w-full text-left">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Session</h3>
      </button>

      {!collapsed && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-yellow-500" />
            <span>{formatTokens(stats.inputTokens + stats.outputTokens)} tokens</span>
          </div>
          <div className="flex items-center gap-1.5">
            <DollarSign className="h-3 w-3 text-green-500" />
            <span>${stats.estimatedCostUsd.toFixed(3)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-blue-500" />
            <span>{formatTime(stats.elapsedMs)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <FileEdit className="h-3 w-3 text-purple-500" />
            <span>{stats.filesModified} files</span>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Wrench className="h-3 w-3 text-orange-500" />
            <span>{stats.toolsCalled} tool calls</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/SessionStatsSection.tsx src-tauri/src/web_server.rs
git commit -m "feat: add SessionStatsSection and /api/session-stats endpoint"
```

### Task 18: Wire sidebar sections into ProjectSidebar

**Files:**
- Modify: `src/components/ProjectSidebar.tsx` — replace placeholders with real sections

- [ ] **Step 1: Replace placeholder sections with real components**

Update `ProjectSidebar.tsx` to accept props and render the real sidebar sections:

```typescript
import { ProjectInfoSection } from './sidebar/ProjectInfoSection';
import { LiveContextSection } from './sidebar/LiveContextSection';
import { SessionStatsSection } from './sidebar/SessionStatsSection';

interface ProjectSidebarProps {
  projectPath?: string;
  messages?: any[];
  gitBranch?: string;
  dirtyFileCount?: number;
  sessionStats?: SessionStats;
}
```

Replace the placeholder rendering with:

```tsx
<ProjectInfoSection projectPath={projectPath || ''} />
<LiveContextSection messages={messages || []} gitBranch={gitBranch} dirtyFileCount={dirtyFileCount} />
<SessionStatsSection stats={sessionStats || defaultStats} />
{/* Skills section placeholder — added in Phase 5 */}
<SidebarPlaceholder title="Skills" />
```

- [ ] **Step 2: Pass props from App.tsx**

Update the `ProjectSidebar` usage in `App.tsx` to pass the active tab's project path, messages, and stats from the existing session/tab state.

- [ ] **Step 3: Verify build and test**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

Open app, verify sidebar shows project info, live context, and session stats.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProjectSidebar.tsx src/App.tsx
git commit -m "feat: wire real sidebar sections into ProjectSidebar"
```

---

## Chunk 5: Phase 4 — Display Polish

### Task 19: Message layout improvements

**Files:**
- Modify: `src/components/StreamMessage.tsx` — message styling

- [ ] **Step 1: Add role-based message styling**

In `StreamMessage.tsx`, find where messages are rendered and add role-based visual treatment:

```tsx
const roleStyles = {
  user: 'border-l-2 border-blue-500 bg-blue-500/5',
  assistant: 'border-l-2 border-emerald-500 bg-emerald-500/5',
  system: 'border-l-2 border-gray-400 bg-gray-500/5 text-sm opacity-75',
};

// Apply to the message wrapper:
<div className={`px-4 py-3 ${roleStyles[message.role] || ''}`}>
```

- [ ] **Step 2: Reduce system message visual weight**

System messages should be smaller and more muted:

```tsx
{message.role === 'system' && (
  <div className="text-xs text-muted-foreground italic">
    {/* system message content */}
  </div>
)}
```

- [ ] **Step 3: Consistent spacing between messages**

Add uniform gap between messages:

```tsx
<div className="space-y-1">
  {/* messages rendered here */}
</div>
```

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/components/StreamMessage.tsx
git commit -m "feat: improve message layout with role-based styling"
```

### Task 20: Tool widget visual polish

**Files:**
- Modify: `src/components/widgets/BashWidget.tsx`
- Modify: `src/components/widgets/ReadWidget.tsx`
- Modify: `src/components/widgets/EditWidget.tsx`
- Modify: `src/components/widgets/GrepWidget.tsx`
- Modify: `src/components/widgets/GlobWidget.tsx`

- [ ] **Step 1: Polish BashWidget**

Add cleaner terminal look with command/output distinction:

```tsx
// Command line with $ prefix
<div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b border-border rounded-t-md font-mono text-sm">
  <span className="text-green-500">$</span>
  <span>{command}</span>
</div>
// Output area
<div className="px-3 py-2 font-mono text-sm bg-background rounded-b-md max-h-64 overflow-auto">
  {output}
</div>
// Exit code badge
{exitCode !== undefined && exitCode !== 0 && (
  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-red-500/10 text-red-500">
    exit {exitCode}
  </span>
)}
```

- [ ] **Step 2: Polish ReadWidget**

Add file path header with icon:

```tsx
<div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/50 border-b border-border rounded-t-md text-xs">
  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
  <span className="font-mono">{filePath}</span>
</div>
```

Make line numbers subtler: `text-muted-foreground/40` and smaller width.

- [ ] **Step 3: Polish EditWidget**

Tighter diff view with standard green/red coloring:

```tsx
// Added lines
<div className="bg-green-500/10 border-l-2 border-green-500 px-2 font-mono text-sm">
  + {addedLine}
</div>
// Removed lines
<div className="bg-red-500/10 border-l-2 border-red-500 px-2 font-mono text-sm">
  - {removedLine}
</div>
```

- [ ] **Step 4: Polish GrepWidget and GlobWidget**

Clean results list with file icons:

```tsx
// GrepWidget results
<div className="space-y-0.5">
  {results.map(result => (
    <div key={result.path} className="flex items-center gap-1.5 px-2 py-1 text-xs font-mono hover:bg-muted/50 rounded">
      <Search className="h-3 w-3 text-muted-foreground flex-shrink-0" />
      <span className="text-blue-400">{result.path}</span>
      <span className="text-muted-foreground">:{result.line}</span>
    </div>
  ))}
</div>
```

- [ ] **Step 5: Add consistent widget wrapper styling**

Create a shared wrapper pattern for all widgets:

```tsx
// Consistent wrapper for all tool widgets
<div className="rounded-md border border-border overflow-hidden my-2">
  {/* Widget header */}
  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/30 text-xs text-muted-foreground">
    <ToolIcon className="h-3.5 w-3.5" />
    <span className="font-medium">{toolName}</span>
  </div>
  {/* Widget content */}
  <div className="p-0">
    {children}
  </div>
</div>
```

- [ ] **Step 6: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 7: Commit**

```bash
git add src/components/widgets/
git commit -m "feat: polish tool widgets with consistent styling"
```

### Task 21: Collapsible tool outputs and information density

**Files:**
- Modify: `src/components/StreamMessage.tsx` — collapsible tool outputs
- Modify: `src/components/widgets/ThinkingWidget.tsx` — collapsed by default

- [ ] **Step 1: Add collapsible wrapper for tool outputs**

In `StreamMessage.tsx`, wrap tool outputs in a collapsible container:

```tsx
function CollapsibleToolOutput({ toolName, summary, children }: {
  toolName: string;
  summary: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-md border border-border overflow-hidden my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 bg-muted/30 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span className="font-medium">{toolName}</span>
        <span className="text-muted-foreground/60 truncate">{summary}</span>
      </button>
      {expanded && children}
    </div>
  );
}
```

- [ ] **Step 2: Collapse ThinkingWidget by default**

In `ThinkingWidget.tsx`, set initial state to collapsed:

```typescript
const [expanded, setExpanded] = useState(false);
```

Show a summary line when collapsed: "Thinking... (click to expand)"

- [ ] **Step 3: Add max-height with "Show all" for long code blocks**

In the markdown renderer or code block component, add:

```tsx
const [showAll, setShowAll] = useState(false);
const MAX_HEIGHT = 300; // px

<div className={`relative ${!showAll ? 'max-h-[300px] overflow-hidden' : ''}`}>
  {codeContent}
  {!showAll && contentHeight > MAX_HEIGHT && (
    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background to-transparent pt-8 pb-2 text-center">
      <button onClick={() => setShowAll(true)} className="text-xs text-primary hover:underline">
        Show all ({lineCount} lines)
      </button>
    </div>
  )}
</div>
```

- [ ] **Step 4: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 5: Commit**

```bash
git add src/components/StreamMessage.tsx src/components/widgets/ThinkingWidget.tsx
git commit -m "feat: add collapsible tool outputs and max-height for code blocks"
```

---

## Chunk 6: Phase 5 — Superpowers Integration

### Task 22: Skills catalog backend endpoint

**Files:**
- Modify: `src-tauri/src/web_server.rs` — add `/api/skills` endpoint

- [ ] **Step 1: Add /api/skills endpoint**

First, verify `serde_yaml` is in `src-tauri/Cargo.toml` dependencies (it should already be there as `serde_yaml = "0.9"`). If not, add it.

Add route:
```rust
.route("/api/skills", get(get_skills_catalog))
```

Implement the handler using the discovery algorithm from the spec:

```rust
async fn get_skills_catalog() -> impl IntoResponse {
    let home = std::env::var("HOME").unwrap_or_default();
    let plugins_file = format!("{}/.claude/plugins/installed_plugins.json", home);

    let mut catalog: Vec<serde_json::Value> = Vec::new();

    if let Ok(content) = std::fs::read_to_string(&plugins_file) {
        if let Ok(plugins) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(plugins_arr) = plugins.as_array() {
                for plugin in plugins_arr {
                    let install_path = plugin.get("installPath")
                        .and_then(|p| p.as_str())
                        .unwrap_or_default();

                    // Read plugin metadata
                    let plugin_json_path = format!("{}/.claude-plugin/plugin.json", install_path);
                    let plugin_meta = std::fs::read_to_string(&plugin_json_path)
                        .ok()
                        .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
                        .unwrap_or_default();

                    let plugin_name = plugin_meta.get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("Unknown Plugin");

                    // Walk skills directories
                    let skills_dir = format!("{}/skills", install_path);
                    let mut skills = Vec::new();

                    if let Ok(entries) = std::fs::read_dir(&skills_dir) {
                        for entry in entries.flatten() {
                            if entry.file_type().map_or(false, |t| t.is_dir()) {
                                // Find .md files in skill directory
                                if let Ok(skill_files) = std::fs::read_dir(entry.path()) {
                                    for skill_file in skill_files.flatten() {
                                        let path = skill_file.path();
                                        if path.extension().map_or(false, |e| e == "md") {
                                            if let Ok(content) = std::fs::read_to_string(&path) {
                                                // Parse YAML frontmatter
                                                if let Some(fm) = parse_frontmatter(&content) {
                                                    skills.push(fm);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if !skills.is_empty() {
                        catalog.push(serde_json::json!({
                            "plugin": plugin_name,
                            "skills": skills
                        }));
                    }
                }
            }
        }
    }

    axum::Json(catalog)
}

fn parse_frontmatter(content: &str) -> Option<serde_json::Value> {
    let content = content.trim();
    if !content.starts_with("---") { return None; }
    let rest = &content[3..];
    let end = rest.find("---")?;
    let yaml = &rest[..end];

    let parsed: serde_yaml::Value = serde_yaml::from_str(yaml).ok()?;
    let name = parsed.get("name")?.as_str()?;
    let description = parsed.get("description").and_then(|d| d.as_str()).unwrap_or("");

    Some(serde_json::json!({
        "name": name,
        "description": description
    }))
}
```

- [ ] **Step 2: Verify build**

```bash
cd /home/koves/GitHub/opcode && cd src-tauri && cargo build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/web_server.rs
git commit -m "feat: add /api/skills endpoint for plugin/skill catalog discovery"
```

### Task 23: SkillsCatalogSection component

**Files:**
- Create: `src/components/sidebar/SkillsCatalogSection.tsx`

- [ ] **Step 1: Create SkillsCatalogSection.tsx**

```typescript
import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Sparkles, Zap } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

interface Skill {
  name: string;
  description: string;
}

interface PluginGroup {
  plugin: string;
  skills: Skill[];
}

interface SkillsCatalogSectionProps {
  activeSkills?: Set<string>;
}

export function SkillsCatalogSection({ activeSkills = new Set() }: SkillsCatalogSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [catalog, setCatalog] = useState<PluginGroup[]>([]);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Dual-mode: try Tauri IPC first, fall back to REST for web mode
    async function loadSkills() {
      try {
        if (window.__TAURI__) {
          const { invoke } = await import('@tauri-apps/api/core');
          const data = await invoke('get_skills_catalog');
          setCatalog(data as PluginGroup[]);
        } else {
          const res = await fetch('/api/skills');
          setCatalog(await res.json());
        }
      } catch { /* silently fail if skills unavailable */ }
    }
    loadSkills();
  }, []);

  const totalSkills = catalog.reduce((sum, g) => sum + g.skills.length, 0);

  const togglePlugin = (name: string) => {
    setExpandedPlugins(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-1 w-full text-left">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Skills ({totalSkills})
        </h3>
      </button>

      {!collapsed && (
        <div className="space-y-1">
          {catalog.map(group => (
            <div key={group.plugin}>
              <button
                onClick={() => togglePlugin(group.plugin)}
                className="flex items-center gap-1 w-full text-left text-xs py-1 hover:bg-muted/50 rounded px-1"
              >
                {expandedPlugins.has(group.plugin)
                  ? <ChevronDown className="h-3 w-3" />
                  : <ChevronRight className="h-3 w-3" />}
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span className="font-medium">{group.plugin}</span>
                <span className="text-muted-foreground ml-auto">{group.skills.length}</span>
              </button>

              {expandedPlugins.has(group.plugin) && (
                <div className="ml-5 space-y-0.5">
                  {group.skills.map(skill => (
                    <Popover key={skill.name}>
                      <PopoverTrigger asChild>
                        <button className="flex items-center gap-1.5 w-full text-left text-xs py-0.5 px-1 rounded hover:bg-muted/50">
                          {activeSkills.has(skill.name) && (
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                          )}
                          <span>{skill.name}</span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent side="left" className="w-64 text-xs">
                        <div className="font-medium mb-1">{skill.name}</div>
                        <p className="text-muted-foreground">{skill.description}</p>
                      </PopoverContent>
                    </Popover>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire into ProjectSidebar**

In `ProjectSidebar.tsx`, replace the Skills placeholder with:

```tsx
import { SkillsCatalogSection } from './sidebar/SkillsCatalogSection';

<SkillsCatalogSection activeSkills={activeSkills} />
```

- [ ] **Step 3: Verify build**

```bash
cd /home/koves/GitHub/opcode && bun run build 2>&1 | head -50
```

- [ ] **Step 4: Commit**

```bash
git add src/components/sidebar/SkillsCatalogSection.tsx src/components/ProjectSidebar.tsx
git commit -m "feat: add SkillsCatalogSection with plugin grouping and popovers"
```

### Task 24: SkillBadgeWidget and active skill tracking

**Files:**
- Create: `src/components/widgets/SkillBadgeWidget.tsx`
- Modify: `src/stores/sessionStore.ts` — add activeSkills state
- Modify: `src/components/StreamMessage.tsx` — detect Skill tool calls

- [ ] **Step 1: Add activeSkills to sessionStore**

In `src/stores/sessionStore.ts`, extend the state:

```typescript
interface SessionState {
  // ... existing fields ...
  activeSkills: Set<string>;
  addActiveSkill: (name: string) => void;
  removeActiveSkill: (name: string) => void;
}
```

Add implementations:

```typescript
activeSkills: new Set(),
addActiveSkill: (name) => set(state => {
  const next = new Set(state.activeSkills);
  next.add(name);
  return { activeSkills: next };
}),
removeActiveSkill: (name) => set(state => {
  const next = new Set(state.activeSkills);
  next.delete(name);
  return { activeSkills: next };
}),
```

- [ ] **Step 2: Create SkillBadgeWidget.tsx**

```typescript
import React from 'react';
import { Zap } from 'lucide-react';

interface SkillBadgeWidgetProps {
  skillName: string;
}

export function SkillBadgeWidget({ skillName }: SkillBadgeWidgetProps) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 text-xs my-1">
      <Zap className="h-3 w-3" />
      <span>Using: {skillName}</span>
    </div>
  );
}
```

- [ ] **Step 3: Detect Skill tool calls in StreamMessage.tsx**

In `StreamMessage.tsx`, where tool calls are rendered, check for Skill tool calls:

```tsx
import { SkillBadgeWidget } from './widgets/SkillBadgeWidget';
import { useSessionStore } from '../stores/sessionStore';

// At the TOP LEVEL of the component (not inside a conditional):
const isSkillTool = toolName === 'Skill';
const skillName = isSkillTool ? (toolInput?.skill || 'unknown') : null;

useEffect(() => {
  if (!skillName) return;
  const store = useSessionStore.getState();
  store.addActiveSkill(skillName);
  return () => { store.removeActiveSkill(skillName); };
}, [skillName]);

// Then in the render logic:
{isSkillTool && <SkillBadgeWidget skillName={skillName!} />}
```

- [ ] **Step 4: Pass activeSkills to SkillsCatalogSection**

In `ProjectSidebar.tsx`:

```tsx
const activeSkills = useSessionStore(state => state.activeSkills);

<SkillsCatalogSection activeSkills={activeSkills} />
```

- [ ] **Step 5: Verify full build (frontend + backend)**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build 2>&1 | tail -20
```

- [ ] **Step 6: Commit**

```bash
git add src/components/widgets/SkillBadgeWidget.tsx src/stores/sessionStore.ts src/components/StreamMessage.tsx src/components/ProjectSidebar.tsx
git commit -m "feat: add skill execution badges and active skill tracking in sidebar"
```

### Task 25: Final integration verification

- [ ] **Step 1: Full build check**

```bash
cd /home/koves/GitHub/opcode && bun run build && cd src-tauri && cargo build 2>&1 | tail -30
```

- [ ] **Step 2: Manual smoke test**

Open the app and verify:
1. Auto-scroll pauses on scroll-up, resumes on scroll-to-bottom
2. Jump-to-bottom button appears with unread count
3. Sidebar opens/closes, resizes, shows all 4 sections
4. Project info auto-detects from package.json/Cargo.toml
5. Session stats display tokens/cost/time
6. Skills catalog shows installed plugins and skills
7. Agent tabs appear when agents spawn (if testable)

- [ ] **Step 3: Test headless mode**

```bash
cd /home/koves/GitHub/opcode/src-tauri && cargo run --bin opcode-web -- --port 9090 --open
```

Verify the browser opens and the full UI is served from the embedded assets.

- [ ] **Step 4: Final commit**

```bash
git add src/ src-tauri/src/
git commit -m "feat: complete UI enhancements — auto-scroll, sidebar, agent tabs, display polish, superpowers"
```
