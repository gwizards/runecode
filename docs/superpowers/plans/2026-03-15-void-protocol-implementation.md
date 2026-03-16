# Void Protocol Design System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RuneCode's current design system with the Void Protocol aesthetic (deep void backgrounds, electric purple + warm gold accents) and introduce a configurable Theme System with independent Palette, Density, and Atmosphere axes.

**Architecture:** The implementation uses CSS custom properties driven by `data-*` attributes on `<html>`, with ThemeContext managing state and persistence. All changes are backward-compatible through a one-release token alias period. Three built-in themes (Void Protocol, Daylight, Slate) plus full custom theme support.

**Tech Stack:** Tailwind CSS v4, OKLCH color space, CVA (class-variance-authority), Radix UI, Framer Motion, Tauri v2.

**Spec:** `docs/superpowers/specs/2026-03-15-void-protocol-design-system.md`

---

## Chunk 1: Fonts & Design Tokens

### Task 1: Bundle New Fonts

**Files:**
- Create: `src/assets/fonts/instrument-sans/InstrumentSans-Variable.ttf`
- Create: `src/assets/fonts/geist/Geist-Variable.ttf`
- Create: `src/assets/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf`
- Modify: `src/styles.css` (lines 45-52, font-face declarations)

- [ ] **Step 1: Download font files**

```bash
# Instrument Sans from Google Fonts
curl -L "https://github.com/google/fonts/raw/main/ofl/instrumentsans/InstrumentSans%5Bwdth%2Cwght%5D.ttf" -o src/assets/fonts/instrument-sans/InstrumentSans-Variable.ttf

# JetBrains Mono from GitHub releases
curl -L "https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip" -o /tmp/jbmono.zip
unzip -j /tmp/jbmono.zip "fonts/variable/JetBrainsMono[wght].ttf" -d src/assets/fonts/jetbrains-mono/
mv "src/assets/fonts/jetbrains-mono/JetBrainsMono[wght].ttf" src/assets/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf

# Geist from Vercel
curl -L "https://github.com/vercel/geist-font/releases/download/1.4.0/Geist.zip" -o /tmp/geist.zip
unzip -j /tmp/geist.zip "*/Geist-Variable.ttf" -d src/assets/fonts/geist/
```

Create directories first: `mkdir -p src/assets/fonts/{instrument-sans,geist,jetbrains-mono}`

- [ ] **Step 2: Update @font-face declarations in styles.css**

Replace the existing Inter font-face block (lines 45-52) with:

```css
/* Heading font — Instrument Sans */
@font-face {
  font-family: 'Instrument Sans';
  src: url('./assets/fonts/instrument-sans/InstrumentSans-Variable.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}

/* Body font — Geist */
@font-face {
  font-family: 'Geist';
  src: url('./assets/fonts/geist/Geist-Variable.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}

/* Code font — JetBrains Mono */
@font-face {
  font-family: 'JetBrains Mono';
  src: url('./assets/fonts/jetbrains-mono/JetBrainsMono-Variable.ttf') format('truetype');
  font-weight: 100 800;
  font-display: swap;
}

/* Legacy — keep Inter for transition period */
@font-face {
  font-family: 'Inter';
  src: url('./assets/fonts/inter/Inter.ttf') format('truetype');
  font-weight: 100 900;
  font-display: swap;
}
```

- [ ] **Step 3: Verify fonts load**

Run: `npm run dev` (or `pnpm dev`)
Open the app, inspect element, check Computed tab → font-family.
Expected: New font-face declarations appear in DevTools Sources.

- [ ] **Step 4: Commit**

```bash
git add src/assets/fonts/ src/styles.css
git commit -m "feat: bundle Instrument Sans, Geist, and JetBrains Mono fonts"
```

---

### Task 2: Replace Design Tokens in @theme Block

**Files:**
- Modify: `src/styles.css` (lines 89-167, @theme block)

- [ ] **Step 1: Replace the @theme block**

Replace the entire `@theme` block (lines 89-167) with the new Void Protocol tokens:

```css
@theme {
  /* ===== FONTS ===== */
  --font-heading: 'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-sans: 'Geist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace;

  /* ===== BACKGROUNDS ===== */
  --color-void-deep: oklch(0.05 0.02 285);
  --color-void-base: oklch(0.06 0.02 285);
  --color-void-raised: oklch(0.10 0.02 285);
  --color-void-elevated: oklch(0.14 0.025 288);
  --color-void-overlay: oklch(0.18 0.02 285);

  /* ===== PRIMARY — ELECTRIC PURPLE ===== */
  --color-purple-400: oklch(0.72 0.22 292);
  --color-purple-500: oklch(0.62 0.28 292);
  --color-purple-600: oklch(0.52 0.26 292);
  --color-purple-glow: oklch(0.62 0.28 292 / 0.3);

  /* ===== ACCENT — WARM GOLD ===== */
  --color-gold-300: oklch(0.85 0.12 80);
  --color-gold-400: oklch(0.78 0.15 80);
  --color-gold-500: oklch(0.70 0.17 75);
  --color-gold-glow: oklch(0.78 0.15 80 / 0.25);

  /* ===== TEXT ===== */
  --color-text-primary: oklch(0.93 0.01 285);
  --color-text-secondary: oklch(0.70 0.02 285);
  --color-text-muted: oklch(0.50 0.02 285);
  --color-text-on-purple: oklch(0.98 0.01 292);
  --color-text-on-gold: oklch(0.15 0.02 80);

  /* ===== BORDERS ===== */
  --color-border-subtle: oklch(0.20 0.02 285);
  --color-border-purple: oklch(0.40 0.15 292 / 0.4);
  --color-border-gold: oklch(0.60 0.10 80 / 0.3);

  /* ===== SEMANTIC ===== */
  --color-success: oklch(0.72 0.20 155);
  --color-warning: oklch(0.78 0.18 60);
  --color-error: oklch(0.65 0.22 25);
  --color-info: oklch(0.65 0.15 250);

  /* ===== POPOVER (used by Radix UI) ===== */
  --color-popover: var(--color-void-elevated);
  --color-popover-foreground: var(--color-text-primary);

  /* ===== LEGACY ALIASES (remove after one release) ===== */
  --color-background: var(--color-void-base);
  --color-foreground: var(--color-text-primary);
  --color-card: var(--color-void-raised);
  --color-card-foreground: var(--color-text-primary);
  --color-primary: var(--color-purple-500);
  --color-primary-foreground: var(--color-text-on-purple);
  --color-secondary: var(--color-void-overlay);
  --color-secondary-foreground: var(--color-text-primary);
  --color-muted: var(--color-void-raised);
  --color-muted-foreground: var(--color-text-muted);
  --color-accent: var(--color-gold-400);
  --color-accent-foreground: var(--color-text-on-gold);
  --color-destructive: var(--color-error);
  --color-destructive-foreground: oklch(0.98 0.01 25);
  --color-border: var(--color-border-subtle);
  --color-input: var(--color-border-subtle);
  --color-ring: var(--color-purple-glow);

  /* ===== BORDER RADIUS ===== */
  --radius-sm: 0.25rem;
  --radius-base: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;

  /* ===== TRANSITIONS ===== */
  --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
  --duration-fast: 100ms;
  --duration-base: 200ms;
  --duration-slow: 300ms;
  --duration-glow: 2000ms;

  /* ===== DENSITY — ADAPTIVE (default) ===== */
  --density-sidebar: 260px;
  --density-sidebar-compact: 48px;
  --density-card-padding: 20px;
  --density-sidebar-padding: 12px;
  --density-gap: 12px;

  /* ===== STATUS COLORS (existing, remapped) ===== */
  --color-green-500: var(--color-success);
  --color-green-600: oklch(0.64 0.22 155);
}
```

