import { Component, type ReactNode, useState, useEffect, useRef, useCallback } from "react";
import { RuneCodeLogo } from "./RuneCodeLogo";
import { ProjectInfoSection } from "./sidebar/ProjectInfoSection";
import { LiveContextSection } from "./sidebar/LiveContextSection";
import { PlanUsagePanel } from "./sidebar/PlanUsagePanel";
import { EnvironmentSelector } from "./sidebar/EnvironmentSelector";
import { RecentFiles } from "./sidebar/RecentFiles";
import { SidebarBookmarks } from "./sidebar/SidebarBookmarks";
import { ResourcesSection } from "../integrations/compute/ResourcesSection";
import { DockerSection } from "../integrations/compute/DockerSection";
import { SecurityWarning } from "../integrations/security/SecurityWarning";
import { useEnvScanner } from "../integrations/security/useEnvScanner";

const LS_KEY_WIDTH = "runecode-sidebar-width";
const LS_KEY_OPEN = "runecode-sidebar-open";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const AUTO_COLLAPSE_BREAKPOINT = 1024;

interface ProjectSidebarProps {
  projectPath?: string;
}

function SectionDivider() {
  return <div className="border-t border-border/30 my-2 mx-3" />;
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
        {children}
      </span>
    </div>
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
  const envScan = useEnvScanner(projectPath);
  const [isOpen, setIsOpen] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY_OPEN);
      if (stored !== null) return stored === "true";
    } catch {}
    return window.innerWidth >= AUTO_COLLAPSE_BREAKPOINT;
  });

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

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

  // External toggle from header button: open ↔ close
  useEffect(() => {
    const handler = () => setIsOpen(prev => !prev);
    window.addEventListener('runecode:toggle-sidebar', handler);
    return () => window.removeEventListener('runecode:toggle-sidebar', handler);
  }, []);

  // Broadcast sidebar state so external components can read it
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('runecode:sidebar-state', { detail: { isOpen } }));
  }, [isOpen]);

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

  // Persist width
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY_WIDTH, String(width));
    } catch {}
  }, [width]);

  // Keyboard shortcut: Ctrl+B / Cmd+B to toggle sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleSidebar]);

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
  return (
    <div
      className="relative flex-shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-in-out"
      style={{ width: isOpen ? width : 0 }}
    >
      <div
        className="h-full flex flex-col"
        style={{
          width,
          backgroundColor: 'var(--color-void-deep)',
          borderLeft: isOpen ? '1px solid var(--color-border-subtle)' : 'none',
        }}
      >
              <div className="flex flex-col h-full overflow-hidden">
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
                  {/* Close sidebar */}
                </div>

                {/* Plan & Usage — always visible at top */}
                {/* Account selector — switch between Claude accounts */}
                <EnvironmentSelector />

                <PlanUsagePanel />

                {/* Sections */}
                <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">

                  {/* ═══════ PROJECT ═══════ */}
                  <GroupLabel>Project</GroupLabel>

                  <div ref={(el) => { sectionRefs.current["project"] = el; }}>
                    <SectionErrorBoundary>
                      <ProjectInfoSection projectPath={projectPath} />
                    </SectionErrorBoundary>
                  </div>

                  <div ref={(el) => { sectionRefs.current["context"] = el; }}>
                    <SectionErrorBoundary>
                      <LiveContextSection
                        projectPath={projectPath}
                        envFilesDetected={envScan.envFiles}
                      />
                    </SectionErrorBoundary>
                  </div>

                  <SectionDivider />

                  {/* ═══════ WORKSPACE ═══════ */}




                  <SectionDivider />

                  {/* ═══════ ACTIVITY ═══════ */}
                  <GroupLabel>Activity</GroupLabel>

                  <SectionErrorBoundary>
                    <RecentFiles projectPath={projectPath} />
                  </SectionErrorBoundary>

                  <SectionErrorBoundary>
                    <SidebarBookmarks />
                  </SectionErrorBoundary>

                  <SectionDivider />

                  {/* ═══════ SYSTEM ═══════ */}
                  <GroupLabel>System</GroupLabel>

                  <div ref={(el) => { sectionRefs.current["resources"] = el; }}>
                    <SectionErrorBoundary>
                      <ResourcesSection />
                    </SectionErrorBoundary>
                  </div>

                  <SectionErrorBoundary>
                    <DockerSection />
                  </SectionErrorBoundary>


                </div>

                {/* Security warning (side-effect only, renders nothing) */}
                <SecurityWarning hasEnvFiles={envScan.hasEnvFiles} envFiles={envScan.envFiles} />
              </div>
      </div>
    </div>
  );
}
