# RuneCode Partner Integrations & Dependency Upgrade Design Spec

## Summary

Integrate four "Opinionated Architectural Default" partner services into RuneCode — Compute (Railway/DigitalOcean), Security (Infisical), Intelligence (Unified LLM Gateway), and Observability (Helicone). Simultaneously upgrade the frontend stack to React 19.1, replace heavy dependencies, and add React Query for data fetching. All integrations surface as "Recommended" or "Powered by" — never as advertisements.

## Dependency Upgrades (Phase 0)

### Upgrades

| Package | Current | Target | Notes |
|---------|---------|--------|-------|
| `react` | 18.3.1 | 19.1 | Server Components, Actions, `use()`, `useOptimistic` |
| `react-dom` | 18.3.1 | 19.1 | |
| `@types/react` | 18.3.1 | 19.x | |
| `@types/react-dom` | 18.3.1 | 19.x | |
| `typescript` | 5.6.2 | 5.8 | |
| `vite` | 6.0.3 | 6.3+ | Performance improvements |
| `@vitejs/plugin-react` | 4.3.4 | 4.5+ | React 19 support |
| `lucide-react` | 0.468.0 | latest | |
| `zustand` | 5.0.6 | latest | |
| `recharts` | 2.14.1 | latest | |
| `posthog-js` | 1.258.3 | latest | |
| All `@radix-ui/*` | various | latest | React 19 compatible versions |
| `@tanstack/react-virtual` | 3.13.10 | latest | |

### Replacements

| Remove | Add | Savings |
|--------|-----|---------|
| `framer-motion` 12.0.0-alpha.1 | `motion` (stable) | Tree-shakeable, stable, smaller |
| `react-syntax-highlighter` 15.6.1 | `shiki` | ~636KB → ~50KB base (lazy per-language) |
| `@radix-ui/react-toast` | `sonner` | 8KB, better UX for partner alerts |

### Additions

| Package | Purpose |
|---------|---------|
| `@tanstack/react-query` | Data fetching for sidebar, resource monitor, integrations API calls. Replaces manual useEffect+fetch patterns with caching, refetching, error/retry. |
| `sonner` | Toast notifications for partner warnings (security, resource alerts, cost limits) |

### Removals

| Package | Reason |
|---------|--------|
| `html2canvas` | 200KB+, verify usage — remove or replace with lighter alternative |

### React 19 Migration Notes

- `forwardRef` removed — audit all components, convert to ref-as-prop pattern
- `useContext` → `use(Context)` available (optional migration)
- Latest Radix UI versions required for React 19 compatibility
- `motion` package is near drop-in replacement for `framer-motion` with different import paths (`from 'motion/react'` instead of `from 'framer-motion'`)
- Shiki migration touches `StreamMessage.tsx` and all code block rendering — significant but contained to the rendering layer

## Integration Architecture

### Core Pattern

Every partner integration follows the same structure:

```
IntegrationProvider (context)
├── Detector — monitors a condition (CPU high, .env present, no API key)
├── Surface — where the recommendation appears (toast, sidebar, settings)
└── Config — user preferences (.runecode/integrations.json)
```

### File Structure

```
src/integrations/
├── types.ts                    — shared Integration interface
├── IntegrationProvider.tsx     — context provider, manages all integration state
├── config.ts                   — affiliate URLs, feature flags
├── compute/
│   ├── ResourceMonitor.tsx     — CPU/RAM polling via React Query
│   ├── CloudEjectButton.tsx    — "Eject to Cloud" UI
│   └── ResourcesSection.tsx    — sidebar resource bars
├── security/
│   ├── useEnvScanner.ts        — .env detection hook
│   └── SecurityWarning.tsx     — styled warning component
├── intelligence/
│   └── GatewayRecommendation.tsx — model settings integration
├── observability/
│   ├── HeliconeToggle.tsx      — cost guard toggle in bottom bar
│   └── CostCounter.tsx         — live session cost display
└── hooks/
    └── useIntegrationConfig.ts — read/write .runecode/integrations.json
```

### Configuration

**`src/integrations/config.ts`** — centralized affiliate URLs:

```typescript
export const INTEGRATIONS = {
  compute: {
    railway: { url: 'https://railway.app?referralCode=RUNECODE', name: 'Railway' },
    digitalocean: { url: 'https://m.do.co/c/RUNECODE', name: 'DigitalOcean', credit: '$200' },
  },
  security: {
    infisical: { url: 'https://infisical.com?ref=runecode', name: 'Infisical' },
  },
  intelligence: {
    gateway: { url: 'https://aimlapi.com?ref=runecode', name: 'AI/ML API' },
  },
  observability: {
    helicone: { url: 'https://helicone.ai?ref=runecode', name: 'Helicone' },
  },
} as const;
```

**`.runecode/integrations.json`** — per-project user state:

```json
{
  "compute": {
    "dismissed": false,
    "provider": "railway",
    "thresholdCpu": 80,
    "thresholdRam": 85,
    "cooldownMinutes": 60
  },
  "security": {
    "dismissed": false,
    "scanEnabled": true
  },
  "intelligence": {
    "dismissed": false,
    "gatewayKey": ""
  },
  "observability": {
    "dismissed": false,
    "heliconeKey": "",
    "costLimit": 5.0,
    "showCounter": true
  }
}
```

### UX Golden Rules

- The words "affiliate", "sponsored", or "partner" never appear in the UI
- Only use "Recommended" or "Powered by"
- Every integration can be permanently dismissed — users never feel nagged
- Once dismissed, it never resurfaces unless re-enabled in Settings
- All integrations are off/passive by default until triggered by a real condition

## Feature 1: Compute — Resource Monitor + Cloud Eject

### Resource Monitoring

**Backend — `src-tauri/src/commands/resources.rs`:**
- Uses `sysinfo` crate (cross-platform CPU/RAM/process monitoring)
- Add `sysinfo = "0.33"` to `src-tauri/Cargo.toml`
- Polls every 5 seconds via Tauri command
- Tracks: CPU usage %, RAM usage %, Docker container stats (via `docker stats --no-stream --format json` command)
- New Tauri IPC command: `get_system_resources` → returns `{ cpu_percent, ram_percent, ram_used_gb, ram_total_gb, containers: [{ name, cpu, mem }] }`
- New web endpoint: `GET /api/resources`
- Tauri event: `resource-alert` — emitted when thresholds exceeded for 30+ seconds sustained

**Frontend — React Query polling:**
```typescript
const { data: resources } = useQuery({
  queryKey: ['resources'],
  queryFn: fetchResources,
  refetchInterval: 5000,
});
```

### Trigger Conditions

- CPU sustained > 80% for 30+ seconds
- RAM usage > 85%
- Any Docker container using > 4GB RAM

### UI Surfaces

**1. Sidebar — Resources section (`ResourcesSection.tsx`):**
- Small CPU/RAM bars with live percentages
- Glassmorphic styling, minimal
- Shows container count if Docker is running
- Added to `ProjectSidebar.tsx` between Session Stats and Skills sections

**2. Toast notification (triggered by threshold):**
- Sonner toast with rune-glow styling
- Text: "Heavy workload detected. Eject to Railway for faster execution."
- Buttons: "Eject to Cloud" (opens affiliate link), "Dismiss"
- Dismissing suppresses for the configured cooldown period (default 1 hour)
- "Don't show again" option persists to `.runecode/integrations.json`

**3. Settings — Compute section:**
- "Cloud Provider" dropdown: Railway (default, recommended), DigitalOcean
- Threshold sliders: CPU % (default 80), RAM % (default 85)
- Cooldown period input
- DigitalOcean: "Claim $200 free credits" link

### Components

- New: `src/integrations/compute/ResourceMonitor.tsx` — React Query hook + threshold detection
- New: `src/integrations/compute/ResourcesSection.tsx` — sidebar CPU/RAM bars
- New: `src/integrations/compute/CloudEjectButton.tsx` — toast trigger + affiliate link
- New: `src-tauri/src/commands/resources.rs` — sysinfo-based system monitoring
- Modified: `src/components/ProjectSidebar.tsx` — add Resources section
- Modified: `src/components/Settings.tsx` — add Compute settings section
- Modified: `src-tauri/Cargo.toml` — add `sysinfo` dependency

## Feature 2: Security — .env Scanner + Infisical Warning

### Detection Logic