- [ ] **Step 2: Verify app still renders**

Run: `npm run dev`
Expected: App renders. Colors may look different (new tokens active) but no CSS errors. Legacy aliases keep existing components working.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: replace design tokens with Void Protocol palette and legacy aliases"
```

---

### Task 3: Add Theme Attribute Rules (Replace CSS Class Themes)

**Files:**
- Modify: `src/styles.css` (lines 169-251, theme class rules)

- [ ] **Step 1: Replace theme class rules with data-attribute rules**

Replace the entire theme class block (lines 169-256, including `.theme-dark`, `.theme-light`, `.theme-gray`, `.theme-white`, `.theme-custom`) with:

```css
/* ===== THEME: VOID PROTOCOL (default dark) ===== */
html, html[data-theme="void-protocol"] {
  color-scheme: dark;
  --color-void-deep: oklch(0.05 0.02 285);
  --color-void-base: oklch(0.06 0.02 285);
  --color-void-raised: oklch(0.10 0.02 285);
  --color-void-elevated: oklch(0.14 0.025 288);
  --color-void-overlay: oklch(0.18 0.02 285);
  --color-purple-400: oklch(0.72 0.22 292);
  --color-purple-500: oklch(0.62 0.28 292);
  --color-purple-600: oklch(0.52 0.26 292);
  --color-purple-glow: oklch(0.62 0.28 292 / 0.3);
  --color-gold-300: oklch(0.85 0.12 80);
  --color-gold-400: oklch(0.78 0.15 80);
  --color-gold-500: oklch(0.70 0.17 75);
  --color-gold-glow: oklch(0.78 0.15 80 / 0.25);
  --color-text-primary: oklch(0.93 0.01 285);
  --color-text-secondary: oklch(0.70 0.02 285);
  --color-text-muted: oklch(0.50 0.02 285);
  --color-text-on-purple: oklch(0.98 0.01 292);
  --color-text-on-gold: oklch(0.15 0.02 80);
  --color-border-subtle: oklch(0.20 0.02 285);
  --color-border-purple: oklch(0.40 0.15 292 / 0.4);
  --color-border-gold: oklch(0.60 0.10 80 / 0.3);
}

/* ===== THEME: DAYLIGHT ===== */
html[data-theme="daylight"] {
  color-scheme: light;
  --color-void-deep: oklch(0.95 0.01 270);
  --color-void-base: oklch(0.97 0.005 270);
  --color-void-raised: oklch(0.99 0.003 270);
  --color-void-elevated: oklch(1.0 0 0);
  --color-void-overlay: oklch(0.93 0.01 270);
  --color-purple-500: oklch(0.50 0.26 292);
  --color-purple-400: oklch(0.58 0.24 292);
  --color-purple-600: oklch(0.42 0.24 292);
  --color-gold-400: oklch(0.65 0.17 75);
  --color-text-primary: oklch(0.15 0.01 285);
  --color-text-secondary: oklch(0.40 0.02 285);
  --color-text-muted: oklch(0.55 0.02 285);
  --color-text-on-purple: oklch(0.98 0.01 292);
  --color-text-on-gold: oklch(0.15 0.02 80);
  --color-border-subtle: oklch(0.85 0.01 270);
  --color-border-purple: oklch(0.50 0.20 292 / 0.3);
  --color-border-gold: oklch(0.65 0.12 80 / 0.3);
}

/* ===== THEME: SLATE ===== */
html[data-theme="slate"] {
  color-scheme: dark;
  --color-void-deep: oklch(0.12 0.005 260);
  --color-void-base: oklch(0.15 0.005 260);
  --color-void-raised: oklch(0.19 0.005 260);
  --color-void-elevated: oklch(0.23 0.005 260);
  --color-void-overlay: oklch(0.27 0.005 260);
  --color-border-subtle: oklch(0.28 0.005 260);
}

/* ===== THEME: CUSTOM (values set via JS on <html>) ===== */
html[data-theme="custom"] {
  /* All tokens overridden via inline style from ThemeContext */
}

/* ===== DENSITY: SPACIOUS ===== */
html[data-density="spacious"] {
  --density-sidebar: 300px;
  --density-card-padding: 24px;
  --density-sidebar-padding: 16px;
  --density-gap: 16px;
}

/* ===== DENSITY: ADAPTIVE (default) ===== */
html, html[data-density="adaptive"] {
  --density-sidebar: 260px;
  --density-sidebar-compact: 48px;
  --density-card-padding: 20px;
  --density-sidebar-padding: 12px;
  --density-gap: 12px;
}

/* ===== DENSITY: DENSE ===== */
html[data-density="dense"] {
  --density-sidebar: 220px;
  --density-card-padding: 12px;
  --density-sidebar-padding: 8px;
  --density-gap: 8px;
}

/* ===== ATMOSPHERE: FULL (default) ===== */
html, html[data-atmosphere="full"] {
  --atm-grain-opacity: 0.03;
  --atm-blur: 24px;
  --atm-blur-elevated: 40px;
  --atm-glow-opacity: 1;
  --atm-mesh-opacity: 1;
  --atm-transition-duration: var(--duration-base);
}

/* ===== ATMOSPHERE: MINIMAL ===== */
html[data-atmosphere="minimal"] {
  --atm-grain-opacity: 0.015;
  --atm-blur: 0px;
  --atm-blur-elevated: 12px;
  --atm-glow-opacity: 0;
  --atm-mesh-opacity: 0;
  --atm-transition-duration: var(--duration-base);
}

