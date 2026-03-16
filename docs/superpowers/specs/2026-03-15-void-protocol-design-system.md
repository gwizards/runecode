# Void Protocol — RuneCode Design System Revamp

**Date:** 2026-03-15
**Status:** Approved
**Direction:** Dark Luxury Tech — exclusive, edgy, technically refined

## Overview

A complete visual redesign of RuneCode built around the "Void Protocol" aesthetic: deep space with signal light. The interface emerges from darkness with precise, luminous purple and gold accents. Prioritizes readability, navigability, and feature discoverability while feeling like a premium developer tool.

The design introduces a configurable **Theme System** with three independent axes: Palette, Density, and Atmosphere — each with presets and full custom override support.

---

## 1. Color System (OKLCH)

All colors use the OKLCH color space for perceptual uniformity across themes.

### 1.1 Backgrounds

| Token | Value | Description |
|-------|-------|-------------|
| `--void-base` | `oklch(0.06 0.02 285)` | Deep void — the canvas |
| `--void-raised` | `oklch(0.10 0.02 285)` | Raised surfaces (cards, panels) |
| `--void-elevated` | `oklch(0.14 0.025 288)` | Elevated surfaces (modals, dropdowns) |
| `--void-overlay` | `oklch(0.18 0.02 285)` | Overlay/hover states |

### 1.2 Primary — Electric Purple

| Token | Value | Description |
|-------|-------|-------------|
| `--purple-400` | `oklch(0.72 0.22 292)` | Hover text, subtle highlights |
| `--purple-500` | `oklch(0.62 0.28 292)` | Primary — buttons, links, active states |
| `--purple-600` | `oklch(0.52 0.26 292)` | Pressed/deep state |
| `--purple-glow` | `oklch(0.62 0.28 292 / 0.3)` | Glow halos around interactive elements |

### 1.3 Accent — Warm Gold

| Token | Value | Description |
|-------|-------|-------------|
| `--gold-300` | `oklch(0.85 0.12 80)` | Subtle text accents |
| `--gold-400` | `oklch(0.78 0.15 80)` | Badges, status indicators, "power" elements |
| `--gold-500` | `oklch(0.70 0.17 75)` | Active/important highlights |
| `--gold-glow` | `oklch(0.78 0.15 80 / 0.25)` | Warm glow for premium/special elements |

### 1.4 Text

| Token | Value | Description |
|-------|-------|-------------|
| `--text-primary` | `oklch(0.93 0.01 285)` | Primary text — high contrast |
| `--text-secondary` | `oklch(0.70 0.02 285)` | Descriptions, labels |
| `--text-muted` | `oklch(0.50 0.02 285)` | Placeholders, disabled |
| `--text-on-purple` | `oklch(0.98 0.01 292)` | Text on purple surfaces |
| `--text-on-gold` | `oklch(0.15 0.02 80)` | Text on gold surfaces |

### 1.5 Borders

| Token | Value | Description |
|-------|-------|-------------|
| `--border-subtle` | `oklch(0.20 0.02 285)` | Default borders |
| `--border-purple` | `oklch(0.40 0.15 292 / 0.4)` | Focus/active borders |
| `--border-gold` | `oklch(0.60 0.10 80 / 0.3)` | Premium element borders |

### 1.6 Semantic

| Token | Value | Description |
|-------|-------|-------------|
| `--success` | `oklch(0.72 0.20 155)` | Green — success states |
| `--warning` | `oklch(0.78 0.15 80)` | Reuses gold — warnings |
| `--error` | `oklch(0.65 0.22 25)` | Red-orange — errors, destructive |
| `--info` | `oklch(0.65 0.15 250)` | Blue — informational |

---

## 2. Typography

### 2.1 Font Pairing

| Role | Font | Source |
|------|------|--------|
| **Headings & Display** | Instrument Sans | Google Fonts |
| **Body & Labels** | Geist | Vercel CDN / local |
| **Code & Values** | JetBrains Mono | Google Fonts / local |

### 2.2 Type Scale

| Token | Font | Weight | Size | Tracking | Use |
|-------|------|--------|------|----------|-----|
| `display-1` | Instrument Sans | 700 | 40px | -0.03em | Hero headings |
| `display-2` | Instrument Sans | 700 | 32px | -0.02em | Page titles |
| `heading-1` | Instrument Sans | 600 | 24px | -0.02em | Section headers |
| `heading-2` | Instrument Sans | 600 | 20px | -0.01em | Subsection headers |
| `heading-3` | Instrument Sans | 600 | 16px | -0.01em | Card titles |
| `heading-4` | Instrument Sans | 500 | 14px | 0 | Small headers |
| `body-large` | Geist | 400 | 16px | 0 | Long-form content |
| `body` | Geist | 400 | 14px | 0 | Default body text |
| `body-small` | Geist | 400 | 13px | 0 | Secondary descriptions |
| `label` | Geist | 500 | 12px | 0.02em | Form labels, metadata |
| `overline` | Geist | 500 | 10px | 0.08em (uppercase) | Section labels, categories |
| `caption` | Geist | 400 | 11px | 0 | Hints, timestamps |
| `mono` | JetBrains Mono | 400 | 13px | 0 | Code, technical values |

