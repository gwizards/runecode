/**
 * AppProviders — nests all top-level React context providers so App.tsx
 * stays concise.
 */

import React from "react";
import { OutputCacheProvider } from "@/lib/outputCache";
import { TabProvider } from "@/contexts/TabContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { IntegrationProvider } from "@/integrations/IntegrationProvider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <IntegrationProvider>
        <OutputCacheProvider>
          <TabProvider>
            {children}
          </TabProvider>
        </OutputCacheProvider>
      </IntegrationProvider>
    </ThemeProvider>
  );
}