/* ===== ATMOSPHERE: NONE ===== */
html[data-atmosphere="none"] {
  --atm-grain-opacity: 0;
  --atm-blur: 0px;
  --atm-blur-elevated: 0px;
  --atm-glow-opacity: 0;
  --atm-mesh-opacity: 0;
  --atm-transition-duration: 0ms;
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  html:not([data-atmosphere]) {
    --atm-grain-opacity: 0;
    --atm-blur: 0px;
    --atm-blur-elevated: 0px;
    --atm-glow-opacity: 0;
    --atm-mesh-opacity: 0;
    --atm-transition-duration: 0ms;
  }
}

/* ===== RESPONSIVE DENSITY OVERRIDES ===== */
@media (max-width: 767px) {
  html {
    --density-sidebar: 0px;
    --density-card-padding: 12px;
    --density-gap: 8px;
  }
}

/* Legacy class aliases (transition period) */
.theme-dark { /* handled by default html rules */ }
.theme-gray { /* mapped to slate via ThemeContext */ }
.theme-light { /* mapped to daylight via ThemeContext */ }
.theme-white { /* mapped to daylight via ThemeContext */ }
.theme-custom { /* mapped to custom via ThemeContext */ }
```

- [ ] **Step 2: Verify app renders with new theme rules**

Run: `npm run dev`
Expected: App renders with Void Protocol colors. No CSS errors in console.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: replace CSS class themes with data-attribute theme/density/atmosphere system"
```

---

### Task 4: Update Typography Utilities

**Files:**
- Modify: `src/styles.css` (lines 349-432, typography utility classes)

- [ ] **Step 1: Replace typography utility classes**

Replace the existing `.text-display-1` through `.text-overline` block with:

```css
/* ===== TYPOGRAPHY UTILITIES ===== */

.text-display-1 {
  font-family: var(--font-heading);
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.text-display-2 {
  font-family: var(--font-heading);
  font-size: 32px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.text-heading-1 {
  font-family: var(--font-heading);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.text-heading-2 {
  font-family: var(--font-heading);
  font-size: 20px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
}

.text-heading-3 {
  font-family: var(--font-heading);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.01em;
}

.text-heading-4 {
  font-family: var(--font-heading);
  font-size: 14px;
  font-weight: 500;
  line-height: 1.35;
}

.text-body-large {
  font-family: var(--font-sans);
  font-size: 16px;
  font-weight: 400;
  line-height: 1.6;
}

.text-body {
  font-family: var(--font-sans);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
}

.text-body-small {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}

.text-label {
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.02em;
}

.text-overline {
  font-family: var(--font-sans);
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.text-caption {
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
}

.text-mono {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}

.text-button {
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
```

- [ ] **Step 2: Verify typography renders**

Run: `npm run dev`
Expected: Headings render in Instrument Sans, body in Geist, code in JetBrains Mono.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: update typography utilities with Void Protocol type scale"
```

---

### Task 5: Update Glass, Glow, and Ambient Utilities

**Files:**
- Modify: `src/styles.css` (lines 454-489, glass utilities + add new ambient utilities)

- [ ] **Step 1: Replace glass utilities and add ambient effects**

Replace the existing `.glass`, `.glass-elevated`, `.glass-subtle`, `.rune-glow`, `.rune-glow-sm`, `.rune-pulse` block. **Note:** The existing utilities are inside `@layer utilities { ... }`. Preserve this wrapper — place all the following CSS inside the existing `@layer utilities` block to maintain Tailwind v4 specificity behavior:

```css
/* ===== GLASS SURFACES ===== */

.glass {
  background: color-mix(in oklch, var(--color-void-raised) 80%, transparent);
  backdrop-filter: blur(var(--atm-blur));
  border: 1px solid color-mix(in oklch, var(--color-text-primary) 8%, transparent);
}

.glass-elevated {
  background: color-mix(in oklch, var(--color-void-raised) 60%, transparent);
  backdrop-filter: blur(var(--atm-blur-elevated));
  border: 1px solid color-mix(in oklch, var(--color-text-primary) 12%, transparent);
  box-shadow: 0 8px 32px color-mix(in oklch, var(--color-void-base) 40%, transparent);
}

.glass-subtle {
  background: color-mix(in oklch, var(--color-void-base) 90%, transparent);
  backdrop-filter: blur(calc(var(--atm-blur) / 2));
  border: 1px solid color-mix(in oklch, var(--color-text-primary) 4%, transparent);
}

/* ===== GLOW EFFECTS ===== */

.glow-purple {
  box-shadow: 0 0 15px var(--color-purple-glow), 0 0 45px color-mix(in oklch, var(--color-purple-500) 8%, transparent);
  opacity: var(--atm-glow-opacity, 1);
}

.glow-purple-sm {
  box-shadow: 0 0 8px var(--color-purple-glow);
  opacity: var(--atm-glow-opacity, 1);
}

.glow-gold {
  box-shadow: 0 0 15px var(--color-gold-glow), 0 0 45px color-mix(in oklch, var(--color-gold-400) 6%, transparent);
  opacity: var(--atm-glow-opacity, 1);
}

.glow-gold-sm {
  box-shadow: 0 0 8px var(--color-gold-glow);
  opacity: var(--atm-glow-opacity, 1);
}

/* Legacy aliases */
.rune-glow { box-shadow: 0 0 15px var(--color-purple-glow), 0 0 45px color-mix(in oklch, var(--color-purple-500) 8%, transparent); }
.rune-glow-sm { box-shadow: 0 0 8px var(--color-purple-glow); }

@keyframes rune-pulse {
  0%, 100% { box-shadow: 0 0 15px var(--color-purple-glow); }
  50% { box-shadow: 0 0 25px var(--color-purple-glow), 0 0 50px color-mix(in oklch, var(--color-purple-500) 15%, transparent); }
}
.rune-pulse {
  animation: rune-pulse var(--duration-glow) ease-in-out infinite;
}

/* ===== AMBIENT: GRAIN OVERLAY ===== */

.grain-overlay {
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
  opacity: var(--atm-grain-opacity, 0);
  pointer-events: none;
  z-index: 1;
}

/* ===== AMBIENT: MESH GRADIENT ORBS ===== */

