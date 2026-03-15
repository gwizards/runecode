import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PanelRightClose,
  PanelRightOpen,
  Info,
  Activity,
  BarChart3,
  Sparkles,
} from "lucide-react";

const LS_KEY_WIDTH = "runecode-sidebar-width";
const LS_KEY_OPEN = "runecode-sidebar-open";

const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;
const AUTO_COLLAPSE_BREAKPOINT = 1024;

interface PlaceholderSectionProps {
  title: string;
  icon: React.ReactNode;
}

function PlaceholderSection({ title, icon }: PlaceholderSectionProps) {
  return (
    <div className="px-4 py-3 border-b border-border/40">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground/80 mb-2">
        {icon}
        {title}
      </div>
      <p className="text-xs text-muted-foreground">Coming soon</p>
    </div>
  );
}

export function ProjectSidebar() {
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
        onClick={() => setIsOpen((prev) => !prev)}
        className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
        style={
          isOpen ? undefined : { right: "auto", left: "-36px", position: "absolute" }
        }
        title={isOpen ? "Close sidebar" : "Open sidebar"}
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
            <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground/90">
                Project Context
              </span>
            </div>

            {/* Sections */}
            <div className="flex-1 overflow-y-auto">
              <PlaceholderSection
                title="Project Info"
                icon={<Info className="h-3.5 w-3.5" />}
              />
              <PlaceholderSection
                title="Live Context"
                icon={<Activity className="h-3.5 w-3.5" />}
              />
              <PlaceholderSection
                title="Session Stats"
                icon={<BarChart3 className="h-3.5 w-3.5" />}
              />
              <PlaceholderSection
                title="Skills"
                icon={<Sparkles className="h-3.5 w-3.5" />}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