---

## 3. Theme System Architecture

### 3.1 Structure

A theme is a named collection of three independent layers:

| Layer | Controls | Configurable |
|-------|----------|-------------|
| **Palette** | All color tokens | Backgrounds, primary, accent, text, borders, semantic |
| **Density** | Spacing & sizing | Padding, gaps, font sizes, border-radius, sidebar width |
| **Atmosphere** | Ambient effects | Grain, glows, mesh gradients, backdrop blur, animations |

### 3.2 Built-in Themes

| Theme | Palette | Default Density | Default Atmosphere |
|-------|---------|----------------|-------------------|
| **Void Protocol** (default) | Deep void + electric purple + warm gold | Adaptive | Full |
| **Daylight** | Warm white bg, deep purple primary, muted gold | Adaptive | Minimal |
| **Slate** | Neutral gray, no hue tint, cooler feel | Adaptive | Minimal |

Users can also create **Custom** themes with full control over all three layers.

### 3.3 Density Presets

| Preset | Sidebar | Card Padding | Gap | Description |
|--------|---------|-------------|-----|-------------|
| **Spacious** | 300px | 24px | 16px | Breathing room, fewer elements visible |
| **Adaptive** (default) | 260px / 48px compact | 20px main / 12px sidebar | 12px | Spacious main, dense sidebar/panels |
| **Dense** | 220px | 12px | 8px | Maximum information density |

### 3.4 Atmosphere Presets

| Preset | Grain | Glows | Mesh Gradients | Backdrop Blur | Animations |
|--------|-------|-------|---------------|--------------|------------|
| **Full** (default) | `opacity: 0.03` SVG feTurbulence | Purple + gold halos on interactive elements | 2-3 corner orbs (600px radial) | 24-40px on glass surfaces | All transitions + pulse |
| **Minimal** | `opacity: 0.015` | Focus/active only | None | 12px on modals only | Reduced |
| **None** | Off | Off | Off | Off | CSS transitions only |

`prefers-reduced-motion: reduce` automatically maps to Atmosphere: None.

### 3.5 Technical Implementation

- All values flow through CSS custom properties
- Theme applied via `data-theme`, `data-density`, `data-atmosphere` attributes on `<html>`
- Theme selection persisted via `api.saveSetting()` (existing infrastructure)
- Density and atmosphere are independent — any combination works
- Theme changes apply instantly via DOM attribute swap + CSS variable injection

### 3.6 Migration from Current System

| Current | New |
|---------|-----|
| `dark` | Void Protocol |
| `gray` | Slate |
| `light` | Daylight |
| `custom` | Custom theme editor |

Existing `CustomThemeColors` interface extended with density + atmosphere fields.

---

## 4. Component Design

### 4.1 Glass Surfaces

Three tiers, respecting the Atmosphere setting:

| Tier | Background | Blur | Border | Use Case |
|------|-----------|------|--------|----------|
| `glass` | `void-raised` @ 80% opacity | 24px | 1px `text-primary` @ 8% | Cards, sidebar |
| `glass-elevated` | `void-raised` @ 60% opacity | 40px | 1px `text-primary` @ 12% + glow shadow | Modals, dropdowns, command palette |
| `glass-subtle` | `void-base` @ 90% opacity | 12px | 1px `text-primary` @ 4% | Tooltips, inline panels |

When Atmosphere is None, these fall back to solid backgrounds with no blur.

### 4.2 Buttons

| Variant | Background | Text | Border | Hover | Glow |
|---------|-----------|------|--------|-------|------|
| **Primary** | `purple-500` | `text-on-purple` | none | `purple-400` | Purple halo |
| **Secondary** | transparent | `text-primary` | `border-subtle` | `void-overlay` bg | None |
| **Ghost** | transparent | `text-secondary` | none | `void-overlay` bg | None |
| **Accent** | transparent | `gold-400` | `border-gold` | `gold-400` @ 8% bg | Gold halo |
| **Destructive** | `error` | white | none | lighter error | None |

All buttons: `radius-md` (8px), Geist font, weight 500.

### 4.3 Cards

- Background: `glass` tier
- Hover: border shifts to `border-purple`, subtle purple glow
- Active/selected: persistent `border-purple` + glow
- Gold variant: `border-gold` + gold glow on hover for premium/special items

### 4.4 Inputs

- Background: `void-base` @ 50% opacity
- Border: `border-subtle` → `border-purple` on focus
- Focus: purple glow ring (`purple-glow` as box-shadow)
- Placeholder: `text-muted`

