# Smart Bar Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the cluttered FloatingPromptInput with a minimal Smart Bar: config pill + textarea + copy + send, with a unified config panel for model/reasoning/checkpoints.

**Architecture:** Extract model/thinking state into a shared hook (`useSessionConfig`). Create new ConfigPill and ConfigPanel components. Simplify FloatingPromptInput by removing inline model/thinking pickers and extraMenuItems. Move Timeline toggle to SessionHeader.

**Tech Stack:** React, Zustand, Framer Motion, Tailwind CSS v4, Radix UI, Lucide icons.

**Spec:** `docs/superpowers/specs/2026-03-16-smart-bar-redesign.md`

---

## Chunk 1: State Management & New Components

### Task 1: Create useSessionConfig hook

**Files:**
- Create: `src/hooks/useSessionConfig.ts`

- [ ] **Step 1: Create the hook**

```typescript
import { create } from 'zustand';

type ModelId = 'sonnet' | 'opus';
type ThinkingMode = 'auto' | 'think' | 'think_hard' | 'think_harder' | 'ultrathink';

interface SessionConfigState {
  model: ModelId;
  thinkingMode: ThinkingMode;
  setModel: (model: ModelId) => void;
  setThinkingMode: (mode: ThinkingMode) => void;
  cycleModel: () => void;
  cycleThinkingMode: () => void;
}

export const useSessionConfig = create<SessionConfigState>((set) => ({
  model: 'sonnet',
  thinkingMode: 'auto',
  setModel: (model) => set({ model }),
  setThinkingMode: (mode) => set({ thinkingMode: mode }),
  cycleModel: () => set((s) => ({ model: s.model === 'sonnet' ? 'opus' : 'sonnet' })),
  cycleThinkingMode: () => set((s) => {
    const modes: ThinkingMode[] = ['auto', 'think', 'think_hard', 'think_harder', 'ultrathink'];
    const idx = modes.indexOf(s.thinkingMode);
    return { thinkingMode: modes[(idx + 1) % modes.length] };
  }),
}));

export type { ModelId, ThinkingMode };
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useSessionConfig.ts
git commit -m "feat: create useSessionConfig Zustand store for model and thinking mode"
```

---

### Task 2: Create ConfigPill component

**Files:**
- Create: `src/components/ConfigPill.tsx`

- [ ] **Step 1: Create the component**

The pill shows: `{ModelIcon} {ModelName} · {ReasoningLabel} · ✓{N}`

```typescript
import React from 'react';
import { Zap } from 'lucide-react';
import { useSessionConfig, type ModelId, type ThinkingMode } from '@/hooks/useSessionConfig';

const MODEL_INFO: Record<ModelId, { name: string; iconColor: string }> = {
  sonnet: { name: 'Sonnet', iconColor: 'var(--color-gold-400)' },
  opus: { name: 'Opus', iconColor: 'var(--color-purple-400)' },
};

const THINKING_LABELS: Record<ThinkingMode, string> = {
  auto: 'Auto',
  think: 'Think',
  think_hard: 'Deep',
  think_harder: 'Hard',
  ultrathink: 'Ultra',
};

interface ConfigPillProps {
  onClick: () => void;
  isOpen: boolean;
  checkpointCount?: number;
}

export function ConfigPill({ onClick, isOpen, checkpointCount = 0 }: ConfigPillProps) {
  const { model, thinkingMode } = useSessionConfig();
  const modelInfo = MODEL_INFO[model];
  const thinkingLabel = THINKING_LABELS[thinkingMode];

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-full px-3 h-8 shrink-0 transition-all cursor-pointer"
      style={{
        backgroundColor: 'color-mix(in oklch, var(--color-void-overlay) 60%, transparent)',
        border: `1px solid ${isOpen ? 'var(--color-border-purple)' : 'var(--color-border-subtle)'}`,
        ...(isOpen && { boxShadow: '0 0 12px var(--color-purple-glow)' }),
      }}
    >
      <Zap className="h-3 w-3" style={{ color: modelInfo.iconColor }} />
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {modelInfo.name}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>·</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
        {thinkingLabel}
      </span>
      <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>·</span>
      <span className="text-[11px] font-medium" style={{ color: 'var(--color-gold-400)' }}>
        ✓{checkpointCount}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ConfigPill.tsx
git commit -m "feat: create ConfigPill component showing model/reasoning/checkpoint state"
```

---

### Task 3: Create ReasoningSelector component

**Files:**
- Create: `src/components/ReasoningSelector.tsx`

- [ ] **Step 1: Create the component**

