# Smart Bar — Floating Input Redesign

**Date:** 2026-03-16
**Status:** Approved
**Direction:** Simplify the floating input bar into a clean Smart Bar with unified config panel

## Overview

Redesign the FloatingPromptInput from a cluttered multi-button bar into a minimal "Smart Bar" with 4 elements: a config pill (model + reasoning + checkpoints), a textarea, a copy button, and a send button. All session configuration is unified into a single floating panel that expands from the config pill.

---

## 1. Input Bar Layout

The fixed bottom bar contains exactly 4 elements:

```
┌──────────────────────────────────────────────────────────────┐
│ [⚡ Sonnet · Auto · ✓3]  [  Cast a rune... (/ · @)  ] [📋][▶] │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 Config Pill (left)

Displays current session configuration at a glance. Click to expand config panel.

**Content:** `{ModelIcon} {ModelName} · {ReasoningLevel} · ✓{CheckpointCount}`

**Styling:**
- Shape: `rounded-full px-3 h-8`
- Background: `color-mix(in oklch, var(--color-void-overlay) 60%, transparent)`
- Border: `1px solid var(--color-border-subtle)`
- Text: `text-[11px] font-medium` in `--color-text-secondary`
- Model icon: colored per model (gold for Sonnet, purple for Opus)
- Separator dots: `·` in `--color-text-muted`
- Checkpoint count: `✓N` in `--color-gold-400`
- Hover: border brightens to `--color-border-purple`
- Active (panel open): `--color-border-purple` border + subtle purple glow

### 1.2 Textarea (center)

Auto-growing textarea. `/` triggers slash command picker, `@` triggers file picker.

**Styling:**
- Fills remaining space: `flex-1`
- Height: starts at 48px, grows to max 240px
- Padding: `pl-3 pr-12 py-2.5` (right padding for send button)
- Placeholder: `Cast a rune... (/ · @)` in `--color-text-muted`
- Font: `var(--font-sans)`
- Background: `color-mix(in oklch, var(--color-void-base) 50%, transparent)`
- Border: `1px solid var(--color-border-subtle)`
- Focus: border transitions to `--color-border-purple` with purple glow ring
- Scrollbar: `scrollbar-thin` when max height reached

### 1.3 Copy Button (right)

Copies conversation to clipboard. Always visible.

**Styling:**
- Size: `h-8 w-8`
- Variant: ghost icon button
- Icon: `Copy` (h-3.5 w-3.5) in `--color-text-muted`
- Hover: `--color-text-primary`
- Provides a dropdown/popover on click: "Copy as Markdown" / "Copy as JSONL"

### 1.4 Send/Stop Button (right)

Sends message or stops execution.

**States:**
| State | Variant | Icon | Background | Glow |
|-------|---------|------|------------|------|
| No text (disabled) | ghost | Send (h-4 w-4) | transparent | none |
| Has text | default | Send (h-4 w-4) | `--color-purple-500` | `glow-purple-sm` |
| Executing | destructive | Square (h-4 w-4) | `--color-error` | none |

**Styling:**
- Size: `h-8 w-8`
- Shape: `rounded-full` for the active/executing states
- Tap animation: scale 0.97

### 1.5 Bar Container

**Styling:**
- Position: `fixed bottom-0 left-0 right-0 z-40`
- Background: `color-mix(in oklch, var(--color-void-deep) 92%, transparent)`
- Backdrop: `backdrop-blur-md`
- Border: top only, `color-mix(in oklch, var(--color-border-subtle) 50%, transparent)`
- Shadow: `0 -4px 30px color-mix(in oklch, var(--color-void-base) 80%, transparent)`
- Inner padding: `px-4 py-3`
- Inner layout: `flex items-end gap-2`
- Focus state: border transitions to `--color-border-purple` with purple glow

### 1.6 What's Removed From Bar

| Element | New Location |
|---------|-------------|
| Model picker button | Config panel → Model section |
| Thinking mode button | Config panel → Reasoning section |
| Timeline toggle | Session header |
| Settings wrench | Topbar |
| Helicone toggle | Settings > Appearance or session header |
| Expand button (Maximize2) | Keep inside textarea as before |

---

## 2. Config Panel

A glass-elevated vertical panel that floats above the config pill. Contains all session configuration.

### 2.1 Container

- Position: `absolute bottom-full mb-2 left-0 z-50`
- Width: `w-[420px]`
- Class: `glass-elevated rounded-xl`
- Padding: `p-5`
- Sections: `space-y-5`
- Animation: `initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}`
- Closes on: click outside, Escape, or click pill again

### 2.2 Model Section

**Label:** `text-overline` in `--color-gold-300`: "MODEL"

**Layout:** `grid grid-cols-2 gap-3`

**Each model card:**
- Shape: `rounded-lg p-3 cursor-pointer transition-all`
- Default state:
  - Border: `1px solid var(--color-border-subtle)`
  - Background: transparent
- Selected state:
  - Border: `1px solid var(--color-purple-500)`
  - Background: `color-mix(in oklch, var(--color-purple-500) 8%, transparent)`
  - Box-shadow: `0 0 12px var(--color-purple-glow)`
- Icon container: `w-8 h-8 rounded-full flex items-center justify-center`
  - Background: `color-mix(in oklch, var(--color-purple-500) 10%, transparent)`
  - Sonnet icon color: `--color-gold-400`
  - Opus icon color: `--color-purple-400`
- Name: `text-sm font-medium` in `--color-text-primary`
- Description: `text-xs` in `--color-text-muted`

**Models:**

| ID | Name | Description | Icon |
|----|------|-------------|------|
| `sonnet` | Claude Sonnet | Fast & efficient | Zap (gold) |
| `opus` | Claude Opus | Most capable | Zap (purple) |

### 2.3 Reasoning Section

**Label:** `text-overline` in `--color-gold-300`: "REASONING"

**Layout:** `flex gap-1` — 5 segmented buttons in a row

**Each button:**
- Shape: `rounded-full px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer`
- Default state:
  - Background: transparent
  - Color: `--color-text-secondary`
  - Border: `1px solid var(--color-border-subtle)`
- Selected state:
  - Background: `--color-purple-500`
  - Color: `--color-text-on-purple`
  - Box-shadow: `0 0 8px var(--color-purple-glow)`
- Ultra selected state (special):
  - Background: `--color-gold-400`
  - Color: `--color-text-on-gold`
  - Box-shadow: `0 0 8px var(--color-gold-glow)`

**Levels:**

| ID | Label | Description |
|----|-------|-------------|
| `auto` | Auto | Let Claude decide |
| `think` | Think | Basic reasoning |
| `think_hard` | Deep | Deeper analysis |
| `think_harder` | Hard | Extensive reasoning |
| `ultrathink` | Ultra | Maximum computation |

### 2.4 Checkpoints Section

**Label:** `text-overline` in `--color-gold-300`: "CHECKPOINTS"
**Rewind button:** Right-aligned, `text-xs font-medium` in `--color-purple-400`, hover underline

**Timeline visualization:**
- Horizontal line: `h-px bg-border-subtle` full width
- Dots positioned along the line at relative time intervals
- Each dot: `w-2.5 h-2.5 rounded-full transition-all`
  - Current: `--color-purple-500` with `0 0 6px var(--color-purple-glow)`
  - Past: `--color-text-muted`
  - Hover: expands to `w-3 h-3`, border `--color-purple-400`
- Time labels below dots: `text-[10px]` in `--color-text-muted` (e.g., "now", "2m", "8m")
- Click on dot: opens rewind options popover:
  - "Restore code & conversation"
  - "Restore code only"
  - "Restore conversation only"
  - Each option: `text-sm` with icon, hover `bg-accent/50`

**Empty state:** (no checkpoints yet)
- Text: "Checkpoints created automatically as you work" in `text-xs --color-text-muted italic`

**Rewind button click:**
- Opens full checkpoint list in a modal/panel with:
  - Each checkpoint: timestamp, prompt preview (truncated), file count changed
  - Restore options per checkpoint
  - Same UI as the dot-click but in a scrollable list

### 2.5 Checkpoint Data Source

Checkpoints are powered by a **git-based snapshot system** using PostToolUse hooks:
- After every file edit (Edit, Write, MultiEdit), a hook auto-commits: `git commit -m "checkpoint: {tool} {file}"`
- The config panel reads checkpoint history via `git log --oneline` filtered to checkpoint commits
- Restore uses `git checkout {sha} -- {files}` for code restore
- Conversation restore uses Claude Code's session resume with `--resume`
- Checkpoint settings (auto-commit interval, max history) are configurable inside the Timeline panel

---

## 3. Expanded Modal

The expanded modal (`Ctrl+Shift+E`) simplifies to focus purely on writing:

### 3.1 Layout

```
┌─────────────────────────────────────────────┐
│  Compose your prompt              [Minimize] │
│                                              │
│  ┌──────────────────────────────────────┐   │
│  │                                      │   │
│  │  (textarea, 240px min height)        │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│                                              │
│                                      [Send]  │
└─────────────────────────────────────────────┘
```

**What's removed from modal:**
- Model picker controls → use config pill in the bar below
- Thinking mode controls → use config pill in the bar below
- The modal is purely: heading + textarea + send button

**Container:**
- Class: `glass-elevated rounded-xl`
- Width: `max-w-2xl`
- Padding: `p-6`
- Heading: `text-heading-3` in `var(--font-heading)`

**Textarea:**
- Min height: 240px
- Background: `color-mix(in oklch, var(--color-void-base) 50%, transparent)`
- Border: `1px solid var(--color-border-subtle)`
- Font: `var(--font-sans)`

**Send button:**
- Shape: `rounded-full min-w-[80px]`
- Active: purple background + glow
- Loading: RotatingRune spinner

---

## 4. Relocated Controls

### 4.1 Timeline Toggle

Moves to the session header bar (the sticky header at the top of the chat).

- Icon: `GitBranch` (h-4 w-4)
- Position: right side of session header, next to session name/info
- Active state: icon in `--color-purple-400`
- Tooltip: "Session Timeline (Ctrl+Shift+T)"

### 4.2 Checkpoint Settings

Moves inside the Timeline panel (the right sidebar that opens when Timeline is toggled).

- Rendered at the top or bottom of the Timeline panel
- Settings: auto-checkpoint interval, max checkpoint count, cleanup policy
- Uses the same design language as other settings (segmented controls, toggles)

### 4.3 Settings Wrench

Moves to the topbar (CustomTitlebar or Topbar component).

- Icon: `Settings` (h-4 w-4)
- Tooltip: "Settings"
- Opens Settings view/tab

### 4.4 Helicone Toggle

Moves to Settings > Appearance tab or the session header as a small status indicator.

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in textarea |
| `/` (at line start) | Open slash command picker |
| `@` | Open file picker |
| `Ctrl+Shift+E` | Expand/collapse compose modal |
| `Escape` | Close config panel / pickers / modal |
| `Ctrl+M` | Toggle model (Sonnet ↔ Opus) |
| `Ctrl+T` | Cycle reasoning level |
| `Ctrl+Z` | Open checkpoint rewind |
| `Ctrl+Shift+T` | Toggle Timeline panel |

---

## 6. Interaction States

### 6.1 Config Pill States

| State | Visual |
|-------|--------|
| Default | Subtle border, muted text |
| Hover | Border brightens to `--color-border-purple` |
| Panel open | Purple border + subtle purple glow, text brightens |
| Model changing | Brief flash on model icon |
| Has checkpoints | Gold `✓N` indicator |
| No checkpoints | Shows `✓0` in muted color |

### 6.2 Panel Open/Close

- **Open:** Click pill, or `Ctrl+M`/`Ctrl+T`/`Ctrl+Z` (opens panel scrolled to relevant section)
- **Close:** Click pill again, click outside, press Escape
- **Animation:** Scale 0.95→1, opacity 0→1, duration 150ms
- **No interference:** Panel, slash command picker, and file picker are mutually exclusive — opening one closes the others

### 6.3 Send Button States

| State | Variant | Icon | Glow |
|-------|---------|------|------|
| Disabled (no text) | ghost | Send | none |
| Ready (has text) | default | Send | purple |
| Executing | destructive | Square | none |

---

## 7. Migration Plan

### 7.1 Components to Create

- `ConfigPill.tsx` — the pill component showing model/reasoning/checkpoints
- `ConfigPanel.tsx` — the floating panel with Model/Reasoning/Checkpoints sections
- `CheckpointTimeline.tsx` — the horizontal dot timeline visualization
- `ReasoningSelector.tsx` — the 5-button segmented control

### 7.2 Components to Modify

- `FloatingPromptInput.tsx` — remove model/thinking buttons, add ConfigPill, remove extra menu items
- `ClaudeCodeSession.tsx` — move Timeline toggle to session header, remove from extra menu items
- `SessionHeader.tsx` or `Topbar.tsx` — add Timeline toggle, Settings button
- `Settings.tsx` — add Helicone toggle to Appearance tab (if not already)

### 7.3 Components to Remove

- Model picker popover (functionality moves to ConfigPanel)
- Thinking mode picker popover (functionality moves to ConfigPanel)
- HeliconeToggle from input bar (moves to settings/header)

### 7.4 State Management

The config panel reads from and writes to existing state:
- Model: `selectedModel` / `setSelectedModel` (existing in FloatingPromptInput)
- Reasoning: `selectedThinkingMode` / `setSelectedThinkingMode` (existing)
- Checkpoints: new state, reads from git log, writes via git operations

Consider lifting model/thinking state to a shared context or the session store so the ConfigPill and ConfigPanel can access it without prop drilling.

---

## 8. Visual References

The brainstorming HTML mockups are in `.superpowers/brainstorm/` for reference. The Void Protocol design system spec at `docs/superpowers/specs/2026-03-15-void-protocol-design-system.md` defines all color tokens, typography, and glass effects used in this spec.
