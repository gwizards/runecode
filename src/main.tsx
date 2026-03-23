// Initialize web mode BEFORE any other imports that may load Tauri APIs.
// ES module imports are hoisted, but side-effect imports run in order,
// so we do the mock setup synchronously here.
import { initializeWebMode } from "./lib/apiAdapter";
initializeWebMode();

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AnalyticsErrorBoundary } from "./components/AnalyticsErrorBoundary";
import { analytics } from "./infrastructure/analytics";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import "./assets/shimmer.css";
import "./styles.css";
import AppIcon from "./assets/nfo/asterisk-logo.png";

// Detect web mode: either no Tauri internals or mocked internals from apiAdapter
const tauriInternals = window.__TAURI_INTERNALS__;
const isWebMode = !tauriInternals || tauriInternals.__WEB_MODE_MOCK__;

// Wire the Tauri event listener port for the ruflo domain.
// Only injected when running inside Tauri — web/test environments get no-op behaviour.
//
// NOTE: The previous implementation used dynamic import('./domain/ruflo/store') which
// Vite warned about (INEFFECTIVE_DYNAMIC_IMPORT) because domain/ruflo/index.ts already
// statically re-exports store.ts, so the module is always eagerly bundled. We now
// import setRuFloEventListener statically from the barrel (it is already in the main
// chunk) and only lazy-load the Tauri infrastructure adapter, which IS a separate chunk.
import { setRuFloEventListener } from './domain/ruflo';

if (!isWebMode) {
  import('./infrastructure/ruflo/tauri-event-listener').then(({ tauriRuFloEventListener }) => {
    setRuFloEventListener(tauriRuFloEventListener);
  });
}

// Initialize analytics before rendering
analytics.initialize();

// Resource monitoring handled by ResourceMonitor.tsx sidebar hook

// Add a macOS-specific class to the <html> element to enable platform-specific styling
// Browser-safe detection using navigator properties (works in Tauri and web preview)
(() => {
  const isMacLike = typeof navigator !== "undefined" &&
    (navigator.platform?.toLowerCase().includes("mac") ||
      navigator.userAgent?.toLowerCase().includes("mac os x"));
  if (isMacLike) {
    document.documentElement.classList.add("is-macos");
  }
})();

// Set favicon to the new app icon (avoids needing /public)
(() => {
  try {
    const existing = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const link = existing ?? document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = AppIcon;
    if (!existing) {
      document.head.appendChild(link);
    }
  } catch (_) {
    // Non-fatal if document/head is not available
  }
})();

// Only use PostHogProvider when PostHog is properly initialized (not in web mode)
const posthogReady = !isWebMode && posthog.__loaded && posthog.config?.token;

const AppTree = (
  <ErrorBoundary>
    <AnalyticsErrorBoundary>
      <App />
    </AnalyticsErrorBoundary>
  </ErrorBoundary>
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {posthogReady ? (
      <PostHogProvider client={posthog}>
        {AppTree}
      </PostHogProvider>
    ) : (
      AppTree
    )}
  </React.StrictMode>,
);