A 5-button segmented control for reasoning levels.

```typescript
import React from 'react';
import { useSessionConfig, type ThinkingMode } from '@/hooks/useSessionConfig';

const LEVELS: { id: ThinkingMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'think', label: 'Think' },
  { id: 'think_hard', label: 'Deep' },
  { id: 'think_harder', label: 'Hard' },
  { id: 'ultrathink', label: 'Ultra' },
];

export function ReasoningSelector() {
  const { thinkingMode, setThinkingMode } = useSessionConfig();

  return (
    <div className="flex gap-1">
      {LEVELS.map((level) => {
        const isSelected = thinkingMode === level.id;
        const isUltra = level.id === 'ultrathink' && isSelected;
        return (
          <button
            key={level.id}
            onClick={() => setThinkingMode(level.id)}
            className="rounded-full px-3 py-1.5 text-[11px] font-medium transition-all cursor-pointer"
            style={{
              backgroundColor: isSelected
                ? isUltra ? 'var(--color-gold-400)' : 'var(--color-purple-500)'
                : 'transparent',
              color: isSelected
                ? isUltra ? 'var(--color-text-on-gold)' : 'var(--color-text-on-purple)'
                : 'var(--color-text-secondary)',
              border: `1px solid ${isSelected ? 'transparent' : 'var(--color-border-subtle)'}`,
              boxShadow: isSelected
                ? isUltra ? '0 0 8px var(--color-gold-glow)' : '0 0 8px var(--color-purple-glow)'
                : 'none',
            }}
          >
            {level.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ReasoningSelector.tsx
git commit -m "feat: create ReasoningSelector segmented control component"
```

---

### Task 4: Create ConfigPanel component

**Files:**
- Create: `src/components/ConfigPanel.tsx`

- [ ] **Step 1: Create the component**

The floating panel with Model cards, Reasoning selector, and Checkpoints section.

```typescript
import React from 'react';
import { motion } from 'motion/react';
import { Zap } from 'lucide-react';
import { useSessionConfig, type ModelId } from '@/hooks/useSessionConfig';
import { ReasoningSelector } from '@/components/ReasoningSelector';

const MODELS: { id: ModelId; name: string; description: string; iconColor: string }[] = [
  { id: 'sonnet', name: 'Claude Sonnet', description: 'Fast & efficient', iconColor: 'var(--color-gold-400)' },
  { id: 'opus', name: 'Claude Opus', description: 'Most capable', iconColor: 'var(--color-purple-400)' },
];

interface ConfigPanelProps {
  onClose: () => void;
}

export function ConfigPanel({ onClose }: ConfigPanelProps) {
  const { model, setModel } = useSessionConfig();

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute bottom-full mb-2 left-0 z-50 glass-elevated rounded-xl p-5 space-y-5"
      style={{ width: '420px' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* MODEL SECTION */}
      <div>
        <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Model
        </span>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {MODELS.map((m) => {
            const isSelected = model === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setModel(m.id)}
                className="rounded-lg p-3 text-left transition-all cursor-pointer"
                style={{
                  border: `1px solid ${isSelected ? 'var(--color-purple-500)' : 'var(--color-border-subtle)'}`,
                  backgroundColor: isSelected
                    ? 'color-mix(in oklch, var(--color-purple-500) 8%, transparent)'
                    : 'transparent',
                  boxShadow: isSelected ? '0 0 12px var(--color-purple-glow)' : 'none',
                }}
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 10%, transparent)' }}
                  >
                    <Zap className="h-4 w-4" style={{ color: m.iconColor }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {m.name}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {m.description}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* REASONING SECTION */}
      <div>
        <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Reasoning
        </span>
        <div className="mt-3">
          <ReasoningSelector />
        </div>
      </div>

      {/* CHECKPOINTS SECTION (empty state for now) */}
      <div>
        <div className="flex items-center justify-between">
          <span className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
            Checkpoints
          </span>
          <button
            className="text-xs font-medium transition-colors opacity-50 cursor-not-allowed"
            style={{ color: 'var(--color-purple-400)' }}
            disabled
          >
            Rewind
          </button>
        </div>
        <div className="mt-3">
          <p className="text-xs italic" style={{ color: 'var(--color-text-muted)' }}>
            Checkpoints coming soon
          </p>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ConfigPanel.tsx
git commit -m "feat: create ConfigPanel with model cards, reasoning selector, and checkpoint placeholder"
```

---

## Chunk 2: Integrate Smart Bar into FloatingPromptInput

### Task 5: Refactor FloatingPromptInput — remove old controls, add ConfigPill