.mesh-orb-purple {
  position: fixed;
  top: -200px;
  right: -200px;
  width: 600px;
  height: 600px;
  background: radial-gradient(circle, color-mix(in oklch, var(--color-purple-500) 8%, transparent) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  opacity: var(--atm-mesh-opacity, 0);
}

.mesh-orb-gold {
  position: fixed;
  bottom: -150px;
  left: -150px;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, color-mix(in oklch, var(--color-gold-400) 6%, transparent) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
  opacity: var(--atm-mesh-opacity, 0);
}

/* ===== FOCUS RING (replaces global box-shadow:none !important) ===== */

*:focus {
  outline: none;
}

*:focus-visible {
  box-shadow: 0 0 0 3px var(--color-purple-glow), 0 0 15px color-mix(in oklch, var(--color-purple-500) 10%, transparent);
}
```

- [ ] **Step 2: Remove the old global focus reset**

Find and remove the existing `*:focus, *:focus-visible, *:focus-within { box-shadow: none !important; }` block (around lines 306-310).

- [ ] **Step 3: Verify glass effects and ambient elements**

Run: `npm run dev`
Expected: Glass surfaces show blur, glows work on hover, no broken focus states.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css
git commit -m "feat: add Void Protocol glass, glow, ambient, and focus-visible utilities"
```

---

### Task 6: Update Scrollbar Styling

**Files:**
- Modify: `src/styles.css` (lines 971-1022, scrollbar rules)

- [ ] **Step 1: Replace scrollbar styles**

Replace the existing scrollbar block with:

```css
/* ===== SCROLLBARS ===== */

::-webkit-scrollbar {
  width: 3px;
  height: 3px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: color-mix(in oklch, var(--color-purple-500) 30%, transparent);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: color-mix(in oklch, var(--color-purple-500) 50%, transparent);
  width: 6px;
}

/* Code blocks get thicker scrollbars */
pre::-webkit-scrollbar,
code::-webkit-scrollbar,
.code-block::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in oklch, var(--color-purple-500) 30%, transparent) transparent;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: update scrollbar styling with purple-tinted Void Protocol theme"
```

---

## Chunk 2: ThemeContext Refactor

### Task 7: Refactor ThemeContext

**Files:**
- Modify: `src/contexts/ThemeContext.tsx` (full rewrite, 188 lines)

- [ ] **Step 1: Read current ThemeContext**

Read: `src/contexts/ThemeContext.tsx`
Understand current state shape, `applyTheme()`, storage keys.

- [ ] **Step 2: Update types and interface**

At the top of the file, replace the type definitions:

```typescript
export type ThemeMode = 'void-protocol' | 'daylight' | 'slate' | 'custom';
export type DensityMode = 'spacious' | 'adaptive' | 'dense';
export type AtmosphereMode = 'full' | 'minimal' | 'none';

export interface CustomThemeColors {
  // Backgrounds
  voidDeep?: string;
  voidBase?: string;
  voidRaised?: string;
  voidElevated?: string;
  voidOverlay?: string;
  // Primary
  purple400?: string;
  purple500?: string;
  purple600?: string;
  purpleGlow?: string;
  // Accent
  gold300?: string;
  gold400?: string;
  gold500?: string;
  goldGlow?: string;
  // Text
  textPrimary?: string;
  textSecondary?: string;
  textMuted?: string;
  textOnPurple?: string;
  textOnGold?: string;
  // Borders
  borderSubtle?: string;
  borderPurple?: string;
  borderGold?: string;
  // Semantic
  success?: string;
  warning?: string;
  error?: string;
  info?: string;
}

interface ThemeContextType {
  theme: ThemeMode;
  density: DensityMode;
  atmosphere: AtmosphereMode;
  customColors: CustomThemeColors;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setDensity: (density: DensityMode) => Promise<void>;
  setAtmosphere: (atmosphere: AtmosphereMode) => Promise<void>;
  setCustomColors: (colors: Partial<CustomThemeColors>) => Promise<void>;
  isLoading: boolean;
}
```

- [ ] **Step 3: Update applyTheme to use data attributes**

Replace the `applyTheme` function body:

```typescript
const applyTheme = useCallback((
  mode: ThemeMode,
  densityMode: DensityMode,
  atmosphereMode: AtmosphereMode,
  colors: CustomThemeColors
) => {
  const root = document.documentElement;

  // Remove legacy classes
  root.classList.remove('theme-dark', 'theme-gray', 'theme-light', 'theme-custom');

  // Apply data attributes
  root.setAttribute('data-theme', mode);
  root.setAttribute('data-density', densityMode);
  root.setAttribute('data-atmosphere', atmosphereMode);

  // Apply custom colors as inline CSS variables
  if (mode === 'custom' && colors) {
    const tokenMap: Record<string, string> = {
      voidDeep: '--color-void-deep',
      voidBase: '--color-void-base',
      voidRaised: '--color-void-raised',
      voidElevated: '--color-void-elevated',
      voidOverlay: '--color-void-overlay',
      purple400: '--color-purple-400',
      purple500: '--color-purple-500',
      purple600: '--color-purple-600',
      purpleGlow: '--color-purple-glow',
      gold300: '--color-gold-300',
      gold400: '--color-gold-400',
      gold500: '--color-gold-500',
      goldGlow: '--color-gold-glow',
      textPrimary: '--color-text-primary',
      textSecondary: '--color-text-secondary',
      textMuted: '--color-text-muted',
      textOnPurple: '--color-text-on-purple',
      textOnGold: '--color-text-on-gold',
      borderSubtle: '--color-border-subtle',
      borderPurple: '--color-border-purple',
      borderGold: '--color-border-gold',
      success: '--color-success',
      warning: '--color-warning',
      error: '--color-error',
      info: '--color-info',
    };

    for (const [key, cssVar] of Object.entries(tokenMap)) {
      const value = colors[key as keyof CustomThemeColors];
      if (value) {
        root.style.setProperty(cssVar, value);
      } else {
        root.style.removeProperty(cssVar);
      }
    }
  } else {
    // Clear all custom inline styles
    root.removeAttribute('style');
  }
}, []);
```

- [ ] **Step 4: Update state initialization and persistence**

Update the state initialization to load all three axes:

```typescript
const [theme, setThemeState] = useState<ThemeMode>('void-protocol');
const [density, setDensityState] = useState<DensityMode>('adaptive');
const [atmosphere, setAtmosphereState] = useState<AtmosphereMode>('full');
const [customColors, setCustomColorsState] = useState<CustomThemeColors>({});
const [isLoading, setIsLoading] = useState(true);
```

Update the load effect to read all three settings:

```typescript
useEffect(() => {
  const loadSettings = async () => {
    try {
      const [savedTheme, savedDensity, savedAtmosphere, savedColors] = await Promise.all([
        api.loadSetting('theme_preference'),
        api.loadSetting('density_preference'),
        api.loadSetting('atmosphere_preference'),
        api.loadSetting('theme_custom_colors'),
      ]);

      // Migrate old theme values
      const migrateTheme = (t: string): ThemeMode => {
        const migration: Record<string, ThemeMode> = {
          dark: 'void-protocol',
          gray: 'slate',
          light: 'daylight',
          white: 'daylight',
          custom: 'custom',
        };
        return migration[t] || (t as ThemeMode) || 'void-protocol';
      };

      const t = savedTheme ? migrateTheme(savedTheme) : detectDefaultTheme();
      const d = (savedDensity as DensityMode) || 'adaptive';
      const a = (savedAtmosphere as AtmosphereMode) || detectDefaultAtmosphere();
      const c = savedColors ? JSON.parse(savedColors) : {};

      setThemeState(t);
      setDensityState(d);
      setAtmosphereState(a);
      setCustomColorsState(c);
      applyTheme(t, d, a, c);
    } catch (err) {
      console.error('Failed to load theme settings:', err);
      applyTheme('void-protocol', 'adaptive', 'full', {});
    } finally {
      setIsLoading(false);
    }
  };

  loadSettings();
}, [applyTheme]);
```

Add the reduced-motion detector:

```typescript
function detectDefaultAtmosphere(): AtmosphereMode {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return 'none';
  }
  return 'full';
}

function detectDefaultTheme(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'daylight';
  }
  return 'void-protocol';
}
```

- [ ] **Step 4b: Add runtime prefers-reduced-motion listener**

After the load effect, add a second effect for runtime motion preference changes:

```typescript
useEffect(() => {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => {
    if (e.matches) {
      setAtmosphereState('none');
      applyTheme(theme, density, 'none', customColors);
    }
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}, [theme, density, customColors, applyTheme]);
```

- [ ] **Step 5: Add setDensity and setAtmosphere methods**

```typescript
const setTheme = useCallback(async (newTheme: ThemeMode) => {
  setThemeState(newTheme);
  applyTheme(newTheme, density, atmosphere, customColors);
  await api.saveSetting('theme_preference', newTheme);
}, [density, atmosphere, customColors, applyTheme]);

const setDensity = useCallback(async (newDensity: DensityMode) => {
  setDensityState(newDensity);
  applyTheme(theme, newDensity, atmosphere, customColors);
  await api.saveSetting('density_preference', newDensity);
}, [theme, atmosphere, customColors, applyTheme]);

const setAtmosphere = useCallback(async (newAtmosphere: AtmosphereMode) => {
  setAtmosphereState(newAtmosphere);
  applyTheme(theme, density, newAtmosphere, customColors);
  await api.saveSetting('atmosphere_preference', newAtmosphere);
}, [theme, density, customColors, applyTheme]);

const setCustomColors = useCallback(async (colors: Partial<CustomThemeColors>) => {
  const merged = { ...customColors, ...colors };
  setCustomColorsState(merged);
  applyTheme(theme, density, atmosphere, merged);
  await api.saveSetting('theme_custom_colors', JSON.stringify(merged));
}, [theme, density, atmosphere, customColors, applyTheme]);
```

- [ ] **Step 6: Update the context value**

```typescript
const value: ThemeContextType = {
  theme,
  density,
  atmosphere,
  customColors,
  setTheme,
  setDensity,
  setAtmosphere,
  setCustomColors,
  isLoading,
};
```

- [ ] **Step 7: Verify ThemeContext works**

Run: `npm run dev`
Expected: App loads with `data-theme="void-protocol"` `data-density="adaptive"` `data-atmosphere="full"` on `<html>`. Inspect element to confirm.

- [ ] **Step 8: Commit**

```bash
git add src/contexts/ThemeContext.tsx
git commit -m "feat: refactor ThemeContext with density, atmosphere, and data-attribute system"
```

---

## Chunk 3: Component Library Updates

### Task 8: Update Button Component

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: Read current button.tsx**

Read: `src/components/ui/button.tsx`

- [ ] **Step 2: Update CVA variants**

Update the `buttonVariants` to use new tokens and add `accent` variant:

```typescript
const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "shadow-xs hover:shadow-sm",
        destructive:
          "shadow-xs hover:shadow-sm",
        outline:
          "border shadow-xs hover:shadow-sm",
        secondary:
          "shadow-xs hover:shadow-sm",
        ghost: "",
        accent: "border",
        link: "underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-5 py-2",
        sm: "h-8 rounded-md px-3.5 text-xs",
        lg: "h-10 rounded-lg px-7 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)
```

Add inline styles for color tokens on the Button component (similar to existing pattern):

```typescript
const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--color-purple-500)',
    color: 'var(--color-text-on-purple)',
    boxShadow: '0 0 15px var(--color-purple-glow)',
  },
  destructive: {
    backgroundColor: 'var(--color-error)',
    color: 'white',
  },
  outline: {
    borderColor: 'var(--color-border-subtle)',
    color: 'var(--color-text-primary)',
    backgroundColor: 'transparent',
  },
  secondary: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-subtle)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
  },
  accent: {
    backgroundColor: 'transparent',
    color: 'var(--color-gold-400)',
    borderColor: 'var(--color-border-gold)',
  },
  link: {
    color: 'var(--color-purple-400)',
    backgroundColor: 'transparent',
  },
};
```

Apply the style in the render:

```tsx
<Comp
  className={cn(buttonVariants({ variant, size, className }))}
  style={variantStyles[variant || 'default']}
  ref={ref}
  {...props}
/>
```

- [ ] **Step 3: Verify buttons render correctly**

Run: `npm run dev`, navigate to a view with buttons.
Expected: Primary buttons are purple with glow, accent buttons are gold-bordered.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "feat: update Button with Void Protocol variants and accent style"
```

---

### Task 9: Update Badge Component

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Read current badge.tsx**

Read: `src/components/ui/badge.tsx`

- [ ] **Step 2: Update CVA variants**

Replace badge variants to include new styles with inline styles for OKLCH tokens:

Add new variants: `gold`, `success`, `error`, `info`, `muted`.

```typescript
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "",
        secondary: "",
        destructive: "",
        outline: "",
        gold: "",
        success: "",
        error: "",
        info: "",
        muted: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)
