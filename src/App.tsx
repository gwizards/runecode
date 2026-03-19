import { useState, useEffect, lazy } from "react";
import { motion } from "motion/react";
import { Bot, FolderCode } from "lucide-react";
import { RotatingRune } from "./components/RuneCodeLogo";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { initializeWebMode } from "@/lib/apiAdapter";
import { isDevMode, checkBackendConnected } from "@/lib/devFallback";
import { OutputCacheProvider } from "@/lib/outputCache";
import { TabProvider } from "@/contexts/TabContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { Card } from "@/components/ui/card";
import { ProjectList } from "@/components/ProjectList";
import { FilePicker } from "@/components/FilePicker";
import { SessionList } from "@/components/SessionList";
const ClaudeFileEditor = lazy(() => import("@/components/ClaudeFileEditor").then(m => ({ default: m.ClaudeFileEditor })));
import { CCAgents } from "@/components/CCAgents";
import { ClaudeBinaryDialog } from "@/components/ClaudeBinaryDialog";
import { Toast, ToastContainer } from "@/components/ui/toast";
import { ProjectSettings } from '@/components/ProjectSettings';
import { TabManager } from "@/components/TabManager";
import { TabContent } from "@/components/TabContent";
import { useTabState } from "@/hooks/useTabState";
import { useAgentLifecycle } from "@/hooks/useAgentLifecycle";
import { useAppLifecycle, useTrackEvent } from "@/hooks";
import { StartupIntro } from "@/components/StartupIntro";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { IntegrationProvider } from "@/integrations/IntegrationProvider";
import { Toaster } from "sonner";

/**
 * Migrate localStorage keys from opcode- prefix to runecode- prefix.
 * Runs once; subsequent calls are no-ops.
 */
function migrateLocalStorage() {
  const migrated = localStorage.getItem('runecode-migrated');
  if (migrated) return;
  const keys = Object.keys(localStorage).filter(k => k.startsWith('opcode-') || k.startsWith('opcode_'));
  for (const key of keys) {
    const newKey = key.replace(/^opcode[-_]/, (match) => match === 'opcode-' ? 'runecode-' : 'runecode_');
    const value = localStorage.getItem(key);
    if (value !== null) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(key);
    }
  }
  localStorage.setItem('runecode-migrated', 'true');
}

// Run migration immediately on module load
migrateLocalStorage();

type View =
  | "welcome" 
  | "projects" 
  | "editor" 
  | "claude-file-editor" 
  | "settings"
  | "cc-agents"
  | "create-agent"
  | "github-agents"
  | "agent-execution"
  | "agent-run-view"
  | "mcp"
  | "usage-dashboard"
  | "project-settings"
  | "tabs"; // New view for tab-based interface

/**
 * AppContent component - Contains the main app logic, wrapped by providers
 */