**Files:**
- Modify: `src/components/FloatingPromptInput.tsx`

- [ ] **Step 1: Read the current file fully**

- [ ] **Step 2: Add imports for new components**

Add at the top:
```typescript
import { ConfigPill } from '@/components/ConfigPill';
import { ConfigPanel } from '@/components/ConfigPanel';
import { useSessionConfig } from '@/hooks/useSessionConfig';
```

- [ ] **Step 3: Replace internal model/thinking state with useSessionConfig**

Remove these internal state variables:
- `selectedModel` / `setSelectedModel`
- `selectedThinkingMode` / `setSelectedThinkingMode`
- `modelPickerOpen` / `setModelPickerOpen`
- `thinkingModePickerOpen` / `setThinkingModePickerOpen`

Replace with:
```typescript
const { model: selectedModel, thinkingMode: selectedThinkingMode } = useSessionConfig();
const [configPanelOpen, setConfigPanelOpen] = useState(false);
```

- [ ] **Step 4: Remove the MODELS and THINKING_MODES arrays**

These are now in ConfigPill and ConfigPanel. Remove the arrays and the `ThinkingModeIndicator` component from FloatingPromptInput.

- [ ] **Step 5: Replace the left section (model/thinking buttons) in the FIXED BAR**

Find the left section with model picker Popover and thinking mode Popover. Replace the entire left `<div>` with:

```tsx
<div className="relative shrink-0 mb-1">
  <ConfigPill
    onClick={() => setConfigPanelOpen(!configPanelOpen)}
    isOpen={configPanelOpen}
    checkpointCount={0}
  />
  <AnimatePresence>
    {configPanelOpen && (
      <ConfigPanel onClose={() => setConfigPanelOpen(false)} />
    )}
  </AnimatePresence>
</div>
```

- [ ] **Step 6: Remove the extraMenuItems section from the fixed bar**

Find: `{extraMenuItems && (<div className="flex items-center gap-1 shrink-0 mb-1">...`
Remove it entirely.

- [ ] **Step 7: Remove the Helicone toggle section from the fixed bar**

Find: `<div className="flex items-center shrink-0 mb-1"><HeliconeToggle...`
Remove it entirely.

- [ ] **Step 8: Add a Copy button before the Send button**

In the action buttons area (absolute right-2 bottom-2), add a Copy button before the expand/send buttons. This will be wired up in the next task.

```tsx
{/* Copy button placeholder */}
<TooltipSimple content="Copy conversation" side="top">
  <Button
    variant="ghost"
    size="icon"
    className="h-8 w-8"
    style={{ color: 'var(--color-text-muted)' }}
    disabled
  >
    <Copy className="h-3.5 w-3.5" />
  </Button>
</TooltipSimple>
```

- [ ] **Step 9: Simplify the expanded modal**

In the expanded modal section, remove the model/thinking controls from the bottom. The modal should only have:
- Header: "Compose your prompt" + Minimize button
- Image preview (if images)
- Textarea
- Send button (right-aligned)

Remove the left controls div that contains model picker and thinking picker in the modal.

- [ ] **Step 10: Remove the extraMenuItems prop from the interface**

Update `FloatingPromptInputProps`: remove `extraMenuItems?: React.ReactNode` and `sessionCostUsd?: number`.

- [ ] **Step 11: Add click-outside handler for config panel**

Add a useEffect to close the config panel when clicking outside:
```typescript
useEffect(() => {
  if (!configPanelOpen) return;
  const handler = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.config-panel-container')) {
      setConfigPanelOpen(false);
    }
  };
  document.addEventListener('mousedown', handler);
  return () => document.removeEventListener('mousedown', handler);
}, [configPanelOpen]);
```

And wrap the ConfigPill + ConfigPanel div with `className="config-panel-container"`.

- [ ] **Step 12: Add keyboard shortcuts**

Add to the existing keydown handler or a new useEffect:
```typescript
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'm') {
      e.preventDefault();
      useSessionConfig.getState().cycleModel();
    }
    if (e.ctrlKey && e.key === 't' && !e.shiftKey) {
      e.preventDefault();
      useSessionConfig.getState().cycleThinkingMode();
    }
  };
  window.addEventListener('keydown', handler);
  return () => window.removeEventListener('keydown', handler);
}, []);
```

- [ ] **Step 13: Update the onSend call**

Where `onSend(prompt, selectedModel)` is called, ensure it reads from the Zustand store:
```typescript
const handleSend = () => {
  const { model } = useSessionConfig.getState();
  onSend(prompt.trim(), model);
  // ... rest of send logic
};
```

