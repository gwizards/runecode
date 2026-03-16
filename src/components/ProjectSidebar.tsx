import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { RuneCodeLogo } from "./RuneCodeLogo";
import { ProjectInfoSection } from "./sidebar/ProjectInfoSection";
import { LiveContextSection } from "./sidebar/LiveContextSection";
import { SkillsCatalogSection } from "./sidebar/SkillsCatalogSection";
import { UsageStatsSection } from "./sidebar/UsageStatsSection";
import { ResourcesSection } from "../integrations/compute/ResourcesSection";
import { SecurityWarning } from "../integrations/security/SecurityWarning";
import { useEnvScanner } from "../integrations/security/useEnvScanner";
import { useSessionStore } from "../stores/sessionStore";

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

  const toggleSidebar = useCallback(() => setIsOpen((prev) => !prev), []);

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
            animate={{ width, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="h-full border-l border-border/50 bg-background/80 backdrop-blur-sm overflow-hidden flex flex-col"
          >
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
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {/* 1. Project Info — always visible, compact */}
              <ProjectInfoSection projectPath={projectPath} />

              <SectionDivider />

              {/* 2. Live Context */}
              <LiveContextSection
                projectPath={projectPath}
                envFilesDetected={envScan.envFiles}
              />

              <SectionDivider />

              {/* 3. Usage Stats — expanded by default */}
              <UsageStatsSection />

              <SectionDivider />

              {/* 4. Resources — compact */}
              <ResourcesSection />

              <SectionDivider />

              {/* 5. Skills — collapsed by default */}
              <SkillsCatalogSection activeSkills={activeSkills} />
            </div>

            {/* Security warning (side-effect only, renders nothing) */}
            <SecurityWarning hasEnvFiles={envScan.hasEnvFiles} envFiles={envScan.envFiles} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