- On project load, scan project root for: `.env`, `.env.local`, `.env.production`, `.env.development`
- Shallow scan first 100 lines of `.js`, `.ts`, `.py`, `.rs` files (max 20 files) for patterns: `API_KEY=sk-...`, `SECRET=...`, `PASSWORD=...`
- Re-scan when Write/Edit tool calls modify matching files
- Detection runs client-side from project file tree and session tool call history — no new backend endpoint needed

### UI Surfaces

**1. Sidebar — Live Context enhancement:**
- When `.env` files detected, show yellow shield icon with "Plaintext secrets detected"
- Subtle, matches existing warning style in `LiveContextSection.tsx`

**2. Toast on first detection (once per project, per session):**
- Sonner toast with amber/yellow styling
- Text: "Plaintext .env detected. For agentic safety, inject secrets securely via Infisical."
- Buttons: "Set up Infisical" (affiliate link), "Dismiss"
- "Don't show for this project" persists to `.runecode/integrations.json`

**3. Settings — Security section:**
- "Secrets Management" with Infisical recommendation
- Toggle: "Scan for plaintext secrets" (on by default)
- Infisical setup link with affiliate URL

### Components

- New: `src/integrations/security/useEnvScanner.ts` — detection hook
- New: `src/integrations/security/SecurityWarning.tsx` — toast component
- Modified: `src/components/sidebar/LiveContextSection.tsx` — add secrets warning
- Modified: `src/components/Settings.tsx` — add Security settings section

## Feature 3: Intelligence — Unified LLM Gateway

### Scope

Advisory only for custom agents and standalone API usage. Does NOT touch the core Claude Code connection.

### UI Surfaces

**1. Settings — Models section:**
- "Recommended" badge next to "Unified Gateway" option
- Description: "Access Claude, GPT, LLaMA, and DeepSeek with one API key. No vendor lock-in."
- "Set up" button opens affiliate link in external browser
- Manual API key input field for gateway key (stored in `.runecode/integrations.json`)
- Only appears in custom agent model configuration, not main Claude Code settings

**2. Agent creation flow:**
- In `CreateAgent.tsx`, when configuring model selection, show subtle note:
- "Need multi-model access? Use a unified gateway (Recommended)"
- One-line link, not a modal or popup

### Components

- New: `src/integrations/intelligence/GatewayRecommendation.tsx` — recommendation UI
- Modified: `src/components/Settings.tsx` — add Models/Gateway settings
- Modified: `src/components/CreateAgent.tsx` — add gateway note in model selection

## Feature 4: Observability — Helicone Cost Guard

### UI Surfaces

**1. Bottom bar — Cost Guard toggle (`HeliconeToggle.tsx`):**
- Small, clean toggle in the bottom-right of the app near prompt input
- Unconfigured: dimmed with "Set up" link
- Configured: active, shows live cost counter (e.g., "$0.42 this session")
- "Set up" opens affiliate link to generate Helicone API key

**2. Settings — Observability section:**
- "Cost Guard powered by Helicone"
- API key input field
- Toggle: "Show cost counter in session" (on by default when key configured)
- Toggle: "Cost limit alert" with threshold input (default $5)
- "View full dashboard on Helicone" link

**3. Cost limit toast:**
- When session cost exceeds configured threshold, fire sonner toast
- Text: "Session cost reached $5.00. View breakdown on Helicone."
- Buttons: "Open Dashboard" (Helicone link), "Increase Limit", "Dismiss"

### Data Flow

- If Helicone API key configured, RuneCode POSTs token usage data to Helicone's ingest API after each Claude response
- Fire-and-forget async call — never blocks the session
- Payload: token counts (input/output), model name, timestamp, session ID
- Cost estimated client-side from token counts using known model pricing (already tracked in SessionStatsSection)

### Components

- New: `src/integrations/observability/HeliconeToggle.tsx` — bottom bar toggle + cost counter
- New: `src/integrations/observability/CostCounter.tsx` — live cost display
- New: `src-tauri/src/commands/helicone.rs` — async POST to Helicone API (non-blocking)
- Modified: `src/components/FloatingPromptInput.tsx` — integrate cost guard toggle near prompt
- Modified: `src/components/Settings.tsx` — add Observability settings section
- Modified: `src-tauri/Cargo.toml` — add `reqwest` if not already present for HTTP client

## Implementation Phases