### 4.5 Badges

| Variant | Background | Text | Border |
|---------|-----------|------|--------|
| **Default** | `purple-500` @ 15% | `purple-400` | `purple-500` @ 20% |
| **Gold** | `gold-400` @ 12% | `gold-300` | `gold-400` @ 20% |
| **Success** | `success` @ 12% | `success` | `success` @ 20% |
| **Error** | `error` @ 12% | `error` | `error` @ 20% |
| **Muted** | `void-overlay` | `text-secondary` | `border-subtle` |

### 4.6 Sidebar

- Background: darker than main canvas (`oklch(0.05 0.02 285)`)
- Section labels: `overline` style in `gold-300`
- Items: `body-small` in `text-secondary`, icon + text
- Active item: `purple-500` @ 10% bg, `purple-400` text, purple border
- Notification dot: `gold-400` with gold glow
- Compact mode: 48px icon strip, purple glow on active icon

### 4.7 Scrollbars

- Track: transparent
- Thumb: `purple-500` @ 30%, 3px width, rounded
- Hover: expands to 6px, `purple-500` @ 50%
- Code blocks: 8px thumb for usability

---

## 5. Ambient Effects

### 5.1 Full Tier (default)

| Effect | Implementation | Performance |
|--------|---------------|-------------|
| **Grain texture** | SVG `feTurbulence` fixed overlay, `opacity: 0.03` | Minimal — single composited layer |
| **Mesh gradient orbs** | 2-3 radial gradients (600px) fixed in corners, purple top-right + gold bottom-left | Minimal — CSS only |
| **Glass blur** | `backdrop-filter: blur(24-40px)` on glass surfaces | Moderate — limit to 6-8 simultaneous |
| **Glow halos** | `box-shadow` with purple/gold @ 20-30% on interactive elements | Minimal |
| **Active pulse** | `box-shadow` animation (2s cycle) on running elements | Minimal — single element |
| **Gradient dividers** | `linear-gradient` through `border-purple` on separators | Negligible |
| **Star-field grain** | Fine noise texture under main grain for depth | Negligible — static SVG |

### 5.2 Minimal Tier

- Grain reduced to `opacity: 0.015`
- Mesh orbs removed
- Glass blur only on modals/command palette at `12px`
- Glows only on focus/active, not hover
- Active pulse removed
- Gradient dividers replaced with solid borders
- Star-field removed

### 5.3 None Tier

All ambient effects disabled. Solid backgrounds, no blur, no glows, no grain. Standard CSS transitions preserved. Automatically applied when `prefers-reduced-motion: reduce` detected.

### 5.4 CSS Strategy

Atmosphere controlled via `data-atmosphere` attribute on `<html>`:

```css
html[data-atmosphere="full"]    .glass { backdrop-filter: blur(24px); }
html[data-atmosphere="minimal"] .glass { backdrop-filter: none; background: var(--void-raised); }
html[data-atmosphere="none"]    .glass { backdrop-filter: none; background: var(--void-raised); }

html[data-atmosphere="full"]    .grain { opacity: 0.03; }
html[data-atmosphere="minimal"] .grain { opacity: 0.015; }
html[data-atmosphere="none"]    .grain { display: none; }
```

---

## 6. Settings UI — Appearance Tab

### 6.1 Layout (top to bottom)

**Theme Selector**
- Horizontal row of theme cards (Void Protocol, Daylight, Slate, Custom)
- Each card: mini-preview swatch (background + primary stripe + accent stripe)
- Active theme: purple glow border
- "Custom" card with `+` icon opens the custom editor

**Density Control**
- Three-way segmented control: Spacious | Adaptive | Dense
- Live mini-preview below showing mock sidebar + content area
- Updates instantly on toggle

**Atmosphere Control**
- Three-way segmented control: Full | Minimal | None
- Demo card below showing grain/glows/blur toggling in real-time
- Note: "Automatically set to None when your system requests reduced motion"

**Custom Theme Editor** (collapsed by default)
- Palette: color pickers grouped by token category (backgrounds, primary, accent, text, borders, semantic)
- Typography: font family dropdowns for heading/body/mono, size scale slider
- Import/Export: JSON theme files, shareable between users
- Reset: button to restore Void Protocol defaults

### 6.2 Persistence

- Theme, density, atmosphere stored via `api.saveSetting()`
- Custom colors stored as JSON object in settings
- Applied on load via `ThemeContext` — sets `data-theme`, `data-density`, `data-atmosphere` on `<html>`

---

## 7. Visual References

Live HTML mockups created during brainstorming are available in `.superpowers/brainstorm/` for implementation reference:

- `void-protocol-palette.html` — Full color system with swatches, glows, component samples, app mockup
- `void-protocol-typography.html` — Font specimens, type scale, in-context demo
- `void-protocol-components.html` — Complete component library (buttons, inputs, cards, toggles, tabs, sidebar)