function AppContent() {
  const [view, setView] = useState<View>("tabs");
  const { activeTab, createSettingsTab: _createSettingsTab, createUsageTab: _createUsageTab, createAgentsTab: _createAgentsTab } = useTabState();

  // Wire sidebar to active tab's project path
  const projectPath = activeTab?.projectPath || activeTab?.initialProjectPath || '';

  // Listen for agent lifecycle events
  useAgentLifecycle();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [editingClaudeFile, setEditingClaudeFile] = useState<ClaudeMdFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [_error, setError] = useState<string | null>(null);
  const [showClaudeBinaryDialog, setShowClaudeBinaryDialog] = useState(false);
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [homeDirectory, setHomeDirectory] = useState<string>('/');
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [projectForSettings, setProjectForSettings] = useState<Project | null>(null);
  const [previousView, setPreviousView] = useState<View>("welcome");
  
  // Initialize analytics lifecycle tracking
  useAppLifecycle();
  const trackEvent = useTrackEvent();
  
  // Track user journey milestones
  const [hasTrackedFirstChat] = useState(false);
  // const [hasTrackedFirstAgent] = useState(false);
  
  // Track when user reaches different journey stages
  useEffect(() => {
    if (view === "projects" && projects.length > 0 && !hasTrackedFirstChat) {
      // User has projects - they're past onboarding
      trackEvent.journeyMilestone({
        journey_stage: 'onboarding',
        milestone_reached: 'projects_created',
        time_to_milestone_ms: Date.now() - performance.timeOrigin
      });
    }
  }, [view, projects.length, hasTrackedFirstChat, trackEvent]);

  // Dev-mode backend connectivity indicator
  const [backendConnected, setBackendConnected] = useState(true);

  // Initialize web mode compatibility on mount
  useEffect(() => {
    initializeWebMode();
  }, []);

  // Periodically check backend connectivity in dev mode
  useEffect(() => {
    if (!isDevMode()) return;
    let cancelled = false;

    const check = async () => {
      const ok = await checkBackendConnected();
      if (!cancelled) setBackendConnected(ok);
    };

    check();
    const interval = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Load projects on mount when in projects view
  useEffect(() => {
    if (view === "projects") {
      loadProjects();
    } else if (view === "welcome") {
      // Reset loading state for welcome view
      setLoading(false);
    }
  }, [view]);

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    if (view !== "tabs") return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      // Tab (alone) — cycle to next tab/grid cell
      if (e.key === 'Tab' && !e.shiftKey && !modKey && !e.altKey) {
        // Skip if focus is in a regular input (not terminal)
        const target = e.target as HTMLElement;
        const isTextInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.closest('.xterm');
        if (isTextInput) return; // Let normal Tab work in text inputs

        // Grid mode — let TabContent's own handler deal with it
        const gridMode = localStorage.getItem('runecode-layout-mode');
        if (gridMode === 'grid') return;

        e.preventDefault();
        window.dispatchEvent(new CustomEvent('switch-to-next-tab'));
        return;
      }

      if (modKey) {
        switch (e.key) {
          case 't':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('create-chat-tab'));
            break;
          case 'w':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('close-current-tab'));
            break;
          case 'Tab':
            e.preventDefault();
            if (e.shiftKey) {
              window.dispatchEvent(new CustomEvent('switch-to-previous-tab'));
            } else {
              window.dispatchEvent(new CustomEvent('switch-to-next-tab'));
            }
            break;
          default:
            // Ctrl/Cmd + 1-9: switch to tab by index
            if (e.key >= '1' && e.key <= '9') {
              e.preventDefault();
              const index = parseInt(e.key) - 1;
              window.dispatchEvent(new CustomEvent('switch-to-tab-by-index', { detail: { index } }));
            }
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  // Listen for Claude not found events
  useEffect(() => {
    const handleClaudeNotFound = () => {
      setShowClaudeBinaryDialog(true);
    };

    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    return () => {
      window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    };
  }, []);

  /**
   * Loads all projects from the ~/.claude/projects directory
   */
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      const projectList = await api.listProjects();
      setProjects(projectList);
    } catch (err) {
      console.error("Failed to load projects:", err);
      setError("Failed to load projects. Please ensure ~/.claude directory exists.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Handles project selection and loads its sessions
   */
  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true);
      setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      setSessions(sessionList);
      setSelectedProject(project);
    } catch (err) {
      console.error("Failed to load sessions:", err);
      setError("Failed to load sessions for this project.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Opens the project directory picker
   */
  const handleOpenProject = async () => {
    // Get home directory before showing picker
    const homeDir = await api.getHomeDirectory();
    setHomeDirectory(homeDir);
    setShowProjectPicker(true);
  };

  /**
   * Opens a new Claude Code session in the interactive UI
   */
  // New session creation is handled by the tab system via titlebar actions

  /**
   * Handles editing a CLAUDE.md file from a project
   */
  const handleEditClaudeFile = (file: ClaudeMdFile) => {
    setEditingClaudeFile(file);
    handleViewChange("claude-file-editor");
  };

  /**
   * Returns from CLAUDE.md file editor to projects view
   */
  const handleBackFromClaudeFileEditor = () => {
    setEditingClaudeFile(null);
    handleViewChange("projects");
  };

  /**
   * Handles view changes with navigation protection
   */
  const handleViewChange = (newView: View) => {
    // No need for navigation protection with tabs since sessions stay open
    setPreviousView(view);
    setView(newView);
  };

  /**
   * Handles navigating to hooks configuration
   */
  // Project settings navigation handled via `projectForSettings` state when needed


  const renderContent = () => {
    switch (view) {
      case "welcome":
        return (
          <div className="flex items-center justify-center p-4" style={{ height: "100%" }}>
            <div className="w-full max-w-4xl">
              {/* Welcome Header */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="mb-12 text-center"
              >
                <h1 className="text-4xl font-bold tracking-tight">
                  <RotatingRune size={20} />
                  Welcome to RuneCode
                </h1>
              </motion.div>

              {/* Navigation Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {/* CC Agents Card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: 0.05 }}
                >
                  <Card 
                    className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border"
                    onClick={() => handleViewChange("cc-agents")}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-8">
                      <Bot className="h-16 w-16 mb-4 text-primary" />
                      <h2 className="text-xl font-semibold">CC Agents</h2>
                    </div>
                  </Card>
                </motion.div>

                {/* Projects Card */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, delay: 0.1 }}
                >
                  <Card 
                    className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border"
                    onClick={() => handleViewChange("projects")}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-8">
                      <FolderCode className="h-16 w-16 mb-4 text-primary" />
                      <h2 className="text-xl font-semibold">Projects</h2>
                    </div>
                  </Card>
                </motion.div>

              </div>
            </div>
          </div>
        );

      case "cc-agents":
        return (
          <CCAgents 
            onBack={() => handleViewChange("welcome")} 
          />
        );

      case "editor":
      case "settings":
        // These views are now handled via the tab system in TabContent
        return null;
      
      case "projects":
        if (selectedProject) {
          return (
            <SessionList
              sessions={sessions}
              projectPath={selectedProject.path}
              onEditClaudeFile={handleEditClaudeFile}
            />
          );
        }
        return (
          <ProjectList
            projects={projects}
            onProjectClick={handleProjectClick}
            onOpenProject={handleOpenProject}
            loading={loading}
          />
        );
      
      case "claude-file-editor":
        return editingClaudeFile ? (
          <ClaudeFileEditor
            file={editingClaudeFile}
            onBack={handleBackFromClaudeFileEditor}
          />
        ) : null;
      
      case "tabs":
        return (
          <div className="h-full flex flex-col">
            <TabManager className="flex-shrink-0 glass-subtle" />
            <div className="flex-1 overflow-hidden flex">
              <div className="flex-1 overflow-hidden">
                <TabContent />
              </div>
              <ProjectSidebar projectPath={projectPath} key={projectPath} />
            </div>
            {/* Portal target for footer input — sits below sidebar flex, full width */}
            <div id="runecode-footer-portal" className="shrink-0" />
          </div>
        );
      
      case "usage-dashboard":
      case "mcp":
        // These views are now handled via the tab system in TabContent
        return null;
      
      case "project-settings":
        if (projectForSettings) {
          return (
            <ProjectSettings
              project={projectForSettings}
              onBack={() => {
                setProjectForSettings(null);
                handleViewChange(previousView || "projects");
              }}
            />
          );
        }
        break;
      
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Ambient Effects — hidden in tabs view to save ~8-15ms/frame GPU overhead */}
      {view !== 'tabs' && (
        <>
          <div className="mesh-orb-purple" aria-hidden="true" />
          <div className="mesh-orb-gold" aria-hidden="true" />
          <div className="grain-overlay" aria-hidden="true" />
        </>
      )}

      {/* Dev-mode backend status banner */}
      {isDevMode() && !backendConnected && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 text-center select-none">
          Backend not connected — showing placeholder data. Run <code className="font-mono bg-yellow-500/15 px-1 rounded">cargo build --bin runecode-web</code> for full functionality.
        </div>
      )}

      {/* Topbar - Commented out since navigation moved to titlebar */}
      {/* <Topbar
        onClaudeClick={() => createClaudeMdTab()}
        onSettingsClick={() => createSettingsTab()}
        onUsageClick={() => createUsageTab()}
        onMCPClick={() => createMCPTab()}
        onAgentsClick={() => setShowAgentsModal(true)}
      /> */}
      
      
      
      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {renderContent()}
      </div>
      
      {/* NFO Credits Modal */}
      
      
      {/* Claude Binary Dialog */}
      <ClaudeBinaryDialog
        open={showClaudeBinaryDialog}
        onOpenChange={setShowClaudeBinaryDialog}
        onSuccess={() => {
          setToast({ message: "Claude binary path saved successfully", type: "success" });
        }}
        onError={(message) => setToast({ message, type: "error" })}
      />

      {/* File picker modal for selecting project directory */}
      {showProjectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[600px] bg-background border rounded-lg shadow-lg">
            <FilePicker
              basePath={homeDirectory}
              onSelect={async (entry) => {
                if (entry.is_directory) {
                  // Create or open a project for this directory
                  try {
                    const project = await api.createProject(entry.path);
                    setShowProjectPicker(false);
                    await loadProjects();
                    await handleProjectClick(project);
                  } catch (err) {
                    console.error('Failed to create project:', err);
                    setError('Failed to create project for the selected directory.');
                  }
                }
              }}
              onClose={() => setShowProjectPicker(false)}
            />
          </div>
        </div>
      )}
      
      {/* Toast Container */}
      <ToastContainer>
        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onDismiss={() => setToast(null)}
          />
        )}
      </ToastContainer>

    </div>
  );
}

