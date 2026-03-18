import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FolderOpen, ChevronDown, ChevronRight, Plug, Bot, FileText,
  MessageSquare, Loader2, RefreshCw, Search, ExternalLink, Clock
} from 'lucide-react';
import { api, type Project, type Agent, type ClaudeMdFile, type MCPProjectConfig } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProjectData {
  project: Project;
  agents: Agent[];
  mcpConfig: MCPProjectConfig | null;
  claudeMdFiles: ClaudeMdFile[];
  sessionCount: number;
  loading: boolean;
}

export function ProjectExplorer() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectData, setProjectData] = useState<Map<string, ProjectData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadProjects = async () => {
    setLoading(true);
    try {
      const result = await api.listProjects();
      // Sort by most recent
      result.sort((a, b) => (b.most_recent_session || b.created_at) - (a.most_recent_session || a.created_at));
      setProjects(result);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadProjects(); }, []);

  const loadProjectDetails = async (project: Project) => {
    const existing = projectData.get(project.id);
    if (existing && !existing.loading) return; // already loaded

    setProjectData(prev => {
      const next = new Map(prev);
      next.set(project.id, {
        project,
        agents: [],
        mcpConfig: null,
        claudeMdFiles: [],
        sessionCount: project.sessions?.length || 0,
        loading: true,
      });
      return next;
    });

    try {
      // Fetch all project data in parallel
      const [allAgents, mcpConfig, claudeMdFiles, sessions] = await Promise.allSettled([
        api.listAgents(),
        api.mcpReadProjectConfig(project.path),
        api.findClaudeMdFiles(project.path),
        api.getProjectSessions(project.id),
      ]);

      const projectAgents = allAgents.status === 'fulfilled'
        ? allAgents.value.filter(a => a.scope === 'project')
        : [];
      const mcp = mcpConfig.status === 'fulfilled' ? mcpConfig.value : null;
      const mdFiles = claudeMdFiles.status === 'fulfilled' ? claudeMdFiles.value : [];
      const sessCount = sessions.status === 'fulfilled' ? sessions.value.length : project.sessions?.length || 0;

      setProjectData(prev => {
        const next = new Map(prev);
        next.set(project.id, {
          project,
          agents: projectAgents,
          mcpConfig: mcp,
          claudeMdFiles: mdFiles,
          sessionCount: sessCount,
          loading: false,
        });
        return next;
      });
    } catch {
      setProjectData(prev => {
        const next = new Map(prev);
        const existing = next.get(project.id);
        if (existing) next.set(project.id, { ...existing, loading: false });
        return next;
      });
    }
  };

  const handleToggle = (project: Project) => {
    if (expandedProject === project.id) {
      setExpandedProject(null);
    } else {
      setExpandedProject(project.id);
      loadProjectDetails(project);
    }
  };

  const filtered = search
    ? projects.filter(p => p.path.toLowerCase().includes(search.toLowerCase()))
    : projects;

  const getProjectName = (p: Project) => {
    const parts = p.path.split('/');
    return parts[parts.length - 1] || p.path;
  };

  const formatDate = (ts: number) => {
    if (!ts) return '';
    return new Date(ts * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-amber-400" />
          Project Explorer
        </h2>
        <p className="text-sm text-muted-foreground">
          Browse all projects and inspect their configuration — MCP servers, agents, CLAUDE.md files, and session history.
        </p>
      </div>

      {/* Search + refresh */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground/30" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter projects..." className="h-8 text-xs pl-7" />
        </div>
        <Button variant="ghost" size="sm" onClick={loadProjects} className="text-xs text-muted-foreground">
          <RefreshCw className={cn('h-3 w-3 mr-1', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground/50">
        <span>{projects.length} projects</span>
        <span className="w-1 h-1 rounded-full bg-muted-foreground/20" />
        <span>{projects.reduce((sum, p) => sum + (p.sessions?.length || 0), 0)} total sessions</span>
      </div>

      {/* Project list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground/40">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Loading projects...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-muted-foreground/40">
          {search ? `No projects match "${search}"` : 'No projects found'}
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map(project => {
            const isExpanded = expandedProject === project.id;
            const data = projectData.get(project.id);

            return (
              <div key={project.id} className="rounded-lg border border-border/20 bg-muted/5 overflow-hidden">
                {/* Project header */}
                <button
                  onClick={() => handleToggle(project)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/10 transition-colors"
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground/40" /> : <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                  <FolderOpen className="h-3.5 w-3.5 text-amber-400/60 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium">{getProjectName(project)}</span>
                    <span className="text-[9px] text-muted-foreground/40 ml-2 font-mono truncate">{project.path}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-muted-foreground/40 flex-shrink-0">
                    <span>{project.sessions?.length || 0} sessions</span>
                    {project.most_recent_session && (
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {formatDate(project.most_recent_session)}
                      </span>
                    )}
                  </div>
                </button>

                {/* Expanded details */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                      <div className="px-3 pb-3 pt-1 border-t border-border/10 space-y-3">
                        {data?.loading ? (
                          <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground/40">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading project configuration...
                          </div>
                        ) : data ? (
                          <>
                            {/* CLAUDE.md files */}
                            <ConfigSection
                              icon={FileText}
                              iconColor="text-emerald-400/60"
                              title="CLAUDE.md Files"
                              count={data.claudeMdFiles.length}
                              emptyText="No CLAUDE.md files"
                            >
                              {data.claudeMdFiles.map(f => (
                                <div key={f.absolute_path} className="flex items-center gap-2 text-[10px] py-0.5">
                                  <FileText className="w-2.5 h-2.5 text-muted-foreground/30" />
                                  <span className="font-mono truncate">{f.relative_path}</span>
                                  <span className="text-muted-foreground/30">{(f.size / 1024).toFixed(1)}KB</span>
                                </div>
                              ))}
                            </ConfigSection>

                            {/* MCP Servers */}
                            <ConfigSection
                              icon={Plug}
                              iconColor="text-blue-400/60"
                              title="MCP Servers (project)"
                              count={data.mcpConfig ? Object.keys(data.mcpConfig.mcpServers || {}).length : 0}
                              emptyText="No project-scoped MCP servers"
                            >
                              {data.mcpConfig && Object.entries(data.mcpConfig.mcpServers || {}).map(([name, config]) => (
                                <div key={name} className="flex items-center gap-2 text-[10px] py-0.5">
                                  <Plug className="w-2.5 h-2.5 text-muted-foreground/30" />
                                  <span className="font-medium">{name}</span>
                                  <span className="font-mono text-muted-foreground/40 truncate">{config.command} {config.args?.join(' ')}</span>
                                </div>
                              ))}
                            </ConfigSection>

                            {/* Project Agents */}
                            <ConfigSection
                              icon={Bot}
                              iconColor="text-cyan-400/60"
                              title="Project Agents"
                              count={data.agents.length}
                              emptyText="No project-scoped agents"
                            >
                              {data.agents.map(a => (
                                <div key={a.name} className="flex items-center gap-2 text-[10px] py-0.5">
                                  <Bot className="w-2.5 h-2.5 text-muted-foreground/30" />
                                  <span className="font-medium">{a.name}</span>
                                  {a.model && <span className="text-muted-foreground/40 font-mono">{a.model}</span>}
                                  {a.description && <span className="text-muted-foreground/30 truncate">{a.description}</span>}
                                </div>
                              ))}
                            </ConfigSection>

                            {/* Sessions */}
                            <ConfigSection
                              icon={MessageSquare}
                              iconColor="text-purple-400/60"
                              title="Sessions"
                              count={data.sessionCount}
                              emptyText="No sessions"
                            />
                          </>
                        ) : null}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigSection({ icon: Icon, iconColor, title, count, emptyText, children }: {
  icon: React.ElementType;
  iconColor: string;
  title: string;
  count: number;
  emptyText: string;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('w-3 h-3', iconColor)} />
        <span className="text-[10px] font-medium text-muted-foreground/60">{title}</span>
        <span className="text-[9px] font-mono text-muted-foreground/30">({count})</span>
      </div>
      {count === 0 ? (
        <p className="text-[9px] text-muted-foreground/25 ml-4.5">{emptyText}</p>
      ) : (
        <div className="ml-4.5 space-y-0.5">{children}</div>
      )}
    </div>
  );
}