- [ ] **Step 14: Verify and commit**

```bash
git add src/components/FloatingPromptInput.tsx
git commit -m "feat: integrate Smart Bar — config pill replaces model/thinking pickers"
```

---

### Task 6: Update ClaudeCodeSession — remove extraMenuItems, move Timeline

**Files:**
- Modify: `src/components/ClaudeCodeSession.tsx`
- Modify: `src/components/claude-code-session/SessionHeader.tsx`

- [ ] **Step 1: Remove extraMenuItems from FloatingPromptInput usage**

In ClaudeCodeSession.tsx, find the `<FloatingPromptInput>` JSX (around line 1620). Remove the `extraMenuItems` prop entirely. Also remove `sessionCostUsd` prop.

Before:
```tsx
<FloatingPromptInput
  ref={floatingPromptRef}
  onSend={handleSendPrompt}
  onCancel={handleCancelExecution}
  isLoading={isLoading}
  disabled={!projectPath}
  projectPath={projectPath}
  sessionCostUsd={sessionCostUsd}
  extraMenuItems={<>...huge JSX block...</>}
/>
```

After:
```tsx
<FloatingPromptInput
  ref={floatingPromptRef}
  onSend={handleSendPrompt}
  onCancel={handleCancelExecution}
  isLoading={isLoading}
  disabled={!projectPath}
  projectPath={projectPath}
/>
```

- [ ] **Step 2: Move Timeline toggle to SessionHeader**

In SessionHeader.tsx, add a Timeline toggle button in the right section. The button should:
- Icon: `GitBranch` (h-4 w-4)
- Active state: `--color-purple-400`
- Tooltip: "Session Timeline"
- onClick: call `onToggleTimeline` (already a prop)

The SessionHeader already has `showTimeline` and `onToggleTimeline` props — just ensure the button is rendered.

- [ ] **Step 3: Extract copy conversation logic**

The copy conversation popover (Copy as Markdown / Copy as JSONL) was in extraMenuItems. Move it to SessionHeader's right section, next to the existing copy button (if SessionHeader already has one — check first).

- [ ] **Step 4: Commit**

```bash
git add src/components/ClaudeCodeSession.tsx src/components/claude-code-session/SessionHeader.tsx
git commit -m "feat: remove extraMenuItems, move Timeline toggle to SessionHeader"
```

---

## Chunk 3: Wire Copy Button & Final Polish

### Task 7: Wire the Copy button in FloatingPromptInput

**Files:**
- Modify: `src/components/FloatingPromptInput.tsx`

- [ ] **Step 1: Add copy functionality**

Add a `onCopy` prop to FloatingPromptInputProps:
```typescript
onCopyMarkdown?: () => void;
onCopyJsonl?: () => void;
```

Replace the disabled Copy button placeholder with a functional one using a Popover:
```tsx
<Popover
  trigger={
    <TooltipSimple content="Copy conversation" side="top">
      <Button variant="ghost" size="icon" className="h-8 w-8"
        style={{ color: 'var(--color-text-muted)' }}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </TooltipSimple>
  }
  content={
    <div className="w-44 p-1">
      <button className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent/50"
        onClick={onCopyMarkdown}>
        Copy as Markdown
      </button>
      <button className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-accent/50"
        onClick={onCopyJsonl}>
        Copy as JSONL
      </button>
    </div>
  }
  align="end"
  side="top"
/>
```

- [ ] **Step 2: Pass copy handlers from ClaudeCodeSession**

In ClaudeCodeSession.tsx, pass the copy handlers:
```tsx
<FloatingPromptInput
  ...
  onCopyMarkdown={() => handleCopyAsMarkdown()}
  onCopyJsonl={() => handleCopyAsJsonl()}
/>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/FloatingPromptInput.tsx src/components/ClaudeCodeSession.tsx
git commit -m "feat: wire Copy button with Markdown/JSONL options in Smart Bar"
```

---

### Task 8: Build verification and cleanup

**Files:**
- Multiple (cleanup)

- [ ] **Step 1: Run type check**

```bash
npx tsc --noEmit
```

Fix any TypeScript errors.

- [ ] **Step 2: Remove unused imports**

Check FloatingPromptInput.tsx for unused imports (old model/thinking related imports like Lightbulb, Brain, Cpu, Rocket, ChevronUp, etc.).

- [ ] **Step 3: Clean up unused components**

If `ThinkingModeIndicator` was only used in FloatingPromptInput and is now in ReasoningSelector, remove the old one.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: cleanup unused imports and components after Smart Bar migration"
```
