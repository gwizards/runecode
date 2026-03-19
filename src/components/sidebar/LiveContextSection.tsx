import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ChevronDown,
  ChevronRight,
  Shield,
} from "lucide-react";

interface LiveContextSectionProps {
  projectPath?: string;
  envFilesDetected?: string[];
}

export function LiveContextSection({
  envFilesDetected,
}: LiveContextSectionProps) {
  const [collapsed, setCollapsed] = useState(true);

  const hasEnvWarning = envFilesDetected && envFilesDetected.length > 0;

  // If no env files detected, don't render the section at all
  if (!hasEnvWarning) return null;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded transition-colors sidebar-item"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
        <h3 className="text-overline" style={{ color: 'var(--color-gold-300)' }}>
          Context
        </h3>
        <span className="ml-auto flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full opacity-75 sidebar-notification-dot" />
          <span className="relative inline-flex rounded-full h-2 w-2 sidebar-notification-dot" />
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="py-1.5 space-y-1.5">
              {/* Env files warning — compact */}
              <div className="flex items-center gap-1.5 text-[11px] text-yellow-400">
                <Shield className="h-3 w-3 flex-shrink-0" />
                <span className="font-medium">
                  {envFilesDetected!.length} .env file{envFilesDetected!.length > 1 ? "s" : ""} detected
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