/**
 * Main App component - Wraps the app with providers
 */
function App() {
  const [showIntro, setShowIntro] = useState(() => {
    // Read cached preference synchronously to avoid any initial flash
    try {
      const cached = typeof window !== 'undefined'
        ? window.localStorage.getItem('app_setting:startup_intro_enabled')
        : null;
      if (cached === 'true') return true;
      if (cached === 'false') return false;
    } catch (_ignore) {}
    return true; // default if no cache
  });

  useEffect(() => {
    let timer: number | undefined;
    (async () => {
      try {
        const pref = await api.getSetting('startup_intro_enabled');
        const enabled = pref === null ? true : pref === 'true';
        if (enabled) {
          // keep intro visible and hide after duration
          timer = window.setTimeout(() => setShowIntro(false), 2000);
        } else {
          // user disabled intro: hide immediately to avoid any overlay delay
          setShowIntro(false);
        }
      } catch (err) {
        // On failure, show intro once to keep UX consistent
        timer = window.setTimeout(() => setShowIntro(false), 2000);
      }
    })();
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <ThemeProvider>
      <IntegrationProvider>
        <OutputCacheProvider>
          <TabProvider>
            <AppContent />
            <StartupIntro visible={showIntro} />
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                className: 'glass-subtle',
              }}
            />
          </TabProvider>
        </OutputCacheProvider>
      </IntegrationProvider>
    </ThemeProvider>
  );
}

export default App;