**Phase 0 — Dependency Upgrades:**
React 19.1 migration, framer-motion → motion, react-syntax-highlighter → shiki, add React Query + sonner, remove html2canvas, update all Radix UI packages. Fix all forwardRef usages. Verify build.

**Phase 1 — Integration Foundation:**
Create `src/integrations/` directory structure, `types.ts`, `config.ts`, `IntegrationProvider.tsx`, `useIntegrationConfig.ts` hook. Add `.runecode/integrations.json` read/write support to backend. Add integration settings sections to `Settings.tsx`.

**Phase 2 — Compute (Resource Monitor):**
Add `sysinfo` to Rust backend, create `resources.rs` command, implement `ResourceMonitor` + `ResourcesSection` + `CloudEjectButton`. Wire into sidebar and toast system.

**Phase 3 — Security (.env Scanner):**
Implement `useEnvScanner` hook, `SecurityWarning` toast, enhance `LiveContextSection` with secrets detection.

**Phase 4 — Intelligence (Gateway):**
Implement `GatewayRecommendation` component, add to Settings models section and CreateAgent flow.

**Phase 5 — Observability (Helicone):**
Implement `HeliconeToggle`, `CostCounter`, Helicone API integration in Rust backend. Wire into bottom bar and toast system.

## New Files

| File | Purpose |
|------|---------|
| `src/integrations/types.ts` | Shared integration interfaces |
| `src/integrations/config.ts` | Affiliate URLs, constants |
| `src/integrations/IntegrationProvider.tsx` | Context provider for integration state |
| `src/integrations/hooks/useIntegrationConfig.ts` | Read/write .runecode/integrations.json |
| `src/integrations/compute/ResourceMonitor.tsx` | System resource polling hook |
| `src/integrations/compute/ResourcesSection.tsx` | Sidebar CPU/RAM display |
| `src/integrations/compute/CloudEjectButton.tsx` | Cloud eject toast + link |
| `src/integrations/security/useEnvScanner.ts` | .env + secret detection |
| `src/integrations/security/SecurityWarning.tsx` | Security warning toast |
| `src/integrations/intelligence/GatewayRecommendation.tsx` | Gateway recommendation UI |
| `src/integrations/observability/HeliconeToggle.tsx` | Cost guard toggle |
| `src/integrations/observability/CostCounter.tsx` | Live cost counter |
| `src-tauri/src/commands/resources.rs` | System resource monitoring |
| `src-tauri/src/commands/helicone.rs` | Helicone API integration |

## Modified Files

| File | Changes |
|------|---------|
| `package.json` | Dependency upgrades |
| `src-tauri/Cargo.toml` | Add sysinfo, reqwest |
| `src/App.tsx` | Wrap with IntegrationProvider |
| `src/components/ProjectSidebar.tsx` | Add Resources section |
| `src/components/sidebar/LiveContextSection.tsx` | Add secrets warning |
| `src/components/Settings.tsx` | Add Compute, Security, Models, Observability sections |
| `src/components/FloatingPromptInput.tsx` | Integrate cost guard toggle |
| `src/components/CreateAgent.tsx` | Add gateway recommendation |
| `src/components/StreamMessage.tsx` | Migrate to shiki for code highlighting |
| All components using `framer-motion` | Migrate imports to `motion` |
| All components using `forwardRef` | Convert to ref-as-prop pattern |

## API Endpoints (New)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/resources` | GET | System CPU/RAM/container stats |
| `GET /api/integrations` | GET | Read .runecode/integrations.json |
| `POST /api/integrations` | POST | Write .runecode/integrations.json |

## Risks & Mitigations

- **React 19 migration breakage:** Radix UI and motion must be updated first. Run incremental: upgrade React → fix type errors → update Radix → update motion → verify build. Don't do all at once.
- **Shiki bundle size:** Use dynamic imports to load language grammars on demand. Base shiki is ~50KB, each language grammar is 5-50KB loaded lazily.
- **Resource monitor on macOS/Windows:** The `sysinfo` crate handles cross-platform differences. Docker detection may need platform-specific paths.
- **Affiliate link staleness:** All URLs centralized in `config.ts` — single file to update if referral codes change.
- **User trust:** The "Recommended" framing must feel genuine. Each integration solves a real problem the user has at the moment they have it. If the detection conditions don't match reality, the trust erodes.