```

Add a `variantStyles` map (same pattern as button) and apply via `style` prop:

```typescript
const variantStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'color-mix(in oklch, var(--color-purple-500) 15%, transparent)',
    color: 'var(--color-purple-400)',
    borderColor: 'color-mix(in oklch, var(--color-purple-500) 20%, transparent)',
  },
  gold: {
    backgroundColor: 'color-mix(in oklch, var(--color-gold-400) 12%, transparent)',
    color: 'var(--color-gold-300)',
    borderColor: 'color-mix(in oklch, var(--color-gold-400) 20%, transparent)',
  },
  success: {
    backgroundColor: 'color-mix(in oklch, var(--color-success) 12%, transparent)',
    color: 'var(--color-success)',
    borderColor: 'color-mix(in oklch, var(--color-success) 20%, transparent)',
  },
  error: {
    backgroundColor: 'color-mix(in oklch, var(--color-error) 12%, transparent)',
    color: 'var(--color-error)',
    borderColor: 'color-mix(in oklch, var(--color-error) 20%, transparent)',
  },
  info: {
    backgroundColor: 'color-mix(in oklch, var(--color-info) 12%, transparent)',
    color: 'var(--color-info)',
    borderColor: 'color-mix(in oklch, var(--color-info) 20%, transparent)',
  },
  muted: {
    backgroundColor: 'var(--color-void-overlay)',
    color: 'var(--color-text-secondary)',
    borderColor: 'var(--color-border-subtle)',
  },
  secondary: {
    backgroundColor: 'var(--color-void-overlay)',
    color: 'var(--color-text-primary)',
    borderColor: 'var(--color-border-subtle)',
  },
  destructive: {
    backgroundColor: 'color-mix(in oklch, var(--color-error) 15%, transparent)',
    color: 'var(--color-error)',
    borderColor: 'color-mix(in oklch, var(--color-error) 20%, transparent)',
  },
  outline: {
    backgroundColor: 'transparent',
    color: 'var(--color-text-secondary)',
    borderColor: 'var(--color-border-subtle)',
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat: update Badge with Void Protocol variants (gold, success, error, info, muted)"
```

---

### Task 10: Update Card Component

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Read current card.tsx**

Read: `src/components/ui/card.tsx`

- [ ] **Step 2: Update Card root to use glass tier**

Update the Card component's inline styles to use glass tier background:

```typescript
style={{
  borderColor: 'var(--color-border-subtle)',
  backgroundColor: 'color-mix(in oklch, var(--color-void-raised) 80%, transparent)',
  backdropFilter: 'blur(var(--atm-blur))',
  color: 'var(--color-text-primary)',
  transition: 'border-color var(--duration-base) var(--ease-smooth), box-shadow var(--duration-base) var(--ease-smooth)',
}}
```

Add hover styles via CSS class or onMouseEnter/onMouseLeave if needed. The simplest approach is to add a CSS rule in styles.css:

```css
.card-hover:hover {
  border-color: var(--color-border-purple);
  box-shadow: 0 0 30px color-mix(in oklch, var(--color-purple-500) 8%, transparent);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx src/styles.css
git commit -m "feat: update Card with glass tier background and purple hover glow"
```

---

### Task 11: Update Input and Textarea Components

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`

- [ ] **Step 1: Update Input inline styles**

```typescript
style={{
  borderColor: 'var(--color-border-subtle)',
  backgroundColor: 'color-mix(in oklch, var(--color-void-base) 50%, transparent)',
  color: 'var(--color-text-primary)',
}}
```

Update the focus-visible class to remove `ring-1` and rely on the global `*:focus-visible` box-shadow.

- [ ] **Step 2: Update Textarea similarly**

Same token updates as Input.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx
git commit -m "feat: update Input and Textarea with Void Protocol tokens and focus glow"
```

---

### Task 12: Update Switch, Tabs, and Remaining UI Components

**Files:**
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/popover.tsx`

- [ ] **Step 1: Update Switch**

Change the track active color from `--color-primary` to `--color-purple-500`, inactive to `--color-void-overlay`. Add purple glow when active.

- [ ] **Step 2: Update Tabs**

Active tab: `--color-purple-400` text with `--color-purple-500` bottom border.
Inactive tab: `--color-text-muted`.

- [ ] **Step 3: Update Dialog**

Overlay: use `--color-void-base` at high opacity.
Content: use `glass-elevated` tier.

- [ ] **Step 4: Update Dropdown, Select, Tooltip, Popover**

All floating elements: use `glass-elevated` tier for background. Border: `--color-border-subtle`. Update any hardcoded color references to new tokens.

- [ ] **Step 5: Verify all components**

Run: `npm run dev`, navigate through the app.
Expected: All UI components render with Void Protocol colors. No visual regressions.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/
git commit -m "feat: update all UI components with Void Protocol tokens"
```

---

## Chunk 4: Sidebar & Layout Updates

### Task 13: Update Sidebar Styling

**Files:**
- Modify: `src/components/ProjectSidebar.tsx`
- Modify: any sidebar section components that apply their own styles

- [ ] **Step 1: Read ProjectSidebar.tsx**

Read: `src/components/ProjectSidebar.tsx`

- [ ] **Step 2: Update sidebar container styles**

- Background: `var(--color-void-deep)`
- Border-right: `1px solid var(--color-border-subtle)`
- Width: use `var(--density-sidebar)` and `var(--density-sidebar-compact)`

- [ ] **Step 3: Update section labels**

Section label elements should use the `text-overline` class with `color: var(--color-gold-300)`.

- [ ] **Step 4: Update sidebar items**

- Default: `color: var(--color-text-secondary)`
- Hover: `background: var(--color-void-elevated)`, `color: var(--color-text-primary)`
- Active: `background: color-mix(in oklch, var(--color-purple-500) 10%, transparent)`, `color: var(--color-purple-400)`, border with `var(--color-border-purple)`

- [ ] **Step 5: Update notification dots**

Gold dots: `background: var(--color-gold-400)`, `box-shadow: 0 0 6px var(--color-gold-glow)`

- [ ] **Step 6: Update compact mode**

Active icon in compact mode: add `box-shadow: 0 0 12px var(--color-purple-glow)`

- [ ] **Step 7: Commit**

```bash
git add src/components/ProjectSidebar.tsx src/components/sidebar/
git commit -m "feat: update Sidebar with Void Protocol tokens, gold labels, purple active states"
```

---

### Task 14: Add Ambient Effect Elements to App Root

**Files:**
- Modify: `src/App.tsx` (add grain overlay and mesh orbs)

- [ ] **Step 1: Add ambient elements inside the root layout**

Inside the main app container (but outside the content), add:

```tsx
{/* Ambient Effects */}
<div className="mesh-orb-purple" aria-hidden="true" />
<div className="mesh-orb-gold" aria-hidden="true" />
<div className="grain-overlay" aria-hidden="true" />
```

These elements use the CSS classes defined in Task 5. Their visibility is controlled by `--atm-mesh-opacity` and `--atm-grain-opacity` (driven by `data-atmosphere`).

- [ ] **Step 2: Verify ambient effects render**

Run: `npm run dev`
Expected: Subtle purple mesh in top-right, gold mesh in bottom-left, fine grain texture over everything. All three respect the atmosphere setting.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add ambient grain overlay and mesh gradient orbs to app root"
```

---

## Chunk 5: Settings UI — Appearance Tab

### Task 15: Create Appearance Settings Component

**Files:**
- Create: `src/components/settings/AppearanceSettings.tsx`

- [ ] **Step 0: Create settings directory**

```bash
mkdir -p src/components/settings
```

- [ ] **Step 1: Create the component**

```tsx
import { useTheme, type ThemeMode, type DensityMode, type AtmosphereMode } from '@/contexts/ThemeContext';

const THEMES: { id: ThemeMode; name: string; description: string }[] = [
  { id: 'void-protocol', name: 'Void Protocol', description: 'Deep space with electric purple & warm gold' },
  { id: 'daylight', name: 'Daylight', description: 'Warm light mode with muted accents' },
  { id: 'slate', name: 'Slate', description: 'Neutral gray, cooler feel' },
  { id: 'custom', name: 'Custom', description: 'Full control over all tokens' },
];

const DENSITIES: { id: DensityMode; name: string }[] = [
  { id: 'spacious', name: 'Spacious' },
  { id: 'adaptive', name: 'Adaptive' },
  { id: 'dense', name: 'Dense' },
];

const ATMOSPHERES: { id: AtmosphereMode; name: string }[] = [
  { id: 'full', name: 'Full' },
  { id: 'minimal', name: 'Minimal' },
  { id: 'none', name: 'None' },
];

export function AppearanceSettings() {
  const { theme, density, atmosphere, setTheme, setDensity, setAtmosphere } = useTheme();

  return (
    <div className="flex flex-col" style={{ gap: 'var(--density-gap)', padding: 'var(--density-card-padding)' }}>
      {/* Theme Selector */}
      <section>
        <h3 className="text-heading-3" style={{ marginBottom: '12px' }}>Theme</h3>
        <div className="grid grid-cols-2 gap-3" style={{ maxWidth: '500px' }}>
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className="text-left rounded-lg p-4 transition-all cursor-pointer"
              style={{
                backgroundColor: theme === t.id
                  ? 'color-mix(in oklch, var(--color-purple-500) 10%, transparent)'
                  : 'var(--color-void-raised)',
                borderColor: theme === t.id ? 'var(--color-border-purple)' : 'var(--color-border-subtle)',
                border: '1px solid',
                boxShadow: theme === t.id ? '0 0 20px var(--color-purple-glow)' : 'none',
              }}
            >
              <div className="text-heading-4">{t.name}</div>
              <div className="text-caption" style={{ color: 'var(--color-text-muted)' }}>{t.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Density Control */}
      <section>
        <h3 className="text-heading-3" style={{ marginBottom: '12px' }}>Density</h3>
        <SegmentedControl
          options={DENSITIES}
          value={density}
          onChange={(v) => setDensity(v as DensityMode)}
        />
      </section>

      {/* Atmosphere Control */}
      <section>
        <h3 className="text-heading-3" style={{ marginBottom: '12px' }}>Atmosphere</h3>
        <SegmentedControl
          options={ATMOSPHERES}
          value={atmosphere}
          onChange={(v) => setAtmosphere(v as AtmosphereMode)}
        />
        <p className="text-caption" style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>
          Automatically set to None when your system requests reduced motion.
        </p>
      </section>
    </div>
  );
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; name: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg p-1"
      style={{ backgroundColor: 'var(--color-void-raised)', border: '1px solid var(--color-border-subtle)' }}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className="px-4 py-1.5 rounded-md text-sm font-medium transition-all cursor-pointer"
          style={{
            backgroundColor: value === opt.id ? 'var(--color-purple-500)' : 'transparent',
            color: value === opt.id ? 'var(--color-text-on-purple)' : 'var(--color-text-secondary)',
            boxShadow: value === opt.id ? '0 0 12px var(--color-purple-glow)' : 'none',
          }}
        >
          {opt.name}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/settings/AppearanceSettings.tsx
git commit -m "feat: create AppearanceSettings component with theme/density/atmosphere controls"
```

---

### Task 16: Wire Appearance Tab into Settings

**Files:**
- Modify: `src/components/Settings.tsx` (or wherever the settings tabs are defined)

- [ ] **Step 1: Read current Settings component**

Read: `src/components/Settings.tsx`

- [ ] **Step 2: Add Appearance tab**

Import `AppearanceSettings` and add it as the first tab in the settings view:

```tsx
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
```

Add to the tabs array/config:

```tsx
{ id: 'appearance', label: 'Appearance', icon: Paintbrush, component: <AppearanceSettings /> }
```

- [ ] **Step 3: Verify Settings → Appearance works**

Run: `npm run dev`, navigate to Settings → Appearance.
Expected: Theme selector cards, density segmented control, atmosphere segmented control all render. Clicking them changes the app appearance in real-time.

- [ ] **Step 4: Commit**

```bash
git add src/components/Settings.tsx
git commit -m "feat: add Appearance tab to Settings with theme, density, and atmosphere controls"
```

---

## Chunk 6: Custom Theme Editor & Remaining Spec Items

### Task 17: Add Custom Theme Editor Section

**Files:**
- Modify: `src/components/settings/AppearanceSettings.tsx`

- [ ] **Step 1: Add CustomThemeEditor component**

Below the `SegmentedControl`, add a `CustomThemeEditor` component that renders when `theme === 'custom'`:

```tsx
function CustomThemeEditor() {
  const { customColors, setCustomColors } = useTheme();

  const colorGroups = [
    {
      label: 'Backgrounds',
      tokens: [
        { key: 'voidDeep', label: 'Void Deep', default: 'oklch(0.05 0.02 285)' },
        { key: 'voidBase', label: 'Void Base', default: 'oklch(0.06 0.02 285)' },
        { key: 'voidRaised', label: 'Void Raised', default: 'oklch(0.10 0.02 285)' },
        { key: 'voidElevated', label: 'Void Elevated', default: 'oklch(0.14 0.025 288)' },
        { key: 'voidOverlay', label: 'Void Overlay', default: 'oklch(0.18 0.02 285)' },
      ],
    },
    {
      label: 'Primary',
      tokens: [
        { key: 'purple400', label: 'Purple 400', default: 'oklch(0.72 0.22 292)' },
        { key: 'purple500', label: 'Purple 500', default: 'oklch(0.62 0.28 292)' },
        { key: 'purple600', label: 'Purple 600', default: 'oklch(0.52 0.26 292)' },
      ],
    },
    {
      label: 'Accent',
      tokens: [
        { key: 'gold300', label: 'Gold 300', default: 'oklch(0.85 0.12 80)' },
        { key: 'gold400', label: 'Gold 400', default: 'oklch(0.78 0.15 80)' },
        { key: 'gold500', label: 'Gold 500', default: 'oklch(0.70 0.17 75)' },
      ],
    },
    {
      label: 'Text',
      tokens: [
        { key: 'textPrimary', label: 'Primary', default: 'oklch(0.93 0.01 285)' },
        { key: 'textSecondary', label: 'Secondary', default: 'oklch(0.70 0.02 285)' },
        { key: 'textMuted', label: 'Muted', default: 'oklch(0.50 0.02 285)' },
      ],
    },
    {
      label: 'Semantic',
      tokens: [
        { key: 'success', label: 'Success', default: 'oklch(0.72 0.20 155)' },
        { key: 'warning', label: 'Warning', default: 'oklch(0.78 0.18 60)' },
        { key: 'error', label: 'Error', default: 'oklch(0.65 0.22 25)' },
        { key: 'info', label: 'Info', default: 'oklch(0.65 0.15 250)' },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {colorGroups.map((group) => (
        <details key={group.label}>
          <summary className="text-label cursor-pointer" style={{ color: 'var(--color-gold-300)' }}>
            {group.label}
          </summary>
          <div className="grid grid-cols-2 gap-2 mt-2 pl-4">
            {group.tokens.map((token) => (
              <label key={token.key} className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColors[token.key as keyof typeof customColors] || '#6b21a8'}
                  onChange={(e) => setCustomColors({ [token.key]: e.target.value })}
                  className="w-8 h-8 rounded border cursor-pointer"
                  style={{ borderColor: 'var(--color-border-subtle)' }}
                />
                <span className="text-caption" style={{ color: 'var(--color-text-secondary)' }}>
                  {token.label}
                </span>
              </label>
            ))}
          </div>
        </details>
      ))}

      <div className="flex gap-2 mt-4">
        <button
          className="text-sm px-3 py-1.5 rounded-md"
          style={{
            backgroundColor: 'var(--color-void-raised)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-subtle)',
          }}
          onClick={() => {
            const json = JSON.stringify(customColors, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'runecode-theme.json';
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Export JSON
        </button>
        <label
          className="text-sm px-3 py-1.5 rounded-md cursor-pointer"
          style={{
            backgroundColor: 'var(--color-void-raised)',
            color: 'var(--color-text-secondary)',
            border: '1px solid var(--color-border-subtle)',
          }}
        >
          Import Theme
          <input
            type="file"
            accept=".json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const text = await file.text();
              const colors = JSON.parse(text);
              setCustomColors(colors);
            }}
          />
        </label>
        <button
          className="text-sm px-3 py-1.5 rounded-md"
          style={{
            backgroundColor: 'transparent',
            color: 'var(--color-error)',
            border: '1px solid color-mix(in oklch, var(--color-error) 30%, transparent)',
          }}
          onClick={() => setCustomColors({})}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into AppearanceSettings**

Add after the Atmosphere section, conditionally rendered:

```tsx
{theme === 'custom' && (
  <section>
    <h3 className="text-heading-3" style={{ marginBottom: '12px' }}>Custom Theme Editor</h3>
    <CustomThemeEditor />
  </section>
)}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/settings/AppearanceSettings.tsx
git commit -m "feat: add Custom Theme Editor with color pickers, import/export, and reset"
```

---

### Task 18: Add Medium Breakpoint Responsive Rule

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Add --bp-md responsive rule**

Add after the `max-width: 767px` rule in Task 3's CSS:

```css
@media (min-width: 768px) and (max-width: 1023px) {
  html:not([data-sidebar-override]) {
    --density-sidebar: var(--density-sidebar-compact);
  }
}
```

This auto-collapses the sidebar to compact mode between 768-1024px. The `data-sidebar-override` attribute allows the user to manually expand (via Ctrl/Cmd+B), overriding the auto-collapse.

- [ ] **Step 2: Update macOS window styling**

Find the `html.is-macos body` rule and update the box-shadow border color:

```css
html.is-macos body {
  box-shadow: inset 0 0 0 1px var(--color-border-subtle);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add medium breakpoint auto-compact sidebar and update macOS styling"
```

---

## Chunk 7: Integration Testing & Polish

### Task 19: Update Markdown Editor Theme

**Files:**
- Modify: `src/styles.css` (markdown editor styles, around lines 557-631)

- [ ] **Step 1: Update MD editor CSS variables**

Replace hardcoded color values in the `.w-md-editor` and related selectors with new tokens:
- Background: `var(--color-void-raised)`
- Text: `var(--color-text-primary)`
- Borders: `var(--color-border-subtle)`
- Code highlighting: use `--color-purple-400` for keywords, `--color-gold-400` for strings, `--color-success` for comments

- [ ] **Step 2: Commit**

```bash
git add src/styles.css
git commit -m "feat: update Markdown editor theme with Void Protocol tokens"
```

---

### Task 20: Update Body and Root Styles

**Files:**
- Modify: `src/styles.css` (lines 1-40, body/root styles)

- [ ] **Step 1: Update root element styles**

Ensure `body` background uses the token:

```css
body {
  background-color: var(--color-void-base);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

Update the `html` root default `font-family` to `var(--font-sans)`.

- [ ] **Step 2: Verify the app root renders cleanly**

Run: `npm run dev`
Expected: Entire app uses Geist as body font, Void Protocol background, no flashes of old theme.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: update root body styles with Void Protocol defaults"
```

---

### Task 21: Full Visual Verification

**Files:** None (testing only)

- [ ] **Step 1: Verify Void Protocol theme**

Open app → check: deep void background, purple buttons/links, gold accents, Instrument Sans headings, Geist body, JetBrains Mono in code blocks.

- [ ] **Step 2: Verify Daylight theme**

Settings → Appearance → Daylight. Check: light background, darker purple, readable text, no contrast issues.

- [ ] **Step 3: Verify Slate theme**

Settings → Appearance → Slate. Check: neutral gray backgrounds, purple accents still visible, no hue tint in backgrounds.

- [ ] **Step 4: Verify density switching**

Toggle between Spacious/Adaptive/Dense. Check: sidebar width changes, card padding changes, gap changes.

- [ ] **Step 5: Verify atmosphere switching**

Toggle between Full/Minimal/None. Check: grain appears/disappears, mesh orbs appear/disappear, glass blur toggles, glows toggle.

- [ ] **Step 6: Verify responsive behavior**

Resize window below 1024px → sidebar should auto-compact. Below 768px → sidebar should hide.

- [ ] **Step 7: Verify keyboard focus**

Tab through interactive elements. Check: purple glow ring appears on focus-visible, no broken focus states.

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete Void Protocol design system implementation"
```
