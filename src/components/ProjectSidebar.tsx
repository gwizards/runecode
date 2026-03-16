import { Component, type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  PanelRightClose,
  PanelRightOpen,
  FolderGit2,
  GitBranch,
  BarChart3,
  Cpu,
  Sparkles,
  ChevronsRight,
  ChevronsLeft,
} from "lucide-react";
import { Bot, Server, Package } from "lucide-react";
import { RuneCodeLogo } from "./RuneCodeLogo";
import { ProjectInfoSection } from "./sidebar/ProjectInfoSection";
import { LiveContextSection } from "./sidebar/LiveContextSection";
import { SkillsCatalogSection } from "./sidebar/SkillsCatalogSection";
import { UsageStatsSection } from "./sidebar/UsageStatsSection";
import { MCPServersSection } from "./sidebar/MCPServersSection";
import { AgentsSection } from "./sidebar/AgentsSection";
import { PluginsSection } from "./sidebar/PluginsSection";
import { ResourcesSection } from "../integrations/compute/ResourcesSection";
import { SecurityWarning } from "../integrations/security/SecurityWarning";
import { useEnvScanner } from "../integrations/security/useEnvScanner";
import { useSessionStore } from "../stores/sessionStore";

const LS_KEY_WIDTH = "runecode-sidebar-width";
const LS_KEY_OPEN = "runecode-sidebar-open";
const LS_KEY_COMPACT = "runecode-sidebar-compact";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const COMPACT_WIDTH = 48;
const AUTO_COLLAPSE_BREAKPOINT = 1024;

interface ProjectSidebarProps {
  projectPath?: string;
}

function SectionDivider() {
  return <div className="border-t border-border/30 my-2 mx-3" />;
}

interface CompactIconProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
}

function CompactIcon({ icon, label, onClick, isActive }: CompactIconProps) {
  return (
    <button
      onClick={onClick}
      title={label}
      className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
      style={{
        color: isActive ? 'var(--color-purple-400)' : 'var(--color-text-secondary)',
        backgroundColor: isActive
          ? 'color-mix(in oklch, var(--color-purple-500) 10%, transparent)'
          : undefined,
        boxShadow: isActive ? '0 0 12px var(--color-purple-glow)' : undefined,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = 'var(--color-void-elevated)';
          e.currentTarget.style.color = 'var(--color-text-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = '';
          e.currentTarget.style.color = 'var(--color-text-secondary)';
        }
      }}
    >
      {icon}
    </button>
  );
}

class SectionErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.debug('[Sidebar] Section error caught:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

export function ProjectSidebar({
  projectPath = "",
}: ProjectSidebarProps) {
  const activeSkills = useSessionStore((state) => state.activeSkills);
  const envScan = useEnvScanner(projectPath);
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_OPEN);
      if (stored !== null) return stored === "true";
    } catch {}
    return window.innerWidth >= AUTO_COLLAPSE_BREAKPOINT;
  });

  const [compactMode, setCompactMode] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_COMPACT);
      if (stored !== null) return stored === "true";
    } catch {}
    return false;
  });

  const [width, setWidth] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_WIDTH);
      if (stored !== null) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed >= MIN_WIDTH && parsed <= MAX_WIDTH) {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_WIDTH;
  });

  // Section refs for scrolling
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSidebar = useCallback(() => setIsOpen((prev) => !prev), []);
  const toggleCompact = useCallback(() => setCompactMode((prev) => !prev), []);

  const widthRef = useRef(width);
  const isResizingRef = useRef(false);

  // Sync widthRef with state
  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  // Persist open state
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_OPEN, String(isOpen));
    } catch {}
  }, [isOpen]);

  // Persist compact state
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_COMPACT, String(compactMode));
    } catch {}
  }, [compactMode]);

  // Persist width
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_WIDTH, String(width));
    } catch {}
  }, [width]);

  // Keyboard shortcut: Ctrl+B / Cmd+B to toggle sidebar
  // Keyboard shortcut: Ctrl+Shift+B / Cmd+Shift+B to toggle compact mode
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'B' && e.shiftKey) {
        e.preventDefault();
        if (isOpen) {
          toggleCompact();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar, toggleCompact, isOpen]);

  // Auto-collapse on narrow windows
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < AUTO_COLLAPSE_BREAKPOINT) {
        setIsOpen(false);
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Resize drag handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isResizingRef.current = true;
      const startX = e.clientX;
      const startWidth = widthRef.current;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingRef.current) return;
        // Sidebar is on the right, so dragging left increases width
        const delta = startX - moveEvent.clientX;
        const newWidth = Math.min(
          MAX_WIDTH,
          Math.max(MIN_WIDTH, startWidth + delta)
        );
        widthRef.current = newWidth;
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        isResizingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    []
  );

  // Handle compact icon click: expand to full mode and scroll to section
  const handleCompactIconClick = useCallback((sectionKey: string) => {
    setCompactMode(false);
    // Scroll to section after expanding
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = sectionRefs.current[sectionKey];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }, 250); // wait for expand animation
    });
  }, []);

  const compactIcons = [
    { key: "project", icon: <FolderGit2 className="h-5 w-5" />, label: "Project Info" },
    { key: "context", icon: <GitBranch className="h-5 w-5" />, label: "Live Context" },
    { key: "usage", icon: <BarChart3 className="h-5 w-5" />, label: "Usage Stats" },
    { key: "resources", icon: <Cpu className="h-5 w-5" />, label: "Resources" },
    { key: "agents", icon: <Bot className="h-5 w-5" />, label: "Agents" },
    { key: "mcp", icon: <Server className="h-5 w-5" />, label: "MCP Servers" },
    { key: "plugins", icon: <Package className="h-5 w-5" />, label: "Plugins" },
    { key: "skills", icon: <Sparkles className="h-5 w-5" />, label: "Skills" },
  ];

  return (
    <div className="relative flex-shrink-0 flex">
      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        style={
          isOpen ? undefined : { right: "auto", left: "-36px", position: "absolute" }
        }
        title={isOpen ? "Close sidebar (Ctrl+B)" : "Open sidebar (Ctrl+B)"}
      >
        {isOpen ? (
          <PanelRightClose className="h-4 w-4" />
        ) : (
          <PanelRightOpen className="h-4 w-4" />
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: compactMode ? COMPACT_WIDTH : width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full overflow-hidden flex flex-col"
            style={{
              backgroundColor: 'var(--color-void-deep)',
              borderRight: '1px solid var(--color-border-subtle)',
            }}
          >
            {/* Compact icon-strip mode */}
            {compactMode ? (
              <div className="flex flex-col items-center h-full py-2">
                {/* Logo */}
                <div className="mb-3 pb-2 border-b border-border/30 w-full flex justify-center">
                  <RuneCodeLogo size={20} />
                </div>

                {/* Section icons */}
                <div className="flex-1 flex flex-col items-center gap-1">
                  {compactIcons.map((item) => (
                    <CompactIcon
                      key={item.key}
                      icon={item.icon}
                      label={item.label}
                      onClick={() => handleCompactIconClick(item.key)}
                    />
                  ))}
                </div>

                {/* Expand arrow at bottom */}
                <button
                  onClick={toggleCompact}
                  title="Expand sidebar (Ctrl+Shift+B)"
                  className="mt-auto p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <>
                {/* Resize handle */}
                <div
                  onMouseDown={handleMouseDown}
                  className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 transition-colors z-20"
                />

                {/* Header */}
                <div className="px-4 py-3 border-b border-border/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RuneCodeLogo size={18} />
                    <span className="text-sm font-semibold tracking-tight text-foreground/90">
                      RuneCode
                    </span>
                  </div>
                  {/* Compact mode toggle */}
                  <button
                    onClick={toggleCompact}
                    title="Compact sidebar (Ctrl+Shift+B)"
                    className="p-1 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronsRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Sections */}
                <div className="flex-1 overflow-y-auto scrollbar-thin">
                  {/* 1. Project Info -- always visible, compact */}
                  <div ref={(el) => { sectionRefs.current["project"] = el; }}>
                    <SectionErrorBoundary>
                      <ProjectInfoSection projectPath={projectPath} />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 2. Live Context */}
                  <div ref={(el) => { sectionRefs.current["context"] = el; }}>
                    <SectionErrorBoundary>
                      <LiveContextSection
                        projectPath={projectPath}
                        envFilesDetected={envScan.envFiles}
                      />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 3. Usage Stats -- expanded by default */}
                  <div ref={(el) => { sectionRefs.current["usage"] = el; }}>
                    <SectionErrorBoundary>
                      <UsageStatsSection projectPath={projectPath} />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 4. Resources -- compact */}
                  <div ref={(el) => { sectionRefs.current["resources"] = el; }}>
                    <SectionErrorBoundary>
                      <ResourcesSection />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 5. Agents */}
                  <div ref={(el) => { sectionRefs.current["agents"] = el; }}>
                    <SectionErrorBoundary>
                      <AgentsSection />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 6. MCP Servers */}
                  <div ref={(el) => { sectionRefs.current["mcp"] = el; }}>
                    <SectionErrorBoundary>
                      <MCPServersSection />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 7. Plugins */}
                  <div ref={(el) => { sectionRefs.current["plugins"] = el; }}>
                    <SectionErrorBoundary>
                      <PluginsSection />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* 8. Skills -- flat searchable list */}
                  <div ref={(el) => { sectionRefs.current["skills"] = el; }}>
                    <SectionErrorBoundary>
                      <SkillsCatalogSection activeSkills={activeSkills} />
                    </SectionErrorBoundary>
                  </div>
                </div>

                {/* Security warning (side-effect only, renders nothing) */}
                <SecurityWarning hasEnvFiles={envScan.hasEnvFiles} envFiles={envScan.envFiles} />
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
