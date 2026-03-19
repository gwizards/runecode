import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, ChevronRight, TerminalSquare, Globe } from 'lucide-react';
import { useTabState } from '@/hooks/useTabState';

export function ActiveSessions() {
  const { tabs, activeTabId, switchToTab } = useTabState();
  const [collapsed, setCollapsed] = useState(false);

  // Filter to session-type tabs (terminal + chat)
  const sessionTabs = tabs.filter(t => t.type === 'claude-terminal' || t.type === 'chat');

  if (sessionTabs.length === 0) return null;

  const runningCount = sessionTabs.filter(t => t.status === 'running').length;

  return (
    <div className="px-3">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center gap-1.5 w-full text-left py-1 px-1 -mx-1 rounded hover:bg-muted/50 transition-colors"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Sessions</h3>
        <span className="ml-auto text-[9px] text-muted-foreground/50">
          {runningCount > 0 && <span className="text-emerald-400">{runningCount} active</span>}
          {runningCount === 0 && `${sessionTabs.length}`}
        </span>
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="py-1 space-y-0.5">
              {sessionTabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const isTerminal = tab.type === 'claude-terminal';
                const isRunning = tab.status === 'running';
                const Icon = isTerminal ? TerminalSquare : Globe;

                return (
                  <button
                    key={tab.id}
                    onClick={() => switchToTab(tab.id)}
                    className={`flex items-center gap-1.5 w-full text-left px-1 py-1 rounded transition-colors text-[11px] ${
                      isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
                    }`}
                  >
                    <Icon className={`h-3 w-3 flex-shrink-0 ${isTerminal ? 'text-amber-400/60' : 'text-blue-400/60'}`} />
                    <span className="truncate flex-1" style={{ color: isActive ? undefined : 'var(--color-text-secondary)' }}>
                      {tab.title}
                    </span>
                    {isRunning ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20 flex-shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
