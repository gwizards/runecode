import React, { useState, useEffect, lazy, Suspense } from "react";
const Onboarding = lazy(() => import("@/components/Onboarding").then(m => ({ default: m.Onboarding })));
import { motion } from "motion/react";
import { Bot, FolderCode, Loader2 } from "lucide-react";
import { RotatingRune } from "./components/RuneCodeLogo";
import { api, type Project, type Session, type ClaudeMdFile } from "@/lib/api";
import { initializeWebMode } from "@/lib/apiAdapter";
import { bootstrapApp } from "@/lib/appInit";
import { isDevMode, checkBackendConnected } from "@/lib/devFallback";
import { Card } from "@/components/ui/card";
import { ProjectList } from "@/components/ProjectList";
import { FilePicker } from "@/components/FilePicker";
import { SessionList } from "@/components/SessionList";
const ClaudeFileEditor = lazy(() => import("@/components/ClaudeFileEditor").then(m => ({ default: m.ClaudeFileEditor })));
const CCAgents = lazy(() => import('@/components/CCAgents').then(m => ({ default: m.CCAgents })));
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
import { AppProviders } from "@/components/AppProviders";
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
  | "tabs";

/**
 * AppMain component - Contains the main app logic (shown after onboarding)
 */
function AppMain() {
  const [view, setView] = useState<View>("tabs");
  const { activeTab } = useTabState();
  const projectPath = activeTab?.initialProjectPath || activeTab?.projectPath || '';

  useAgentLifecycle();
  const isMountedRef = React.useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
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

  useAppLifecycle();
  const trackEvent = useTrackEvent();
  const [hasTrackedFirstChat] = useState(false);

  useEffect(() => {
    if (view === "projects" && projects.length > 0 && !hasTrackedFirstChat) {
      trackEvent.journeyMilestone({
        journey_stage: 'onboarding',
        milestone_reached: 'projects_created',
        time_to_milestone_ms: Date.now() - performance.timeOrigin
      });
    }
  }, [view, projects.length, hasTrackedFirstChat, trackEvent]);

  const [backendConnected, setBackendConnected] = useState(true);

  useEffect(() => { initializeWebMode(); }, []);

  useEffect(() => {
    if (!isDevMode()) return;
    let cancelled = false;
    const check = async () => {
      if (document.hidden) return; // Skip when tab not visible
      const ok = await checkBackendConnected();
      if (!cancelled) setBackendConnected(ok);
    };
    check();
    const interval = setInterval(check, 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (view === "projects") loadProjects();
    else if (view === "welcome") setLoading(false);
  }, [view]);

  // Keyboard shortcuts for tab navigation
  useEffect(() => {
    if (view !== "tabs") return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (e.key === 'Tab' && !e.shiftKey && !modKey && !e.altKey) {
        const target = e.target as HTMLElement;
        const isTextInput = (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && !target.closest('.xterm');
        if (isTextInput) return;
        const gridMode = localStorage.getItem('runecode-layout-mode');
        if (gridMode === 'grid') return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('switch-to-next-tab'));
        return;
      }

      if (modKey) {
        switch (e.key) {
          case 't': e.preventDefault(); window.dispatchEvent(new CustomEvent('create-chat-tab')); break;
          case 'w': e.preventDefault(); window.dispatchEvent(new CustomEvent('close-current-tab')); break;
          case 'Tab':
            e.preventDefault();
            window.dispatchEvent(new CustomEvent(e.shiftKey ? 'switch-to-previous-tab' : 'switch-to-next-tab'));
            break;
          default:
            if (e.key >= '1' && e.key <= '9') {
              const gridMode = localStorage.getItem('runecode-layout-mode');
              if (gridMode === 'grid') break;
              e.preventDefault();
              window.dispatchEvent(new CustomEvent('switch-to-tab-by-index', { detail: { index: parseInt(e.key) - 1 } }));
            }
            break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view]);

  useEffect(() => {
    const handleClaudeNotFound = () => setShowClaudeBinaryDialog(true);
    window.addEventListener('claude-not-found', handleClaudeNotFound as EventListener);
    return () => window.removeEventListener('claude-not-found', handleClaudeNotFound as EventListener);
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true); setError(null);
      const projectList = await api.listProjects();
      if (!isMountedRef.current) return;
      setProjects(projectList);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Failed to load projects:", err);
      setError(`Failed to load projects: ${err}. Please ensure ~/.claude directory exists.`);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleProjectClick = async (project: Project) => {
    try {
      setLoading(true); setError(null);
      const sessionList = await api.getProjectSessions(project.id);
      if (!isMountedRef.current) return;
      setSessions(sessionList); setSelectedProject(project);
    } catch (err) {
      if (!isMountedRef.current) return;
      console.error("Failed to load sessions:", err);
      setError(`Failed to load sessions for this project: ${err}`);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  };

  const handleOpenProject = async () => {
    const homeDir = await api.getHomeDirectory();
    if (!isMountedRef.current) return;
    setHomeDirectory(homeDir); setShowProjectPicker(true);
  };

  const handleEditClaudeFile = (file: ClaudeMdFile) => {
    setEditingClaudeFile(file); handleViewChange("claude-file-editor");
  };

  const handleBackFromClaudeFileEditor = () => {
    setEditingClaudeFile(null); handleViewChange("projects");
  };

  const handleViewChange = (newView: View) => {
    setPreviousView(view); setView(newView);
  };

  const renderContent = () => {
    switch (view) {
      case "welcome":
        return (
          <div className="flex items-center justify-center p-4" style={{ height: "100%" }}>
            <div className="w-full max-w-4xl">
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-12 text-center">
                <h1 className="text-4xl font-bold tracking-tight"><RotatingRune size={20} />Welcome to RuneCode</h1>
              </motion.div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: 0.05 }}>
                  <Card className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border" onClick={() => handleViewChange("cc-agents")}>
                    <div className="h-full flex flex-col items-center justify-center p-8">
                      <Bot className="h-16 w-16 mb-4 text-primary" />
                      <h2 className="text-xl font-semibold">CC Agents</h2>
                    </div>
                  </Card>
                </motion.div>
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: 0.1 }}>
                  <Card className="h-64 cursor-pointer transition-all duration-200 hover:scale-105 hover:shadow-lg border border-border/50 shimmer-hover trailing-border" onClick={() => handleViewChange("projects")}>
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
          <Suspense fallback={<div className="flex items-center justify-center h-full text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin mr-2" />Loading agents...</div>}>
            <CCAgents onBack={() => handleViewChange("welcome")} />
          </Suspense>
        );
      case "editor": case "settings": return null;
      case "projects":
        if (selectedProject) {
          return <SessionList sessions={sessions} projectPath={selectedProject.path} onEditClaudeFile={handleEditClaudeFile} />;
        }
        return <ProjectList projects={projects} onProjectClick={handleProjectClick} onOpenProject={handleOpenProject} loading={loading} />;
      case "claude-file-editor":
        return editingClaudeFile ? <ClaudeFileEditor file={editingClaudeFile} onBack={handleBackFromClaudeFileEditor} /> : null;
      case "tabs":
        return (
          <div className="h-full flex flex-col">
            <TabManager className="flex-shrink-0 glass-subtle" />
            <div className="flex-1 overflow-hidden flex">
              <div className="flex-1 overflow-hidden"><TabContent /></div>
              <ProjectSidebar projectPath={projectPath} key={projectPath} />
            </div>
            <div id="runecode-footer-portal" className="shrink-0" />
          </div>
        );
      case "usage-dashboard": case "mcp": return null;
      case "project-settings":
        if (projectForSettings) {
          return <ProjectSettings project={projectForSettings} onBack={() => { setProjectForSettings(null); handleViewChange(previousView || "projects"); }} />;
        }
        break;
      default: return null;
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {view !== 'tabs' && (<><div className="mesh-orb-purple" aria-hidden="true" /><div className="mesh-orb-gold" aria-hidden="true" /><div className="grain-overlay" aria-hidden="true" /></>)}
      {isDevMode() && !backendConnected && (
        <div className="text-xs text-yellow-400 bg-yellow-500/10 px-3 py-1.5 text-center select-none">
          Backend not connected — showing placeholder data. Run <code className="font-mono bg-yellow-500/15 px-1 rounded">cargo build --bin runecode-web</code> for full functionality.
        </div>
      )}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
      <ClaudeBinaryDialog open={showClaudeBinaryDialog} onOpenChange={setShowClaudeBinaryDialog} onSuccess={() => setToast({ message: "Claude binary path saved successfully", type: "success" })} onError={(message) => setToast({ message, type: "error" })} />
      {showProjectPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl h-[600px] bg-background border rounded-lg shadow-lg">
            <FilePicker basePath={homeDirectory} onSelect={async (entry) => {
              if (entry.is_directory) {
                try {
                  const project = await api.createProject(entry.path);
                  setShowProjectPicker(false); await loadProjects(); await handleProjectClick(project);
                } catch (err) { console.error('Failed to create project:', err); setError(`Failed to create project for the selected directory: ${err}`); }
              }
            }} onClose={() => setShowProjectPicker(false)} />
          </div>
        </div>
      )}
      <ToastContainer>{toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}</ToastContainer>
    </div>
  );
}

/**
 * Error boundary for onboarding
 */
class OnboardingErrorBoundary extends React.Component<
  { children: React.ReactNode; onSkip: () => void },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; onSkip: () => void }) {
    super(props); this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) {
    console.error('Onboarding crashed, skipping:', error);
    localStorage.setItem('runecode-onboarding-complete', 'true');
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center">
          <div className="text-center space-y-4 max-w-md">
            <p className="text-white/70 text-sm">Setup wizard encountered an error.</p>
            <button onClick={() => { this.props.onSkip(); }} className="px-6 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white text-sm font-medium">Skip Setup &amp; Continue</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [onboardingComplete, setOnboardingComplete] = useState(() =>
    localStorage.getItem('runecode-onboarding-complete') === 'true'
  );
  if (!onboardingComplete) {
    return (
      <OnboardingErrorBoundary onSkip={() => setOnboardingComplete(true)}>
        <Suspense fallback={<div className="fixed inset-0 bg-[#0a0a0f] flex items-center justify-center"><div className="text-white/40 text-sm">Loading setup wizard...</div></div>}>
          <Onboarding onComplete={() => setOnboardingComplete(true)} />
        </Suspense>
      </OnboardingErrorBoundary>
    );
  }
  return <AppMain />;
}

function App() {
  const [showIntro, setShowIntro] = useState(() => {
    try {
      const cached = typeof window !== 'undefined' ? window.localStorage.getItem('app_setting:startup_intro_enabled') : null;
      if (cached === 'true') return true;
      if (cached === 'false') return false;
    } catch (e) { console.warn('[App] localStorage read failed', e); }
    return true;
  });

  useEffect(() => {
    let timer: number | undefined;
    (async () => {
      const enabled = await bootstrapApp();
      if (enabled) {
        timer = window.setTimeout(() => setShowIntro(false), 2000);
      } else {
        setShowIntro(false);
      }
    })();
    return () => { if (timer) window.clearTimeout(timer); };
  }, []);

  return (
    <AppProviders>
      <AppContent />
      <StartupIntro visible={showIntro} />
      <Toaster theme="dark" position="bottom-right" toastOptions={{ className: 'glass-subtle' }} />
    </AppProviders>
  );
}

export default App;
