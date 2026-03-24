/**
 * Application bootstrap logic — runs once on first render.
 * Wires infrastructure adapters into domain ports and fetches the
 * startup-intro preference.
 */

import { initStartupToken } from "@/lib/startupToken";
import { setUsagePersistencePort } from "@/domain/usage";
import { setRuFloDispatcher, setRuFloLocalPersistence } from "@/domain/ruflo";
import { createTauriUsagePersistenceAdapter } from "@/infrastructure/tauri/usage-client";
import { createBrowserEventsDispatcher } from "@/infrastructure/ruflo/browser-events-bridge";
import { createRuFloLocalPersistenceAdapter } from "@/infrastructure/persistence/ruflo-persistence";
import { api } from "@/lib/api";

/**
 * Initialise security tokens, domain-port wiring, and load the user's
 * startup-intro preference.
 *
 * Returns whether the startup intro should be shown.
 */
export async function bootstrapApp(): Promise<boolean> {
  // Fetch the startup secret token early so all subsequent HTTP calls
  // to the local embedded web server carry the X-Startup-Token header.
  await initStartupToken();

  // Wire infrastructure adapters into domain ports.
  // Must run before any domain store mutation or rehydration.
  setUsagePersistencePort(createTauriUsagePersistenceAdapter());
  setRuFloDispatcher(createBrowserEventsDispatcher());
  setRuFloLocalPersistence(createRuFloLocalPersistenceAdapter());

  try {
    const pref = await api.getSetting('startup_intro_enabled');
    const enabled = pref === null ? true : pref === 'true';
    return enabled;
  } catch {
    // On failure, show intro once to keep UX consistent
    return true;
  }
}
